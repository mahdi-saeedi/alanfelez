-- +goose Up
-- «مقالات»: educational articles everyone may read, linked in the footer for SEO (client, 2026-11-04). A new article
-- type next to news, analysis and forecast; the access rule is internal/access ArticlesRead (Free).
ALTER TABLE app.articles DROP CONSTRAINT articles_type_check;
ALTER TABLE app.articles ADD CONSTRAINT articles_type_check CHECK (type IN ('news', 'analysis', 'forecast', 'article'));

-- +goose Down
DELETE FROM app.articles WHERE type = 'article';
ALTER TABLE app.articles DROP CONSTRAINT articles_type_check;
ALTER TABLE app.articles ADD CONSTRAINT articles_type_check CHECK (type IN ('news', 'analysis', 'forecast'));
