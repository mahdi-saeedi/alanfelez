-- +goose Up
-- Site analytics for the admin «تحلیل بازدید» (client, 2026-11-05; owner OK'd): what every visitor (named or not)
-- looks at, by audience (guest = not signed in, free, paid = Silver or Gold), where visitors come from, on what device,
-- what they search for, and from which part of the site they reach the plans page. Nameless totals per day; the
-- per-visitor reach rows (one-way daily ids, as in app.daily_visits) are deleted after 90 days like those.

CREATE TABLE app.page_stats_daily (
  day      date   NOT NULL,
  audience text   NOT NULL CHECK (audience IN ('guest', 'free', 'paid')),
  section  text   NOT NULL,
  metal    text   NOT NULL DEFAULT '',  -- metal slug the page was about ('' = none)
  series   text   NOT NULL DEFAULT '',  -- price row (product) the page was about ('' = none)
  views    int    NOT NULL DEFAULT 0 CHECK (views >= 0),
  seconds  bigint NOT NULL DEFAULT 0 CHECK (seconds >= 0), -- time in view
  PRIMARY KEY (day, audience, section, metal, series)
);

-- Who reached what, once per visitor and day: kind 's' section, 'm' metal, 'p' product (price row). Unique counts.
CREATE TABLE app.reach_daily (
  day     date NOT NULL,
  kind    char(1) NOT NULL CHECK (kind IN ('s', 'm', 'p')),
  key     text NOT NULL,
  visitor text NOT NULL,
  PRIMARY KEY (day, kind, key, visitor)
);

-- Visits that started from somewhere: a search engine, a social network, another site, a campaign tag, or direct.
CREATE TABLE app.traffic_daily (
  day      date NOT NULL,
  source   text NOT NULL,
  campaign text NOT NULL DEFAULT '',
  landings int  NOT NULL DEFAULT 0 CHECK (landings >= 0),
  PRIMARY KEY (day, source, campaign)
);

-- The section a visitor was on right before opening the plans or checkout page (the locked feature that sent them).
CREATE TABLE app.plans_from_daily (
  day     date NOT NULL,
  page    text NOT NULL CHECK (page IN ('plans', 'checkout')),
  section text NOT NULL,
  metal   text NOT NULL DEFAULT '',
  views   int  NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (day, page, section, metal)
);

-- What visitors search for on the site, and how often nothing was found.
CREATE TABLE app.search_terms_daily (
  day          date NOT NULL,
  term         text NOT NULL,
  searches     int  NOT NULL DEFAULT 0 CHECK (searches >= 0),
  zero_results int  NOT NULL DEFAULT 0 CHECK (zero_results >= 0),
  PRIMARY KEY (day, term)
);

ALTER TABLE app.daily_visits ADD COLUMN device text CHECK (device IN ('mobile', 'tablet', 'desktop'));
-- Where a member first came from (the visit they signed up in): for «which campaign brought buyers».
ALTER TABLE app.users ADD COLUMN signup_source text, ADD COLUMN signup_campaign text;

-- The privacy page says so (only where the text of migration 00037 is still there; the previous text becomes a revision).
-- +goose StatementBegin
WITH n AS (
  SELECT p.slug, replace(p.body_fa, $a$وقتی وارد حساب نشده‌اید، بازدید شما فقط شمرده می‌شود و به شما ربط داده نمی‌شود.</p>$a$, $a$وقتی وارد حساب نشده‌اید، بازدید شما فقط شمرده می‌شود و به شما ربط داده نمی‌شود.</p>
<p>برای بهبود سایت، این آمارها هم به‌صورت تجمیعی و بدون نام نگهداری می‌شود: سایتی که از آن به الان‌فلز آمده‌اید (مثلاً یک موتور جست‌وجو یا شبکه‌ی اجتماعی، فقط نام آن سایت) و برچسب کمپین تبلیغاتی لینک، نوع دستگاه (موبایل، تبلت یا رایانه)، عبارت‌هایی که در جست‌وجوی سایت می‌نویسید و بخش‌هایی از سایت که بیشتر دیده می‌شوند. برای این کار در مرورگر شما فقط تا بسته شدن همان زبانه، منبع ورود نگه داشته می‌شود و کوکی ساخته نمی‌شود. اگر در همان بازدید ثبت‌نام کنید، منبع ورود همراه حساب شما ثبت می‌شود.</p>$a$) AS body_fa,
         replace(p.body_en, $a$When you are signed in, your usage (section 1) is recorded;$a$, $a$To improve the site we also keep, as nameless totals: the site you came from (a search engine or social network; only its name) and a link's campaign tag, your device type (mobile, tablet or computer), what you type in the site search and which parts of the site are seen most. Only the source of your visit is kept in your browser, until you close that tab; no cookie is set. If you sign up during that visit, its source is recorded with your account. When you are signed in, your usage (section 1) is recorded;$a$) AS body_en
  FROM app.pages p WHERE p.slug = 'privacy' AND position('منبع ورود' in p.body_fa) = 0
),
r AS (
  INSERT INTO app.page_revisions (slug, version, title_fa, title_en, body_fa, body_en)
  SELECT p.slug, p.version, p.title_fa, p.title_en, p.body_fa, p.body_en FROM app.pages p JOIN n ON n.slug = p.slug
  WHERE p.body_fa <> n.body_fa
  ON CONFLICT (slug, version) DO NOTHING
)
UPDATE app.pages p SET body_fa = n.body_fa, body_en = n.body_en, version = p.version + 1, updated_at = now()
FROM n WHERE p.slug = n.slug AND p.body_fa <> n.body_fa;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE app.users DROP COLUMN signup_campaign, DROP COLUMN signup_source;
ALTER TABLE app.daily_visits DROP COLUMN device;
DROP TABLE app.search_terms_daily;
DROP TABLE app.plans_from_daily;
DROP TABLE app.traffic_daily;
DROP TABLE app.reach_daily;
DROP TABLE app.page_stats_daily;
