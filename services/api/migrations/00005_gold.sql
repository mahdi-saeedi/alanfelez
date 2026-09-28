-- +goose Up
-- M5 Gold features: IME daily offerings (SCOPE §7), saved calculator runs (§8) and SMS price alerts (#19).
-- Conventions: docs/architecture/DATA_MODEL.md §3. Money = bigint Rial. Weights = bigint kg. Time = timestamptz (UTC).

-- One row per offering in an Iran Mercantile Exchange session. trade_date is the Tehran calendar day.
-- Prices are Rial per kg (how IME publishes them); demand / traded / clearing are empty until the session closes.
CREATE TABLE market.ime_offerings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date          date     NOT NULL,
  metal_id            smallint NOT NULL REFERENCES market.metals (id),
  product_fa          text     NOT NULL,
  product_en          text,
  producer_fa         text     NOT NULL,
  producer_en         text,
  offered_kg          bigint   NOT NULL CHECK (offered_kg > 0),
  base_price_rial     bigint   NOT NULL CHECK (base_price_rial > 0),
  demand_kg           bigint   CHECK (demand_kg >= 0),
  traded_kg           bigint   CHECK (traded_kg >= 0),
  clearing_price_rial bigint   CHECK (clearing_price_rial > 0), -- volume-weighted average of the session
  source              text     NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'demo', 'api')),
  entered_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_date, product_fa, producer_fa),
  CHECK (traded_kg IS NULL OR traded_kg <= offered_kg)
);
CREATE INDEX ime_offerings_date_idx ON market.ime_offerings (trade_date DESC, metal_id);

-- A calculator run the user saved (Gold). input / result are the calculator's JSON (internal/calculator), kept as
-- they were, so a saved result never changes when prices move.
CREATE TABLE app.calculations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  series_id  int  REFERENCES market.price_series (id),
  input      jsonb NOT NULL,
  result     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calculations_user_idx ON app.calculations (user_id, created_at DESC);

-- SMS price alerts (Gold). above / below fire when the price crosses the threshold and re-arm when it crosses back;
-- move fires once per Tehran day when the daily change reaches move_bp (internal/alerts).
CREATE TABLE app.price_alerts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  series_id         int  NOT NULL REFERENCES market.price_series (id),
  kind              text NOT NULL CHECK (kind IN ('above', 'below', 'move')),
  threshold_minor   bigint,
  move_bp           int,
  active            boolean NOT NULL DEFAULT true,
  armed             boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'move' AND move_bp BETWEEN 50 AND 5000 AND threshold_minor IS NULL)
      OR (kind <> 'move' AND threshold_minor > 0 AND move_bp IS NULL))
);
CREATE INDEX price_alerts_user_idx ON app.price_alerts (user_id, created_at DESC);
CREATE INDEX price_alerts_active_idx ON app.price_alerts (series_id) WHERE active;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON market.ime_offerings FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.price_alerts     FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- SMS texts for alerts in environments seeded before M5 (a fresh environment gets them from 30-platform.yaml,
-- which is applied after migrations). Existing admin edits are kept: keys are only added when missing.
UPDATE app.site_settings
SET value = value || jsonb_build_object(
  'price_alert_above', jsonb_build_object('fa', 'الان‌فلز: قیمت {product} به {price} رسید (بالاتر از {threshold}). {url}',
                                          'en', 'Alan Felez: {product} is now {price} (above {threshold}). {url}'),
  'price_alert_below', jsonb_build_object('fa', 'الان‌فلز: قیمت {product} به {price} رسید (پایین‌تر از {threshold}). {url}',
                                          'en', 'Alan Felez: {product} is now {price} (below {threshold}). {url}'),
  'price_alert_move',  jsonb_build_object('fa', 'الان‌فلز: قیمت {product} امروز {change} تغییر کرد و به {price} رسید. {url}',
                                          'en', 'Alan Felez: {product} moved {change} today, now {price}. {url}'))
WHERE key = 'sms_templates' AND NOT (value ? 'price_alert_above');

-- +goose Down
DROP TABLE app.price_alerts;
DROP TABLE app.calculations;
DROP TABLE market.ime_offerings;
UPDATE app.site_settings SET value = value - 'price_alert_above' - 'price_alert_below' - 'price_alert_move' WHERE key = 'sms_templates';
