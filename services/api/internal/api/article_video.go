package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
	"github.com/alanfelez/alanfelez/services/api/internal/storage"
)

// Article videos on our own storage (client, 2026-11-04: for the ads now, maybe Aparat later). The admin's browser
// uploads the file straight to the private bucket with a signed link (big files never pass the API or the ingress),
// then attaches it here; readers who may read the body get a signed link to play it.
const (
	maxVideoBytes  = 500 << 20 // 500 MB
	videoUploadTTL = time.Hour
	videoPlayTTL   = 6 * time.Hour
)

var videoTypes = map[string]string{"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}

// videoKeyOf checks a key belongs to this article's videos (the shape the upload link used).
func videoKeyOf(article uuid.UUID, key string) bool {
	prefix := "articles/" + article.String() + "/"
	rest, ok := strings.CutPrefix(key, prefix)
	return ok && rest != "" && !strings.ContainsAny(rest, "/\\\\") && len(key) <= 200
}

// AdminStartArticleVideo returns a signed link to upload an article's video to.
func (s *Server) AdminStartArticleVideo(ctx context.Context, req AdminStartArticleVideoRequestObject) (AdminStartArticleVideoResponseObject, error) {
	type bad = AdminStartArticleVideodefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesContentWrite...); pr != nil {
		return fail[bad](*pr), nil
	}
	if s.store == nil {
		return fail[bad](problem(ctx, http.StatusServiceUnavailable, codeUpstream, "Video upload is not set up", "no object storage configured")), nil
	}
	ext, ok := videoTypes[string(req.Body.ContentType)]
	if !ok {
		return fail[bad](badRequest(ctx, "a video must be MP4, WebM or MOV")), nil
	}
	if req.Body.Size <= 0 || req.Body.Size > maxVideoBytes {
		return fail[bad](badRequest(ctx, "a video may be at most 500 MB")), nil
	}
	if _, err := s.q.GetArticle(ctx, pgtype.UUID{Bytes: req.Id, Valid: true}); errors.Is(err, pgx.ErrNoRows) {
		return fail[bad](notFound(ctx, "article")), nil
	} else if err != nil {
		return nil, fmt.Errorf("article: %w", err)
	}
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	key := fmt.Sprintf("articles/%s/%s.%s", req.Id, hex.EncodeToString(b), ext)
	url, err := s.store.PresignPut(ctx, key, videoUploadTTL)
	if err != nil {
		return nil, err //nolint:wrapcheck // storage errors say what failed
	}
	return AdminStartArticleVideo201JSONResponse{UploadUrl: url, Key: key}, nil
}

// AdminSetArticleVideo attaches an uploaded video to its article (and deletes the one it replaces).
func (s *Server) AdminSetArticleVideo(ctx context.Context, req AdminSetArticleVideoRequestObject) (AdminSetArticleVideoResponseObject, error) {
	type bad = AdminSetArticleVideodefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	if s.store == nil {
		return fail[bad](problem(ctx, http.StatusServiceUnavailable, codeUpstream, "Video upload is not set up", "")), nil
	}
	key := req.Body.Key
	if !videoKeyOf(req.Id, key) {
		return fail[bad](badRequest(ctx, "unknown video key")), nil
	}
	obj, err := s.store.Stat(ctx, key)
	if errors.Is(err, storage.ErrNotFound) {
		return fail[bad](badRequest(ctx, "the video hasn't been uploaded")), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // storage errors say what failed
	}
	if _, ok := videoTypes[obj.ContentType]; !ok || obj.Size > maxVideoBytes {
		_ = s.store.Remove(ctx, key)
		return fail[bad](badRequest(ctx, "a video must be MP4, WebM or MOV of at most 500 MB")), nil
	}
	old, err := s.setVideo(ctx, p, req.Id, pgtype.Text{String: key, Valid: true}, obj)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[bad](notFound(ctx, "article")), nil
	}
	if err != nil {
		return nil, err
	}
	if old.Valid && old.String != key {
		if err := s.store.Remove(ctx, old.String); err != nil {
			s.logger().WarnContext(ctx, "old article video not deleted", "key", old.String, "err", err)
		}
	}
	return AdminSetArticleVideo204Response{}, nil
}

// AdminDeleteArticleVideo removes an article's uploaded video.
func (s *Server) AdminDeleteArticleVideo(ctx context.Context, req AdminDeleteArticleVideoRequestObject) (AdminDeleteArticleVideoResponseObject, error) {
	type bad = AdminDeleteArticleVideodefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	old, err := s.setVideo(ctx, p, req.Id, pgtype.Text{}, storage.Object{})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[bad](notFound(ctx, "article")), nil
	}
	if err != nil {
		return nil, err
	}
	if !old.Valid {
		return fail[bad](notFound(ctx, "video")), nil
	}
	if s.store != nil {
		if err := s.store.Remove(ctx, old.String); err != nil {
			s.logger().WarnContext(ctx, "article video not deleted from storage", "key", old.String, "err", err)
		}
	}
	return AdminDeleteArticleVideo204Response{}, nil
}

// setVideo points the article at key (none: invalid) in one audited transaction; it returns the key it had.
func (s *Server) setVideo(ctx context.Context, p *auth.Principal, id uuid.UUID, key pgtype.Text, obj storage.Object) (pgtype.Text, error) {
	var old pgtype.Text
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		arg := dbq.SetArticleVideoFileParams{ID: pgtype.UUID{Bytes: id, Valid: true}, VideoKey: key}
		if key.Valid {
			arg.VideoBytes = pgtype.Int8{Int64: obj.Size, Valid: true}
			arg.VideoType = pgtype.Text{String: obj.ContentType, Valid: true}
		}
		if old, err = q.SetArticleVideoFile(ctx, arg); err != nil {
			return err //nolint:wrapcheck // pgx.ErrNoRows is checked by the caller
		}
		action := "article.video"
		if !key.Valid {
			action = "article.video_delete"
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: action, Entity: "article", EntityID: id.String(), Data: map[string]any{"key": key.String, "bytes": obj.Size}})
	})
	return old, err
}

// withVideo adds the upload switch and the uploaded video's preview link to an admin article.
func (s *Server) withVideo(ctx context.Context, a AdminArticle, key pgtype.Text) AdminArticle {
	a.VideoUploads = s.store != nil
	if s.store != nil && key.Valid {
		if u, err := s.store.PresignGet(ctx, key.String, videoPlayTTL); err == nil {
			a.VideoFileUrl = &u
		}
	}
	return a
}

// videoFileURL is the signed link to play a published article's video (empty when none or not set up).
func (s *Server) videoFileURL(ctx context.Context, key pgtype.Text) *string {
	if s.store == nil || !key.Valid {
		return nil
	}
	u, err := s.store.PresignGet(ctx, key.String, videoPlayTTL)
	if err != nil {
		s.logger().WarnContext(ctx, "article video link not signed", "err", err)
		return nil
	}
	return &u
}
