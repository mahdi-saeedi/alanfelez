-- +goose Up
-- M3 accounts and billing: local user profiles, orders, payments, refunds, paid-feature usage, notifications.
-- Conventions: docs/architecture/DATA_MODEL.md §3. Money = bigint Rial. Time = timestamptz (UTC).

-- A local copy of the Keycloak profile, refreshed from token claims on every authenticated /v1/me call.
-- Keycloak stays the owner of identities; this table exists for joins, admin search and notifications.
CREATE TABLE app.users (
  id           uuid PRIMARY KEY,           -- Keycloak user id (token `sub`)
  username     text NOT NULL,              -- the mobile number for customers (09121234567)
  phone_e164   text,                       -- +989121234567
  first_name   text,
  last_name    text,
  email        text,
  locale       text NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  blocked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_username_idx ON app.users (username);
CREATE INDEX users_phone_idx ON app.users (phone_e164);

-- Orders. amount_rial = what the gateway charges (price − credit). The price row is kept, so history never changes.
CREATE TABLE app.orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  plan_price_id   uuid NOT NULL REFERENCES app.plan_prices (id),
  plan_code       text NOT NULL REFERENCES app.plans (code),
  period          text NOT NULL CHECK (period IN ('month', 'quarter', 'year')),
  kind            text NOT NULL CHECK (kind IN ('new', 'renewal', 'upgrade', 'downgrade')),
  price_rial      bigint NOT NULL CHECK (price_rial >= 0),
  credit_rial     bigint NOT NULL DEFAULT 0 CHECK (credit_rial >= 0),
  amount_rial     bigint NOT NULL CHECK (amount_rial >= 0),
  starts_at       timestamptz NOT NULL,   -- where the subscription will start (quoted at order time)
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),
  idempotency_key text NOT NULL,
  locale          text NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  expires_at      timestamptz NOT NULL,   -- a pending order older than this is abandoned
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_idx ON app.orders (user_id, created_at DESC);
CREATE INDEX orders_pending_idx ON app.orders (expires_at) WHERE status = 'pending';

-- One row per gateway attempt. authority is the gateway's payment id; unique so a callback can't be replayed onto another order.
CREATE TABLE app.payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES app.orders (id),
  gateway     text NOT NULL,
  authority   text NOT NULL UNIQUE,
  amount_rial bigint NOT NULL,
  status      text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'verified', 'failed')),
  ref_id      text,                        -- the gateway's receipt number after verification
  card_mask   text,                        -- masked card number, if the gateway returns one (never the full PAN)
  raw         jsonb NOT NULL DEFAULT '{}', -- gateway responses, for support and reconciliation
  created_at  timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
CREATE INDEX payments_order_idx ON app.payments (order_id);

-- Subscriptions gain the order that created them and a "replaced" state (upgrades end the lower plan early).
ALTER TABLE app.subscriptions ADD COLUMN order_id uuid REFERENCES app.orders (id);
ALTER TABLE app.subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE app.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'cancelled', 'replaced'));
CREATE UNIQUE INDEX subscriptions_order_uq ON app.subscriptions (order_id) WHERE order_id IS NOT NULL;

-- First use of each paid feature per subscription: the objective basis for the refund rule (SCOPE §6).
CREATE TABLE app.entitlement_usage (
  subscription_id uuid NOT NULL REFERENCES app.subscriptions (id),
  feature         text NOT NULL,
  first_used_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, feature)
);

-- Refund requests (money goes back by hand: Iranian gateways have no refund API). One per order.
CREATE TABLE app.refunds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL UNIQUE REFERENCES app.orders (id),
  amount_rial bigint NOT NULL CHECK (amount_rial >= 0),
  status      text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
  reason      text,
  note        text,                        -- staff note, e.g. the bank transfer reference
  decided_by  uuid,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Every message sent to a user (SMS today). dedupe_key makes jobs safe to re-run (one reminder per subscription).
CREATE TABLE app.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  channel    text NOT NULL CHECK (channel IN ('sms')),
  template   text NOT NULL,
  recipient  text NOT NULL,
  body       text NOT NULL,
  status     text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  provider   text NOT NULL,
  cost_rial  int  NOT NULL DEFAULT 0,
  error      text,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON app.notifications (user_id, created_at DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.users   FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.orders  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.refunds FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- +goose Down
DROP TABLE app.notifications;
DROP TABLE app.refunds;
DROP TABLE app.entitlement_usage;
DROP INDEX app.subscriptions_order_uq;
ALTER TABLE app.subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE app.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'cancelled'));
ALTER TABLE app.subscriptions DROP COLUMN order_id;
DROP TABLE app.payments;
DROP TABLE app.orders;
DROP TABLE app.users;
