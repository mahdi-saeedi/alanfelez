-- The sign-up form's optional company name (client, 2026-11-01), copied from the access token on each visit like the
-- other answers (Keycloak stays its owner) and shown in the admin users list.

-- +goose Up
ALTER TABLE app.users ADD COLUMN company text;

-- +goose Down
ALTER TABLE app.users DROP COLUMN company;
