-- User activity (admin «رفتار کاربران») and the dashboard. Migration 00029.

-- name: PageMetalOfSeries :one
-- The metal of a price row (chart, calculator links); no row when the slug is unknown.
SELECT m.slug AS metal FROM market.price_series s
JOIN market.products p ON p.id = s.product_id
JOIN market.metals m ON m.id = p.metal_id
WHERE s.slug = sqlc.arg(slug);

-- name: PageMetalOfArticle :one
-- The metal an article is about (analysis pages); NULL when it has none.
SELECT m.slug AS metal FROM app.articles a JOIN market.metals m ON m.id = a.metal_id WHERE a.slug = sqlc.arg(slug);

-- name: MetalSlugExists :one
SELECT EXISTS (SELECT 1 FROM market.metals m WHERE m.slug = sqlc.arg(slug))::bool;

-- name: InsertPageView :execrows
-- A signed-in user's page view. The id comes from the browser; a repeat (same id) is ignored.
INSERT INTO app.page_views (id, user_id, day, path, section, metal, series_slug)
VALUES (sqlc.arg(id), sqlc.arg(user_id), sqlc.arg(day)::date, sqlc.arg(path), sqlc.arg(section), sqlc.narg(metal), sqlc.narg(series_slug))
ON CONFLICT (id) DO NOTHING;

-- name: AddActivityView :exec
INSERT INTO app.user_activity_daily (user_id, day, section, metal, views)
VALUES (sqlc.arg(user_id), sqlc.arg(day)::date, sqlc.arg(section), sqlc.arg(metal), 1)
ON CONFLICT (user_id, day, section, metal) DO UPDATE SET views = app.user_activity_daily.views + 1;

-- name: AddMetalView :exec
INSERT INTO app.metal_views_daily (day, metal, views) VALUES (sqlc.arg(day)::date, sqlc.arg(metal), 1)
ON CONFLICT (day, metal) DO UPDATE SET views = app.metal_views_daily.views + 1;

-- name: AddPageViewSeconds :one
-- Time the page was in view, added when the user leaves or hides it (only the user's own view; ≤ 4 h per page).
-- added = what was really added after the cap.
WITH old AS (
  SELECT o.seconds FROM app.page_views o WHERE o.id = sqlc.arg(id) AND o.user_id = sqlc.arg(user_id) FOR UPDATE
)
UPDATE app.page_views pv SET seconds = least(pv.seconds + sqlc.arg(seconds)::int, 14400)
FROM old
WHERE pv.id = sqlc.arg(id) AND pv.user_id = sqlc.arg(user_id)
RETURNING pv.day, pv.section, coalesce(pv.metal, '')::text AS metal, (pv.seconds - old.seconds)::int AS added;

-- name: AddActivitySeconds :exec
INSERT INTO app.user_activity_daily (user_id, day, section, metal, seconds)
VALUES (sqlc.arg(user_id), sqlc.arg(day)::date, sqlc.arg(section), sqlc.arg(metal), sqlc.arg(seconds)::int)
ON CONFLICT (user_id, day, section, metal) DO UPDATE SET seconds = app.user_activity_daily.seconds + excluded.seconds;

-- name: ActivityUsers :many
-- Signed-in users with activity between from and to (Tehran days), with filters; busiest first, or with the most
-- views of the chosen metal first. total = the number of matching users (for paging).
WITH agg AS (
  SELECT a.user_id, count(DISTINCT a.day)::int AS days, sum(a.views)::int AS views, sum(a.seconds)::bigint AS seconds,
         coalesce(sum(a.views) FILTER (WHERE a.metal = sqlc.arg(metal)::text), 0)::int AS metal_views,
         max(a.day)::date AS last_day
  FROM app.user_activity_daily a
  WHERE a.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
  GROUP BY a.user_id
)
SELECT u.id, u.username, u.phone_e164, u.first_name, u.last_name, u.company, u.activity, u.metals, u.province,
       coalesce(cur.plan_code, 'free')::text AS current_plan,
       agg.days, agg.views, agg.seconds, agg.metal_views,
       (SELECT max(pv.at) FROM app.page_views pv WHERE pv.user_id = u.id AND pv.day <= sqlc.arg(to_day)::date)::timestamptz AS last_at,
       count(*) OVER ()::int AS total
FROM agg
JOIN app.users u ON u.id = agg.user_id
LEFT JOIN LATERAL (
  SELECT s.plan_code FROM app.subscriptions s JOIN app.plans p ON p.code = s.plan_code
  WHERE s.user_id = u.id AND s.status = 'active' AND s.starts_at <= now() AND s.ends_at > now()
  ORDER BY p.rank DESC LIMIT 1
) cur ON true
WHERE u.deleted_at IS NULL
  AND (sqlc.arg(metal)::text = '' OR agg.metal_views > 0)
  AND (sqlc.arg(plan)::text = '' OR coalesce(cur.plan_code, 'free') = sqlc.arg(plan)::text)
  AND (sqlc.arg(activity)::text = '' OR u.activity = sqlc.arg(activity)::text)
  AND (sqlc.arg(q)::text = ''
       OR u.username ILIKE '%' || sqlc.arg(q)::text || '%'
       OR u.phone_e164 ILIKE '%' || sqlc.arg(q)::text || '%'
       OR (coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '') || ' ' || coalesce(u.company, '')) ILIKE '%' || sqlc.arg(q)::text || '%'
       OR u.id::text LIKE sqlc.arg(q)::text || '%')
ORDER BY agg.metal_views DESC, agg.seconds DESC, agg.views DESC, u.id
LIMIT sqlc.arg(lim)::int OFFSET sqlc.arg(off)::int;

-- name: ActivityMetals :many
-- Views and seconds per user and metal (only pages about a metal) between from and to.
SELECT a.user_id, a.metal, sum(a.views)::int AS views, sum(a.seconds)::bigint AS seconds
FROM app.user_activity_daily a
WHERE a.user_id = ANY (sqlc.arg(user_ids)::uuid[]) AND a.metal <> ''
  AND a.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
GROUP BY a.user_id, a.metal
ORDER BY a.user_id, views DESC, seconds DESC;

-- name: ActivitySections :many
-- Views and seconds per user and section between from and to.
SELECT a.user_id, a.section, sum(a.views)::int AS views, sum(a.seconds)::bigint AS seconds
FROM app.user_activity_daily a
WHERE a.user_id = ANY (sqlc.arg(user_ids)::uuid[])
  AND a.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
GROUP BY a.user_id, a.section
ORDER BY a.user_id, seconds DESC, views DESC;

-- name: ActivityDays :many
-- One user's views and seconds per day between from and to.
SELECT a.day, sum(a.views)::int AS views, sum(a.seconds)::bigint AS seconds
FROM app.user_activity_daily a
WHERE a.user_id = sqlc.arg(user_id) AND a.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
GROUP BY a.day
ORDER BY a.day;

-- name: ActivityProducts :many
-- One user's most viewed price rows (products) between from and to.
SELECT pv.series_slug::text AS series_slug, p.name_fa, p.name_en, m.slug AS metal, count(*)::int AS views
FROM app.page_views pv
JOIN market.price_series s ON s.slug = pv.series_slug
JOIN market.products p ON p.id = s.product_id
JOIN market.metals m ON m.id = p.metal_id
WHERE pv.user_id = sqlc.arg(user_id) AND pv.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
GROUP BY pv.series_slug, p.name_fa, p.name_en, m.slug
ORDER BY views DESC, pv.series_slug
LIMIT 5;

-- name: ActivityRange :one
-- One user's first and last page view between from and to (NULL when none).
SELECT min(pv.at)::timestamptz AS first_at, max(pv.at)::timestamptz AS last_at
FROM app.page_views pv
WHERE pv.user_id = sqlc.arg(user_id) AND pv.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date;

-- name: ActivityLastDay :one
-- The last day (up to to) the user opened a page, for the profile's default day.
SELECT coalesce(max(a.day), sqlc.arg(to_day)::date)::date AS day
FROM app.user_activity_daily a
WHERE a.user_id = sqlc.arg(user_id) AND a.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date;

-- name: PageViewsOfDay :many
-- One user's page views on one day, in order.
SELECT pv.at, pv.path, pv.section, pv.metal, pv.series_slug, pv.seconds, p.name_fa AS product_fa, p.name_en AS product_en
FROM app.page_views pv
LEFT JOIN market.price_series s ON s.slug = pv.series_slug
LEFT JOIN market.products p ON p.id = s.product_id
WHERE pv.user_id = sqlc.arg(user_id) AND pv.day = sqlc.arg(day)::date
ORDER BY pv.at
LIMIT 500;

-- name: PageViewsForExport :many
-- One user's page views between from and to (the profile's Excel export).
SELECT pv.at, pv.path, pv.section, pv.metal, pv.series_slug, pv.seconds
FROM app.page_views pv
WHERE pv.user_id = sqlc.arg(user_id) AND pv.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
ORDER BY pv.at
LIMIT 20000;

-- name: AdminUserByID :one
-- One user for the activity profile, with the plan they hold now and when it ends.
SELECT u.id, u.username, u.phone_e164, u.first_name, u.last_name, u.email, u.created_at, u.last_seen_at, u.blocked_at,
       u.activity, u.metals, u.province, u.company, u.deleted_at,
       coalesce(cur.plan_code, 'free')::text AS current_plan, cur.ends_at AS current_ends_at
FROM app.users u
LEFT JOIN LATERAL (
  SELECT s.plan_code, s.ends_at FROM app.subscriptions s JOIN app.plans p ON p.code = s.plan_code
  WHERE s.user_id = u.id AND s.status = 'active' AND s.starts_at <= now() AND s.ends_at > now()
  ORDER BY p.rank DESC LIMIT 1
) cur ON true
WHERE u.id = sqlc.arg(id);

-- name: MetalViewsOfDay :many
-- Every visitor's metal page views on one day (dashboard), most viewed first.
SELECT mv.metal, mv.views FROM app.metal_views_daily mv WHERE mv.day = sqlc.arg(day)::date ORDER BY mv.views DESC;

-- name: VisitTotalsOfDay :one
-- One day's visitor totals: from the per-visitor rows while they're kept (90 days), else from the saved totals.
SELECT coalesce(l.visitors, t.visitors, 0)::int AS visitors, coalesce(l.signed_in, t.signed_in, 0)::int AS signed_in,
       coalesce(l.pageviews, t.pageviews, 0)::int AS pageviews
FROM (SELECT 1) one
LEFT JOIN (
  SELECT count(*)::int AS visitors, count(v.user_id)::int AS signed_in, sum(v.pageviews)::int AS pageviews
  FROM app.daily_visits v WHERE v.day = sqlc.arg(day)::date HAVING count(*) > 0
) l ON true
LEFT JOIN app.visit_totals t ON t.day = sqlc.arg(day)::date;

-- name: SaveVisitTotals :execrows
-- Copies the daily totals of past days (before today) into visit_totals, before the per-visitor rows are deleted.
INSERT INTO app.visit_totals (day, visitors, signed_in, pageviews)
SELECT v.day, count(*), count(v.user_id), sum(v.pageviews) FROM app.daily_visits v WHERE v.day < sqlc.arg(today)::date GROUP BY v.day
ON CONFLICT (day) DO UPDATE SET visitors = excluded.visitors, signed_in = excluded.signed_in, pageviews = excluded.pageviews;

-- name: DeleteOldPageViews :execrows
DELETE FROM app.page_views WHERE day < sqlc.arg(before)::date;

-- name: DeleteOldActivity :execrows
DELETE FROM app.user_activity_daily WHERE day < sqlc.arg(before)::date;

-- name: DashboardCounts :one
-- The dashboard's numbers for the day ending at day_end (now, for today): sign-ups in the 7 days before, plans held
-- at day_end and ending in the 7 days after it, and what waits for staff now.
SELECT
  (SELECT count(*) FROM app.users u WHERE u.created_at > sqlc.arg(day_end)::timestamptz - interval '7 days'
     AND u.created_at <= sqlc.arg(day_end)::timestamptz AND u.deleted_at IS NULL)::int AS signups_7d,
  (SELECT count(*) FROM app.users u WHERE u.created_at > sqlc.arg(day_end)::timestamptz - interval '14 days'
     AND u.created_at <= sqlc.arg(day_end)::timestamptz - interval '7 days' AND u.deleted_at IS NULL)::int AS signups_prev_7d,
  (SELECT count(DISTINCT s.user_id) FROM app.subscriptions s WHERE s.plan_code = 'silver' AND s.status = 'active'
     AND s.starts_at <= sqlc.arg(day_end)::timestamptz AND s.ends_at > sqlc.arg(day_end)::timestamptz)::int AS silver,
  (SELECT count(DISTINCT s.user_id) FROM app.subscriptions s WHERE s.plan_code = 'gold' AND s.status = 'active'
     AND s.starts_at <= sqlc.arg(day_end)::timestamptz AND s.ends_at > sqlc.arg(day_end)::timestamptz)::int AS gold,
  (SELECT count(DISTINCT s.user_id) FROM app.subscriptions s WHERE s.status = 'active' AND s.plan_code <> 'free'
     AND s.ends_at > sqlc.arg(day_end)::timestamptz AND s.ends_at <= sqlc.arg(day_end)::timestamptz + interval '7 days'
     AND NOT EXISTS (SELECT 1 FROM app.subscriptions n WHERE n.user_id = s.user_id AND n.status = 'active'
                     AND n.ends_at > s.ends_at AND n.starts_at <= s.ends_at))::int AS expiring_7d,
  (SELECT count(*) FROM app.community_posts cp WHERE cp.status = 'pending')::int AS pending_posts,
  (SELECT count(*) FROM app.comments c WHERE c.status = 'pending')::int AS pending_comments,
  (SELECT count(*) FROM app.tickets t WHERE t.status = 'open')::int AS open_tickets,
  (SELECT count(*) FROM app.contact_messages cm WHERE cm.status = 'new')::int AS new_messages,
  (SELECT count(*) FROM market.price_points pp WHERE pp.status = 'quarantined')::int AS quarantined;

-- name: DashboardMissingPrices :many
-- Domestic price rows that had a price in the 14 days before the day but none on it (day_start..day_end).
SELECT s.slug, p.name_fa, p.name_en, mk.name_fa AS market_fa, mk.name_en AS market_en
FROM market.price_series s
JOIN market.products p ON p.id = s.product_id
JOIN market.markets mk ON mk.id = s.market_id
WHERE s.active AND p.active AND mk.scope = 'domestic'
  AND EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id AND pp.status = 'published'
              AND pp.observed_at >= sqlc.arg(day_start)::timestamptz - interval '14 days' AND pp.observed_at < sqlc.arg(day_start)::timestamptz)
  AND NOT EXISTS (SELECT 1 FROM market.price_points pp WHERE pp.series_id = s.id AND pp.status = 'published'
              AND pp.observed_at >= sqlc.arg(day_start)::timestamptz AND pp.observed_at < sqlc.arg(day_end)::timestamptz)
ORDER BY s.sort, s.slug
LIMIT 50;

-- name: AdminUsersPage :many
-- The admin users list with filters (plan held now, a metal from the sign-up form, activity, province) and paging.
SELECT u.id, u.username, u.phone_e164, u.first_name, u.last_name, u.email, u.created_at, u.last_seen_at, u.blocked_at,
       u.activity, u.metals, u.province, u.company, u.deleted_at, u.signup_source,
       coalesce(cur.plan_code, 'free')::text AS current_plan, cur.ends_at AS current_ends_at,
       count(*) OVER ()::int AS total
FROM app.users u
LEFT JOIN LATERAL (
  SELECT s.plan_code, s.ends_at FROM app.subscriptions s JOIN app.plans p ON p.code = s.plan_code
  WHERE s.user_id = u.id AND s.status = 'active' AND s.starts_at <= now() AND s.ends_at > now()
  ORDER BY p.rank DESC LIMIT 1
) cur ON true
WHERE (sqlc.arg(q)::text = ''
       OR u.username ILIKE '%' || sqlc.arg(q)::text || '%'
       OR u.phone_e164 ILIKE '%' || sqlc.arg(q)::text || '%'
       OR (coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '') || ' ' || coalesce(u.company, '')) ILIKE '%' || sqlc.arg(q)::text || '%'
       OR u.id::text LIKE sqlc.arg(q)::text || '%')
  AND (sqlc.arg(plan)::text = '' OR coalesce(cur.plan_code, 'free') = sqlc.arg(plan)::text)
  AND (sqlc.arg(metal)::text = '' OR sqlc.arg(metal)::text = ANY (u.metals))
  AND (sqlc.arg(activity)::text = '' OR u.activity = sqlc.arg(activity)::text)
  AND (sqlc.arg(province)::text = '' OR u.province = sqlc.arg(province)::text)
  -- Segments for the sales team's own bulk SMS (client, 2026-11-05): a paid SMS metal, a plan ending soon, a sign-up
  -- period and where they came from.
  AND (sqlc.arg(sms_metal)::text = '' OR EXISTS (
        SELECT 1 FROM app.subscription_sms_metals ssm
        JOIN app.subscriptions ss ON ss.id = ssm.subscription_id AND ss.status = 'active' AND ss.starts_at <= now() AND ss.ends_at > now()
        JOIN market.metals mm ON mm.id = ssm.metal_id
        WHERE ss.user_id = u.id AND mm.slug = sqlc.arg(sms_metal)::text))
  AND (sqlc.arg(expires_within)::int = 0 OR (cur.ends_at IS NOT NULL AND cur.ends_at <= now() + make_interval(days => sqlc.arg(expires_within)::int)))
  AND (sqlc.narg(joined_from)::date IS NULL OR (u.created_at AT TIME ZONE 'Asia/Tehran')::date >= sqlc.narg(joined_from)::date)
  AND (sqlc.narg(joined_to)::date IS NULL OR (u.created_at AT TIME ZONE 'Asia/Tehran')::date <= sqlc.narg(joined_to)::date)
  AND (sqlc.arg(source)::text = '' OR u.signup_source = sqlc.arg(source)::text)
ORDER BY u.last_seen_at DESC, u.id
LIMIT sqlc.arg(lim)::int OFFSET sqlc.arg(off)::int;

-- name: UserProvinces :many
-- The provinces users chose (the users page filter).
SELECT DISTINCT u.province::text AS province FROM app.users u WHERE u.province IS NOT NULL AND u.province <> '' ORDER BY 1;
