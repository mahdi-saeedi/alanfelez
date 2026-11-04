-- +goose Up
-- Articles get a picture and an Aparat video (client, 2026-11-04). The picture is uploaded in the admin, re-encoded
-- as a JPEG and kept here (like community post images, until Object Storage exists); cover_url then points to the
-- website's /api/articles/{id}/image. The video stays on Aparat (fast in Iran, no storage here): video_url is its
-- page link, and the website shows the picture with a play button that opens Aparat's player in place.
ALTER TABLE app.articles ADD COLUMN video_url text CHECK (video_url ~ '^https://www\.aparat\.com/v/[A-Za-z0-9]+$');

CREATE TABLE app.article_images (
  article_id uuid PRIMARY KEY REFERENCES app.articles (id) ON DELETE CASCADE,
  width      int NOT NULL,
  height     int NOT NULL,
  size_bytes int NOT NULL,
  content    bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE app.article_images;
ALTER TABLE app.articles DROP COLUMN video_url;
