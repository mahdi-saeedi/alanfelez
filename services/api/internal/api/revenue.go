package api

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// AdminRevenue is the sales report for a period (client, 2026-11-05): revenue per day by plan and SMS metals,
// refunds, paying members and monthly recurring revenue now, renewals, and who to call before their plan ends. Staff.
func (s *Server) AdminRevenue(ctx context.Context, req AdminRevenueRequestObject) (AdminRevenueResponseObject, error) {
	type bad = AdminRevenuedefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[bad](*pr), nil
	}
	from, to, ok := dayRange(req.Params.From, req.Params.To)
	if !ok {
		return fail[bad](badRequest(ctx, "from must not be after to")), nil
	}
	days, err := s.q.RevenueByDay(ctx, dbq.RevenueByDayParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return nil, fmt.Errorf("revenue by day: %w", err)
	}
	out := AdminRevenue{From: openapi_types.Date{Time: from}, To: openapi_types.Date{Time: to}, Days: make([]RevenueDay, 0, len(days))}
	var silver, gold, sms, refunds, orders int64
	for _, d := range days {
		out.Days = append(out.Days, RevenueDay{Day: openapi_types.Date{Time: d.Day.Time}, Silver: rial(d.SilverRial), Gold: rial(d.GoldRial), Sms: rial(d.SmsRial), Refunds: rial(d.RefundsRial), Orders: d.Orders})
		silver, gold, sms, refunds, orders = silver+d.SilverRial, gold+d.GoldRial, sms+d.SmsRial, refunds+d.RefundsRial, orders+d.Orders
	}
	out.Silver, out.Gold, out.Sms, out.Refunds, out.Orders = rial(silver), rial(gold), rial(sms), rial(refunds), orders
	out.Total = rial(silver + gold + sms)
	now, err := s.q.RevenueNow(ctx)
	if err != nil {
		return nil, fmt.Errorf("revenue now: %w", err)
	}
	out.PayingSilver, out.PayingGold, out.Mrr = now.Silver, now.Gold, rial(now.MrrPlansRial+now.MrrAddonsRial)
	ren, err := s.q.RenewalStats(ctx, dbq.RenewalStatsParams{FromDay: pgDate(from), ToDay: pgDate(to)})
	if err != nil {
		return nil, fmt.Errorf("renewals: %w", err)
	}
	out.RenewalsEnded, out.RenewalsRenewed = ren.Ended, ren.Renewed
	exp, err := s.q.ExpiringSoon(ctx)
	if err != nil {
		return nil, fmt.Errorf("expiring: %w", err)
	}
	out.Expiring = make([]ExpiringPlan, 0, len(exp))
	for _, e := range exp {
		out.Expiring = append(out.Expiring, ExpiringPlan{
			UserId: uuid.UUID(e.UserID.Bytes), Mobile: e.Username, Name: fullName(e.FirstName, e.LastName), Company: textp(e.Company),
			Plan: PaidPlan(e.PlanCode), EndsAt: e.EndsAt.Time.UTC(),
		})
	}
	return AdminRevenue200JSONResponse(out), nil
}
