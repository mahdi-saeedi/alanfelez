package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Who may edit what (SCOPE §10). Reads are open to every staff role.
var (
	rolesContentWrite  = []string{auth.RoleEditor, auth.RoleAdmin}
	rolesSettingsWrite = []string{auth.RoleAdmin}
)

// tx runs fn in one transaction, so a change and its audit row are written together.
func (s *Server) tx(ctx context.Context, fn func(q *dbq.Queries) error) error {
	if err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return fn(dbq.New(tx)) }); err != nil {
		return fmt.Errorf("tx: %w", err)
	}
	return nil
}

// --- articles -------------------------------------------------------------------------

// AdminListArticles lists articles in any status.
func (s *Server) AdminListArticles(ctx context.Context, req AdminListArticlesRequestObject) (AdminListArticlesResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListArticlesdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	arg := dbq.AdminListArticlesParams{}
	if req.Params.Type != nil {
		arg.Type = textOf(string(*req.Params.Type))
	}
	if req.Params.Status != nil {
		arg.Status = textOf(string(*req.Params.Status))
	}
	if req.Params.Q != nil {
		arg.Q = strings.TrimSpace(*req.Params.Q)
	}
	rows, err := s.q.AdminListArticles(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("admin list articles: %w", err)
	}
	items := make([]AdminArticleRow, 0, len(rows))
	for _, r := range rows {
		items = append(items, AdminArticleRow{
			Id: r.ID.Bytes, Type: ArticleType(r.Type), Slug: r.Slug, Status: ArticleStatus(r.Status), Featured: r.Featured,
			TitleFa: r.TitleFa, TitleEn: textp(r.TitleEn), Category: textp(r.CategorySlug), Metal: textp(r.MetalSlug),
			PublishedAt: timep(r.PublishedAt), UpdatedAt: r.UpdatedAt.Time.UTC(),
		})
	}
	return AdminListArticles200JSONResponse{Items: items}, nil
}

// AdminGetArticle returns one article for editing.
func (s *Server) AdminGetArticle(ctx context.Context, req AdminGetArticleRequestObject) (AdminGetArticleResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminGetArticledefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	a, err := s.q.GetArticle(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminGetArticledefaultApplicationProblemPlusJSONResponse](notFound(ctx, "article")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("get article: %w", err)
	}
	return AdminGetArticle200JSONResponse(adminArticleOf(a)), nil
}

// AdminCreateArticle creates an article.
func (s *Server) AdminCreateArticle(ctx context.Context, req AdminCreateArticleRequestObject) (AdminCreateArticleResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminCreateArticledefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	arg, msg, err := s.articleParams(ctx, *req.Body, p)
	if err != nil {
		return nil, err
	}
	if msg != "" {
		return fail[AdminCreateArticledefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	var id pgtype.UUID
	err = s.tx(ctx, func(q *dbq.Queries) error {
		if id, err = q.CreateArticle(ctx, arg); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{
			Action: "article.create", Entity: "article", EntityID: *uuidString(id), Data: map[string]string{"slug": arg.Slug, "type": arg.Type, "status": arg.Status},
		})
	})
	if isUniqueViolation(err) {
		return fail[AdminCreateArticledefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug already used")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create article: %w", err)
	}
	a, err := s.q.GetArticle(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get article: %w", err)
	}
	return AdminCreateArticle201JSONResponse(adminArticleOf(a)), nil
}

// AdminUpdateArticle replaces an article.
func (s *Server) AdminUpdateArticle(ctx context.Context, req AdminUpdateArticleRequestObject) (AdminUpdateArticleResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminUpdateArticledefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	c, msg, err := s.articleParams(ctx, *req.Body, p)
	if err != nil {
		return nil, err
	}
	if msg != "" {
		return fail[AdminUpdateArticledefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	arg := dbq.UpdateArticleParams{
		ID: id, Type: c.Type, Slug: c.Slug, Status: c.Status, CategorySlug: c.CategorySlug, MetalSlug: c.MetalSlug,
		Outlook: c.Outlook, Featured: c.Featured, TitleFa: c.TitleFa, TitleEn: c.TitleEn, SummaryFa: c.SummaryFa,
		SummaryEn: c.SummaryEn, BodyFa: c.BodyFa, BodyEn: c.BodyEn, AuthorFa: c.AuthorFa, AuthorEn: c.AuthorEn,
		CoverUrl: c.CoverUrl, ReadMinutes: c.ReadMinutes, PublishedAt: c.PublishedAt, Actor: c.Actor,
	}
	err = s.tx(ctx, func(q *dbq.Queries) error {
		if _, err := q.UpdateArticle(ctx, arg); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{
			Action: "article.update", Entity: "article", EntityID: *uuidString(id), Data: map[string]string{"slug": arg.Slug, "type": arg.Type, "status": arg.Status},
		})
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return fail[AdminUpdateArticledefaultApplicationProblemPlusJSONResponse](notFound(ctx, "article")), nil
	case isUniqueViolation(err):
		return fail[AdminUpdateArticledefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug already used")), nil
	case err != nil:
		return nil, fmt.Errorf("update article: %w", err)
	}
	a, err := s.q.GetArticle(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get article: %w", err)
	}
	return AdminUpdateArticle200JSONResponse(adminArticleOf(a)), nil
}

// articleParams validates and sanitizes an article. msg is the 400 detail when the input is invalid.
func (s *Server) articleParams(ctx context.Context, in AdminArticleInput, p *auth.Principal) (dbq.CreateArticleParams, string, error) {
	var out dbq.CreateArticleParams
	if tooLong(in.BodyFa, 200_000) || tooLong(deref(in.BodyEn), 200_000) || tooLong(in.SummaryFa, 2_000) || tooLong(deref(in.SummaryEn), 2_000) ||
		tooLong(deref(in.TitleEn), 200) || tooLong(deref(in.AuthorFa), 100) || tooLong(deref(in.AuthorEn), 100) || tooLong(deref(in.CoverUrl), 500) {
		return out, "a field is too long", nil
	}
	if _, ok := content.Type(in.Type).Feature(); !ok {
		return out, "unknown type", nil
	}
	if !slices.Contains([]ArticleStatus{ArticleStatusDraft, ArticleStatusPublished, ArticleStatusArchived}, in.Status) {
		return out, "unknown status", nil
	}
	slug := strings.TrimSpace(in.Slug)
	if !content.ValidSlug(slug) {
		return out, "slug: lowercase latin words joined by hyphens", nil
	}
	title, ok := content.Clean(in.TitleFa, 3, 200)
	if !ok {
		return out, "titleFa must be 3–200 characters", nil
	}
	body := content.Sanitize(in.BodyFa)
	if in.Status == ArticleStatusPublished && content.PlainText(body) == "" {
		return out, "a published article needs a Persian body", nil
	}
	if in.Outlook != nil && !slices.Contains([]Outlook{Up, Down, Neutral}, *in.Outlook) {
		return out, "unknown outlook", nil
	}
	cover := optText(in.CoverUrl)
	if cover.Valid && !safeURL(cover.String) {
		return out, "coverUrl must be https:// or a site path", nil
	}
	category, metal := optText(in.Category), optText(in.Metal)
	if category.Valid {
		cats, err := s.q.ListArticleCategories(ctx)
		if err != nil {
			return out, "", fmt.Errorf("categories: %w", err)
		}
		if !slices.ContainsFunc(cats, func(c dbq.ListArticleCategoriesRow) bool { return c.Slug == category.String }) {
			return out, "unknown category", nil
		}
	}
	if metal.Valid {
		metals, err := s.q.ListMetals(ctx)
		if err != nil {
			return out, "", fmt.Errorf("metals: %w", err)
		}
		if !slices.ContainsFunc(metals, func(m dbq.ListMetalsRow) bool { return m.Slug == metal.String }) {
			return out, "unknown metal", nil
		}
	}
	summary := content.PlainText(in.SummaryFa)
	if summary == "" {
		summary = firstWords(content.PlainText(body), 40)
	}
	out = dbq.CreateArticleParams{
		Type: string(in.Type), Slug: slug, Status: string(in.Status), CategorySlug: category, MetalSlug: metal,
		Featured: in.Featured, TitleFa: title, TitleEn: optText(in.TitleEn), SummaryFa: summary,
		SummaryEn: plainOpt(in.SummaryEn), BodyFa: body, BodyEn: sanitizedOpt(in.BodyEn),
		AuthorFa: optText(in.AuthorFa), AuthorEn: optText(in.AuthorEn), CoverUrl: cover,
		ReadMinutes: int32(content.ReadMinutes(body)), Actor: p.ID, //nolint:gosec // bodies are ≤ 200k chars: ≤ 1,000 minutes
	}
	if in.Outlook != nil {
		out.Outlook = textOf(string(*in.Outlook))
	}
	if in.PublishedAt != nil {
		out.PublishedAt = pgtype.Timestamptz{Time: in.PublishedAt.UTC(), Valid: true}
	}
	return out, "", nil
}

func adminArticleOf(a dbq.GetArticleRow) AdminArticle {
	out := AdminArticle{
		Id: a.ID.Bytes, Type: ArticleType(a.Type), Slug: a.Slug, Status: ArticleStatus(a.Status), Featured: a.Featured,
		Category: textp(a.CategorySlug), Metal: textp(a.MetalSlug), Outlook: outlookOf(a.Outlook),
		TitleFa: a.TitleFa, TitleEn: textp(a.TitleEn), SummaryFa: a.SummaryFa, SummaryEn: textp(a.SummaryEn),
		BodyFa: a.BodyFa, BodyEn: textp(a.BodyEn), AuthorFa: textp(a.AuthorFa), AuthorEn: textp(a.AuthorEn),
		CoverUrl: textp(a.CoverUrl), ReadMinutes: int(a.ReadMinutes), PublishedAt: timep(a.PublishedAt),
		CreatedAt: a.CreatedAt.Time.UTC(), UpdatedAt: a.UpdatedAt.Time.UTC(),
	}
	return out
}

// --- categories -----------------------------------------------------------------------

// AdminListArticleCategories lists article categories.
func (s *Server) AdminListArticleCategories(ctx context.Context, _ AdminListArticleCategoriesRequestObject) (AdminListArticleCategoriesResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListArticleCategoriesdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.ListArticleCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("list article categories: %w", err)
	}
	items := make([]AdminCategory, 0, len(rows))
	for _, r := range rows {
		items = append(items, categoryOf(r.Slug, r.NameFa, r.NameEn, r.Sort))
	}
	return AdminListArticleCategories200JSONResponse{Items: items}, nil
}

// AdminCreateArticleCategory adds an article category.
func (s *Server) AdminCreateArticleCategory(ctx context.Context, req AdminCreateArticleCategoryRequestObject) (AdminCreateArticleCategoryResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminCreateArticleCategorydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in, msg := cleanCategory(*req.Body, req.Body.Slug)
	if msg != "" {
		return fail[AdminCreateArticleCategorydefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	var r dbq.ListArticleCategoriesRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		row, err := q.CreateArticleCategory(ctx, dbq.CreateArticleCategoryParams{Slug: in.Slug, NameFa: in.NameFa, NameEn: optText(in.NameEn), Sort: int32(in.Sort)}) //nolint:gosec // cleanCategory bounds sort
		if err != nil {
			return err
		}
		r = dbq.ListArticleCategoriesRow(row)
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "article_category.create", Entity: "article_category", EntityID: in.Slug, Data: in})
	})
	if isUniqueViolation(err) {
		return fail[AdminCreateArticleCategorydefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug already used")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create article category: %w", err)
	}
	return AdminCreateArticleCategory201JSONResponse(categoryOf(r.Slug, r.NameFa, r.NameEn, r.Sort)), nil
}

// AdminUpdateArticleCategory renames or reorders an article category.
func (s *Server) AdminUpdateArticleCategory(ctx context.Context, req AdminUpdateArticleCategoryRequestObject) (AdminUpdateArticleCategoryResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminUpdateArticleCategorydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in, msg := cleanCategory(*req.Body, req.Slug)
	if msg != "" {
		return fail[AdminUpdateArticleCategorydefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	var r dbq.ListArticleCategoriesRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		row, err := q.UpdateArticleCategory(ctx, dbq.UpdateArticleCategoryParams{Slug: in.Slug, NameFa: in.NameFa, NameEn: optText(in.NameEn), Sort: int32(in.Sort)}) //nolint:gosec // cleanCategory bounds sort
		if err != nil {
			return err
		}
		r = dbq.ListArticleCategoriesRow(row)
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "article_category.update", Entity: "article_category", EntityID: in.Slug, Data: in})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminUpdateArticleCategorydefaultApplicationProblemPlusJSONResponse](notFound(ctx, "category")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("update article category: %w", err)
	}
	return AdminUpdateArticleCategory200JSONResponse(categoryOf(r.Slug, r.NameFa, r.NameEn, r.Sort)), nil
}

// --- FAQ ------------------------------------------------------------------------------

// AdminGetFaq returns every FAQ category and item.
func (s *Server) AdminGetFaq(ctx context.Context, _ AdminGetFaqRequestObject) (AdminGetFaqResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminGetFaqdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	cats, err := s.q.ListFaqCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("faq categories: %w", err)
	}
	items, err := s.q.ListFaqItems(ctx, false)
	if err != nil {
		return nil, fmt.Errorf("faq items: %w", err)
	}
	out := AdminGetFaq200JSONResponse{Categories: make([]AdminCategory, 0, len(cats)), Items: make([]AdminFaqItem, 0, len(items))}
	for _, c := range cats {
		out.Categories = append(out.Categories, categoryOf(c.Slug, c.NameFa, c.NameEn, c.Sort))
	}
	for _, i := range items {
		out.Items = append(out.Items, faqItemOf(i))
	}
	return out, nil
}

// AdminCreateFaqCategory adds an FAQ category.
func (s *Server) AdminCreateFaqCategory(ctx context.Context, req AdminCreateFaqCategoryRequestObject) (AdminCreateFaqCategoryResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminCreateFaqCategorydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in, msg := cleanCategory(*req.Body, req.Body.Slug)
	if msg != "" {
		return fail[AdminCreateFaqCategorydefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	var r dbq.CreateFaqCategoryRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if r, err = q.CreateFaqCategory(ctx, dbq.CreateFaqCategoryParams{Slug: in.Slug, NameFa: in.NameFa, NameEn: optText(in.NameEn), Sort: int32(in.Sort)}); err != nil { //nolint:gosec // cleanCategory bounds sort
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "faq_category.create", Entity: "faq_category", EntityID: in.Slug, Data: in})
	})
	if isUniqueViolation(err) {
		return fail[AdminCreateFaqCategorydefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug already used")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create faq category: %w", err)
	}
	return AdminCreateFaqCategory201JSONResponse(categoryOf(r.Slug, r.NameFa, r.NameEn, r.Sort)), nil
}

// AdminUpdateFaqCategory renames or reorders an FAQ category.
func (s *Server) AdminUpdateFaqCategory(ctx context.Context, req AdminUpdateFaqCategoryRequestObject) (AdminUpdateFaqCategoryResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminUpdateFaqCategorydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in, msg := cleanCategory(*req.Body, req.Slug)
	if msg != "" {
		return fail[AdminUpdateFaqCategorydefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	var r dbq.UpdateFaqCategoryRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if r, err = q.UpdateFaqCategory(ctx, dbq.UpdateFaqCategoryParams{Slug: in.Slug, NameFa: in.NameFa, NameEn: optText(in.NameEn), Sort: int32(in.Sort)}); err != nil { //nolint:gosec // cleanCategory bounds sort
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "faq_category.update", Entity: "faq_category", EntityID: in.Slug, Data: in})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminUpdateFaqCategorydefaultApplicationProblemPlusJSONResponse](notFound(ctx, "category")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("update faq category: %w", err)
	}
	return AdminUpdateFaqCategory200JSONResponse(categoryOf(r.Slug, r.NameFa, r.NameEn, r.Sort)), nil
}

// AdminCreateFaqItem adds a question.
func (s *Server) AdminCreateFaqItem(ctx context.Context, req AdminCreateFaqItemRequestObject) (AdminCreateFaqItemResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminCreateFaqItemdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	arg, msg, err := s.faqParams(ctx, *req.Body)
	if err != nil {
		return nil, err
	}
	if msg == "" && !content.ValidSlug(strings.TrimSpace(req.Body.Slug)) {
		msg = "slug: lowercase latin words joined by hyphens"
	}
	if msg != "" {
		return fail[AdminCreateFaqItemdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	c := dbq.CreateFaqItemParams{
		Slug: strings.TrimSpace(req.Body.Slug), CategorySlug: arg.CategorySlug, QuestionFa: arg.QuestionFa, QuestionEn: arg.QuestionEn,
		AnswerFa: arg.AnswerFa, AnswerEn: arg.AnswerEn, Popular: arg.Popular, Published: arg.Published, Sort: arg.Sort,
	}
	var id pgtype.UUID
	err = s.tx(ctx, func(q *dbq.Queries) error {
		if id, err = q.CreateFaqItem(ctx, c); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "faq_item.create", Entity: "faq_item", EntityID: *uuidString(id), Data: map[string]string{"slug": c.Slug}})
	})
	if isUniqueViolation(err) {
		return fail[AdminCreateFaqItemdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug already used")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create faq item: %w", err)
	}
	item, err := s.faqItem(ctx, id)
	if err != nil {
		return nil, err
	}
	return AdminCreateFaqItem201JSONResponse(item), nil
}

// AdminUpdateFaqItem edits a question (not its slug).
func (s *Server) AdminUpdateFaqItem(ctx context.Context, req AdminUpdateFaqItemRequestObject) (AdminUpdateFaqItemResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminUpdateFaqItemdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	arg, msg, err := s.faqParams(ctx, *req.Body)
	if err != nil {
		return nil, err
	}
	if msg != "" {
		return fail[AdminUpdateFaqItemdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, msg)), nil
	}
	arg.ID = pgtype.UUID{Bytes: req.Id, Valid: true}
	err = s.tx(ctx, func(q *dbq.Queries) error {
		if _, err := q.UpdateFaqItem(ctx, arg); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "faq_item.update", Entity: "faq_item", EntityID: *uuidString(arg.ID)})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminUpdateFaqItemdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "faq item")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("update faq item: %w", err)
	}
	item, err := s.faqItem(ctx, arg.ID)
	if err != nil {
		return nil, err
	}
	return AdminUpdateFaqItem200JSONResponse(item), nil
}

// AdminDeleteFaqItem deletes a question.
func (s *Server) AdminDeleteFaqItem(ctx context.Context, req AdminDeleteFaqItemRequestObject) (AdminDeleteFaqItemResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminDeleteFaqItemdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if n, err = q.DeleteFaqItem(ctx, id); err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "faq_item.delete", Entity: "faq_item", EntityID: *uuidString(id)})
	})
	if err != nil {
		return nil, fmt.Errorf("delete faq item: %w", err)
	}
	if n == 0 {
		return fail[AdminDeleteFaqItemdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "faq item")), nil
	}
	return AdminDeleteFaqItem204Response{}, nil
}

func (s *Server) faqParams(ctx context.Context, in AdminFaqInput) (dbq.UpdateFaqItemParams, string, error) {
	if tooLong(in.AnswerFa, 20_000) || tooLong(deref(in.AnswerEn), 20_000) || tooLong(deref(in.QuestionEn), 300) {
		return dbq.UpdateFaqItemParams{}, "a field is too long", nil
	}
	q, ok := content.Clean(in.QuestionFa, 3, 300)
	if !ok {
		return dbq.UpdateFaqItemParams{}, "questionFa must be 3–300 characters", nil
	}
	answer := content.Sanitize(in.AnswerFa)
	if content.PlainText(answer) == "" {
		return dbq.UpdateFaqItemParams{}, "answerFa is required", nil
	}
	if in.Sort < -maxSort || in.Sort > maxSort {
		return dbq.UpdateFaqItemParams{}, "sort out of range", nil
	}
	cats, err := s.q.ListFaqCategories(ctx)
	if err != nil {
		return dbq.UpdateFaqItemParams{}, "", fmt.Errorf("faq categories: %w", err)
	}
	if !slices.ContainsFunc(cats, func(c dbq.ListFaqCategoriesRow) bool { return c.Slug == in.Category }) {
		return dbq.UpdateFaqItemParams{}, "unknown category", nil
	}
	return dbq.UpdateFaqItemParams{
		CategorySlug: in.Category, QuestionFa: q, QuestionEn: optText(in.QuestionEn), AnswerFa: answer,
		AnswerEn: sanitizedOpt(in.AnswerEn), Popular: in.Popular, Published: in.Published, Sort: int32(in.Sort), //nolint:gosec // bounded above
	}, "", nil
}

func (s *Server) faqItem(ctx context.Context, id pgtype.UUID) (AdminFaqItem, error) {
	items, err := s.q.ListFaqItems(ctx, false)
	if err != nil {
		return AdminFaqItem{}, fmt.Errorf("faq items: %w", err)
	}
	for _, i := range items {
		if i.ID == id {
			return faqItemOf(i), nil
		}
	}
	return AdminFaqItem{}, fmt.Errorf("faq item %s vanished", *uuidString(id))
}

func faqItemOf(i dbq.ListFaqItemsRow) AdminFaqItem {
	return AdminFaqItem{
		Id: i.ID.Bytes, Slug: i.Slug, Category: i.CategorySlug, QuestionFa: i.QuestionFa, QuestionEn: textp(i.QuestionEn),
		AnswerFa: i.AnswerFa, AnswerEn: textp(i.AnswerEn), Popular: i.Popular, Published: i.Published, Sort: int(i.Sort),
		UpdatedAt: i.UpdatedAt.Time.UTC(),
	}
}

// --- pages ----------------------------------------------------------------------------

// AdminListPages lists static pages.
func (s *Server) AdminListPages(ctx context.Context, _ AdminListPagesRequestObject) (AdminListPagesResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListPagesdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.ListPages(ctx)
	if err != nil {
		return nil, fmt.Errorf("list pages: %w", err)
	}
	items := make([]AdminPageRow, 0, len(rows))
	for _, r := range rows {
		items = append(items, AdminPageRow{Slug: r.Slug, TitleFa: r.TitleFa, TitleEn: textp(r.TitleEn), Published: r.Published, Version: int(r.Version), UpdatedAt: r.UpdatedAt.Time.UTC()})
	}
	return AdminListPages200JSONResponse{Items: items}, nil
}

// AdminGetPage returns one page for editing.
func (s *Server) AdminGetPage(ctx context.Context, req AdminGetPageRequestObject) (AdminGetPageResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminGetPagedefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	pg, err := s.q.GetPage(ctx, req.Slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminGetPagedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "page")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("get page: %w", err)
	}
	return AdminGetPage200JSONResponse(adminPageOf(dbq.UpdatePageRow(pg))), nil
}

// AdminUpdatePage saves a page with an optimistic lock on its version; the previous text becomes a revision.
func (s *Server) AdminUpdatePage(ctx context.Context, req AdminUpdatePageRequestObject) (AdminUpdatePageResponseObject, error) {
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[AdminUpdatePagedefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := req.Body
	title, ok := content.Clean(in.TitleFa, 2, 200)
	if !ok {
		return fail[AdminUpdatePagedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "titleFa must be 2–200 characters")), nil
	}
	if tooLong(in.BodyFa, 300_000) || tooLong(deref(in.BodyEn), 300_000) || tooLong(deref(in.TitleEn), 200) {
		return fail[AdminUpdatePagedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "a field is too long")), nil
	}
	if in.Version < 1 || in.Version > math.MaxInt32 {
		return fail[AdminUpdatePagedefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "invalid version")), nil
	}
	var saved dbq.UpdatePageRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		if err := q.SavePageRevision(ctx, dbq.SavePageRevisionParams{Slug: req.Slug, Actor: p.ID}); err != nil {
			return err
		}
		var err error
		saved, err = q.UpdatePage(ctx, dbq.UpdatePageParams{
			Slug: req.Slug, ExpectedVersion: int32(in.Version), //nolint:gosec // checked above
			TitleFa: title, TitleEn: optText(in.TitleEn),
			BodyFa: content.Sanitize(in.BodyFa), BodyEn: sanitizedOpt(in.BodyEn), Published: in.Published, Actor: p.ID,
		})
		if err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "page.update", Entity: "page", EntityID: req.Slug, Data: map[string]any{"version": saved.Version, "published": saved.Published}})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		if _, e := s.q.GetPage(ctx, req.Slug); errors.Is(e, pgx.ErrNoRows) {
			return fail[AdminUpdatePagedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "page")), nil
		}
		return fail[AdminUpdatePagedefaultApplicationProblemPlusJSONResponse](conflict(ctx, "the page was saved by someone else; reload it")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("update page: %w", err)
	}
	return AdminUpdatePage200JSONResponse(adminPageOf(saved)), nil
}

func adminPageOf(p dbq.UpdatePageRow) AdminPage {
	return AdminPage{
		Slug: p.Slug, TitleFa: p.TitleFa, TitleEn: textp(p.TitleEn), BodyFa: p.BodyFa, BodyEn: textp(p.BodyEn),
		Published: p.Published, Version: int(p.Version), UpdatedAt: p.UpdatedAt.Time.UTC(),
	}
}

// --- settings -------------------------------------------------------------------------

var socialNetworks = []string{"telegram", "instagram", "linkedin", "bale", "eitaa", "whatsapp"}

// AdminGetSettings returns contact details and social links.
func (s *Server) AdminGetSettings(ctx context.Context, _ AdminGetSettingsRequestObject) (AdminGetSettingsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminGetSettingsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	c, social, err := s.loadSiteSettings(ctx)
	if err != nil {
		return nil, err
	}
	e, err := s.loadEnamad(ctx)
	if err != nil {
		return nil, err
	}
	return AdminGetSettings200JSONResponse(settingsOf(c, social, e)), nil
}

// AdminUpdateSettings saves contact details and social links.
func (s *Server) AdminUpdateSettings(ctx context.Context, req AdminUpdateSettingsRequestObject) (AdminUpdateSettingsResponseObject, error) {
	p, pr := requireRoles(ctx, rolesSettingsWrite...)
	if pr != nil {
		return fail[AdminUpdateSettingsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := req.Body
	c := contactSettings{
		Phone: strings.TrimSpace(in.Contact.Phone), Email: strings.TrimSpace(in.Contact.Email),
		AddressFa: strings.TrimSpace(in.Contact.AddressFa), AddressEn: strings.TrimSpace(in.Contact.AddressEn),
		HoursFa: strings.TrimSpace(in.Contact.HoursFa), HoursEn: strings.TrimSpace(in.Contact.HoursEn),
	}
	for _, v := range []string{c.Phone, c.HoursFa, c.HoursEn} {
		if tooLong(v, 200) {
			return fail[AdminUpdateSettingsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "a field is too long")), nil
		}
	}
	if tooLong(c.AddressFa, 300) || tooLong(c.AddressEn, 300) {
		return fail[AdminUpdateSettingsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "a field is too long")), nil
	}
	if c.Email != "" && !emailRe.MatchString(c.Email) {
		return fail[AdminUpdateSettingsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "invalid email")), nil
	}
	social := socialSettings{
		"telegram": in.Social.Telegram, "instagram": in.Social.Instagram, "linkedin": in.Social.Linkedin,
		"bale": in.Social.Bale, "eitaa": in.Social.Eitaa, "whatsapp": deref(in.Social.Whatsapp),
	}
	for _, k := range socialNetworks {
		social[k] = strings.TrimSpace(social[k])
		if v := social[k]; v != "" && (!safeURL(v) || strings.HasPrefix(v, "/") || tooLong(v, 300)) {
			return fail[AdminUpdateSettingsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, k+": use a full https:// link")), nil
		}
	}
	e, err := s.loadEnamad(ctx)
	if err != nil {
		return nil, err
	}
	if in.Enamad != nil { // left out = unchanged
		e = enamadSettings{ID: strings.TrimSpace(in.Enamad.Id), Code: strings.TrimSpace(in.Enamad.Code)}
		if (e.ID != "" && !enamadIDRe.MatchString(e.ID)) || (e.Code != "" && !enamadCodeRe.MatchString(e.Code)) {
			return fail[AdminUpdateSettingsdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "enamad: id is digits, code is latin letters and digits")), nil
		}
	}
	cj, _ := json.Marshal(c)
	sj, _ := json.Marshal(social)
	ej, _ := json.Marshal(e)
	err = s.tx(ctx, func(q *dbq.Queries) error {
		if err := q.PutSetting(ctx, dbq.PutSettingParams{Key: "contact", Value: cj}); err != nil {
			return err
		}
		if err := q.PutSetting(ctx, dbq.PutSettingParams{Key: "social", Value: sj}); err != nil {
			return err
		}
		if err := q.PutSetting(ctx, dbq.PutSettingParams{Key: "enamad", Value: ej}); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "settings.update", Entity: "site_settings", EntityID: "contact,social,enamad", Data: map[string]any{"contact": c, "social": social, "enamad": e}})
	})
	if err != nil {
		return nil, fmt.Errorf("save settings: %w", err)
	}
	return AdminUpdateSettings200JSONResponse(settingsOf(c, social, e)), nil
}

func settingsOf(c contactSettings, social socialSettings, e enamadSettings) AdminSettings {
	var out AdminSettings
	out.Contact.Phone, out.Contact.Email = c.Phone, c.Email
	out.Contact.AddressFa, out.Contact.AddressEn, out.Contact.HoursFa, out.Contact.HoursEn = c.AddressFa, c.AddressEn, c.HoursFa, c.HoursEn
	out.Social.Telegram, out.Social.Instagram, out.Social.Linkedin = social["telegram"], social["instagram"], social["linkedin"]
	out.Social.Bale, out.Social.Eitaa = social["bale"], social["eitaa"]
	if w := social["whatsapp"]; w != "" {
		out.Social.Whatsapp = &w
	}
	out.Enamad = &Enamad{Id: e.ID, Code: e.Code}
	return out
}

// --- helpers --------------------------------------------------------------------------

// maxSort bounds display-order values (they fit int32 with room to spare).
const maxSort = 1_000_000

func cleanCategory(in AdminCategory, slug string) (AdminCategory, string) {
	in.Slug = strings.TrimSpace(slug)
	if !content.ValidSlug(in.Slug) || len(in.Slug) > 60 {
		return in, "slug: lowercase latin words joined by hyphens"
	}
	var ok bool
	if in.NameFa, ok = content.Clean(in.NameFa, 1, 80); !ok {
		return in, "nameFa must be 1–80 characters"
	}
	if in.Sort < -maxSort || in.Sort > maxSort {
		return in, "sort out of range"
	}
	return in, ""
}

func categoryOf(slug, fa string, en pgtype.Text, sort int32) AdminCategory {
	return AdminCategory{Slug: slug, NameFa: fa, NameEn: textp(en), Sort: int(sort)}
}

func optText(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return textOf(*s)
}

func plainOpt(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return textOf(content.PlainText(*s))
}

func sanitizedOpt(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	v := content.Sanitize(*s)
	if content.PlainText(v) == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: v, Valid: true}
}

// safeURL accepts https URLs and site-relative paths (never javascript:, data: or protocol-relative //host).
func safeURL(s string) bool {
	if strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "//") {
		return true
	}
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Host != ""
}

// tooLong reports whether s has more than n characters.
func tooLong(s string, n int) bool { return utf8.RuneCountInString(s) > n }

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func firstWords(s string, n int) string {
	f := strings.Fields(s)
	if len(f) <= n {
		return s
	}
	return strings.Join(f[:n], " ") + "…"
}
