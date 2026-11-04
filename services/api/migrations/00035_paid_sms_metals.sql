-- +goose Up
-- Paid SMS metals (client, 2026-11-04; owner OK'd). With Gold, a member chooses their SMS metals on the checkout page
-- and pays 100,000 Toman per metal per month of the plan (3-month: 300,000, a year: 1,200,000), on top of the plan.
-- Paid metals belong to that subscription and can't be changed or refunded; during the plan a member may add more
-- metals, each at the full price of the plan's length (an «sms_addon» order). These replace app.sms_metals (migration
-- 00031, only ever on staging), which held a free choice.

ALTER TABLE app.orders
  ADD COLUMN sms_metals       text[] NOT NULL DEFAULT '{}',          -- metal slugs bought with this order
  ADD COLUMN sms_rial         bigint NOT NULL DEFAULT 0 CHECK (sms_rial >= 0), -- their price, included in amount_rial
  ADD COLUMN for_subscription uuid REFERENCES app.subscriptions (id); -- sms_addon: the Gold subscription they're added to
ALTER TABLE app.orders DROP CONSTRAINT orders_kind_check;
ALTER TABLE app.orders ADD CONSTRAINT orders_kind_check CHECK (kind IN ('new', 'renewal', 'upgrade', 'downgrade', 'sms_addon'));
ALTER TABLE app.orders ADD CONSTRAINT orders_addon_target CHECK ((kind = 'sms_addon') = (for_subscription IS NOT NULL));

-- The metals a subscription sends price SMS for (the SMS stop when the subscription ends).
CREATE TABLE app.subscription_sms_metals (
  subscription_id uuid     NOT NULL REFERENCES app.subscriptions (id) ON DELETE CASCADE,
  metal_id        smallint NOT NULL REFERENCES market.metals (id),
  order_id        uuid     REFERENCES app.orders (id), -- the order that paid it (none if staff added it)
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, metal_id)
);
CREATE INDEX subscription_sms_metals_metal_idx ON app.subscription_sms_metals (metal_id);

DROP TABLE app.sms_metals;

-- +goose Down
CREATE TABLE app.sms_metals (
  user_id  uuid     NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  metal_id smallint NOT NULL REFERENCES market.metals (id),
  PRIMARY KEY (user_id, metal_id)
);
CREATE INDEX sms_metals_metal_idx ON app.sms_metals (metal_id);
DROP TABLE app.subscription_sms_metals;
DELETE FROM app.orders WHERE kind = 'sms_addon';
ALTER TABLE app.orders DROP CONSTRAINT orders_addon_target;
ALTER TABLE app.orders DROP CONSTRAINT orders_kind_check;
ALTER TABLE app.orders ADD CONSTRAINT orders_kind_check CHECK (kind IN ('new', 'renewal', 'upgrade', 'downgrade'));
ALTER TABLE app.orders DROP COLUMN for_subscription, DROP COLUMN sms_rial, DROP COLUMN sms_metals;
