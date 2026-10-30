-- +goose Up
-- Members' own analyses («تحلیل کاربران», client 2026-10-30): Silver and Gold subscribers post a title, text, an
-- optional metal and view, and one chart image. Published at once; staff can hide one (audited), the author can delete
-- their own. New tables only; no existing data changes.
CREATE TABLE app.community_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,                       -- Keycloak user id (sub)
  author_name  text        NOT NULL,                       -- the sign-up name (full or company), as it was when posting
  metal_id     smallint    REFERENCES market.metals (id),
  outlook      text        CHECK (outlook IN ('up', 'down', 'neutral')),
  title        text        NOT NULL CHECK (char_length(title) BETWEEN 3 AND 150),
  body         text        NOT NULL CHECK (char_length(body) BETWEEN 10 AND 3000),
  status       text        NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  hidden_by    uuid,
  hidden_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_posts_feed_idx ON app.community_posts (created_at DESC) WHERE status = 'published';
CREATE INDEX community_posts_user_idx ON app.community_posts (user_id, created_at DESC);

-- The chart image, re-encoded by the API (JPEG, at most 1600 px wide). In Postgres until Object Storage exists
-- (ADR-0028, like the auction PDFs in ADR-0027); kept apart so the feed never reads the files.
CREATE TABLE app.community_post_images (
  post_id     uuid PRIMARY KEY REFERENCES app.community_posts (id) ON DELETE CASCADE,
  width       int   NOT NULL CHECK (width > 0),
  height      int   NOT NULL CHECK (height > 0),
  size_bytes  int   NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  content     bytea NOT NULL
);

-- +goose Down
DROP TABLE app.community_post_images;
DROP TABLE app.community_posts;
