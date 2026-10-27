-- +goose Up
-- Daily visitor counts for the admin («آمار بازدید», client 2026-10-27). Cookieless: an anonymous visitor is
-- sha256(the day's salt, IP, user agent), so nothing ties two days together once the salt is deleted (the cleanup
-- job keeps today's and yesterday's) and the IP itself is never stored. A signed-in visitor is their user id, so
-- staff see who came. Kept 90 days (privacy page §5).
CREATE TABLE app.visit_salts (
  day        date PRIMARY KEY, -- Tehran calendar day
  salt       uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.daily_visits (
  day       date NOT NULL,         -- Tehran calendar day
  visitor   text NOT NULL,         -- 'u:<user id>' or 'a:<one-way daily id>'
  user_id   uuid,                  -- set for signed-in visitors
  first_at  timestamptz NOT NULL DEFAULT now(),
  last_at   timestamptz NOT NULL DEFAULT now(),
  pageviews int NOT NULL DEFAULT 1 CHECK (pageviews > 0),
  PRIMARY KEY (day, visitor)
);
CREATE INDEX daily_visits_user_idx ON app.daily_visits (day, user_id) WHERE user_id IS NOT NULL;

-- +goose Down
DROP TABLE app.daily_visits;
DROP TABLE app.visit_salts;
