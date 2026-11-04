-- +goose Up
-- The welcome SMS goes once per mobile number for the life of the site (client, 2026-11-04): a number that signs up
-- again after its account was deleted gets none. Only a hash of the number is kept, so deleting the account
-- (AnonymizeUser) still removes the number itself.
CREATE TABLE app.welcomed_phones (
  phone_sha256 bytea PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE app.welcomed_phones;
