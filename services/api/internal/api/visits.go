package api

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
	"github.com/alanfelez/alanfelez/services/api/internal/visits"
)

// RecordVisit counts a page view for the daily visitor stats (the website sends it for every page). Signed-in
// visitors count by user id; anonymous ones by a one-way daily id (the IP isn't stored); robots are ignored.
func (s *Server) RecordVisit(ctx context.Context, req RecordVisitRequestObject) (RecordVisitResponseObject, error) {
	c := httpx.ClientFrom(ctx)
	if visits.IsRobot(c.UserAgent) || len(req.Body.Path) > 300 {
		return RecordVisit204Response{}, nil
	}
	day := pgtype.Date{Time: visits.Day(time.Now()), Valid: true}
	arg := dbq.RecordVisitParams{Day: day}
	if p := auth.FromContext(ctx); p != nil {
		// Keeps the account row (name, mobile, last seen) current, so the stats can say who came.
		if _, err := s.touchUser(ctx, p); err != nil {
			return nil, err
		}
		arg.Visitor, arg.UserID = "u:"+*uuidString(p.ID), p.ID
	} else {
		salt, err := s.q.VisitSalt(ctx, day)
		if err != nil {
			return nil, fmt.Errorf("visit salt: %w", err)
		}
		ip := ""
		if c.IP != nil {
			ip = c.IP.String()
		}
		arg.Visitor = visits.AnonID(salt.Bytes, ip, c.UserAgent)
	}
	if err := s.q.RecordVisit(ctx, arg); err != nil {
		return nil, fmt.Errorf("record visit: %w", err)
	}
	return RecordVisit204Response{}, nil
}

// AdminVisits returns the last 30 days' visitor counts and one day's signed-in visitors (staff).
func (s *Server) AdminVisits(ctx context.Context, req AdminVisitsRequestObject) (AdminVisitsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminVisitsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	today := visits.Day(time.Now())
	day := today
	if req.Params.Day != nil {
		day = req.Params.Day.Time
	}
	totals, err := s.q.VisitTotals(ctx, pgtype.Date{Time: today.AddDate(0, 0, -29), Valid: true})
	if err != nil {
		return nil, fmt.Errorf("visit totals: %w", err)
	}
	users, err := s.q.VisitUsers(ctx, pgtype.Date{Time: day, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("visit users: %w", err)
	}
	out := AdminVisits200JSONResponse{Day: openapi_types.Date{Time: day}}
	out.Days = make([]visitDay, 0, len(totals))
	for _, t := range totals {
		out.Days = append(out.Days, visitDay{Day: openapi_types.Date{Time: t.Day.Time}, Pageviews: int(t.Pageviews), SignedIn: int(t.SignedIn), Visitors: int(t.Visitors)})
	}
	out.Users = make([]visitUser, 0, len(users))
	for _, u := range users {
		row := visitUser{FirstAt: u.FirstAt.Time.UTC(), LastAt: u.LastAt.Time.UTC(), Pageviews: int(u.Pageviews), Plan: Tier(u.CurrentPlan), UserId: u.UserID.Bytes}
		if name := fullName(u.FirstName, u.LastName); name != "" {
			row.Name = &name
		}
		row.Phone = textp(u.Username)
		out.Users = append(out.Users, row)
	}
	return out, nil
}

// The element types of AdminVisits (inline objects in the contract, so the generated code has no names for them).
type (
	visitDay = struct {
		Day       openapi_types.Date `json:"day"`
		Pageviews int                `json:"pageviews"`
		SignedIn  int                `json:"signedIn"`
		Visitors  int                `json:"visitors"`
	}
	visitUser = struct {
		FirstAt   time.Time          `json:"firstAt"`
		LastAt    time.Time          `json:"lastAt"`
		Name      *string            `json:"name,omitempty"`
		Pageviews int                `json:"pageviews"`
		Phone     *string            `json:"phone,omitempty"`
		Plan      Tier               `json:"plan"`
		UserId    openapi_types.UUID `json:"userId"` //nolint:revive // the generated field name
	}
)

func fullName(first, last pgtype.Text) string {
	switch {
	case first.String != "" && last.String != "":
		return first.String + " " + last.String
	case first.String != "":
		return first.String
	}
	return last.String
}
