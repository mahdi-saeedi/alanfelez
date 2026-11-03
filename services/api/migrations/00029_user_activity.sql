-- +goose Up
-- User activity for the admin «رفتار کاربران» (client 2026-11-03, owner OK by phone): which pages a signed-in user
-- opened, how long the page was in view, and which metal it was about, so sales staff know what each customer
-- follows. Anonymous visitors are never named: they only add to the per-metal daily totals (no id at all).
-- Retention (privacy page, client to confirm the wording): page views 1 year, the daily summary 2 years
-- (internal/visits: PageViewRetention, ActivityRetention). The totals tables hold no personal data and are kept.

-- One page a signed-in user opened. The browser makes the id, so the time spent can be added when the page is left.
CREATE TABLE app.page_views (
  id          uuid        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  day         date        NOT NULL,                   -- Tehran calendar day
  at          timestamptz NOT NULL DEFAULT now(),
  path        text        NOT NULL,                   -- path and query, as the browser showed it (≤ 300 chars)
  section     text        NOT NULL,                   -- home, prices, chart, auctions, analysis, … (visits.Section)
  metal       text,                                   -- metal slug the page was about, if any
  series_slug text,                                   -- the price row (product) the page was about, if any
  seconds     int         NOT NULL DEFAULT 0 CHECK (seconds >= 0) -- time the page was visible
);
CREATE INDEX page_views_user_idx ON app.page_views (user_id, at DESC);
CREATE INDEX page_views_day_idx ON app.page_views (day);

-- Per user, day, section and metal ('' = no metal): views and seconds. What the lists, the profile and the export read.
CREATE TABLE app.user_activity_daily (
  user_id uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  day     date NOT NULL,
  section text NOT NULL,
  metal   text NOT NULL DEFAULT '',
  views   int  NOT NULL DEFAULT 0 CHECK (views >= 0),
  seconds int  NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  PRIMARY KEY (user_id, day, section, metal)
);
CREATE INDEX user_activity_daily_day_idx ON app.user_activity_daily (day);

-- Every visitor (signed in or not), per day and metal: the dashboard's «کاربران به کدام فلز سر زدند؟».
CREATE TABLE app.metal_views_daily (
  day   date NOT NULL,
  metal text NOT NULL,
  views int  NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (day, metal)
);

-- The daily visitor totals, kept after the per-visitor rows (90 days) are deleted, so the dashboard shows any date.
CREATE TABLE app.visit_totals (
  day       date PRIMARY KEY,
  visitors  int NOT NULL,
  signed_in int NOT NULL,
  pageviews int NOT NULL
);
INSERT INTO app.visit_totals (day, visitors, signed_in, pageviews)
SELECT v.day, count(*), count(v.user_id), sum(v.pageviews) FROM app.daily_visits v GROUP BY v.day;

-- +goose Down
DROP TABLE app.visit_totals;
DROP TABLE app.metal_views_daily;
DROP TABLE app.user_activity_daily;
DROP TABLE app.page_views;
