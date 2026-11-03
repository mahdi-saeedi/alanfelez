-- +goose Up
-- Sales follow-up in the admin (client 2026-11-03): where each customer stands with the sales staff, who looks after
-- them, when to call next, and a log of notes and calls (renewal and feedback calls included). Staff-only data; it
-- goes when the user is deleted (DeleteUserPrivateData).

-- One row per customer the sales staff work with.
CREATE TABLE app.sales_leads (
  user_id    uuid        PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
  stage      text        NOT NULL DEFAULT 'new'
             CHECK (stage IN ('new', 'contacted', 'interested', 'not_interested', 'customer')),
  owner_id   uuid,                 -- the staff member (Keycloak id) who looks after this customer
  owner_name text,                 -- their name when assigned (staff names live in Keycloak)
  next_at    date,                 -- the next follow-up, Tehran day
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text        NOT NULL  -- staff username
);
CREATE INDEX sales_leads_next_idx ON app.sales_leads (next_at) WHERE next_at IS NOT NULL;

-- Notes and calls, newest first per customer.
CREATE TABLE app.sales_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL,
  author_name text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('note', 'call', 'renewal_call', 'feedback_call')),
  outcome     text        CHECK (outcome IN ('answered', 'no_answer', 'call_back')), -- calls only
  body        text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_notes_user_idx ON app.sales_notes (user_id, created_at DESC);

-- +goose Down
DROP TABLE app.sales_notes;
DROP TABLE app.sales_leads;
