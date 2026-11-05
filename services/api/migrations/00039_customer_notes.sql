-- +goose Up
-- Notes on a customer for the sales team (client, 2026-11-05): what was said on a call and when to follow up. Any
-- staff member writes them (sales have the view-only role); the dashboard lists the follow-ups that are due.
CREATE TABLE app.customer_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL,
  author_name text        NOT NULL,
  body        text        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  follow_up   date,                         -- Tehran day to call back (NULL = none)
  done        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_notes_user_idx ON app.customer_notes (user_id, created_at DESC);
CREATE INDEX customer_notes_due_idx ON app.customer_notes (follow_up) WHERE follow_up IS NOT NULL AND NOT done;

-- +goose Down
DROP TABLE app.customer_notes;
