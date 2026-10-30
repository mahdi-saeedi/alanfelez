package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/community"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Members' analyses («تحلیل کاربران», client 2026-10-30). Silver and Gold read and post (community.read/.post);
// a post is published at once, staff can hide it, its author can delete it. Free callers get the count only.

// ListCommunityPosts returns one page of published posts, or the count only when the caller's plan doesn't include them.
func (s *Server) ListCommunityPosts(ctx context.Context, req ListCommunityPostsRequestObject) (ListCommunityPostsResponseObject, error) {
	p := req.Params
	page, limit := 1, 12
	if p.Page != nil {
		page = min(max(*p.Page, 1), 1000)
	}
	if p.Limit != nil {
		limit = min(max(*p.Limit, 1), 50)
	}
	metal := textOfPtr(p.Metal)
	total, err := s.q.CountCommunityPosts(ctx, metal)
	if err != nil {
		return nil, fmt.Errorf("count community posts: %w", err)
	}
	caller := auth.FromContext(ctx)
	cur, err := s.tiers.Tier(ctx, caller)
	if err != nil {
		return nil, err
	}
	out := CommunityPostList{Items: []CommunityPost{}, Total: int(total), Page: page, Limit: limit}
	if !access.Allowed(cur.Tier, access.CommunityRead) {
		out.Locked = true
		if need, ok := access.RequiredTier(access.CommunityRead); ok {
			plan := Tier(need)
			out.RequiredPlan = &plan
		}
		return ListCommunityPosts200JSONResponse(out), nil
	}
	rows, err := s.q.ListCommunityPosts(ctx, dbq.ListCommunityPostsParams{
		Metal: metal, Lim: int32(limit), Off: int32((page - 1) * limit), //nolint:gosec // clamped above
	})
	if err != nil {
		return nil, fmt.Errorf("list community posts: %w", err)
	}
	lang := langOf((*string)(p.AcceptLanguage))
	for _, r := range rows {
		out.Items = append(out.Items, CommunityPost{
			Id: r.ID.Bytes, Title: r.Title, Body: r.Body, AuthorName: r.AuthorName, HasImage: r.HasImage,
			Mine: caller != nil && caller.ID == r.UserID, CreatedAt: r.CreatedAt.Time.UTC(),
			Metal: localizedRef(lang, r.MetalSlug, r.MetalFa, r.MetalEn), Outlook: outlookOf(r.Outlook),
		})
	}
	if caller != nil && access.Allowed(cur.Tier, access.CommunityPost) {
		left, err := s.postsLeftToday(ctx, caller.ID)
		if err != nil {
			return nil, err
		}
		yes := true
		out.CanPost, out.PostsLeftToday = &yes, &left
	}
	return ListCommunityPosts200JSONResponse(out), nil
}

func (s *Server) postsLeftToday(ctx context.Context, user pgtype.UUID) (int, error) {
	n, err := s.q.CountUserCommunityPostsSince(ctx, dbq.CountUserCommunityPostsSinceParams{
		UserID: user, CreatedAt: pgtype.Timestamptz{Time: time.Now().Add(-24 * time.Hour), Valid: true},
	})
	if err != nil {
		return 0, fmt.Errorf("count posts today: %w", err)
	}
	return max(community.PerDay-int(n), 0), nil
}

// CreateCommunityPost publishes a member's analysis (text; the image comes after with PutCommunityPostImage).
func (s *Server) CreateCommunityPost(ctx context.Context, req CreateCommunityPostRequestObject) (CreateCommunityPostResponseObject, error) {
	type bad = CreateCommunityPostdefaultApplicationProblemPlusJSONResponse
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[bad](unauthenticated(ctx)), nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	if !access.Allowed(cur.Tier, access.CommunityPost) {
		return fail[bad](lockedProblem(ctx, access.CommunityPost)), nil
	}
	in := req.Body
	title, body := community.Text(in.Title), community.Text(in.Body)
	if n := len([]rune(title)); n < 3 || n > 150 {
		return fail[bad](badRequest(ctx, "title must be 3–150 characters")), nil
	}
	if n := len([]rune(body)); n < 10 || n > 3000 {
		return fail[bad](badRequest(ctx, "text must be 10–3000 characters")), nil
	}
	if err := community.CheckClaims(title, body); err != nil {
		return fail[bad](badRequest(ctx, err.Error())), nil
	}
	left, err := s.postsLeftToday(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	if left == 0 {
		return fail[bad](problem(ctx, http.StatusTooManyRequests, codeRateLimited, "Too many analyses", "at most 3 a day")), nil
	}
	arg := dbq.CreateCommunityPostParams{
		UserID: p.ID, AuthorName: community.AuthorName(p.GivenName, p.FamilyName), MetalSlug: textOfPtr(in.Metal),
		Title: title, Body: body,
	}
	if in.Outlook != nil {
		arg.Outlook = textOf(string(*in.Outlook))
	}
	row, err := s.q.CreateCommunityPost(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("create community post: %w", err)
	}
	lang := langOf((*string)(req.Params.AcceptLanguage))
	out := CommunityPost{Id: row.ID.Bytes, Title: title, Body: body, AuthorName: arg.AuthorName, Mine: true,
		CreatedAt: row.CreatedAt.Time.UTC(), Outlook: in.Outlook}
	if in.Metal != nil {
		out.Metal = s.metalRef(ctx, lang, *in.Metal)
	}
	return CreateCommunityPost201JSONResponse(out), nil
}

// metalRef names a metal by slug in the caller's language (nil when unknown: the post was saved without one).
func (s *Server) metalRef(ctx context.Context, lang, slug string) *Localized {
	metals, err := s.q.ListMetals(ctx)
	if err != nil {
		return nil
	}
	for _, m := range metals {
		if m.Slug == slug {
			return &Localized{Slug: m.Slug, Name: localized(lang, m.NameFa, m.NameEn)}
		}
	}
	return nil
}

// ownPost reports whether p wrote post id (not found → false, nil).
func (s *Server) ownPost(ctx context.Context, p *auth.Principal, id pgtype.UUID) (found, own bool, err error) {
	o, err := s.q.GetCommunityPostOwner(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, fmt.Errorf("post owner: %w", err)
	}
	return true, o.UserID == p.ID, nil
}

// DeleteCommunityPost lets the author remove their own post.
func (s *Server) DeleteCommunityPost(ctx context.Context, req DeleteCommunityPostRequestObject) (DeleteCommunityPostResponseObject, error) {
	type bad = DeleteCommunityPostdefaultApplicationProblemPlusJSONResponse
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[bad](unauthenticated(ctx)), nil
	}
	n, err := s.q.DeleteCommunityPost(ctx, dbq.DeleteCommunityPostParams{ID: pgtype.UUID{Bytes: req.Id, Valid: true}, UserID: p.ID})
	if err != nil {
		return nil, fmt.Errorf("delete community post: %w", err)
	}
	if n == 0 { // someone else's post looks the same as a missing one
		return fail[bad](notFound(ctx, "post")), nil
	}
	return DeleteCommunityPost204Response{}, nil
}

// PutCommunityPostImage stores the chart image of the caller's own post, re-encoded as a JPEG.
func (s *Server) PutCommunityPostImage(ctx context.Context, req PutCommunityPostImageRequestObject) (PutCommunityPostImageResponseObject, error) {
	type bad = PutCommunityPostImagedefaultApplicationProblemPlusJSONResponse
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[bad](unauthenticated(ctx)), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	found, own, err := s.ownPost(ctx, p, id)
	if err != nil {
		return nil, err
	}
	if !found || !own {
		return fail[bad](notFound(ctx, "post")), nil
	}
	b, err := io.ReadAll(io.LimitReader(req.Body, community.MaxImageBytes+1))
	if err != nil {
		return fail[bad](badRequest(ctx, community.ErrImageSize.Error())), nil
	}
	img, err := community.ReencodeImage(b)
	if err != nil {
		return fail[bad](badRequest(ctx, err.Error())), nil
	}
	err = s.q.PutCommunityPostImage(ctx, dbq.PutCommunityPostImageParams{
		PostID: id, Width: int32(img.Width), Height: int32(img.Height), //nolint:gosec // ≤ MaxImageWidth, decoded image size
		SizeBytes: int32(len(img.JPEG)), Content: img.JPEG, //nolint:gosec // a JPEG of ≤ 1600 px is far below 2 GB
	})
	if err != nil {
		return nil, fmt.Errorf("save post image: %w", err)
	}
	return PutCommunityPostImage204Response{}, nil
}

// GetCommunityPostImage returns a published post's image to Silver and Gold callers.
func (s *Server) GetCommunityPostImage(ctx context.Context, req GetCommunityPostImageRequestObject) (GetCommunityPostImageResponseObject, error) {
	type bad = GetCommunityPostImagedefaultApplicationProblemPlusJSONResponse
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[bad](unauthenticated(ctx)), nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	// Staff see images to moderate posts, whatever their own plan.
	if !access.Allowed(cur.Tier, access.CommunityRead) && !p.HasRole(auth.RoleStaff) {
		return fail[bad](lockedProblem(ctx, access.CommunityRead)), nil
	}
	b, err := s.q.GetCommunityPostImage(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[bad](notFound(ctx, "image")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("post image: %w", err)
	}
	return GetCommunityPostImage200ImagejpegResponse{Body: bytes.NewReader(b), ContentLength: int64(len(b))}, nil
}

// --- admin: moderation ---------------------------------------------------------------------

// AdminListCommunityPosts lists members' analyses for moderation, hidden ones included.
func (s *Server) AdminListCommunityPosts(ctx context.Context, req AdminListCommunityPostsRequestObject) (AdminListCommunityPostsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListCommunityPostsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	arg := dbq.AdminListCommunityPostsParams{Q: deref(req.Params.Q)}
	if req.Params.Status != nil {
		arg.Status = textOf(string(*req.Params.Status))
	}
	rows, err := s.q.AdminListCommunityPosts(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("admin community posts: %w", err)
	}
	out := AdminListCommunityPosts200JSONResponse{Items: make([]AdminCommunityPost, 0, len(rows))}
	for _, r := range rows {
		out.Items = append(out.Items, AdminCommunityPost{
			Id: r.ID.Bytes, UserId: r.UserID.Bytes, Title: r.Title, Body: r.Body, AuthorName: r.AuthorName,
			HasImage: r.HasImage, CreatedAt: r.CreatedAt.Time.UTC(), Status: AdminCommunityPostStatus(r.Status),
			HiddenAt: timep(r.HiddenAt), Metal: localizedRef("fa", r.MetalSlug, r.MetalFa, r.MetalEn), Outlook: outlookOf(r.Outlook),
		})
	}
	return out, nil
}

// AdminSetCommunityPostStatus hides a post (or shows it again); audited.
func (s *Server) AdminSetCommunityPostStatus(ctx context.Context, req AdminSetCommunityPostStatusRequestObject) (AdminSetCommunityPostStatusResponseObject, error) {
	type bad = AdminSetCommunityPostStatusdefaultApplicationProblemPlusJSONResponse
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
		if n, err = q.SetCommunityPostStatus(ctx, dbq.SetCommunityPostStatusParams{ID: id, Status: status, Actor: p.ID}); err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "community.post." + status, Entity: "community_post", EntityID: *uuidString(id)})
	})
	if err != nil {
		return nil, fmt.Errorf("set post status: %w", err)
	}
	if n == 0 {
		return fail[bad](notFound(ctx, "post")), nil
	}
	return AdminSetCommunityPostStatus204Response{}, nil
}
