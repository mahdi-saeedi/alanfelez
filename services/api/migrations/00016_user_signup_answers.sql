-- +goose Up
-- The sign-up form's answers (client, 2026-10-27), copied from the access token on each visit like the name (Keycloak
-- stays their owner; the web client's token mappers send them). Shown in the admin users list. Empty for staff and
-- for accounts made before the form; a token without them leaves the stored values as they are.
ALTER TABLE app.users
  ADD COLUMN activity text,    -- one of the form's options: trader, producer, industrial-consumer, distributor, recycler, investor, other
  ADD COLUMN metals   text[],  -- metal slugs (aluminum, copper, …)
  ADD COLUMN province text;    -- as chosen in the form (Persian name)

-- +goose Down
ALTER TABLE app.users DROP COLUMN province, DROP COLUMN metals, DROP COLUMN activity;
