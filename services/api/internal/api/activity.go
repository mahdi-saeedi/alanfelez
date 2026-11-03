package api

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/platform/jalali"
	"github.com/alanfelez/alanfelez/services/api/internal/visits"
)

// The admin's user activity («رفتار کاربران», client 2026-11-03, owner OK by phone) and dashboard. Every staff role
// may read them (sales staff included); exports are audited because they carry names and mobile numbers.

const pageSize = 50

// The element types of AdminActivityRow, AdminUserActivity and AdminDashboard that are inline in the contract.
type (
	activityProduct = struct {
		Metal  string `json:"metal"`
		Name   string `json:"name"`
		Series string `json:"series"`
		Views  int    `json:"views"`
	}
	activityDay = struct {
		Day     openapi_types.Date `json:"day"`
		Seconds int                `json:"seconds"`
		Views   int                `json:"views"`
	}
	activityPage = struct {
		At      time.Time `json:"at"`
		Metal   *string   `json:"metal,omitempty"`
		Path    string    `json:"path"`
		Product *string   `json:"product,omitempty"`
		Seconds int       `json:"seconds"`
		Section string    `json:"section"`
	}
	missingPrice = struct {
		Market string `json:"market"`
		Name   string `json:"name"`
		Series string `json:"series"`
	}
)

func pgDate(t time.Time) pgtype.Date { return pgtype.Date{Time: t, Valid: true} }

func pgTime(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }

// dayRange is the from..to of an activity request: default the last 30 days up to today (Tehran), never past today,
// at most two years long. ok is false for from after to.
func dayRange(from, to *openapi_types.Date) (time.Time, time.Time, bool) {
	today := visits.Day(time.Now())
	t := today
	if to != nil && to.Before(today) {
		t = to.Time
	}
	f := t.AddDate(0, 0, -29)
	if from != nil {
		f = from.Time
	}
	if f.After(t) {
		return f, t, false
	}
	if earliest := t.Add(-visits.ActivityRetention); f.Before(earliest) {
		f = earliest
	}
	return f, t, true
}

// searchTerm prepares a search box value: a phone number loses spaces and "+98"; a name keeps its spaces.
func searchTerm(q *string) string {
	if q == nil {
		return ""
	}
	v := strings.TrimSpace(jalali.Latin(*q))
	if strings.Trim(strings.ReplaceAll(v, " ", ""), "+0123456789") == "" {
		return normalizeSearch(v)
	}
	return v
}

// minDaysOf is the "at least n days with a page" filter (0 = none).
func minDaysOf(n *int) int32 {
	if n == nil || *n < 1 {
		return 0
	}
	return int32(min(*n, 730)) //nolint:gosec // bounded by 730
}

func offsetOf(page *int) int32 {
	if page == nil || *page < 1 {
		return 0
	}
	return int32(min(*page, 10000)-1) * pageSize //nolint:gosec // bounded by 10000 pages
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

func planOf(p *UserPlanFilter) string {
	if p == nil {
		return ""
	}
	return string(*p)
}

// AdminDashboard returns the admin home page for one Tehran day (default today).
func (s *Server) AdminDashboard(ctx context.Context, req AdminDashboardRequestObject) (AdminDashboardResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminDashboarddefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	today := visits.Day(time.Now())
	day := today
	if req.Params.Day != nil && req.Params.Day.Before(today) {
		day = req.Params.Day.Time
	}
	start, end := visits.Bounds(day)
	asOf := end
	if day.Equal(today) {
		asOf = time.Now()
	}
	cur, err := s.q.VisitTotalsOfDay(ctx, pgDate(day))
	if err != nil {
		return nil, fmt.Errorf("dashboard visits: %w", err)
	}
	prev, err := s.q.VisitTotalsOfDay(ctx, pgDate(day.AddDate(0, 0, -1)))
	if err != nil {
		return nil, fmt.Errorf("dashboard visits: %w", err)
	}
	c, err := s.q.DashboardCounts(ctx, pgTime(asOf))
	if err != nil {
		return nil, fmt.Errorf("dashboard counts: %w", err)
	}
	missing, err := s.q.DashboardMissingPrices(ctx, dbq.DashboardMissingPricesParams{DayStart: pgTime(start), DayEnd: pgTime(end)})
	if err != nil {
		return nil, fmt.Errorf("dashboard missing prices: %w", err)
	}
	metals, err := s.q.MetalViewsOfDay(ctx, pgDate(day))
	if err != nil {
		return nil, fmt.Errorf("dashboard metals: %w", err)
	}
	followups, err := s.q.CountFollowupsDue(ctx, pgDate(day))
	if err != nil {
		return nil, fmt.Errorf("dashboard follow-ups: %w", err)
	}
	en := req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en"
	out := AdminDashboard200JSONResponse{
		Day: openapi_types.Date{Time: day}, Today: day.Equal(today),
		Visitors: int(cur.Visitors), SignedIn: int(cur.SignedIn), Pageviews: int(cur.Pageviews),
		PrevVisitors: int(prev.Visitors), PrevSignedIn: int(prev.SignedIn),
		Signups7d: int(c.Signups7d), SignupsPrev7d: int(c.SignupsPrev7d), Silver: int(c.Silver), Gold: int(c.Gold), Expiring7d: int(c.Expiring7d), FollowupsDue: int(followups),
		MissingPrices: make([]missingPrice, 0, len(missing)), Metals: make([]ActivityMetal, 0, len(metals)),
	}
	out.Pending.Posts, out.Pending.Comments, out.Pending.Tickets = int(c.PendingPosts), int(c.PendingComments), int(c.OpenTickets)
	out.Pending.Messages, out.Pending.Quarantined = int(c.NewMessages), int(c.Quarantined)
	for _, m := range missing {
		out.MissingPrices = append(out.MissingPrices, missingPrice{Series: m.Slug, Name: pick(en, m.NameFa, m.NameEn), Market: pick(en, m.MarketFa, m.MarketEn)})
	}
	for _, m := range metals {
		out.Metals = append(out.Metals, ActivityMetal{Metal: m.Metal, Views: int(m.Views)})
	}
	return out, nil
}

// pick is the English name when asked for and set, else the Persian one.
func pick(en bool, fa string, enName pgtype.Text) string {
	if en {
		return localized("en", fa, enName)
	}
	return fa
}

// AdminActivity lists signed-in users with their activity between two days.
func (s *Server) AdminActivity(ctx context.Context, req AdminActivityRequestObject) (AdminActivityResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminActivitydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	from, to, ok := dayRange(req.Params.From, req.Params.To)
	if !ok {
		return fail[AdminActivitydefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "from must not be after to")), nil
	}
	rows, err := s.activityRows(ctx, dbq.ActivityUsersParams{
		FromDay: pgDate(from), ToDay: pgDate(to), Metal: str(req.Params.Metal), Plan: planOf(req.Params.Plan),
		Activity: str(req.Params.Activity), Q: searchTerm(req.Params.Q), Off: offsetOf(req.Params.Page), Lim: pageSize,
		Upgradable: req.Params.Upgradable != nil && *req.Params.Upgradable, MinDays: minDaysOf(req.Params.MinDays),
	})
	if err != nil {
		return nil, err
	}
	out := AdminActivity200JSONResponse{From: openapi_types.Date{Time: from}, To: openapi_types.Date{Time: to}, Items: rows.items}
	out.Total = rows.total
	return out, nil
}

type activityResult struct {
	items []AdminActivityRow
	total int
}

// activityRows runs the activity list query and adds each user's metals and sections.
func (s *Server) activityRows(ctx context.Context, arg dbq.ActivityUsersParams) (activityResult, error) {
	users, err := s.q.ActivityUsers(ctx, arg)
	if err != nil {
		return activityResult{}, fmt.Errorf("activity users: %w", err)
	}
	out := activityResult{items: make([]AdminActivityRow, 0, len(users))}
	if len(users) == 0 {
		return out, nil
	}
	ids := make([]pgtype.UUID, len(users))
	for i, u := range users {
		ids[i] = u.ID
	}
	metals, err := s.q.ActivityMetals(ctx, dbq.ActivityMetalsParams{UserIds: ids, FromDay: arg.FromDay, ToDay: arg.ToDay})
	if err != nil {
		return out, fmt.Errorf("activity metals: %w", err)
	}
	sections, err := s.q.ActivitySections(ctx, dbq.ActivitySectionsParams{UserIds: ids, FromDay: arg.FromDay, ToDay: arg.ToDay})
	if err != nil {
		return out, fmt.Errorf("activity sections: %w", err)
	}
	byUser := map[pgtype.UUID]*AdminActivityRow{}
	for _, u := range users {
		row := AdminActivityRow{
			UserId: u.ID.Bytes, Username: u.Username, Phone: textp(u.PhoneE164), Company: textp(u.Company), Activity: textp(u.Activity),
			Plan: Tier(u.CurrentPlan), Days: int(u.Days), Views: int(u.Views), Seconds: int(u.Seconds), LastAt: timep(u.LastAt),
			Metals: []ActivityMetal{}, Sections: []ActivitySection{},
		}
		if name := fullName(u.FirstName, u.LastName); name != "" {
			row.Name = &name
		}
		if u.LeadStage != "" {
			st := LeadStage(u.LeadStage)
			row.LeadStage = &st
		}
		out.items = append(out.items, row)
		out.total = int(u.Total)
	}
	for i := range out.items {
		byUser[pgtype.UUID{Bytes: out.items[i].UserId, Valid: true}] = &out.items[i]
	}
	for _, m := range metals {
		if r := byUser[m.UserID]; r != nil {
			r.Metals = append(r.Metals, ActivityMetal{Metal: m.Metal, Views: int(m.Views), Seconds: int(m.Seconds)})
		}
	}
	for _, sc := range sections {
		if r := byUser[sc.UserID]; r != nil {
			r.Sections = append(r.Sections, ActivitySection{Section: sc.Section, Views: int(sc.Views), Seconds: int(sc.Seconds)})
		}
	}
	return out, nil
}

// AdminUserActivity returns one user's activity between two days and the pages of one day.
func (s *Server) AdminUserActivity(ctx context.Context, req AdminUserActivityRequestObject) (AdminUserActivityResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminUserActivitydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	from, to, ok := dayRange(req.Params.From, req.Params.To)
	if !ok {
		return fail[AdminUserActivitydefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "from must not be after to")), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	u, err := s.q.AdminUserByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminUserActivitydefaultApplicationProblemPlusJSONResponse](notFound(ctx, "user")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("activity user: %w", err)
	}
	f, t := pgDate(from), pgDate(to)
	page, err := s.activityRows(ctx, dbq.ActivityUsersParams{FromDay: f, ToDay: t, Q: req.Id.String(), Lim: 1})
	if err != nil {
		return nil, err
	}
	days, err := s.q.ActivityDays(ctx, dbq.ActivityDaysParams{UserID: id, FromDay: f, ToDay: t})
	if err != nil {
		return nil, fmt.Errorf("activity days: %w", err)
	}
	products, err := s.q.ActivityProducts(ctx, dbq.ActivityProductsParams{UserID: id, FromDay: f, ToDay: t})
	if err != nil {
		return nil, fmt.Errorf("activity products: %w", err)
	}
	span, err := s.q.ActivityRange(ctx, dbq.ActivityRangeParams{UserID: id, FromDay: f, ToDay: t})
	if err != nil {
		return nil, fmt.Errorf("activity range: %w", err)
	}
	day := pgtype.Date{}
	if req.Params.Day != nil {
		day = pgDate(req.Params.Day.Time)
	} else if day, err = s.q.ActivityLastDay(ctx, dbq.ActivityLastDayParams{UserID: id, FromDay: f, ToDay: t}); err != nil {
		return nil, fmt.Errorf("activity last day: %w", err)
	}
	pages, err := s.q.PageViewsOfDay(ctx, dbq.PageViewsOfDayParams{UserID: id, Day: day})
	if err != nil {
		return nil, fmt.Errorf("activity pages: %w", err)
	}

	en := req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en"
	out := AdminUserActivity200JSONResponse{
		User: AdminUser{
			Id: u.ID.Bytes, Username: u.Username, Phone: textp(u.PhoneE164), FirstName: textp(u.FirstName), LastName: textp(u.LastName),
			Email: textp(u.Email), CreatedAt: u.CreatedAt.Time.UTC(), LastSeenAt: u.LastSeenAt.Time.UTC(), Blocked: u.BlockedAt.Valid,
			CurrentPlan: Tier(u.CurrentPlan), CurrentEndsAt: timep(u.CurrentEndsAt), Activity: textp(u.Activity), Metals: slicep(u.Metals),
			Province: textp(u.Province), Company: textp(u.Company), DeletedAt: timep(u.DeletedAt),
		},
		From: openapi_types.Date{Time: from}, To: openapi_types.Date{Time: to}, Day: openapi_types.Date{Time: day.Time},
		FirstAt: timep(span.FirstAt), LastAt: timep(span.LastAt),
		Metals: []ActivityMetal{}, Sections: []ActivitySection{},
		Products: make([]activityProduct, 0, len(products)), Daily: make([]activityDay, 0, len(days)), Pages: make([]activityPage, 0, len(pages)),
	}
	if len(page.items) == 1 {
		r := page.items[0]
		out.Days, out.Views, out.Seconds, out.Metals, out.Sections = r.Days, r.Views, r.Seconds, r.Metals, r.Sections
	}
	for _, p := range products {
		out.Products = append(out.Products, activityProduct{Series: p.SeriesSlug, Name: pick(en, p.NameFa, p.NameEn), Metal: p.Metal, Views: int(p.Views)})
	}
	for _, d := range days {
		out.Daily = append(out.Daily, activityDay{Day: openapi_types.Date{Time: d.Day.Time}, Views: int(d.Views), Seconds: int(d.Seconds)})
	}
	for _, p := range pages {
		row := activityPage{At: p.At.Time.UTC(), Path: p.Path, Section: p.Section, Seconds: int(p.Seconds), Metal: textp(p.Metal)}
		if p.ProductFa.Valid {
			name := pick(en, p.ProductFa.String, p.ProductEn)
			row.Product = &name
		}
		out.Pages = append(out.Pages, row)
	}
	return out, nil
}

// AdminExportActivity is the activity list (or one user's page views) as a CSV file for Excel. Audited.
func (s *Server) AdminExportActivity(ctx context.Context, req AdminExportActivityRequestObject) (AdminExportActivityResponseObject, error) {
	p, pr := requireRoles(ctx, rolesRead...)
	if pr != nil {
		return fail[AdminExportActivitydefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	from, to, ok := dayRange(req.Params.From, req.Params.To)
	if !ok {
		return fail[AdminExportActivitydefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "from must not be after to")), nil
	}
	l := labelsFor(req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en")
	metals, err := s.q.ListMetals(ctx)
	if err != nil {
		return nil, fmt.Errorf("export metals: %w", err)
	}
	metalName := map[string]string{}
	for _, m := range metals {
		metalName[m.Slug] = pick(l.en, m.NameFa, m.NameEn)
	}

	var buf bytes.Buffer
	buf.WriteString("\xef\xbb\xbf") // Excel reads the file as UTF-8 only with a byte order mark
	w := csv.NewWriter(&buf)
	var rows int
	name := fmt.Sprintf("activity-%s-%s.csv", from.Format(time.DateOnly), to.Format(time.DateOnly))
	if req.Params.UserId != nil {
		id := pgtype.UUID{Bytes: *req.Params.UserId, Valid: true}
		views, err := s.q.PageViewsForExport(ctx, dbq.PageViewsForExportParams{UserID: id, FromDay: pgDate(from), ToDay: pgDate(to)})
		if err != nil {
			return nil, fmt.Errorf("export page views: %w", err)
		}
		_ = w.Write([]string{l.col["time"], l.col["section"], l.col["metal"], l.col["product"], l.col["minutes"], l.col["path"]})
		for _, v := range views {
			_ = w.Write([]string{l.when(v.At.Time), l.section(v.Section), metalName[v.Metal.String], v.SeriesSlug.String, minutes(int64(v.Seconds)), v.Path})
		}
		rows = len(views)
		name = fmt.Sprintf("activity-%s-%s-%s.csv", req.Params.UserId.String()[:8], from.Format(time.DateOnly), to.Format(time.DateOnly))
	} else {
		page, err := s.activityRows(ctx, dbq.ActivityUsersParams{
			FromDay: pgDate(from), ToDay: pgDate(to), Metal: str(req.Params.Metal), Plan: planOf(req.Params.Plan),
			Activity: str(req.Params.Activity), Q: searchTerm(req.Params.Q), Lim: 20000,
		})
		if err != nil {
			return nil, err
		}
		head := []string{l.col["mobile"], l.col["id"], l.col["name"], l.col["company"], l.col["activity"], l.col["plan"],
			l.col["days"], l.col["views"], l.col["minutes"], l.col["topSection"], l.col["last"]}
		for _, m := range metals {
			head = append(head, metalName[m.Slug])
		}
		_ = w.Write(head)
		for _, r := range page.items {
			top := ""
			if len(r.Sections) > 0 {
				top = l.section(r.Sections[0].Section)
			}
			last := ""
			if r.LastAt != nil {
				last = l.when(*r.LastAt)
			}
			line := []string{r.Username, r.UserId.String(), orElse(r.Name, ""), orElse(r.Company, ""),
				l.activity(orElse(r.Activity, "")), l.plan[string(r.Plan)], strconv.Itoa(r.Days), strconv.Itoa(r.Views), minutes(int64(r.Seconds)), top, last}
			views := map[string]int{}
			for _, m := range r.Metals {
				views[m.Metal] = m.Views
			}
			for _, m := range metals {
				line = append(line, strconv.Itoa(views[m.Slug]))
			}
			_ = w.Write(line)
		}
		rows = len(page.items)
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("export csv: %w", err)
	}
	data := map[string]any{"from": from.Format(time.DateOnly), "to": to.Format(time.DateOnly), "rows": rows}
	entityID := ""
	if req.Params.UserId != nil {
		entityID = req.Params.UserId.String()
	}
	if err := s.tx(ctx, func(q *dbq.Queries) error {
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "activity.export", Entity: "user", EntityID: entityID, Data: data})
	}); err != nil {
		return nil, fmt.Errorf("export audit: %w", err)
	}
	disp := `attachment; filename="` + name + `"`
	return AdminExportActivity200TextcsvResponse{Body: &buf, ContentLength: int64(buf.Len()), Headers: AdminExportActivity200ResponseHeaders{ContentDisposition: &disp}}, nil
}

func orElse(p *string, fallback string) string {
	if p == nil {
		return fallback
	}
	return *p
}

// minutes renders seconds as whole minutes (rounded) for the spreadsheets.
func minutes(seconds int64) string { return strconv.FormatInt((seconds+30)/60, 10) }

// csvLabels are the export's column names and values in the staff member's language.
type csvLabels struct {
	en       bool
	col      map[string]string
	sections map[string]string
	acts     map[string]string
	plan     map[string]string
	users    map[string]string
}

func (l csvLabels) section(s string) string {
	if v, ok := l.sections[s]; ok {
		return v
	}
	return s
}

func (l csvLabels) activity(s string) string {
	if v, ok := l.acts[s]; ok {
		return v
	}
	return s
}

// when is a time as Tehran date and clock (Jalali in Persian).
func (l csvLabels) when(t time.Time) string {
	clock := t.In(tehranTZ).Format("15:04")
	if l.en {
		return t.In(tehranTZ).Format("2006-01-02") + " " + clock
	}
	return jalali.Format(t) + " " + jalali.Digits(clock)
}

var tehranTZ = time.FixedZone("IRST", 3*3600+1800)

func labelsFor(en bool) csvLabels {
	if en {
		return csvLabels{en: true,
			col: map[string]string{"mobile": "Mobile", "id": "User id", "name": "Name", "company": "Company", "activity": "Activity", "plan": "Plan",
				"days": "Days on the site", "views": "Pages", "minutes": "Minutes on the site", "topSection": "Top section", "last": "Last visit",
				"time": "Time", "section": "Section", "metal": "Metal", "product": "Price row", "path": "Page"},
			sections: map[string]string{"home": "Home", "prices": "Metal prices", "chart": "Chart", "auctions": "IME auctions", "analysis": "Analyses",
				"calculator": "Calculator", "plans": "Plans", "account": "Account", "faq": "FAQ", "about": "About", "contact": "Contact", "search": "Search", "other": "Other"},
			acts: map[string]string{"trader": "Trading", "producer": "Producer", "industrial-consumer": "Industrial consumer", "distributor": "Distribution",
				"recycler": "Recycling and scrap", "investor": "Investor / analyst", "other": "Other"},
			plan:  map[string]string{"free": "Free", "silver": "Silver", "gold": "Gold"},
			users: map[string]string{"metals": "Metals (sign-up)", "province": "Province", "ends": "Plan ends", "signup": "Signed up", "seen": "Last seen"},
		}
	}
	return csvLabels{
		col: map[string]string{"mobile": "موبایل", "id": "شناسه", "name": "نام", "company": "شرکت", "activity": "زمینه فعالیت", "plan": "اشتراک",
			"days": "روزهای حضور", "views": "صفحه\u200cها", "minutes": "زمان در سایت (دقیقه)", "topSection": "بیشترین بخش", "last": "آخرین بازدید",
			"time": "زمان", "section": "بخش", "metal": "فلز", "product": "ردیف قیمت", "path": "صفحه"},
		sections: map[string]string{"home": "صفحه\u200cی اصلی", "prices": "قیمت فلزات", "chart": "نمودار", "auctions": "مزایده\u200cهای بورس", "analysis": "تحلیل\u200cها",
			"calculator": "ماشین حساب", "plans": "اشتراک\u200cها", "account": "حساب کاربری", "faq": "سوالات متداول", "about": "درباره ما", "contact": "تماس با ما", "search": "جستجو", "other": "سایر"},
		acts: map[string]string{"trader": "بازرگانی (خرید و فروش)", "producer": "تولیدکننده", "industrial-consumer": "مصرف\u200cکننده\u200cی صنعتی", "distributor": "توزیع و پخش",
			"recycler": "بازیافت و ضایعات", "investor": "سرمایه\u200cگذار / تحلیلگر", "other": "سایر"},
		plan:  map[string]string{"free": "رایگان", "silver": "نقره\u200cای", "gold": "طلایی"},
		users: map[string]string{"metals": "فلزهای ثبت\u200cنام", "province": "استان", "ends": "پایان اشتراک", "signup": "تاریخ ثبت\u200cنام", "seen": "آخرین حضور"},
	}
}

// AdminExportUsers is the users list (same filters, every page) as a CSV file for Excel. Audited.
func (s *Server) AdminExportUsers(ctx context.Context, req AdminExportUsersRequestObject) (AdminExportUsersResponseObject, error) {
	p, pr := requireRoles(ctx, rolesRead...)
	if pr != nil {
		return fail[AdminExportUsersdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.AdminUsersPage(ctx, dbq.AdminUsersPageParams{
		Q: searchTerm(req.Params.Q), Plan: planOf(req.Params.Plan), Metal: str(req.Params.Metal), Activity: str(req.Params.Activity),
		Province: str(req.Params.Province), Lim: 20000,
	})
	if err != nil {
		return nil, fmt.Errorf("export users: %w", err)
	}
	l := labelsFor(req.Params.AcceptLanguage != nil && *req.Params.AcceptLanguage == "en")
	metals, err := s.q.ListMetals(ctx)
	if err != nil {
		return nil, fmt.Errorf("export metals: %w", err)
	}
	metalName := map[string]string{}
	for _, m := range metals {
		metalName[m.Slug] = pick(l.en, m.NameFa, m.NameEn)
	}
	sep := "، "
	if l.en {
		sep = ", "
	}
	var buf bytes.Buffer
	buf.WriteString("\xef\xbb\xbf")
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{l.col["mobile"], l.col["id"], l.col["name"], l.col["company"], l.col["activity"], l.users["metals"],
		l.users["province"], l.col["plan"], l.users["ends"], l.users["signup"], l.users["seen"]})
	for _, r := range rows {
		names := make([]string, 0, len(r.Metals))
		for _, m := range r.Metals {
			names = append(names, orElse(strp(metalName[m]), m))
		}
		ends := ""
		if r.CurrentEndsAt.Valid {
			ends = l.when(r.CurrentEndsAt.Time)
		}
		_ = w.Write([]string{r.Username, uuid.UUID(r.ID.Bytes).String(), fullName(r.FirstName, r.LastName),
			r.Company.String, l.activity(r.Activity.String), strings.Join(names, sep), r.Province.String, l.plan[r.CurrentPlan], ends,
			l.when(r.CreatedAt.Time), l.when(r.LastSeenAt.Time)})
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("export csv: %w", err)
	}
	if err := s.tx(ctx, func(q *dbq.Queries) error {
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "users.export", Entity: "user", Data: map[string]int{"rows": len(rows)}})
	}); err != nil {
		return nil, fmt.Errorf("export audit: %w", err)
	}
	disp := `attachment; filename="users-` + visits.Day(time.Now()).Format(time.DateOnly) + `.csv"`
	return AdminExportUsers200TextcsvResponse{Body: &buf, ContentLength: int64(buf.Len()), Headers: AdminExportUsers200ResponseHeaders{ContentDisposition: &disp}}, nil
}
