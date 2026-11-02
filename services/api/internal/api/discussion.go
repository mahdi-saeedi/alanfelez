package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/community"
	"github.com/alanfelez/alanfelez/services/api/internal/content"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Ratings and comments (client, 2026-11-02) on members' analyses ("post") and the team's articles ("article").
// Whoever may read the item may rate and comment on it: members' analyses need community.read (Silver), the team's
// analyses and forecasts their own feature (Gold); staff always. Comments wait for staff review, except staff's own,
// which show at once under the team's name. Nobody rates their own post.

// CommentsPerDay is how many comments one person may write in 24 hours.
const CommentsPerDay = 20

// staffAuthor is the name staff comments show.
const staffAuthor = "الان\u200cفلز"

func ptr[T any](v T) *T { return &v }

// target is what a discussion hangs on, as the caller may use it.
type target struct {
	found   bool
	feature access.Feature
	allowed bool
	author  bool // the caller wrote it (members' analyses)
}

// discussionTarget finds a published post or article and whether caller p may read, rate and comment on it.
func (s *Server) discussionTarget(ctx context.Context, p *auth.Principal, kind DiscussionKind, id pgtype.UUID) (target, error) {
	var t target
	switch kind {
	case DiscussionKindPost:
		row, err := s.q.GetCommunityPostOwner(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.Status != "published") {
			return t, nil
		}
		if err != nil {
			return t, fmt.Errorf("discussion post: %w", err)
		}
		t.found, t.feature, t.author = true, access.CommunityRead, p != nil && p.ID == row.UserID
	case DiscussionKindArticle:
		row, err := s.q.GetArticleForDiscussion(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.Status != "published") {
			return t, nil
		}
		if err != nil {
			return t, fmt.Errorf("discussion article: %w", err)
		}
		f, ok := content.Type(row.Type).Feature()
		if !ok {
			return t, nil
		}
		t.found, t.feature = true, f
	default:
		return t, nil
	}
	if p != nil && p.HasRole(auth.RoleStaff) {
		t.allowed = true
		return t, nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return t, err
	}
	t.allowed = access.Allowed(cur.Tier, t.feature)
	return t, nil
}

func (s *Server) ratingSummary(ctx context.Context, p *auth.Principal, kind DiscussionKind, id pgtype.UUID) (RatingSummary, error) {
	var caller pgtype.UUID
	if p != nil {
		caller = p.ID
	}
	r, err := s.q.RatingSummary(ctx, dbq.RatingSummaryParams{TargetKind: string(kind), TargetID: id, Caller: caller})
	if err != nil {
		return RatingSummary{}, fmt.Errorf("rating summary: %w", err)
	}
	return RatingSummary{Avg: float32(r.Avg), Count: int(r.Count), Mine: int(r.Mine)}, nil
}

// GetDiscussion returns an item's rating and, for callers who may read it, its comments.
func (s *Server) GetDiscussion(ctx context.Context, req GetDiscussionRequestObject) (GetDiscussionResponseObject, error) {
	type bad = GetDiscussiondefaultApplicationProblemPlusJSONResponse
	p := auth.FromContext(ctx)
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	t, err := s.discussionTarget(ctx, p, req.Kind, id)
	if err != nil {
		return nil, err
	}
	if !t.found {
		return fail[bad](notFound(ctx, "item")), nil
	}
	rating, err := s.ratingSummary(ctx, p, req.Kind, id)
	if err != nil {
		return nil, err
	}
	out := Discussion{Rating: rating, Comments: []Comment{}}
	if !t.allowed {
		out.Locked = true
		if need, ok := access.RequiredTier(t.feature); ok {
			out.RequiredPlan = ptr(Tier(need))
		}
		return GetDiscussion200JSONResponse(out), nil
	}
	var caller pgtype.UUID
	if p != nil {
		caller = p.ID
	}
	rows, err := s.q.ListComments(ctx, dbq.ListCommentsParams{TargetKind: string(req.Kind), TargetID: id, Caller: caller})
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	for _, r := range rows {
		out.Comments = append(out.Comments, Comment{
			Id: r.ID.Bytes, AuthorName: r.AuthorName, Staff: r.Staff, Body: r.Body, CreatedAt: r.CreatedAt.Time.UTC(),
			Mine: p != nil && p.ID == r.UserID, Pending: r.Status == "pending",
		})
	}
	out.CanRate = p != nil && !t.author
	out.CanComment = p != nil
	return GetDiscussion200JSONResponse(out), nil
}

// RateDiscussion stores the caller's stars (a second rating replaces the first).
func (s *Server) RateDiscussion(ctx context.Context, req RateDiscussionRequestObject) (RateDiscussionResponseObject, error) {
	type bad = RateDiscussiondefaultApplicationProblemPlusJSONResponse
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[bad](unauthenticated(ctx)), nil
	}
	if req.Body.Stars < 1 || req.Body.Stars > 5 {
		return fail[bad](badRequest(ctx, "stars must be 1–5")), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	t, err := s.discussionTarget(ctx, p, req.Kind, id)
	switch {
	case err != nil:
		return nil, err
	case !t.found:
		return fail[bad](notFound(ctx, "item")), nil
	case !t.allowed:
		return fail[bad](lockedProblem(ctx, t.feature)), nil
	case t.author:
		return fail[bad](badRequest(ctx, "you can't rate your own analysis")), nil
	}
	if err := s.q.UpsertRating(ctx, dbq.UpsertRatingParams{
		TargetKind: string(req.Kind), TargetID: id, UserID: p.ID, Stars: int16(req.Body.Stars), //nolint:gosec // 1–5, checked above
	}); err != nil {
		return nil, fmt.Errorf("rate: %w", err)
	}
	rating, err := s.ratingSummary(ctx, p, req.Kind, id)
	if err != nil {
		return nil, err
	}
	return RateDiscussion200JSONResponse(rating), nil
}

// CommentDiscussion saves a comment: pending until staff review it, published at once for staff.
func (s *Server) CommentDiscussion(ctx context.Context, req CommentDiscussionRequestObject) (CommentDiscussionResponseObject, error) {
	type bad = CommentDiscussiondefaultApplicationProblemPlusJSONResponse
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[bad](unauthenticated(ctx)), nil
	}
	body := community.Text(req.Body.Body)
	if n := len([]rune(body)); n < 2 || n > 1000 {
		return fail[bad](badRequest(ctx, "a comment must be 2–1000 characters")), nil
	}
	if err := community.CheckClaims("", body); err != nil {
		return fail[bad](badRequest(ctx, err.Error())), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	t, err := s.discussionTarget(ctx, p, req.Kind, id)
	switch {
	case err != nil:
		return nil, err
	case !t.found:
		return fail[bad](notFound(ctx, "item")), nil
	case !t.allowed:
		return fail[bad](lockedProblem(ctx, t.feature)), nil
	}
	n, err := s.q.CountUserCommentsSince(ctx, dbq.CountUserCommentsSinceParams{
		UserID: p.ID, CreatedAt: pgtype.Timestamptz{Time: time.Now().Add(-24 * time.Hour), Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("count comments today: %w", err)
	}
	if n >= CommentsPerDay {
		return fail[bad](problem(ctx, http.StatusTooManyRequests, codeRateLimited, "Too many comments", "at most 20 a day")), nil
	}
	staff := p.HasRole(auth.RoleStaff)
	arg := dbq.InsertCommentParams{
		TargetKind: string(req.Kind), TargetID: id, UserID: p.ID, AuthorName: community.AuthorName(p.GivenName, p.FamilyName),
		Body: body, Status: "pending",
	}
	if staff {
		arg.AuthorName, arg.Staff, arg.Status = staffAuthor, true, "published"
	}
	row, err := s.q.InsertComment(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("insert comment: %w", err)
	}
	return CommentDiscussion201JSONResponse(Comment{
		Id: row.ID.Bytes, AuthorName: arg.AuthorName, Staff: staff, Body: body, CreatedAt: row.CreatedAt.Time.UTC(),
		Mine: true, Pending: !staff,
	}), nil
}

// --- admin: comment review ------------------------------------------------------------------

// AdminListComments lists comments for review, waiting ones first.
func (s *Server) AdminListComments(ctx context.Context, req AdminListCommentsRequestObject) (AdminListCommentsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListCommentsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	var status pgtype.Text
	if req.Params.Status != nil {
		status = textOf(string(*req.Params.Status))
	}
	rows, err := s.q.AdminListComments(ctx, status)
	if err != nil {
		return nil, fmt.Errorf("admin comments: %w", err)
	}
	pending, err := s.q.CountPendingComments(ctx)
	if err != nil {
		return nil, fmt.Errorf("count pending comments: %w", err)
	}
	out := AdminListComments200JSONResponse{Items: make([]AdminComment, 0, len(rows)), Pending: int(pending)}
	for _, r := range rows {
		out.Items = append(out.Items, AdminComment{
			Id: r.ID.Bytes, Kind: DiscussionKind(r.TargetKind), TargetId: r.TargetID.Bytes, TargetTitle: r.TargetTitle,
			ArticleSlug: textp(r.ArticleSlug), AuthorName: r.AuthorName, Staff: r.Staff, Body: r.Body,
			Status: AdminCommentStatus(r.Status), CreatedAt: r.CreatedAt.Time.UTC(),
		})
	}
	return out, nil
}

// AdminSetCommentStatus publishes a comment after review or hides it; audited.
func (s *Server) AdminSetCommentStatus(ctx context.Context, req AdminSetCommentStatusRequestObject) (AdminSetCommentStatusResponseObject, error) {
	type bad = AdminSetCommentStatusdefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	status := string(req.Body.Status)
	if status != "published" && status != "hidden" {
		return fail[bad](badRequest(ctx, "unknown status")), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if n, err = q.SetCommentStatus(ctx, dbq.SetCommentStatusParams{ID: id, Status: status, Actor: p.ID}); err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "comment." + status, Entity: "comment", EntityID: *uuidString(id)})
	})
	if err != nil {
		return nil, fmt.Errorf("set comment status: %w", err)
	}
	if n == 0 {
		return fail[bad](notFound(ctx, "comment")), nil
	}
	return AdminSetCommentStatus204Response{}, nil
}
