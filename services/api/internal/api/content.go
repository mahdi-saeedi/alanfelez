package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// defaultProblem matches every generated `…defaultApplicationProblemPlusJSONResponse`: newer operations declare
// their errors as `default` only, so one helper answers any status.
type defaultProblem interface {
	~struct {
		Body       Problem
		StatusCode int
	}
}

func fail[T defaultProblem](p Problem) T { return T{Body: p, StatusCode: p.Status} }

// The licenses page stays hidden until the client has the licenses (client answer #29).
const flagLicensesPage = "page.licenses"

// The English site stays hidden until its copy is reviewed (F4); the website redirects /en while it's off.
const flagEnglishSite = "locale.en"

// ListArticles lists published articles. Locked ones are teasers: the list never carries bodies anyway.
func (s *Server) ListArticles(ctx context.Context, req ListArticlesRequestObject) (ListArticlesResponseObject, error) {
	p := req.Params
	page, limit := 1, 12
	// The generated server doesn't enforce the schema's bounds, so clamp here.
	if p.Page != nil {
		page = min(max(*p.Page, 1), 1000)
	}
	if p.Limit != nil {
		limit = min(max(*p.Limit, 1), 50)
	}
	arg := dbq.ListPublishedArticlesParams{
		Category: textOfPtr(p.Category), Metal: textOfPtr(p.Metal),
		Lim: int32(limit), Off: int32((page - 1) * limit), //nolint:gosec // clamped above
	}
	if p.Type != nil && len(*p.Type) > 0 {
		for _, t := range *p.Type {
			arg.Types = append(arg.Types, string(t))
		}
	}
	rows, err := s.q.ListPublishedArticles(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("list articles: %w", err)
	}
	total, err := s.q.CountPublishedArticles(ctx, dbq.CountPublishedArticlesParams{Types: arg.Types, Category: arg.Category, Metal: arg.Metal})
	if err != nil {
		return nil, fmt.Errorf("count articles: %w", err)
	}
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	lang := langOf((*string)(p.AcceptLanguage))
	out := ArticleList{Items: make([]ArticleSummary, 0, len(rows)), Total: int(total), Page: page, Limit: limit}
	for _, r := range rows {
		a := ArticleSummary{
			Slug: r.Slug, Type: ArticleType(r.Type), Title: localized(lang, r.TitleFa, r.TitleEn),
			Summary: localized(lang, r.SummaryFa, r.SummaryEn), Featured: r.Featured, CoverUrl: textp(r.CoverUrl),
			ReadMinutes: int(r.ReadMinutes), PublishedAt: r.PublishedAt.Time.UTC(),
			Category: localizedRef(lang, r.CategorySlug, r.CategoryFa, r.CategoryEn),
			Metal:    localizedRef(lang, r.MetalSlug, r.MetalFa, r.MetalEn),
			Outlook:  outlookOf(r.Outlook),
		}
		a.Locked, a.RequiredPlan = lockOf(cur.Tier, content.Type(r.Type))
		out.Items = append(out.Items, a)
	}
	return ListArticles200JSONResponse(out), nil
}

// GetArticle returns one article; the body only when the caller's plan includes the article's type.
func (s *Server) GetArticle(ctx context.Context, req GetArticleRequestObject) (GetArticleResponseObject, error) {
	r, err := s.q.GetPublishedArticle(ctx, req.Slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[GetArticledefaultApplicationProblemPlusJSONResponse](notFound(ctx, "article")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("get article: %w", err)
	}
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	a := Article{
		Slug: r.Slug, Type: ArticleType(r.Type), Title: localized(lang, r.TitleFa, r.TitleEn),
		Summary: localized(lang, r.SummaryFa, r.SummaryEn), Featured: r.Featured, CoverUrl: textp(r.CoverUrl),
		ReadMinutes: int(r.ReadMinutes), PublishedAt: r.PublishedAt.Time.UTC(), UpdatedAt: r.UpdatedAt.Time.UTC(),
		Category: localizedRef(lang, r.CategorySlug, r.CategoryFa, r.CategoryEn),
		Metal:    localizedRef(lang, r.MetalSlug, r.MetalFa, r.MetalEn),
		Outlook:  outlookOf(r.Outlook),
	}
	if lang == "en" && r.AuthorEn.Valid {
		a.Author = textp(r.AuthorEn)
	} else {
		a.Author = textp(r.AuthorFa)
	}
	a.Locked, a.RequiredPlan = lockOf(cur.Tier, content.Type(r.Type))
	if !a.Locked {
		body := localized(lang, r.BodyFa, r.BodyEn)
		a.Body = &body
		if f, _ := content.Type(r.Type).Feature(); !access.Allowed(access.Free, f) {
			s.billing.RecordUsage(ctx, cur.SubscriptionID, f) // paid content delivered: counts for the refund rule
		}
	}
	return GetArticle200JSONResponse(a), nil
}

// ListArticleCategories returns the topic tabs.
func (s *Server) ListArticleCategories(ctx context.Context, req ListArticleCategoriesRequestObject) (ListArticleCategoriesResponseObject, error) {
	rows, err := s.q.ListArticleCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("list article categories: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	items := make([]Localized, 0, len(rows))
	for _, r := range rows {
		items = append(items, Localized{Slug: r.Slug, Name: localized(lang, r.NameFa, r.NameEn)})
	}
	return ListArticleCategories200JSONResponse{Items: items}, nil
}

// GetFaq returns the published FAQ grouped by category (empty categories are left out).
func (s *Server) GetFaq(ctx context.Context, req GetFaqRequestObject) (GetFaqResponseObject, error) {
	cats, err := s.q.ListFaqCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("faq categories: %w", err)
	}
	items, err := s.q.ListFaqItems(ctx, true)
	if err != nil {
		return nil, fmt.Errorf("faq items: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	byCat := map[string][]FaqItem{}
	for _, i := range items {
		byCat[i.CategorySlug] = append(byCat[i.CategorySlug], FaqItem{
			Slug: i.Slug, Question: localized(lang, i.QuestionFa, i.QuestionEn), Answer: localized(lang, i.AnswerFa, i.AnswerEn), Popular: i.Popular,
		})
	}
	out := make([]FaqCategory, 0, len(cats))
	for _, c := range cats {
		if len(byCat[c.Slug]) == 0 {
			continue
		}
		out = append(out, FaqCategory{Slug: c.Slug, Name: localized(lang, c.NameFa, c.NameEn), Items: byCat[c.Slug]})
	}
	return GetFaq200JSONResponse{Categories: out}, nil
}

// GetPage returns a published static page.
func (s *Server) GetPage(ctx context.Context, req GetPageRequestObject) (GetPageResponseObject, error) {
	p, err := s.q.GetPage(ctx, req.Slug)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !p.Published) {
		return fail[GetPagedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "page")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("get page: %w", err)
	}
	if req.Slug == "licenses" {
		on, err := s.q.FeatureEnabled(ctx, flagLicensesPage)
		if err != nil {
			return nil, fmt.Errorf("feature flag: %w", err)
		}
		if !on {
			return fail[GetPagedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "page")), nil
		}
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	return GetPage200JSONResponse{
		Slug: p.Slug, Title: localized(lang, p.TitleFa, p.TitleEn), Body: localized(lang, p.BodyFa, p.BodyEn),
		Version: int(p.Version), UpdatedAt: p.UpdatedAt.Time.UTC(),
	}, nil
}

// contactSettings is the `contact` site setting (config/seed/reference/30-platform.yaml).
type contactSettings struct {
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	AddressFa string `json:"address_fa"`
	AddressEn string `json:"address_en"`
	HoursFa   string `json:"hours_fa"`
	HoursEn   string `json:"hours_en"`
}

// socialSettings is the `social` site setting: network → URL.
type socialSettings map[string]string

func (s *Server) loadSiteSettings(ctx context.Context) (contactSettings, socialSettings, error) {
	var c contactSettings
	social := socialSettings{}
	rows, err := s.q.GetSettings(ctx, []string{"contact", "social"})
	if err != nil {
		return c, social, fmt.Errorf("site settings: %w", err)
	}
	for _, r := range rows {
		var target any = &c
		if r.Key == "social" {
			target = &social
		}
		if err := json.Unmarshal(r.Value, target); err != nil {
			return c, social, fmt.Errorf("site setting %s: %w", r.Key, err)
		}
	}
	return c, social, nil
}

// GetSite returns the public site settings. Empty values are left out, so the site hides what isn't set yet.
func (s *Server) GetSite(ctx context.Context, req GetSiteRequestObject) (GetSiteResponseObject, error) {
	c, social, err := s.loadSiteSettings(ctx)
	if err != nil {
		return nil, err
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	pick := func(fa, en string) *string {
		if lang == "en" && en != "" {
			return &en
		}
		if fa == "" {
			return nil
		}
		return &fa
	}
	info := SiteInfo{
		Contact: ContactInfo{Phone: nonEmpty(c.Phone), Email: nonEmpty(c.Email), Address: pick(c.AddressFa, c.AddressEn), Hours: pick(c.HoursFa, c.HoursEn)},
		Social:  map[string]string{},
	}
	for k, v := range social {
		if v != "" {
			info.Social[k] = v
		}
	}
	if info.LicensesPage, err = s.q.FeatureEnabled(ctx, flagLicensesPage); err != nil {
		return nil, fmt.Errorf("feature flag: %w", err)
	}
	if info.EnglishSite, err = s.q.FeatureEnabled(ctx, flagEnglishSite); err != nil {
		return nil, fmt.Errorf("feature flag: %w", err)
	}
	return GetSite200JSONResponse(info), nil
}

// lockOf reports whether tier t can't read articles of type typ, and which plan unlocks them.
func lockOf(t access.Tier, typ content.Type) (bool, *Tier) {
	f, ok := typ.Feature()
	if !ok {
		return true, nil
	}
	if access.Allowed(t, f) {
		return false, nil
	}
	if need, ok := access.RequiredTier(f); ok {
		plan := Tier(need)
		return true, &plan
	}
	return true, nil
}

func localizedRef(lang string, slug, fa, en pgtype.Text) *Localized {
	if !slug.Valid {
		return nil
	}
	return &Localized{Slug: slug.String, Name: localized(lang, fa.String, en)}
}

func outlookOf(t pgtype.Text) *Outlook {
	if !t.Valid {
		return nil
	}
	o := Outlook(t.String)
	return &o
}

func nonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func textOfPtr(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return textOf(*s)
}

// isUniqueViolation reports a duplicate natural key (slug), answered as 409.
func isUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

func conflict(ctx context.Context, detail string) Problem {
	return problem(ctx, http.StatusConflict, codeConflict, "Conflict", detail)
}
