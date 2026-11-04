-- +goose Up
-- Gold price SMS by metal (client, 2026-11-04; owner OK'd). Three kinds, each its own SMS:
--   ime_update   "IME prices updated": for the metals ticked at sign-up (app.users.metals) and the metals chosen for SMS
--   price_update "market prices updated" (the free market, not IME, not world): for the metals chosen for SMS only
--   price_move   ±10 % against the previous day (IME and market): for the metals chosen for SMS only
-- The choice after buying is now several metals (app.sms_metals); app.sms_prefs keeps only the on/off switch, its
-- metal_id is no longer read and is not copied: everyone chooses again (client, 2026-11-04). No daily cap on the "updated" SMS any more (client); the daily SMS budget stays.

CREATE TABLE app.sms_metals (
  user_id  uuid     NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  metal_id smallint NOT NULL REFERENCES market.metals (id),
  PRIMARY KEY (user_id, metal_id)
);
CREATE INDEX sms_metals_metal_idx ON app.sms_metals (metal_id);

-- One cursor per metal and market (ime, free): the two "updated" SMS are announced separately.
ALTER TABLE app.price_update_cursor ADD COLUMN market text NOT NULL DEFAULT 'free';
ALTER TABLE app.price_update_cursor DROP CONSTRAINT price_update_cursor_pkey;
INSERT INTO app.price_update_cursor (metal_id, notified_through, market)
SELECT metal_id, notified_through, 'ime' FROM app.price_update_cursor;
ALTER TABLE app.price_update_cursor ADD PRIMARY KEY (metal_id, market);
ALTER TABLE app.price_update_cursor ALTER COLUMN market DROP DEFAULT;

-- +goose Down
DELETE FROM app.price_update_cursor WHERE market = 'ime';
ALTER TABLE app.price_update_cursor DROP CONSTRAINT price_update_cursor_pkey;
ALTER TABLE app.price_update_cursor DROP COLUMN market;
ALTER TABLE app.price_update_cursor ADD PRIMARY KEY (metal_id);
DROP TABLE app.sms_metals;
