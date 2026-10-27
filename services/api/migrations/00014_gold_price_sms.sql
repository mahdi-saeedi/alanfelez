-- +goose Up
-- Gold SMS about the user's main metal (client, 2026-10-27; owner OK'd): one "prices updated" SMS per batch of changes
-- to that metal's domestic and IME prices (15 minutes after the last change, at most 3 a day, none 22:00–08:00), and an
-- alert when one of its products moves 10 % or more against the previous day (once per product and day). Global prices
-- don't count. The manual alerts (app.price_alerts) are no longer checked; their rows stay.

-- The user's choice. Only Gold receives (internal/access, alerts.sms); others may keep a choice for later.
CREATE TABLE app.sms_prefs (
  user_id    uuid PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
  metal_id   smallint REFERENCES market.metals (id),
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_prefs_metal_idx ON app.sms_prefs (metal_id) WHERE enabled;

-- Per metal: price changes up to this time have been announced (the worker moves it after each batch).
CREATE TABLE app.price_update_cursor (
  metal_id         smallint PRIMARY KEY REFERENCES market.metals (id),
  notified_through timestamptz NOT NULL
);

-- +goose Down
DROP TABLE app.price_update_cursor;
DROP TABLE app.sms_prefs;
