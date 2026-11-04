-- +goose Up
-- Articles get an uploaded video file (client, 2026-11-04: on our own storage for now, maybe Aparat later). The file
-- is in the object storage bucket (internal/storage) under video_key; the site plays it through a signed link, only
-- to readers who may read the article's body. video_url (Aparat, 00033) stays as the other option.
ALTER TABLE app.articles
  ADD COLUMN video_key   text CHECK (video_key ~ '^articles/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  ADD COLUMN video_bytes bigint CHECK (video_bytes > 0),
  ADD COLUMN video_type  text;

-- +goose Down
ALTER TABLE app.articles DROP COLUMN video_type, DROP COLUMN video_bytes, DROP COLUMN video_key;
