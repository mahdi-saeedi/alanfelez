package api

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"sort"
	"strconv"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/jalali"
	"github.com/alanfelez/alanfelez/services/api/internal/visits"
)

// The sales report (client 2026-11-03): paid orders and approved refunds between two Tehran days, per day, week (from
// Saturday) or Jalali month, by plan and period and by kind. It only reads app.orders and app.refunds; it shows real
// numbers once the payment gateway is live (until then: test or no orders). Money is Rial (the admin shows Toman).

type (
	reportPeriod = struct {
		End     openapi_types.Date `json:"end"`
		Figures SalesFigures       `json:"figures"`
		Start   openapi_types.Date `json:"start"`
	}
	reportPlan = struct {
		Amount Money         `json:"amount"`
		Orders int           `json:"orders"`
		Period BillingPeriod `json:"period"`
		Plan   PaidPlan      `json:"plan"`
	}
	reportKind = struct {
		Amount Money                 `json:"amount"`
		Kind   SalesReportByKindKind `json:"kind"`
		Orders int                   `json:"orders"`
	}
)

type figures struct {
	orders, refunds int
	revenue, refund int64
}

func (f figures) api() SalesFigures {
	return SalesFigures{Orders: f.orders, Revenue: rial(f.revenue), Refunds: f.refunds, RefundAmount: rial(f.refund), Net: rial(f.revenue - f.refund)}
}

// periodStart is the first day of the period that holds day (a Tehran date as visits.Day returns it).
func periodStart(day time.Time, group string) time.Time {
	switch group {
	case "week": // Iranian weeks start on Saturday
		return day.AddDate(0, 0, -((int(day.Weekday()) + 1) % 7))
	case "month":
		_, _, jd := jalali.FromGregorian(day.Year(), int(day.Month()), day.Day())
		return day.AddDate(0, 0, -(jd - 1))
	}
	return day
}

// nextPeriod is the first day of the period after the one starting at start.
func nextPeriod(start time.Time, group string) time.Time {
	switch group {
	case "week":
		return start.AddDate(0, 0, 7)
	case "month":
		d := start.AddDate(0, 0, 28) // Jalali months have 29–31 days: step to the next month's first day
		for {
			if _, _, jd := jalali.FromGregorian(d.Year(), int(d.Month()), d.Day()); jd == 1 {
				return d
			}
			d = d.AddDate(0, 0, 1)
		}
	}
	return start.AddDate(0, 0, 1)
}

// AdminSalesReport returns the sales report between two days.
func (s *Server) AdminSalesReport(ctx context.Context, req AdminSalesReportRequestObject) (AdminSalesReportResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminSalesReportdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	from, to, ok := dayRange(req.Params.From, req.Params.To)
	if !ok {
		return fail[AdminSalesReportdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "from must not be after to")), nil
	}
	group := "day"
	if req.Params.Group != nil {
		group = string(*req.Params.Group)
	}
	if group != "day" && group != "week" && group != "month" {
		return fail[AdminSalesReportdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "group: day, week or month")), nil
	}
	start, _ := visits.Bounds(from)
	_, end := visits.Bounds(to)
	orders, err := s.q.SalesOrders(ctx, dbq.SalesOrdersParams{FromAt: pgTime(start), ToAt: pgTime(end)})
	if err != nil {
		return nil, fmt.Errorf("sales orders: %w", err)
	}
	refunds, err := s.q.SalesRefunds(ctx, dbq.SalesRefundsParams{FromAt: pgTime(start), ToAt: pgTime(end)})
	if err != nil {
		return nil, fmt.Errorf("sales refunds: %w", err)
	}

	byPeriod := map[time.Time]*figures{}
	var total figures
	type planKey struct{ plan, period string }
	byPlan := map[planKey]*figures{}
	byKind := map[string]*figures{}
	get := func(m map[time.Time]*figures, k time.Time) *figures {
		if m[k] == nil {
			m[k] = &figures{}
		}
		return m[k]
	}
	for _, o := range orders {
		f := get(byPeriod, periodStart(visits.Day(o.PaidAt.Time), group))
		f.orders++
		f.revenue += o.AmountRial
		total.orders++
		total.revenue += o.AmountRial
		pk := planKey{o.PlanCode, o.Period}
		if byPlan[pk] == nil {
			byPlan[pk] = &figures{}
		}
		byPlan[pk].orders++
		byPlan[pk].revenue += o.AmountRial
		if byKind[o.Kind] == nil {
			byKind[o.Kind] = &figures{}
		}
		byKind[o.Kind].orders++
		byKind[o.Kind].revenue += o.AmountRial
	}
	for _, r := range refunds {
		f := get(byPeriod, periodStart(visits.Day(r.DecidedAt.Time), group))
		f.refunds++
		f.refund += r.AmountRial
		total.refunds++
		total.refund += r.AmountRial
	}

	out := AdminSalesReport200JSONResponse{From: openapi_types.Date{Time: from}, To: openapi_types.Date{Time: to}, Group: SalesReportGroup(group), Totals: total.api()}
	out.Periods = []reportPeriod{}
	for p := periodStart(from, group); !p.After(to); p = nextPeriod(p, group) {
		f := byPeriod[p]
		if f == nil {
			f = &figures{}
		}
		out.Periods = append(out.Periods, reportPeriod{Start: openapi_types.Date{Time: p}, End: openapi_types.Date{Time: nextPeriod(p, group).AddDate(0, 0, -1)}, Figures: f.api()})
	}
	out.ByPlan = []reportPlan{}
	for k, f := range byPlan {
		out.ByPlan = append(out.ByPlan, reportPlan{Plan: PaidPlan(k.plan), Period: BillingPeriod(k.period), Orders: f.orders, Amount: rial(f.revenue)})
	}
	sort.Slice(out.ByPlan, func(i, j int) bool {
		if out.ByPlan[i].Plan != out.ByPlan[j].Plan {
			return out.ByPlan[i].Plan > out.ByPlan[j].Plan // gold first
		}
		return out.ByPlan[i].Orders > out.ByPlan[j].Orders
	})
	out.ByKind = []reportKind{}
	for _, k := range []string{"new", "renewal", "upgrade", "downgrade"} {
		if f := byKind[k]; f != nil {
			out.ByKind = append(out.ByKind, reportKind{Kind: SalesReportByKindKind(k), Orders: f.orders, Amount: rial(f.revenue)})
		}
	}
	return out, nil
}

// AdminExportSales is the paid orders between two days as a CSV file for Excel (amounts in Toman). Audited.
func (s *Server) AdminExportSales(ctx context.Context, req AdminExportSalesRequestObject) (AdminExportSalesResponseObject, error) {
	p, pr := requireRoles(ctx, rolesRead...)
	if pr != nil {
		return fail[AdminExportSalesdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	from, to, ok := dayRange(req.Params.From, req.Params.To)
	if !ok {
		return fail[AdminExportSalesdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "from must not be after to")), nil
	}
	start, _ := visits.Bounds(from)
	_, end := visits.Bounds(to)
	orders, err := s.q.SalesOrders(ctx, dbq.SalesOrdersParams{FromAt: pgTime(start), ToAt: pgTime(end)})
	if err != nil {
		return nil, fmt.Errorf("sales orders: %w", err)
	}
	en := req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en"
	l := labelsFor(en)
	head := []string{"زمان پرداخت", "موبایل", "اشتراک", "دوره", "نوع", "قیمت (تومان)", "اعتبار کسرشده (تومان)", "مبلغ پرداختی (تومان)", "وضعیت", "شماره سفارش"}
	periods := map[string]string{"month": "ماهانه", "quarter": "سه\u200cماهه", "year": "سالانه"}
	kinds := map[string]string{"new": "خرید", "renewal": "تمدید", "upgrade": "ارتقا", "downgrade": "تغییر به پایین\u200cتر"}
	statuses := map[string]string{"paid": "پرداخت\u200cشده", "refunded": "بازگشت وجه"}
	if en {
		head = []string{"Paid at", "Mobile", "Plan", "Period", "Kind", "Price (Toman)", "Credit (Toman)", "Paid (Toman)", "Status", "Order id"}
		periods = map[string]string{"month": "Monthly", "quarter": "Quarterly", "year": "Yearly"}
		kinds = map[string]string{"new": "New", "renewal": "Renewal", "upgrade": "Upgrade", "downgrade": "Downgrade"}
		statuses = map[string]string{"paid": "Paid", "refunded": "Refunded"}
	}
	toman := func(rial int64) string { return strconv.FormatInt(rial/10, 10) }
	var buf bytes.Buffer
	buf.WriteString("\xef\xbb\xbf")
	w := csv.NewWriter(&buf)
	_ = w.Write(head)
	for _, o := range orders {
		_ = w.Write([]string{l.when(o.PaidAt.Time), o.Username.String, l.plan[o.PlanCode], periods[o.Period], kinds[o.Kind],
			toman(o.PriceRial), toman(o.CreditRial), toman(o.AmountRial), statuses[o.Status], o.ID.String()})
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("export csv: %w", err)
	}
	if err := s.tx(ctx, func(q *dbq.Queries) error {
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "sales.export", Entity: "order",
			Data: map[string]any{"from": from.Format(time.DateOnly), "to": to.Format(time.DateOnly), "rows": len(orders)}})
	}); err != nil {
		return nil, fmt.Errorf("export audit: %w", err)
	}
	disp := `attachment; filename="sales-` + from.Format(time.DateOnly) + `-` + to.Format(time.DateOnly) + `.csv"`
	return AdminExportSales200TextcsvResponse{Body: &buf, ContentLength: int64(buf.Len()), Headers: AdminExportSales200ResponseHeaders{ContentDisposition: &disp}}, nil
}
