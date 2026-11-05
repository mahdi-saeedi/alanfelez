-- Site analytics (admin «تحلیل بازدید», client 2026-11-05): nameless daily totals; see migration 00038.

-- name: AddPageStat :exec
INSERT INTO app.page_stats_daily (day, audience, section, metal, series, views, seconds)
VALUES (sqlc.arg(day), sqlc.arg(audience), sqlc.arg(section), sqlc.arg(metal), sqlc.arg(series), sqlc.arg(views), sqlc.arg(seconds))
ON CONFLICT (day, audience, section, metal, series) DO UPDATE
SET views = app.page_stats_daily.views + EXCLUDED.views, seconds = app.page_stats_daily.seconds + EXCLUDED.seconds;

-- name: AddReach :exec
INSERT INTO app.reach_daily (day, kind, key, visitor) VALUES (sqlc.arg(day), sqlc.arg(kind), sqlc.arg(key), sqlc.arg(visitor))
ON CONFLICT DO NOTHING;

-- name: AddLanding :exec
INSERT INTO app.traffic_daily (day, source, campaign, landings) VALUES (sqlc.arg(day), sqlc.arg(source), sqlc.arg(campaign), 1)
ON CONFLICT (day, source, campaign) DO UPDATE SET landings = app.traffic_daily.landings + 1;

-- name: AddPlansFrom :exec
INSERT INTO app.plans_from_daily (day, page, section, metal, views) VALUES (sqlc.arg(day), sqlc.arg(page), sqlc.arg(section), sqlc.arg(metal), 1)
ON CONFLICT (day, page, section, metal) DO UPDATE SET views = app.plans_from_daily.views + 1;

-- name: AddSearch :exec
INSERT INTO app.search_terms_daily (day, term, searches, zero_results) VALUES (sqlc.arg(day), sqlc.arg(term), 1, sqlc.arg(zero))
ON CONFLICT (day, term) DO UPDATE SET searches = app.search_terms_daily.searches + 1,
  zero_results = app.search_terms_daily.zero_results + EXCLUDED.zero_results;

-- name: SetSignupSource :exec
-- A new member's first source (only within a day of their first visit, and never overwritten).
UPDATE app.users u SET signup_source = sqlc.arg(source), signup_campaign = sqlc.narg(campaign)
WHERE u.id = sqlc.arg(id) AND u.signup_source IS NULL AND u.created_at > now() - interval '1 day';

-- name: DeleteOldReach :execrows
DELETE FROM app.reach_daily WHERE day < sqlc.arg(before)::date;

-- name: AnalyticsProducts :many
-- Price rows (products) seen in a period: views, time, unique visitors (90 days back only), and the views of the
-- period before (for the trend). Most viewed first.
WITH cur AS (
  SELECT ps.series, sum(ps.views)::bigint AS views, sum(ps.seconds)::bigint AS seconds,
         sum(ps.views) FILTER (WHERE ps.audience = 'paid')::bigint AS paid_views
  FROM app.page_stats_daily ps
  WHERE ps.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date AND ps.series <> ''
  GROUP BY ps.series
),
prev AS (
  SELECT ps.series, sum(ps.views)::bigint AS views FROM app.page_stats_daily ps
  WHERE ps.day BETWEEN sqlc.arg(prev_from)::date AND sqlc.arg(prev_to)::date AND ps.series <> ''
  GROUP BY ps.series
),
reach AS (
  SELECT r.key AS series, count(DISTINCT r.visitor)::bigint AS visitors FROM app.reach_daily r
  WHERE r.kind = 'p' AND r.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date GROUP BY r.key
)
SELECT cur.series, s.currency, s.unit, pr.name_fa AS product_fa, pr.name_en AS product_en, m.slug AS metal,
       m.name_fa AS metal_fa, m.name_en AS metal_en, mk.slug AS market, mk.name_fa AS market_fa, mk.name_en AS market_en,
       cur.views, cur.seconds, coalesce(cur.paid_views, 0)::bigint AS paid_views,
       coalesce(reach.visitors, 0)::bigint AS visitors, coalesce(prev.views, 0)::bigint AS prev_views
FROM cur
JOIN market.price_series s ON s.slug = cur.series
JOIN market.products pr ON pr.id = s.product_id
JOIN market.metals m ON m.id = pr.metal_id
JOIN market.markets mk ON mk.id = s.market_id
LEFT JOIN prev ON prev.series = cur.series
LEFT JOIN reach ON reach.series = cur.series
ORDER BY cur.views DESC, cur.series
LIMIT 300;

-- name: AnalyticsMetals :many
-- Metals seen in a period (any page about the metal, by everyone), with unique visitors and the period before.
WITH cur AS (
  SELECT ps.metal, sum(ps.views)::bigint AS views, sum(ps.seconds)::bigint AS seconds FROM app.page_stats_daily ps
  WHERE ps.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date AND ps.metal <> '' GROUP BY ps.metal
),
prev AS (
  SELECT ps.metal, sum(ps.views)::bigint AS views FROM app.page_stats_daily ps
  WHERE ps.day BETWEEN sqlc.arg(prev_from)::date AND sqlc.arg(prev_to)::date AND ps.metal <> '' GROUP BY ps.metal
),
reach AS (
  SELECT r.key AS metal, count(DISTINCT r.visitor)::bigint AS visitors FROM app.reach_daily r
  WHERE r.kind = 'm' AND r.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date GROUP BY r.key
)
SELECT m.slug AS metal, m.name_fa, m.name_en, coalesce(cur.views, 0)::bigint AS views, coalesce(cur.seconds, 0)::bigint AS seconds,
       coalesce(reach.visitors, 0)::bigint AS visitors, coalesce(prev.views, 0)::bigint AS prev_views
FROM market.metals m
LEFT JOIN cur ON cur.metal = m.slug
LEFT JOIN prev ON prev.metal = m.slug
LEFT JOIN reach ON reach.metal = m.slug
ORDER BY coalesce(cur.views, 0) DESC, m.sort;

-- name: AnalyticsSections :many
-- Sections in a period by audience (guest, free, paid): views and time; with unique visitors per section.
WITH st AS (
  SELECT ps.section, ps.audience, sum(ps.views)::bigint AS views, sum(ps.seconds)::bigint AS seconds FROM app.page_stats_daily ps
  WHERE ps.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date GROUP BY ps.section, ps.audience
),
reach AS (
  SELECT r.key AS section, count(DISTINCT r.visitor)::bigint AS visitors FROM app.reach_daily r
  WHERE r.kind = 's' AND r.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date GROUP BY r.key
)
SELECT st.section, st.audience, st.views, st.seconds, coalesce(reach.visitors, 0)::bigint AS visitors
FROM st LEFT JOIN reach ON reach.section = st.section
ORDER BY st.section, st.audience;

-- name: AnalyticsFunnel :one
-- Visitors → sign-ups → reached the plans page → reached checkout → bought (distinct members), in a period.
SELECT
  (SELECT count(DISTINCT v.visitor) FROM app.daily_visits v WHERE v.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date)::bigint AS visitors,
  (SELECT coalesce(sum(t.visitors), 0) FROM app.visit_totals t WHERE t.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date)::bigint AS visitor_days,
  (SELECT count(*) FROM app.users u WHERE u.phone_e164 IS NOT NULL AND (u.created_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date)::bigint AS signups,
  (SELECT count(DISTINCT r.visitor) FROM app.reach_daily r WHERE r.kind = 's' AND r.key = 'plans' AND r.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date)::bigint AS plans_visitors,
  (SELECT count(DISTINCT r.visitor) FROM app.reach_daily r WHERE r.kind = 's' AND r.key = 'checkout' AND r.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date)::bigint AS checkout_visitors,
  (SELECT count(DISTINCT o.user_id) FROM app.orders o WHERE o.status IN ('paid', 'refunded') AND (o.paid_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date)::bigint AS buyers;

-- name: AnalyticsPlansFrom :many
-- The section (and metal) visitors were on right before opening the plans or checkout page.
SELECT pf.page, pf.section, pf.metal, sum(pf.views)::bigint AS views FROM app.plans_from_daily pf
WHERE pf.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
GROUP BY pf.page, pf.section, pf.metal ORDER BY views DESC LIMIT 50;

-- name: AnalyticsTraffic :many
-- Where visits came from in a period, with the members who signed up from each source and those of them who paid.
WITH t AS (
  SELECT tr.source, tr.campaign, sum(tr.landings)::bigint AS landings FROM app.traffic_daily tr
  WHERE tr.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date GROUP BY tr.source, tr.campaign
),
m AS (
  SELECT u.signup_source AS source, coalesce(u.signup_campaign, '') AS campaign, count(*)::bigint AS signups,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM app.orders o WHERE o.user_id = u.id AND o.status IN ('paid', 'refunded')))::bigint AS buyers
  FROM app.users u
  WHERE u.signup_source IS NOT NULL AND (u.created_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
  GROUP BY u.signup_source, coalesce(u.signup_campaign, '')
)
SELECT coalesce(t.source, m.source)::text AS source, coalesce(t.campaign, m.campaign)::text AS campaign,
       coalesce(t.landings, 0)::bigint AS landings, coalesce(m.signups, 0)::bigint AS signups, coalesce(m.buyers, 0)::bigint AS buyers
FROM t FULL JOIN m ON m.source = t.source AND m.campaign = t.campaign
ORDER BY landings DESC, signups DESC LIMIT 100;

-- name: AnalyticsDevices :many
SELECT coalesce(v.device, 'unknown')::text AS device, count(*)::bigint AS visitor_days FROM app.daily_visits v
WHERE v.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
GROUP BY coalesce(v.device, 'unknown') ORDER BY visitor_days DESC;

-- name: AnalyticsProvinces :many
-- Members by the province they gave at sign-up, with those holding a paid plan now.
SELECT coalesce(nullif(u.province, ''), '')::text AS province, count(*)::bigint AS members,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM app.subscriptions sub WHERE sub.user_id = u.id AND sub.status = 'active'
                                      AND sub.starts_at <= now() AND sub.ends_at > now()))::bigint AS paying
FROM app.users u WHERE u.phone_e164 IS NOT NULL AND u.deleted_at IS NULL
GROUP BY 1 ORDER BY members DESC;

-- name: AnalyticsSearches :many
SELECT st.term, sum(st.searches)::bigint AS searches, sum(st.zero_results)::bigint AS zero_results FROM app.search_terms_daily st
WHERE st.day BETWEEN sqlc.arg(from_day)::date AND sqlc.arg(to_day)::date
GROUP BY st.term ORDER BY searches DESC, st.term LIMIT 100;
