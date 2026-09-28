-- +goose Up
-- Foundation: schemas, shared helpers, reference tables and seed bookkeeping.
-- Conventions: docs/architecture/DATA_MODEL.md. Money = bigint minor units. Time = timestamptz (UTC).

CREATE SCHEMA IF NOT EXISTS market;
CREATE SCHEMA IF NOT EXISTS app;

-- +goose StatementBegin
CREATE FUNCTION app.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
-- +goose StatementEnd

-- market reference data ------------------------------------------------------

CREATE TABLE market.metals (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_fa    text NOT NULL,
  name_en    text,
  sort       int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market.product_categories (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_fa    text NOT NULL,
  name_en    text,
  sort       int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market.markets (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name_fa    text NOT NULL,
  name_en    text,
  scope      text NOT NULL CHECK (scope IN ('domestic', 'global')),
  sort       int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- billing reference data -----------------------------------------------------

CREATE TABLE app.plans (
  code       text PRIMARY KEY CHECK (code ~ '^[a-z]+$'),
  name_fa    text NOT NULL,
  name_en    text,
  rank       int  NOT NULL UNIQUE,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prices are versioned: a change closes the current row (valid_to) and opens a new one,
-- so orders keep pointing at the exact price the user paid.
CREATE TABLE app.plan_prices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code   text   NOT NULL REFERENCES app.plans (code),
  period      text   NOT NULL CHECK (period IN ('month', 'quarter', 'year')),
  amount_rial bigint NOT NULL CHECK (amount_rial >= 0),
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz CHECK (valid_to IS NULL OR valid_to > valid_from),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plan_prices_current_uq ON app.plan_prices (plan_code, period) WHERE valid_to IS NULL;

-- platform -------------------------------------------------------------------

CREATE TABLE app.feature_flags (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.-]+$'),
  enabled     boolean NOT NULL DEFAULT false,
  rules       jsonb   NOT NULL DEFAULT '{}',
  description text,
  owner       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.site_settings (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.-]+$'),
  value      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed bookkeeping: which seed file (by checksum) was applied, per profile.
CREATE TABLE app.seed_runs (
  profile    text NOT NULL,
  file       text NOT NULL,
  checksum   text NOT NULL,
  rows       int  NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile, file)
);

-- updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON market.metals             FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON market.product_categories FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON market.markets            FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.plans                 FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.plan_prices           FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.feature_flags         FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app.site_settings         FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- +goose Down
DROP SCHEMA app CASCADE;
DROP SCHEMA market CASCADE;
