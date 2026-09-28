-- +goose Up
-- M4 content and support: articles (news / analysis / forecast), FAQ, static pages with revisions, contact form
-- messages and user tickets. Conventions: docs/architecture/DATA_MODEL.md §3.
-- Rich text (body_*, answer_*) is HTML that the API sanitized on write (internal/content, ADR-0025).

-- content ----------------------------------------------------------------------

-- Topic tabs on the analysis page that aren't a metal (economy, global markets, scrap…).
CREATE TABLE app.article_categories (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_fa    text NOT NULL,
  name_en    text,
  sort       int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- type decides who may read the body (internal/access): news = everyone, analysis / forecast = their feature.
-- Archiving is the soft delete: an archived article disappears from the site but keeps its slug and history.
CREATE TABLE app.articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN ('news', 'analysis', 'forecast')),
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  category_id  smallint REFERENCES app.article_categories (id),
  metal_id     smallint REFERENCES market.metals (id),
  outlook      text CHECK (outlook IN ('up', 'down', 'neutral')), -- the author's view of the price direction
  featured     boolean NOT NULL DEFAULT false,
  title_fa     text NOT NULL,
  title_en     text,
  summary_fa   text NOT NULL DEFAULT '',
  summary_en   text,
  body_fa      text NOT NULL DEFAULT '',
  body_en      text,
  author_fa    text,
  author_en    text,
  cover_url    text,
  read_minutes int  NOT NULL DEFAULT 1 CHECK (read_minutes > 0),
  published_at timestamptz,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX articles_published_idx ON app.articles (type, published_at DESC) WHERE status = 'published';

CREATE TABLE app.faq_categories (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_fa    text NOT NULL,
  name_en    text,
  sort       int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- slug is the stable deep link (/faq#slug): never reuse one for a different question.
CREATE TABLE app.faq_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  category_id smallint NOT NULL REFERENCES app.faq_categories (id),
  question_fa text NOT NULL,
  question_en text,
  answer_fa   text NOT NULL,
  answer_en   text,
  popular     boolean NOT NULL DEFAULT false, -- shown in «سوالات پر تکرار»
  published   boolean NOT NULL DEFAULT true,
  sort        int     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX faq_items_category_idx ON app.faq_items (category_id, sort);

-- about / terms / privacy / licenses. version goes up on every edit; the old text is kept in page_revisions,
-- so we can always show which Terms were in force on a given date.
CREATE TABLE app.pages (
  slug       text PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]+$'),
  title_fa   text NOT NULL,
  title_en   text,
  body_fa    text NOT NULL DEFAULT '',
  body_en    text,
  published  boolean NOT NULL DEFAULT true,
  version    int     NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.page_revisions (
  slug       text NOT NULL REFERENCES app.pages (slug) ON DELETE CASCADE,
  version    int  NOT NULL,
  title_fa   text NOT NULL,
  title_en   text,
  body_fa    text NOT NULL,
  body_en    text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, version)
);

-- support ----------------------------------------------------------------------

-- Contact form submissions (anonymous allowed). Plain text only; rendered escaped.
CREATE TABLE app.contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone       text NOT NULL,
  email       text,
  subject     text NOT NULL CHECK (subject IN ('general', 'support', 'billing', 'partnership', 'feedback', 'other')),
  body        text NOT NULL,
  user_id     uuid,                 -- set when the sender was signed in
  ip          inet,
  user_agent  text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled', 'spam')),
  note        text,                 -- staff note
  handled_by  uuid,
  handled_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_messages_status_idx ON app.contact_messages (status, created_at DESC);

-- A ticket is a thread between one user and support. status says whose turn it is:
-- open = waiting for support, answered = waiting for the user, closed. A user reply reopens a closed ticket.
CREATE TABLE app.tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          bigint GENERATED ALWAYS AS IDENTITY UNIQUE, -- shown to users («تیکت ۱۰۲۳»)
  user_id         uuid NOT NULL REFERENCES app.users (id),
  subject         text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')), -- high = support.priority at creation
  idempotency_key text NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX tickets_user_idx ON app.tickets (user_id, last_message_at DESC);
CREATE INDEX tickets_queue_idx ON app.tickets (status, priority, last_message_at);

CREATE TABLE app.ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES app.tickets (id) ON DELETE CASCADE,
  author_id   uuid NOT NULL,
  author_name text,
  is_staff    boolean NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket_idx ON app.ticket_messages (ticket_id, created_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.article_categories FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.articles           FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.faq_categories     FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.faq_items          FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.pages              FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.contact_messages   FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.tickets            FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- +goose Down
DROP TABLE app.ticket_messages;
DROP TABLE app.tickets;
DROP TABLE app.contact_messages;
DROP TABLE app.page_revisions;
DROP TABLE app.pages;
DROP TABLE app.faq_items;
DROP TABLE app.faq_categories;
DROP TABLE app.articles;
DROP TABLE app.article_categories;
