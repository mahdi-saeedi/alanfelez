package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// Price history, voiding a wrong price, and the catalog (metals, products, series) for the admin's price management.
// Reads: every staff role. Writes: editor, admin (rolesPriceWrite), audited in the same transaction.

const defaultMaxJumpBp = 1500 // the outlier gate of a new series (15 %), like the database default

// AdminSeriesPoints lists the recent points of one series in every status, with who entered or voided each.
func (s *Server) AdminSeriesPoints(ctx context.Context, req AdminSeriesPointsRequestObject) (AdminSeriesPointsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminSeriesPointsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	sr, err := s.q.GetSeriesBySlug(ctx, req.Slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminSeriesPointsdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "series")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("get series: %w", err)
	}
	limit := 50
	if req.Params.Limit != nil {
		limit = min(max(*req.Params.Limit, 1), 200)
	}
	rows, err := s.q.AdminSeriesPoints(ctx, dbq.AdminSeriesPointsParams{SeriesID: sr.ID, MaxRows: int32(limit)}) //nolint:gosec // bounded to 1..200 above
	if err != nil {
		return nil, fmt.Errorf("series points: %w", err)
	}
	out := make([]AdminPoint, 0, len(rows))
	for _, r := range rows {
		a := AdminPoint{
			Id: i64s(r.ID), Series: sr.Slug, Amount: i64s(r.PriceMinor), ObservedAt: r.ObservedAt.Time.UTC(),
			Status: AdminPointStatus(r.Status), IsManual: r.IsManual, Source: r.SourceSlug, EnteredBy: uuidString(r.EnteredBy),
			EnteredByName: nonEmpty(r.EnteredByName), ReviewedByName: nonEmpty(r.ReviewedByName), ReviewedAt: timep(r.ReviewedAt),
			CreatedAt: r.CreatedAt.Time.UTC(),
		}
		if r.PreviousMinor > 0 {
			a.PreviousAmount = strp(i64s(r.PreviousMinor))
			jb := int(prices.JumpBp(r.PreviousMinor, r.PriceMinor))
			a.JumpBp = &jb
		}
		out = append(out, a)
	}
	return AdminSeriesPoints200JSONResponse{Items: out}, nil
}

// AdminVoidPrice takes a published point (a wrong entry) off the site. The point is kept, as rejected.
func (s *Server) AdminVoidPrice(ctx context.Context, req AdminVoidPriceRequestObject) (AdminVoidPriceResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminVoidPricedefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	id, err := strconv.ParseInt(req.Id, 10, 64)
	if err != nil {
		return fail[AdminVoidPricedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "point")), nil
	}
	reason := ""
	if req.Body != nil && req.Body.Reason != nil {
		reason = strings.TrimSpace(*req.Body.Reason)
	}
	vp, err := s.prices.Void(ctx, id, reason, actorOf(ctx, p))
	switch {
	case errors.Is(err, prices.ErrNotFound):
		return fail[AdminVoidPricedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "point")), nil
	case errors.Is(err, prices.ErrConflict):
		return fail[AdminVoidPricedefaultApplicationProblemPlusJSONResponse](problem(ctx, http.StatusConflict, codeConflict, "Only published points can be voided", err.Error())), nil
	case err != nil:
		return nil, err
	}
	return AdminVoidPrice200JSONResponse{
		Id: i64s(vp.ID), Series: vp.SeriesSlug, Amount: i64s(vp.PriceMinor), ObservedAt: vp.ObservedAt.Time.UTC(),
		Status: AdminPointStatus(vp.Status), IsManual: vp.IsManual, Source: vp.SourceSlug, EnteredBy: uuidString(vp.EnteredBy),
		CreatedAt: vp.CreatedAt.Time.UTC(),
	}, nil
}

// AdminCatalog lists metals, products (active and inactive), categories and markets.
func (s *Server) AdminCatalog(ctx context.Context, _ AdminCatalogRequestObject) (AdminCatalogResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminCatalogdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	metals, err := s.q.AdminListMetals(ctx)
	if err != nil {
		return nil, fmt.Errorf("list metals: %w", err)
	}
	products, err := s.q.AdminListProducts(ctx)
	if err != nil {
		return nil, fmt.Errorf("list products: %w", err)
	}
	categories, err := s.q.AdminListCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	markets, err := s.q.AdminListMarkets(ctx)
	if err != nil {
		return nil, fmt.Errorf("list markets: %w", err)
	}
	out := AdminCatalog200JSONResponse{
		Metals: make([]AdminCatalogItem, 0, len(metals)), Products: make([]AdminProduct, 0, len(products)),
		Categories: make([]AdminCatalogItem, 0, len(categories)), Markets: make([]AdminCatalogItem, 0, len(markets)),
	}
	for _, m := range metals {
		out.Metals = append(out.Metals, AdminCatalogItem{Slug: m.Slug, NameFa: m.NameFa, NameEn: textp(m.NameEn)})
	}
	for _, p := range products {
		out.Products = append(out.Products, AdminProduct{
			Slug: p.Slug, Metal: p.MetalSlug, Category: p.CategorySlug, NameFa: p.NameFa, NameEn: textp(p.NameEn), Active: p.Active,
		})
	}
	for _, c := range categories {
		out.Categories = append(out.Categories, AdminCatalogItem{Slug: c.Slug, NameFa: c.NameFa, NameEn: textp(c.NameEn)})
	}
	for _, m := range markets {
		out.Markets = append(out.Markets, AdminCatalogItem{Slug: m.Slug, NameFa: m.NameFa, NameEn: textp(m.NameEn)})
	}
	return out, nil
}

// AdminCreateMetal adds a metal.
func (s *Server) AdminCreateMetal(ctx context.Context, req AdminCreateMetalRequestObject) (AdminCreateMetalResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminCreateMetaldefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := *req.Body
	nameFa := strings.TrimSpace(in.NameFa)
	if nameFa == "" {
		return fail[AdminCreateMetaldefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "nameFa is required")), nil
	}
	var row dbq.InsertMetalRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		r, err := q.InsertMetal(ctx, dbq.InsertMetalParams{Slug: in.Slug, NameFa: nameFa, NameEn: optText(in.NameEn)})
		if err != nil {
			return err
		}
		row = r
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "metal.create", Entity: "metal", EntityID: in.Slug, Data: in})
	})
	if errors.Is(err, pgx.ErrNoRows) || isUniqueViolation(err) {
		return fail[AdminCreateMetaldefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug already used")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create metal: %w", err)
	}
	return AdminCreateMetal201JSONResponse{Slug: row.Slug, NameFa: row.NameFa, NameEn: textp(row.NameEn)}, nil
}

// AdminCreateProduct adds a product of a metal.
func (s *Server) AdminCreateProduct(ctx context.Context, req AdminCreateProductRequestObject) (AdminCreateProductResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminCreateProductdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := *req.Body
	nameFa := strings.TrimSpace(in.NameFa)
	if nameFa == "" {
		return fail[AdminCreateProductdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "nameFa is required")), nil
	}
	err := s.tx(ctx, func(q *dbq.Queries) error {
		if _, err := q.InsertProduct(ctx, dbq.InsertProductParams{
			Slug: in.Slug, NameFa: nameFa, NameEn: optText(in.NameEn), Metal: in.Metal, Category: in.Category,
		}); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "product.create", Entity: "product", EntityID: in.Slug, Data: in})
	})
	if errors.Is(err, pgx.ErrNoRows) || isUniqueViolation(err) {
		refs, rerr := s.q.CatalogRefsExist(ctx, dbq.CatalogRefsExistParams{Metal: in.Metal, Category: in.Category})
		switch {
		case rerr != nil:
			return nil, fmt.Errorf("catalog refs: %w", rerr)
		case !refs.Metal:
			return fail[AdminCreateProductdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "metal")), nil
		case !refs.Category:
			return fail[AdminCreateProductdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "category")), nil
		}
		return fail[AdminCreateProductdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug already used")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create product: %w", err)
	}
	return AdminCreateProduct201JSONResponse{
		Slug: in.Slug, Metal: in.Metal, Category: in.Category, NameFa: nameFa, NameEn: textp(optText(in.NameEn)), Active: true,
	}, nil
}

// AdminCreateSeries adds a price series. New series are never base series (the tier matrix is the owner's decision).
func (s *Server) AdminCreateSeries(ctx context.Context, req AdminCreateSeriesRequestObject) (AdminCreateSeriesResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminCreateSeriesdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := *req.Body
	jump := defaultMaxJumpBp
	if in.MaxJumpBp != nil {
		jump = *in.MaxJumpBp
	}
	if jump < 100 || jump > 10_000 {
		return fail[AdminCreateSeriesdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "maxJumpBp must be 100 to 10000")), nil
	}
	err := s.tx(ctx, func(q *dbq.Queries) error {
		if _, err := q.InsertSeries(ctx, dbq.InsertSeriesParams{
			Slug: in.Slug, Product: in.Product, Market: in.Market, Currency: string(in.Currency), Unit: string(in.Unit),
			MaxJumpBp: int32(jump), //nolint:gosec // bounded above
		}); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "series.create", Entity: "price_series", EntityID: in.Slug, Data: in})
	})
	if errors.Is(err, pgx.ErrNoRows) || isUniqueViolation(err) {
		refs, rerr := s.q.CatalogRefsExist(ctx, dbq.CatalogRefsExistParams{Product: in.Product, Market: in.Market})
		switch {
		case rerr != nil:
			return nil, fmt.Errorf("catalog refs: %w", rerr)
		case !refs.Product:
			return fail[AdminCreateSeriesdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "product")), nil
		case !refs.Market:
			return fail[AdminCreateSeriesdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "market")), nil
		}
		return fail[AdminCreateSeriesdefaultApplicationProblemPlusJSONResponse](conflict(ctx, "slug or product × market × currency × unit already used")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create series: %w", err)
	}
	sr, err := s.q.GetSeriesBySlug(ctx, in.Slug)
	if err != nil {
		return nil, fmt.Errorf("get series: %w", err)
	}
	return AdminCreateSeries201JSONResponse{
		Slug: sr.Slug, ProductFa: sr.ProductFa, ProductEn: textp(sr.ProductEn), Metal: &sr.MetalSlug, Market: sr.MarketSlug,
		Currency: Currency(sr.Currency), Unit: Unit(sr.Unit), IsBase: sr.IsBase, Active: sr.Active, MaxJumpBp: int(sr.MaxJumpBp),
	}, nil
}

// AdminSetCatalogActive deactivates or reactivates a product or a series. Nothing is deleted; history stays.
func (s *Server) AdminSetCatalogActive(ctx context.Context, req AdminSetCatalogActiveRequestObject) (AdminSetCatalogActiveResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminSetCatalogActivedefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in := *req.Body
	verb := "deactivate"
	if in.Active {
		verb = "activate"
	}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		entity := "product"
		switch in.Kind {
		case Product:
			n, err = q.SetProductActive(ctx, dbq.SetProductActiveParams{Slug: in.Slug, Active: in.Active})
		case Series:
			entity = "price_series"
			n, err = q.SetSeriesActive(ctx, dbq.SetSeriesActiveParams{Slug: in.Slug, Active: in.Active})
		default:
			return fmt.Errorf("unknown kind %q", in.Kind)
		}
		if err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: string(in.Kind) + "." + verb, Entity: entity, EntityID: in.Slug})
	})
	if err != nil {
		return nil, fmt.Errorf("set active: %w", err)
	}
	if n == 0 {
		return fail[AdminSetCatalogActivedefaultApplicationProblemPlusJSONResponse](notFound(ctx, string(in.Kind))), nil
	}
	return AdminSetCatalogActive204Response{}, nil
}
