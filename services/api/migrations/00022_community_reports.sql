-- +goose Up
-- «گزارش» on a member's analysis (client, 2026-10-30): posts go live at once, so members flag unsuitable ones and staff
-- see the flagged first. One report per member per post. New table only.
CREATE TABLE app.community_post_reports (
  post_id     uuid        NOT NULL REFERENCES app.community_posts (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- +goose Down
DROP TABLE app.community_post_reports;
