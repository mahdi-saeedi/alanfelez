-- +goose Up
-- Keywords shown under a locked article's title instead of its summary (client, 2026-10-30): a few words that say what
-- it's about without giving it away. Comma-separated as the editor typed them; empty = the site derives some from the
-- metal and category. Adds columns only; no existing data changes.
ALTER TABLE app.articles
  ADD COLUMN keywords_fa text NOT NULL DEFAULT '',
  ADD COLUMN keywords_en text;

-- +goose Down
ALTER TABLE app.articles DROP COLUMN keywords_en, DROP COLUMN keywords_fa;
