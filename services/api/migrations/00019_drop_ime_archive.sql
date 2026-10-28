-- +goose Up
-- The IME offerings moved to the archive schema in 00015 stay in the database backups (staging and production, both
-- checked on 2026-10-28; staging restore drill passed), so the table goes now, and the empty schema with it.
DROP TABLE archive.ime_offerings;
DROP SCHEMA archive;

-- +goose Down
-- The empty table as 00005 created it; its rows come back only from a backup taken before this migration.
CREATE SCHEMA archive;
COMMENT ON SCHEMA archive IS 'Tables the app no longer uses, kept until a backup holds them; dropped by a later migration.';
CREATE TABLE archive.ime_offerings (
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
  clearing_price_rial bigint   CHECK (clearing_price_rial > 0),
  source              text     NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'demo', 'api')),
  entered_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_date, product_fa, producer_fa),
  CHECK (traded_kg IS NULL OR traded_kg <= offered_kg)
);
CREATE INDEX ime_offerings_date_idx ON archive.ime_offerings (trade_date DESC, metal_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON archive.ime_offerings FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
