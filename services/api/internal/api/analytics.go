package api

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strconv"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/visits"
)

// «تحلیل بازدید» (client, 2026-11-05; owner OK'd): nameless daily totals of what everyone looks at, where visitors come
// from and what they search for (migration 00038), plus the sales funnel. Staff read it; tables export to Excel.

var unitFa = map[string]string{"kg": "کیلوگرم", "ton": "تن"}

func currencyLabel(c string, en bool) string {
	switch {
	case c == "IRR" && en:
		return "Toman"
	case c == "IRR":
		return "تومان"
	}
	return "$"
}

func unitLabel(currency, unit string, en bool) string {
	if en {
		return currencyLabel(currency, en) + "/" + unit
	}
	return currencyLabel(currency, en) + "/" + unitFa[unit]
}

// analytics loads every table of the report for from..to (and the period of the same length before, for trends).
func (s *Server) analytics(ctx context.Context, fromD, toD *openapi_types.Date, en bool) (AdminAnalytics, bool, error) {
	from, to, ok := dayRange(fromD, toD)
	if !ok {
		return AdminAnalytics{}, false, nil
	}
	days := int(to.Sub(from).Hours()/24) + 1
	prevTo := from.AddDate(0, 0, -1)
	prevFrom := prevTo.AddDate(0, 0, -(days - 1))
	out := AdminAnalytics{From: openapi_types.Date{Time: from}, To: openapi_types.Date{Time: to}}

	products, err := s.q.AnalyticsProducts(ctx, dbq.AnalyticsProductsParams{FromDay: pgDate(from), ToDay: pgDate(to), PrevFrom: pgDate(prevFrom), PrevTo: pgDate(prevTo)})
	if err != nil {
		return out, true, fmt.Errorf("analytics products: %w", err)
	}
	out.Products = make([]AnalyticsProduct, 0, len(products))
	for _, r := range products {
		out.Products = append(out.Products, AnalyticsProduct{
			Series: r.Series, Product: pick(en, r.ProductFa, r.ProductEn), Metal: r.Metal, MetalName: pick(en, r.MetalFa, r.MetalEn),
			Market: pick(en, r.MarketFa, r.MarketEn), Unit: unitLabel(r.Currency, r.Unit, en),
			Views: r.Views, PaidViews: r.PaidViews, Visitors: r.Visitors, Seconds: r.Seconds, PrevViews: r.PrevViews,
		})
	}
	metals, err := s.q.AnalyticsMetals(ctx, dbq.AnalyticsMetalsParams{FromDay: pgDate(from), ToDay: pgDate(to), PrevFrom: pgDate(prevFrom), PrevTo: pgDate(prevTo)})
	if err != nil {
		return out, true, fmt.Errorf("analytics metals: %w", err)
	}
	out.Metals = make([]AnalyticsMetal, 0, len(metals))
	for _, r := range metals {
		out.Metals = append(out.Metals, AnalyticsMetal{Metal: r.Metal, Name: pick(en, r.NameFa, r.NameEn), Views: r.Views, Visitors: r.Visitors, Seconds: r.Seconds, PrevViews: r.PrevViews})
	}
	sections, err := s.q.AnalyticsSections(ctx, dbq.AnalyticsSectionsParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return out, true, fmt.Errorf("analytics sections: %w", err)
	}
	bySection := map[string]*AnalyticsSection{}
	out.Sections = []AnalyticsSection{}
	order := []string{}
	for _, r := range sections {
		sec := bySection[r.Section]
		if sec == nil {
			sec = &AnalyticsSection{Section: r.Section, Visitors: r.Visitors}
			bySection[r.Section] = sec
			order = append(order, r.Section)
		}
		vs := ViewsSeconds{Views: r.Views, Seconds: r.Seconds}
		switch r.Audience {
		case "guest":
			sec.Guest = vs
		case "free":
			sec.Free = vs
		default:
			sec.Paid = vs
		}
	}
	for _, k := range order {
		out.Sections = append(out.Sections, *bySection[k])
	}
	f, err := s.q.AnalyticsFunnel(ctx, dbq.AnalyticsFunnelParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return out, true, fmt.Errorf("analytics funnel: %w", err)
	}
	out.Funnel.Visitors, out.Funnel.Signups, out.Funnel.PlansVisitors, out.Funnel.CheckoutVisitors, out.Funnel.Buyers =
		f.Visitors, f.Signups, f.PlansVisitors, f.CheckoutVisitors, f.Buyers
	pf, err := s.q.AnalyticsPlansFrom(ctx, dbq.AnalyticsPlansFromParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return out, true, fmt.Errorf("analytics plans from: %w", err)
	}
	out.PlansFrom = make([]AnalyticsPlansFrom, 0, len(pf))
	for _, r := range pf {
		out.PlansFrom = append(out.PlansFrom, AnalyticsPlansFrom{Page: r.Page, Section: r.Section, Metal: r.Metal, Views: r.Views})
	}
	tr, err := s.q.AnalyticsTraffic(ctx, dbq.AnalyticsTrafficParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return out, true, fmt.Errorf("analytics traffic: %w", err)
	}
	out.Traffic = make([]AnalyticsTraffic, 0, len(tr))
	for _, r := range tr {
		out.Traffic = append(out.Traffic, AnalyticsTraffic{Source: r.Source, Campaign: r.Campaign, Landings: r.Landings, Signups: r.Signups, Buyers: r.Buyers})
	}
	dev, err := s.q.AnalyticsDevices(ctx, dbq.AnalyticsDevicesParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return out, true, fmt.Errorf("analytics devices: %w", err)
	}
	out.Devices = make([]AnalyticsDevice, 0, len(dev))
	for _, r := range dev {
		out.Devices = append(out.Devices, AnalyticsDevice{Device: r.Device, VisitorDays: r.VisitorDays})
	}
	prov, err := s.q.AnalyticsProvinces(ctx)
	if err != nil {
		return out, true, fmt.Errorf("analytics provinces: %w", err)
	}
	out.Provinces = make([]AnalyticsProvince, 0, len(prov))
	for _, r := range prov {
		out.Provinces = append(out.Provinces, AnalyticsProvince{Province: r.Province, Members: r.Members, Paying: r.Paying})
	}
	se, err := s.q.AnalyticsSearches(ctx, dbq.AnalyticsSearchesParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return out, true, fmt.Errorf("analytics searches: %w", err)
	}
	out.Searches = make([]AnalyticsSearch, 0, len(se))
	for _, r := range se {
		out.Searches = append(out.Searches, AnalyticsSearch{Term: r.Term, Searches: r.Searches, ZeroResults: r.ZeroResults})
	}
	return out, true, nil
}

// AdminAnalytics returns «تحلیل بازدید» for a period (staff).
func (s *Server) AdminAnalytics(ctx context.Context, req AdminAnalyticsRequestObject) (AdminAnalyticsResponseObject, error) {
	type bad = AdminAnalyticsdefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[bad](*pr), nil
	}
	out, ok, err := s.analytics(ctx, req.Params.From, req.Params.To, req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en")
	if err != nil {
		return nil, err
	}
	if !ok {
		return fail[bad](badRequest(ctx, "from must not be after to")), nil
	}
	return AdminAnalytics200JSONResponse(out), nil
}

// AdminExportAnalytics returns one table of «تحلیل بازدید» as CSV for Excel (staff).
func (s *Server) AdminExportAnalytics(ctx context.Context, req AdminExportAnalyticsRequestObject) (AdminExportAnalyticsResponseObject, error) {
	type bad = AdminExportAnalyticsdefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[bad](*pr), nil
	}
	a, ok, err := s.analytics(ctx, req.Params.From, req.Params.To, req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en")
	if err != nil {
		return nil, err
	}
	if !ok {
		return fail[bad](badRequest(ctx, "from must not be after to")), nil
	}
	en := req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en"
	h := func(fa, enH string) string {
		if en {
			return enH
		}
		return fa
	}
	n := func(v int64) string { return strconv.FormatInt(v, 10) }
	var rows [][]string
	switch req.Params.Table {
	case Products:
		rows = append(rows, []string{h("محصول", "Product"), h("فلز", "Metal"), h("بازار", "Market"), h("واحد", "Unit"), h("بازدید", "Views"),
			h("بازدید مشترکان", "Paid views"), h("بازدیدکننده\u200cی یکتا", "Visitors"), h("دقیقه", "Minutes"), h("بازدید دوره\u200cی قبل", "Views before")})
		for _, r := range a.Products {
			rows = append(rows, []string{r.Product, r.MetalName, r.Market, r.Unit, n(r.Views), n(r.PaidViews), n(r.Visitors), n(r.Seconds / 60), n(r.PrevViews)})
		}
	case Metals:
		rows = append(rows, []string{h("فلز", "Metal"), h("بازدید", "Views"), h("بازدیدکننده\u200cی یکتا", "Visitors"), h("دقیقه", "Minutes"), h("بازدید دوره\u200cی قبل", "Views before")})
		for _, r := range a.Metals {
			rows = append(rows, []string{r.Name, n(r.Views), n(r.Visitors), n(r.Seconds / 60), n(r.PrevViews)})
		}
	case Sections:
		rows = append(rows, []string{h("بخش", "Section"), h("بازدیدکننده\u200cی یکتا", "Visitors"), h("بازدید مهمان", "Guest views"), h("بازدید رایگان", "Free views"),
			h("بازدید مشترکان", "Paid views"), h("دقیقه مهمان", "Guest minutes"), h("دقیقه رایگان", "Free minutes"), h("دقیقه مشترکان", "Paid minutes")})
		for _, r := range a.Sections {
			rows = append(rows, []string{r.Section, n(r.Visitors), n(r.Guest.Views), n(r.Free.Views), n(r.Paid.Views), n(r.Guest.Seconds / 60), n(r.Free.Seconds / 60), n(r.Paid.Seconds / 60)})
		}
	case Traffic:
		rows = append(rows, []string{h("منبع", "Source"), h("کمپین", "Campaign"), h("ورود", "Landings"), h("ثبت\u200cنام", "Sign-ups"), h("خرید", "Buyers")})
		for _, r := range a.Traffic {
			rows = append(rows, []string{r.Source, r.Campaign, n(r.Landings), n(r.Signups), n(r.Buyers)})
		}
	case Searches:
		rows = append(rows, []string{h("عبارت", "Term"), h("تعداد", "Searches"), h("بی\u200cنتیجه", "No results")})
		for _, r := range a.Searches {
			rows = append(rows, []string{r.Term, n(r.Searches), n(r.ZeroResults)})
		}
	default:
		return fail[bad](badRequest(ctx, "unknown table")), nil
	}
	var buf bytes.Buffer
	buf.WriteString("\xef\xbb\xbf")
	w := csv.NewWriter(&buf)
	_ = w.WriteAll(rows)
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("export csv: %w", err)
	}
	disp := `attachment; filename="analytics-` + string(req.Params.Table) + "-" + visits.Day(time.Now()).Format(time.DateOnly) + `.csv"`
	return AdminExportAnalytics200TextcsvResponse{Body: &buf, ContentLength: int64(buf.Len()), Headers: AdminExportAnalytics200ResponseHeaders{ContentDisposition: &disp}}, nil
}
