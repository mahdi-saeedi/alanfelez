-- Members' analyses are reviewed before they show (client, 2026-11-02): a new post waits as 'pending' until staff
-- publish it. Posts already on the site stay published. Plus star ratings (1–5) and comments on members' analyses
-- and on the team's articles; comments are reviewed too, except staff's own. Who may rate and comment is the access
-- rule of what is rated (internal/api/discussion.go): members' analyses Silver, the experts' analyses Gold.

-- +goose Up
ALTER TABLE app.community_posts DROP CONSTRAINT community_posts_status_check;
ALTER TABLE app.community_posts ADD CONSTRAINT community_posts_status_check CHECK (status IN ('pending', 'published', 'hidden'));
ALTER TABLE app.community_posts ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE app.community_posts ADD COLUMN reviewed_by uuid, ADD COLUMN reviewed_at timestamptz;
CREATE INDEX community_posts_pending_idx ON app.community_posts (created_at) WHERE status = 'pending';

-- One rating per person and item; changing it replaces it. target_id is a community post or an article (no FK: two
-- tables; deleting the item deletes its ratings and comments in the API).
CREATE TABLE app.ratings (
  target_kind text        NOT NULL CHECK (target_kind IN ('post', 'article')),
  target_id   uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  stars       smallint    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id, user_id)
);

CREATE TABLE app.comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind  text        NOT NULL CHECK (target_kind IN ('post', 'article')),
  target_id    uuid        NOT NULL,
  user_id      uuid        NOT NULL,
  author_name  text        NOT NULL,                      -- as it was when commenting; staff show as the team
  staff        boolean     NOT NULL DEFAULT false,
  body         text        NOT NULL CHECK (char_length(body) BETWEEN 2 AND 1000),
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden')),
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_target_idx ON app.comments (target_kind, target_id, created_at);
CREATE INDEX comments_pending_idx ON app.comments (created_at) WHERE status = 'pending';

-- +goose Down
DROP TABLE app.comments;
DROP TABLE app.ratings;
DROP INDEX app.community_posts_pending_idx;
ALTER TABLE app.community_posts DROP COLUMN reviewed_at, DROP COLUMN reviewed_by;
UPDATE app.community_posts SET status = 'hidden' WHERE status = 'pending';
ALTER TABLE app.community_posts ALTER COLUMN status SET DEFAULT 'published';
ALTER TABLE app.community_posts DROP CONSTRAINT community_posts_status_check;
ALTER TABLE app.community_posts ADD CONSTRAINT community_posts_status_check CHECK (status IN ('published', 'hidden'));
