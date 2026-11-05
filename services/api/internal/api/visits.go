package api

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/httpx"
	"github.com/alanfelez/alanfelez/services/api/internal/visits"
)

// RecordVisit counts a page view for the daily visitor stats (the website sends it for every page). Signed-in
// visitors count by user id; anonymous ones by a one-way daily id (the IP isn't stored); robots are ignored.
// The page's metal adds to the per-metal daily totals (anyone, nameless). For a signed-in user with a view id, the
// page is also recorded for the admin «رفتار کاربران». A report with seconds only adds time to the user's own view.
func (s *Server) RecordVisit(ctx context.Context, req RecordVisitRequestObject) (RecordVisitResponseObject, error) {
	c := httpx.ClientFrom(ctx)
	b := req.Body
	if visits.IsRobot(c.UserAgent) || len(b.Path) > 300 {
		return RecordVisit204Response{}, nil
	}
	p := auth.FromContext(ctx)
	day := pgtype.Date{Time: visits.Day(time.Now()), Valid: true}
	audience, err := s.audienceOf(ctx, p)
	if err != nil {
		return nil, err
	}
	if b.Seconds != nil {
		secs := int64(max(1, min(*b.Seconds, visits.MaxReportSeconds)))
		page, metal, err := s.resolvePage(ctx, b.Path)
		if err != nil {
			return nil, err
		}
		if err := s.q.AddPageStat(ctx, dbq.AddPageStatParams{Day: day, Audience: audience, Section: page.Section, Metal: metal, Series: page.Series, Seconds: secs}); err != nil {
			return nil, fmt.Errorf("page stats seconds: %w", err)
		}
		if p == nil || b.View == nil {
			return RecordVisit204Response{}, nil
		}
		return RecordVisit204Response{}, s.addViewSeconds(ctx, p.ID, pgtype.UUID{Bytes: *b.View, Valid: true}, *b.Seconds)
	}
	device := visits.Device(c.UserAgent)
	arg := dbq.RecordVisitParams{Day: day, Device: pgtype.Text{String: device, Valid: true}}
	if p != nil {
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
	page, metal, err := s.resolvePage(ctx, b.Path)
	if err != nil {
		return nil, err
	}
	var from visits.Page
	fromMetal := ""
	if b.From != nil && (page.Section == "plans" || page.Section == "checkout") {
		if from, fromMetal, err = s.resolvePage(ctx, *b.From); err != nil {
			return nil, err
		}
	}
	err = s.tx(ctx, func(q *dbq.Queries) error {
		if metal != "" {
			if err := q.AddMetalView(ctx, dbq.AddMetalViewParams{Day: day, Metal: metal}); err != nil {
				return err
			}
		}
		// Nameless totals for «تحلیل بازدید» (client, 2026-11-05).
		if err := q.AddPageStat(ctx, dbq.AddPageStatParams{Day: day, Audience: audience, Section: page.Section, Metal: metal, Series: page.Series, Views: 1}); err != nil {
			return err
		}
		reach := [][2]string{{"s", page.Section}}
		if metal != "" {
			reach = append(reach, [2]string{"m", metal})
		}
		if page.Series != "" {
			reach = append(reach, [2]string{"p", page.Series})
		}
		for _, r := range reach {
			if err := q.AddReach(ctx, dbq.AddReachParams{Day: day, Kind: r[0], Key: r[1], Visitor: arg.Visitor}); err != nil {
				return err
			}
		}
		if b.Landing != nil && *b.Landing {
			src := visits.Source(deref(b.Ref), deref(b.Utm), "")
			campaign := visits.Tag(deref(b.Campaign))
			if err := q.AddLanding(ctx, dbq.AddLandingParams{Day: day, Source: src, Campaign: campaign}); err != nil {
				return err
			}
		}
		if from.Section != "" && from.Section != page.Section {
			if err := q.AddPlansFrom(ctx, dbq.AddPlansFromParams{Day: day, Page: page.Section, Section: from.Section, Metal: fromMetal}); err != nil {
				return err
			}
		}
		if p != nil && (b.Utm != nil || b.Ref != nil) {
			// A new member's first source: the website sends the landing's ref/utm with every page of the visit.
			if err := q.SetSignupSource(ctx, dbq.SetSignupSourceParams{ID: p.ID, Source: textOf(visits.Source(deref(b.Ref), deref(b.Utm), "")), Campaign: textOf(visits.Tag(deref(b.Campaign)))}); err != nil {
				return err
			}
		}
		if p == nil || b.View == nil {
			return nil
		}
		n, err := q.InsertPageView(ctx, dbq.InsertPageViewParams{
			ID: pgtype.UUID{Bytes: *b.View, Valid: true}, UserID: p.ID, Day: day, Path: b.Path,
			Section: page.Section, Metal: textOf(metal), SeriesSlug: textOf(page.Series),
		})
		if err != nil || n == 0 {
			return err
		}
		return q.AddActivityView(ctx, dbq.AddActivityViewParams{UserID: p.ID, Day: day, Section: page.Section, Metal: metal})
	})
	if err != nil {
		return nil, fmt.Errorf("record page view: %w", err)
	}
	return RecordVisit204Response{}, nil
}

// audienceOf is who a visitor is for the nameless totals: guest (not signed in), free, or paid (Silver or Gold).
func (s *Server) audienceOf(ctx context.Context, p *auth.Principal) (string, error) {
	if p == nil {
		return "guest", nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return "", err //nolint:wrapcheck // tier lookups say what failed
	}
	if cur.Tier == access.Free {
		return "free", nil
	}
	return "paid", nil
}

// RecordSearch counts a site search: its normalised term and whether anything was found (nameless, per day).
func (s *Server) RecordSearch(ctx context.Context, req RecordSearchRequestObject) (RecordSearchResponseObject, error) {
	term := visits.SearchTerm(req.Body.Q)
	if term == "" || visits.IsRobot(httpx.ClientFrom(ctx).UserAgent) {
		return RecordSearch204Response{}, nil
	}
	zero := int32(0)
	if req.Body.Results == 0 {
		zero = 1
	}
	day := pgtype.Date{Time: visits.Day(time.Now()), Valid: true}
	if err := s.q.AddSearch(ctx, dbq.AddSearchParams{Day: day, Term: term, Zero: zero}); err != nil {
		return nil, fmt.Errorf("record search: %w", err)
	}
	return RecordSearch204Response{}, nil
}

// resolvePage reads the section, metal and price row of a website path and checks the slugs against the catalog
// (an unknown slug is dropped). The metal comes from the page itself, else its price row, else its article.
func (s *Server) resolvePage(ctx context.Context, path string) (visits.Page, string, error) {
	page := visits.ParsePage(path)
	metal := ""
	if page.Metal != "" {
		ok, err := s.q.MetalSlugExists(ctx, page.Metal)
		if err != nil {
			return page, "", fmt.Errorf("page metal: %w", err)
		}
		if ok {
			metal = page.Metal
		}
	}
	if page.Series != "" {
		m, err := s.q.PageMetalOfSeries(ctx, page.Series)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			page.Series = ""
		case err != nil:
			return page, "", fmt.Errorf("page series: %w", err)
		case metal == "":
			metal = m
		}
	}
	if metal == "" && page.Article != "" {
		m, err := s.q.PageMetalOfArticle(ctx, page.Article)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return page, "", fmt.Errorf("page article: %w", err)
		}
		metal = m
	}
	return page, metal, nil
}

// addViewSeconds adds the time a page was in view to the caller's own page view and the day's summary.
func (s *Server) addViewSeconds(ctx context.Context, user, view pgtype.UUID, seconds int) error {
	secs := int32(max(1, min(seconds, visits.MaxReportSeconds))) //nolint:gosec // bounded by MaxReportSeconds
	err := s.tx(ctx, func(q *dbq.Queries) error {
		row, err := q.AddPageViewSeconds(ctx, dbq.AddPageViewSecondsParams{ID: view, UserID: user, Seconds: secs})
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.Added <= 0) {
			return nil // not this user's view (or not recorded), or the page already hit its cap
		}
		if err != nil {
			return err
		}
		return q.AddActivitySeconds(ctx, dbq.AddActivitySecondsParams{UserID: user, Day: row.Day, Section: row.Section, Metal: row.Metal, Seconds: row.Added})
	})
	if err != nil {
		return fmt.Errorf("page view seconds: %w", err)
	}
	return nil
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
