-- CMS content (internal/content): articles, FAQ, pages, site settings. Public reads only see published rows.

-- name: ListArticleCategories :many
SELECT id, slug, name_fa, name_en, sort FROM app.article_categories ORDER BY sort, id;

-- name: CreateArticleCategory :one
INSERT INTO app.article_categories (slug, name_fa, name_en, sort) VALUES ($1, $2, $3, $4)
RETURNING id, slug, name_fa, name_en, sort;

-- name: UpdateArticleCategory :one
UPDATE app.article_categories SET name_fa = $2, name_en = $3, sort = $4 WHERE slug = $1
RETURNING id, slug, name_fa, name_en, sort;

-- name: ListPublishedArticles :many
-- Newest first. Filters are optional (NULL = any).
SELECT a.id, a.type, a.slug, a.outlook, a.featured, a.title_fa, a.title_en, a.summary_fa, a.summary_en,
       a.cover_url, a.read_minutes, a.published_at,
       c.slug AS category_slug, c.name_fa AS category_fa, c.name_en AS category_en,
       m.slug AS metal_slug, m.name_fa AS metal_fa, m.name_en AS metal_en
FROM app.articles a
LEFT JOIN app.article_categories c ON c.id = a.category_id
LEFT JOIN market.metals m ON m.id = a.metal_id
WHERE a.status = 'published' AND a.published_at <= now()
  AND (sqlc.narg(types)::text[] IS NULL OR a.type = ANY (sqlc.narg(types)::text[]))
  AND (sqlc.narg(category)::text IS NULL OR c.slug = sqlc.narg(category)::text)
  AND (sqlc.narg(metal)::text IS NULL OR m.slug = sqlc.narg(metal)::text)
ORDER BY a.published_at DESC, a.id
LIMIT sqlc.arg(lim) OFFSET sqlc.arg(off);

-- name: CountPublishedArticles :one
SELECT count(*) FROM app.articles a
LEFT JOIN app.article_categories c ON c.id = a.category_id
LEFT JOIN market.metals m ON m.id = a.metal_id
WHERE a.status = 'published' AND a.published_at <= now()
  AND (sqlc.narg(types)::text[] IS NULL OR a.type = ANY (sqlc.narg(types)::text[]))
  AND (sqlc.narg(category)::text IS NULL OR c.slug = sqlc.narg(category)::text)
  AND (sqlc.narg(metal)::text IS NULL OR m.slug = sqlc.narg(metal)::text);

-- name: GetPublishedArticle :one
SELECT a.id, a.type, a.slug, a.outlook, a.featured, a.title_fa, a.title_en, a.summary_fa, a.summary_en,
       a.body_fa, a.body_en, a.author_fa, a.author_en, a.cover_url, a.read_minutes, a.published_at, a.updated_at,
       c.slug AS category_slug, c.name_fa AS category_fa, c.name_en AS category_en,
       m.slug AS metal_slug, m.name_fa AS metal_fa, m.name_en AS metal_en
FROM app.articles a
LEFT JOIN app.article_categories c ON c.id = a.category_id
LEFT JOIN market.metals m ON m.id = a.metal_id
WHERE a.slug = $1 AND a.status = 'published' AND a.published_at <= now();

-- name: AdminListArticles :many
SELECT a.id, a.type, a.slug, a.status, a.featured, a.title_fa, a.title_en, a.published_at, a.updated_at,
       c.slug AS category_slug, m.slug AS metal_slug
FROM app.articles a
LEFT JOIN app.article_categories c ON c.id = a.category_id
LEFT JOIN market.metals m ON m.id = a.metal_id
WHERE (sqlc.narg(type)::text IS NULL OR a.type = sqlc.narg(type)::text)
  AND (sqlc.narg(status)::text IS NULL OR a.status = sqlc.narg(status)::text)
  AND (sqlc.arg(q)::text = '' OR a.title_fa ILIKE '%' || sqlc.arg(q)::text || '%'
       OR a.title_en ILIKE '%' || sqlc.arg(q)::text || '%' OR a.slug LIKE '%' || sqlc.arg(q)::text || '%')
ORDER BY a.updated_at DESC
LIMIT 200;

-- name: GetArticle :one
SELECT a.id, a.type, a.slug, a.status, a.outlook, a.featured, a.title_fa, a.title_en, a.summary_fa, a.summary_en,
       a.body_fa, a.body_en, a.author_fa, a.author_en, a.cover_url, a.read_minutes, a.published_at,
       a.created_at, a.updated_at, c.slug AS category_slug, m.slug AS metal_slug
FROM app.articles a
LEFT JOIN app.article_categories c ON c.id = a.category_id
LEFT JOIN market.metals m ON m.id = a.metal_id
WHERE a.id = $1;

-- name: CreateArticle :one
INSERT INTO app.articles (type, slug, status, category_id, metal_id, outlook, featured, title_fa, title_en,
                          summary_fa, summary_en, body_fa, body_en, author_fa, author_en, cover_url, read_minutes,
                          published_at, created_by, updated_by)
VALUES (sqlc.arg(type), sqlc.arg(slug), sqlc.arg(status),
        (SELECT ac.id FROM app.article_categories ac WHERE ac.slug = sqlc.narg(category_slug)::text),
        (SELECT mm.id FROM market.metals mm WHERE mm.slug = sqlc.narg(metal_slug)::text),
        sqlc.narg(outlook), sqlc.arg(featured), sqlc.arg(title_fa), sqlc.narg(title_en),
        sqlc.arg(summary_fa), sqlc.narg(summary_en), sqlc.arg(body_fa), sqlc.narg(body_en),
        sqlc.narg(author_fa), sqlc.narg(author_en), sqlc.narg(cover_url), sqlc.arg(read_minutes),
        CASE WHEN sqlc.arg(status)::text = 'published' THEN coalesce(sqlc.narg(published_at)::timestamptz, now()) ELSE sqlc.narg(published_at)::timestamptz END,
        sqlc.arg(actor), sqlc.arg(actor))
RETURNING id;

-- name: UpdateArticle :one
-- Publishing for the first time stamps published_at (unless one is given, e.g. a scheduled time).
UPDATE app.articles AS a SET
  type = sqlc.arg(type), slug = sqlc.arg(slug), status = sqlc.arg(status),
  category_id = (SELECT ac.id FROM app.article_categories ac WHERE ac.slug = sqlc.narg(category_slug)::text),
  metal_id = (SELECT mm.id FROM market.metals mm WHERE mm.slug = sqlc.narg(metal_slug)::text),
  outlook = sqlc.narg(outlook), featured = sqlc.arg(featured),
  title_fa = sqlc.arg(title_fa), title_en = sqlc.narg(title_en),
  summary_fa = sqlc.arg(summary_fa), summary_en = sqlc.narg(summary_en),
  body_fa = sqlc.arg(body_fa), body_en = sqlc.narg(body_en),
  author_fa = sqlc.narg(author_fa), author_en = sqlc.narg(author_en),
  cover_url = sqlc.narg(cover_url), read_minutes = sqlc.arg(read_minutes),
  published_at = CASE
    WHEN sqlc.narg(published_at)::timestamptz IS NOT NULL THEN sqlc.narg(published_at)::timestamptz
    WHEN sqlc.arg(status)::text = 'published' THEN coalesce(a.published_at, now())
    ELSE a.published_at END,
  updated_by = sqlc.arg(actor)
WHERE a.id = sqlc.arg(id)
RETURNING a.id;

-- name: ListFaqCategories :many
SELECT id, slug, name_fa, name_en, sort FROM app.faq_categories ORDER BY sort, id;

-- name: CreateFaqCategory :one
INSERT INTO app.faq_categories (slug, name_fa, name_en, sort) VALUES ($1, $2, $3, $4)
RETURNING id, slug, name_fa, name_en, sort;

-- name: UpdateFaqCategory :one
UPDATE app.faq_categories SET name_fa = $2, name_en = $3, sort = $4 WHERE slug = $1
RETURNING id, slug, name_fa, name_en, sort;

-- name: ListFaqItems :many
-- Every item in display order; published_only = true for the public site.
SELECT i.id, i.slug, c.slug AS category_slug, i.question_fa, i.question_en, i.answer_fa, i.answer_en,
       i.popular, i.published, i.sort, i.updated_at
FROM app.faq_items i JOIN app.faq_categories c ON c.id = i.category_id
WHERE NOT sqlc.arg(published_only)::boolean OR i.published
ORDER BY c.sort, c.id, i.sort, i.slug;

-- name: CreateFaqItem :one
INSERT INTO app.faq_items (slug, category_id, question_fa, question_en, answer_fa, answer_en, popular, published, sort)
VALUES (sqlc.arg(slug), (SELECT fc.id FROM app.faq_categories fc WHERE fc.slug = sqlc.arg(category_slug)::text),
        sqlc.arg(question_fa), sqlc.narg(question_en), sqlc.arg(answer_fa), sqlc.narg(answer_en),
        sqlc.arg(popular), sqlc.arg(published), sqlc.arg(sort))
RETURNING id;

-- name: UpdateFaqItem :one
UPDATE app.faq_items AS i SET
  category_id = (SELECT fc.id FROM app.faq_categories fc WHERE fc.slug = sqlc.arg(category_slug)::text),
  question_fa = sqlc.arg(question_fa), question_en = sqlc.narg(question_en),
  answer_fa = sqlc.arg(answer_fa), answer_en = sqlc.narg(answer_en),
  popular = sqlc.arg(popular), published = sqlc.arg(published), sort = sqlc.arg(sort)
WHERE i.id = sqlc.arg(id)
RETURNING i.id;

-- name: DeleteFaqItem :execrows
DELETE FROM app.faq_items WHERE id = $1;

-- name: GetPage :one
SELECT slug, title_fa, title_en, body_fa, body_en, published, version, updated_at FROM app.pages WHERE slug = $1;

-- name: ListPages :many
SELECT slug, title_fa, title_en, published, version, updated_at FROM app.pages ORDER BY slug;

-- name: SavePageRevision :exec
-- Keeps the text that is about to be replaced.
INSERT INTO app.page_revisions (slug, version, title_fa, title_en, body_fa, body_en, created_by)
SELECT p.slug, p.version, p.title_fa, p.title_en, p.body_fa, p.body_en, sqlc.arg(actor)::uuid FROM app.pages p WHERE p.slug = sqlc.arg(slug)::text
ON CONFLICT (slug, version) DO NOTHING;

-- name: UpdatePage :one
-- Optimistic lock: no row when someone saved a newer version in between.
UPDATE app.pages SET title_fa = sqlc.arg(title_fa), title_en = sqlc.narg(title_en), body_fa = sqlc.arg(body_fa),
  body_en = sqlc.narg(body_en), published = sqlc.arg(published), version = version + 1, updated_by = sqlc.arg(actor)
WHERE slug = sqlc.arg(slug) AND version = sqlc.arg(expected_version)
RETURNING slug, title_fa, title_en, body_fa, body_en, published, version, updated_at;

-- name: GetSetting :one
SELECT value FROM app.site_settings WHERE key = $1;

-- name: GetSettings :many
SELECT key, value FROM app.site_settings WHERE key = ANY (sqlc.arg(keys)::text[]);

-- name: PutSetting :exec
INSERT INTO app.site_settings (key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
