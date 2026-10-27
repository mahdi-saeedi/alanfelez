-- +goose Up
-- Staff (admin) can delete a user (owner, 2026-10-27): the Keycloak account is deleted, and here the row stays so orders,
-- payments, subscriptions and tickets keep pointing at it for the accounts, but every personal detail is removed
-- (username becomes 'deleted'). See AdminDeleteUser in internal/api/admin_users.go for the full list.
ALTER TABLE app.users ADD COLUMN deleted_at timestamptz;

-- +goose Down
ALTER TABLE app.users DROP COLUMN deleted_at;
