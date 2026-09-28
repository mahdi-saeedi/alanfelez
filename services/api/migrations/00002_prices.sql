-- +goose Up
-- M2 market data: products, price sources, price series and their history, source health,
-- manual subscriptions (until checkout exists) and the staff audit log.
-- Conventions: docs/architecture/DATA_MODEL.md §1–2. Prices = bigint minor units (Rial for IRR, cents for USD).

-- River (background jobs, ADR-0008) keeps its tables in their own schema; `alanfelez migrate` runs River's migrations there.
CREATE SCHEMA IF NOT EXISTS river;

CREATE TABLE market.products (
  id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  metal_id    smallint NOT NULL REFERENCES market.metals (id),
  category_id smallint NOT NULL REFERENCES market.product_categories (id),
  name_fa     text NOT NULL,
  name_en     text,
  sort        int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A source is where points come from: an API adapter, the demo generator or manual entry.
-- provider selects the Go adapter (internal/prices/source); config is adapter-specific and never holds secrets.
CREATE TABLE market.sources (
  id               smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_fa          text NOT NULL,
  name_en          text,
  provider         text NOT NULL CHECK (provider ~ '^[a-z0-9_]+$'), -- manual | demo | <adapter id>
  config           jsonb NOT NULL DEFAULT '{}',
  fetch_interval_s int  NOT NULL DEFAULT 60 CHECK (fetch_interval_s >= 5),
  stale_after_s    int  NOT NULL DEFAULT 1800 CHECK (stale_after_s >= 60),
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The identity of a price: product × market × currency × unit (DATA_MODEL "price_series is the identity of a price").
CREATE TABLE market.price_series (
  id          int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  product_id  smallint NOT NULL REFERENCES market.products (id),
  market_id   smallint NOT NULL REFERENCES market.markets (id),
  currency    text NOT NULL CHECK (currency IN ('IRR', 'USD')),
  unit        text NOT NULL CHECK (unit IN ('kg', 'ton')),
  is_base     boolean NOT NULL DEFAULT false, -- the free tier sees base series only (access.PricesBase)
  max_jump_bp int  NOT NULL DEFAULT 1500 CHECK (max_jump_bp > 0), -- outlier gate, basis points (1500 = 15 %)
  sort        int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, market_id, currency, unit)
);

-- Append-only history. (series_id, observed_at) is unique, so re-ingesting the same quote is a no-op.
CREATE TABLE market.price_points (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_id   int    NOT NULL REFERENCES market.price_series (id),
  observed_at timestamptz NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  source_id   smallint NOT NULL REFERENCES market.sources (id),
  is_manual   boolean NOT NULL DEFAULT false,
  entered_by  uuid, -- Keycloak user id of the staff member (manual points)
  status      text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'quarantined', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, observed_at)
);
CREATE INDEX price_points_published_idx ON market.price_points (series_id, observed_at DESC) WHERE status = 'published';
CREATE INDEX price_points_quarantined_idx ON market.price_points (created_at) WHERE status = 'quarantined';

-- Latest published point per series, maintained in the same transaction as the insert.
-- prev_close_minor = the last published price of an earlier Tehran calendar day (drives daily change).
CREATE TABLE market.price_latest (
  series_id        int PRIMARY KEY REFERENCES market.price_series (id),
  point_id         bigint NOT NULL REFERENCES market.price_points (id),
  price_minor      bigint NOT NULL,
  observed_at      timestamptz NOT NULL,
  source_id        smallint NOT NULL REFERENCES market.sources (id),
  prev_close_minor bigint,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per fetch attempt; feeds the source health dashboard. Retention 90 days (DATA_MODEL §4).
CREATE TABLE market.source_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   smallint NOT NULL REFERENCES market.sources (id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL CHECK (status IN ('ok', 'error')),
  points      int  NOT NULL DEFAULT 0,
  quarantined int  NOT NULL DEFAULT 0,
  error       text
);
CREATE INDEX source_runs_source_idx ON market.source_runs (source_id, started_at DESC);

-- Subscriptions. M2 only needs manual grants by staff; checkout (M-billing) adds order_id in an expand migration.
CREATE TABLE app.subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL, -- Keycloak user id (token `sub`)
  plan_code  text NOT NULL REFERENCES app.plans (code),
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz NOT NULL CHECK (ends_at > starts_at),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  origin     text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'order')),
  note       text,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx ON app.subscriptions (user_id, ends_at DESC) WHERE status = 'active';

-- Every staff write is recorded here (SECURITY T5, §6). Never updated or deleted by the application.
CREATE TABLE app.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_name  text,
  action      text NOT NULL, -- e.g. price.manual_entry, price.approve, subscription.grant
  entity      text NOT NULL,
  entity_id   text,
  data        jsonb NOT NULL DEFAULT '{}',
  request_id  text
);
CREATE INDEX audit_log_entity_idx ON app.audit_log (entity, entity_id, at DESC);
CREATE INDEX audit_log_actor_idx ON app.audit_log (actor_id, at DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON market.products     FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON market.sources      FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON market.price_series FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.subscriptions   FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- +goose Down
DROP TABLE app.audit_log;
DROP TABLE app.subscriptions;
DROP TABLE market.source_runs;
DROP TABLE market.price_latest;
DROP TABLE market.price_points;
DROP TABLE market.price_series;
DROP TABLE market.sources;
DROP TABLE market.products;
DROP SCHEMA river CASCADE;
