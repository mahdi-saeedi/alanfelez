package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/community"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Article pictures (client, 2026-11-04): uploaded in the admin, re-encoded as a JPEG (the community image rules:
// JPEG, PNG or GIF up to 5 MB, ≤ 1600 px) and kept in Postgres. The video is an Aparat link on the article itself.

// AdminPutArticleImage uploads or replaces an article's picture (editor, admin; audited).
func (s *Server) AdminPutArticleImage(ctx context.Context, req AdminPutArticleImageRequestObject) (AdminPutArticleImageResponseObject, error) {
	type bad = AdminPutArticleImagedefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	b, err := io.ReadAll(io.LimitReader(req.Body, community.MaxImageBytes+1))
	if err != nil {
		return fail[bad](badRequest(ctx, community.ErrImageSize.Error())), nil
	}
	img, err := community.ReencodeImage(b)
	if err != nil {
		return fail[bad](badRequest(ctx, err.Error())), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	var n int64
	err = s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		n, err = q.SetArticleImage(ctx, dbq.SetArticleImageParams{
			ArticleID: id, Width: int32(img.Width), Height: int32(img.Height), //nolint:gosec // ≤ MaxImageWidth, decoded image size
			SizeBytes: int32(len(img.JPEG)), Content: img.JPEG, //nolint:gosec // a JPEG of ≤ 1600 px is far below 2 GB
		})
		if err != nil || n == 0 {
			return err //nolint:wrapcheck // wrapped below
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{
			Action: "article.image", Entity: "article", EntityID: req.Id.String(),
			Data: map[string]any{"width": img.Width, "height": img.Height, "bytes": len(img.JPEG)},
		})
	})
	if err != nil {
		return nil, fmt.Errorf("save article image: %w", err)
	}
	if n == 0 {
		return fail[bad](notFound(ctx, "article")), nil
	}
	return AdminPutArticleImage204Response{}, nil
}

// AdminDeleteArticleImage removes an article's picture (editor, admin; audited).
func (s *Server) AdminDeleteArticleImage(ctx context.Context, req AdminDeleteArticleImageRequestObject) (AdminDeleteArticleImageResponseObject, error) {
	type bad = AdminDeleteArticleImagedefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesContentWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if n, err = q.DeleteArticleImage(ctx, pgtype.UUID{Bytes: req.Id, Valid: true}); err != nil || n == 0 {
			return err //nolint:wrapcheck // wrapped below
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "article.image_delete", Entity: "article", EntityID: req.Id.String()})
	})
	if err != nil {
		return nil, fmt.Errorf("delete article image: %w", err)
	}
	if n == 0 {
		return fail[bad](notFound(ctx, "image")), nil
	}
	return AdminDeleteArticleImage204Response{}, nil
}

// AdminGetArticleImage returns any article's picture to staff (the admin preview).
func (s *Server) AdminGetArticleImage(ctx context.Context, req AdminGetArticleImageRequestObject) (AdminGetArticleImageResponseObject, error) {
	type bad = AdminGetArticleImagedefaultApplicationProblemPlusJSONResponse
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[bad](*pr), nil
	}
	b, err := s.q.GetArticleImage(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[bad](notFound(ctx, "image")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("article image: %w", err)
	}
	return AdminGetArticleImage200ImagejpegResponse{Body: bytes.NewReader(b), ContentLength: int64(len(b))}, nil
}

// GetArticleImage returns a published article's picture to anyone (title, summary and picture are public).
func (s *Server) GetArticleImage(ctx context.Context, req GetArticleImageRequestObject) (GetArticleImageResponseObject, error) {
	b, err := s.q.GetPublishedArticleImage(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[GetArticleImagedefaultApplicationProblemPlusJSONResponse](notFound(ctx, "image")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("article image: %w", err)
	}
	return GetArticleImage200ImagejpegResponse{Body: bytes.NewReader(b), ContentLength: int64(len(b))}, nil
}
