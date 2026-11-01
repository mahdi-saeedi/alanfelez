package api

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// Product groups (client, 2026-11-01): boxes such as «آلومینیوم نرم» and «آلومینیوم خشک» inside one metal's category on
// the prices page. Staff manage them in «فلزات و محصولات»; a product sits in at most one group of its metal and category.

// groupID turns a path or body id into the table's smallint, or false when it can't be one.
func groupID(id int) (int16, bool) {
	if id < 1 || id > 32767 {
		return 0, false
	}
	return int16(id), true //nolint:gosec // bounded by the check above
}

// AdminCreateGroup adds a group at the end of its metal and category.
func (s *Server) AdminCreateGroup(ctx context.Context, req AdminCreateGroupRequestObject) (AdminCreateGroupResponseObject, error) {
	type bad = AdminCreateGroupdefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	in := *req.Body
	nameFa := strings.TrimSpace(in.NameFa)
	if nameFa == "" || len([]rune(nameFa)) > 80 || (in.NameEn != nil && len([]rune(*in.NameEn)) > 80) {
		return fail[bad](badRequest(ctx, "nameFa must be 1–80 characters, nameEn at most 80")), nil
	}
	var row dbq.InsertGroupRow
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if row, err = q.InsertGroup(ctx, dbq.InsertGroupParams{NameFa: nameFa, NameEn: optText(in.NameEn), Metal: in.Metal, Category: in.Category}); err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "group.create", Entity: "product_group", EntityID: fmt.Sprint(row.ID), Data: in})
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return fail[bad](notFound(ctx, "metal or category")), nil
	case isUniqueViolation(err):
		return fail[bad](conflict(ctx, "a group with this name already exists here")), nil
	case err != nil:
		return nil, fmt.Errorf("create group: %w", err)
	}
	return AdminCreateGroup201JSONResponse{
		Id: int(row.ID), Metal: in.Metal, Category: in.Category, NameFa: nameFa, NameEn: textp(optText(in.NameEn)), Sort: int(row.Sort),
	}, nil
}

// AdminUpdateGroup renames a group or moves it among its category's groups.
func (s *Server) AdminUpdateGroup(ctx context.Context, req AdminUpdateGroupRequestObject) (AdminUpdateGroupResponseObject, error) {
	type bad = AdminUpdateGroupdefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	id, ok := groupID(req.Id)
	if !ok {
		return fail[bad](notFound(ctx, "group")), nil
	}
	nameFa := strings.TrimSpace(req.Body.NameFa)
	if nameFa == "" || len([]rune(nameFa)) > 80 || (req.Body.NameEn != nil && len([]rune(*req.Body.NameEn)) > 80) {
		return fail[bad](badRequest(ctx, "nameFa must be 1–80 characters, nameEn at most 80")), nil
	}
	sort := pgtype.Int4{}
	if v := req.Body.Sort; v != nil {
		if *v < 0 || *v > 10000 {
			return fail[bad](badRequest(ctx, "sort must be 0–10000")), nil
		}
		sort = pgtype.Int4{Int32: int32(*v), Valid: true} //nolint:gosec // bounded by the check above
	}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if n, err = q.UpdateGroup(ctx, dbq.UpdateGroupParams{ID: id, NameFa: nameFa, NameEn: optText(req.Body.NameEn), Sort: sort}); err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "group.update", Entity: "product_group", EntityID: fmt.Sprint(id), Data: req.Body})
	})
	switch {
	case isUniqueViolation(err):
		return fail[bad](conflict(ctx, "a group with this name already exists here")), nil
	case err != nil:
		return nil, fmt.Errorf("update group: %w", err)
	case n == 0:
		return fail[bad](notFound(ctx, "group")), nil
	}
	return AdminUpdateGroup204Response{}, nil
}

// AdminDeleteGroup deletes a group; its products stay, without a group («سایر …» on the site).
func (s *Server) AdminDeleteGroup(ctx context.Context, req AdminDeleteGroupRequestObject) (AdminDeleteGroupResponseObject, error) {
	type bad = AdminDeleteGroupdefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	id, ok := groupID(req.Id)
	if !ok {
		return fail[bad](notFound(ctx, "group")), nil
	}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if n, err = q.DeleteGroup(ctx, id); err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "group.delete", Entity: "product_group", EntityID: fmt.Sprint(id)})
	})
	if err != nil {
		return nil, fmt.Errorf("delete group: %w", err)
	}
	if n == 0 {
		return fail[bad](notFound(ctx, "group")), nil
	}
	return AdminDeleteGroup204Response{}, nil
}

// AdminSetProductGroup puts a product in a group of its own metal and category, or takes it out (group 0).
func (s *Server) AdminSetProductGroup(ctx context.Context, req AdminSetProductGroupRequestObject) (AdminSetProductGroupResponseObject, error) {
	type bad = AdminSetProductGroupdefaultApplicationProblemPlusJSONResponse
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[bad](*pr), nil
	}
	group := pgtype.Int2{}
	if req.Body.Group != 0 {
		id, ok := groupID(req.Body.Group)
		if !ok {
			return fail[bad](badRequest(ctx, "unknown group")), nil
		}
		group = pgtype.Int2{Int16: id, Valid: true}
	}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		if n, err = q.SetProductGroup(ctx, dbq.SetProductGroupParams{Slug: req.Slug, GroupID: group}); err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "product.group", Entity: "product", EntityID: req.Slug, Data: req.Body})
	})
	if err != nil {
		return nil, fmt.Errorf("set product group: %w", err)
	}
	if n == 0 {
		// Either the product doesn't exist or the group isn't one of its metal and category.
		exists, err := s.q.ProductExists(ctx, req.Slug)
		if err != nil {
			return nil, fmt.Errorf("product exists: %w", err)
		}
		if !exists {
			return fail[bad](notFound(ctx, "product")), nil
		}
		return fail[bad](badRequest(ctx, "the group doesn't exist or belongs to another metal or category")), nil
	}
	return AdminSetProductGroup204Response{}, nil
}
