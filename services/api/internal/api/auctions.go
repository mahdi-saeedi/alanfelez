package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/alanfelez/alanfelez/services/api/internal/access"
	"github.com/alanfelez/alanfelez/services/api/internal/auctions"
	"github.com/alanfelez/alanfelez/services/api/internal/audit"
	"github.com/alanfelez/alanfelez/services/api/internal/auth"
	"github.com/alanfelez/alanfelez/services/api/internal/dbq"
)

// --- metal auctions («مزایدات», client 2026-10-26) ------------------------------------

// ListAuctions returns auction notices, newest first. Everyone sees the title, metal, category, quantity and status;
// the deadline, place, organiser, details and whether there's a PDF need auctions.read (Gold) and are otherwise
// left out of the response.
func (s *Server) ListAuctions(ctx context.Context, req ListAuctionsRequestObject) (ListAuctionsResponseObject, error) {
	lang := langOf((*string)(req.Params.AcceptLanguage))
	cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	rows, err := s.q.ListAuctions(ctx, dbq.ListAuctionsParams{
		Metal: textOfPtr(req.Params.Metal), Category: enumText(req.Params.Category), Status: enumText(req.Params.Status),
		Lim: clampInt32(req.Params.Limit, 24, 1, 50), Off: clampInt32(req.Params.Offset, 0, 0, 1_000_000),
	})
	if err != nil {
		return nil, fmt.Errorf("auctions: %w", err)
	}
	out := ListAuctions200JSONResponse{Items: make([]Auction, 0, len(rows))}
	out.Locked, out.RequiredPlan = featureLock(cur.Tier, access.AuctionsRead)
	for _, r := range rows {
		out.Total = int(r.Total)
		a := Auction{
			Id: r.ID.Bytes, Title: localized(lang, r.TitleFa, r.TitleEn),
			Metal:    Localized{Slug: r.MetalSlug, Name: localized(lang, r.MetalFa, r.MetalEn)},
			Category: AuctionCategory(r.Category), Quantity: r.Quantity, Unit: AuctionUnit(r.Unit),
			Status: AuctionStatus(r.Status), PublishedAt: r.CreatedAt.Time.UTC(),
		}
		if !out.Locked {
			a.DeadlineAt = timep(r.DeadlineAt)
			a.Location = localizedp(lang, r.LocationFa, r.LocationEn)
			a.Organizer = localizedp(lang, r.OrganizerFa, r.OrganizerEn)
			a.Details = localizedp(lang, r.DetailsFa, r.DetailsEn)
			has := r.PdfName.Valid
			a.HasPdf = &has
		}
		out.Items = append(out.Items, a)
	}
	if !out.Locked && len(out.Items) > 0 && !access.Allowed(access.Free, access.AuctionsRead) {
		s.billing.RecordUsage(ctx, cur.SubscriptionID, access.AuctionsRead)
	}
	return out, nil
}

// GetAuctionPdf sends an auction's PDF notice to a Gold caller.
func (s *Server) GetAuctionPdf(ctx context.Context, req GetAuctionPdfRequestObject) (GetAuctionPdfResponseObject, error) {
	p := auth.FromContext(ctx)
	if p == nil {
		return fail[GetAuctionPdfdefaultApplicationProblemPlusJSONResponse](unauthenticated(ctx)), nil
	}
	cur, err := s.tiers.Tier(ctx, p)
	if err != nil {
		return nil, err
	}
	if !access.Allowed(cur.Tier, access.AuctionsRead) {
		return fail[GetAuctionPdfdefaultApplicationProblemPlusJSONResponse](lockedProblem(ctx, access.AuctionsRead)), nil
	}
	f, err := s.q.GetAuctionFile(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[GetAuctionPdfdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "auction PDF")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("auction pdf: %w", err)
	}
	s.billing.RecordUsage(ctx, cur.SubscriptionID, access.AuctionsRead)
	cd := contentDisposition(f.FileName)
	return GetAuctionPdf200ApplicationpdfResponse{Body: bytes.NewReader(f.Content), ContentLength: int64(len(f.Content)),
		Headers: GetAuctionPdf200ResponseHeaders{ContentDisposition: &cd}}, nil
}

// --- admin: metal auctions --------------------------------------------------------------

// AdminListAuctions returns auctions with every field, for editing.
func (s *Server) AdminListAuctions(ctx context.Context, req AdminListAuctionsRequestObject) (AdminListAuctionsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListAuctionsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	rows, err := s.q.ListAuctions(ctx, dbq.ListAuctionsParams{
		Status: enumText(req.Params.Status), Lim: clampInt32(req.Params.Limit, 50, 1, 100), Off: clampInt32(req.Params.Offset, 0, 0, 1_000_000),
	})
	if err != nil {
		return nil, fmt.Errorf("auctions: %w", err)
	}
	out := AdminListAuctions200JSONResponse{Items: make([]AdminAuction, 0, len(rows))}
	for _, r := range rows {
		out.Total = int(r.Total)
		a := AdminAuction{
			Id: r.ID.Bytes, TitleFa: r.TitleFa, TitleEn: textp(r.TitleEn), Metal: r.MetalSlug,
			Category: AuctionCategory(r.Category), Quantity: r.Quantity, Unit: AuctionUnit(r.Unit), Status: AuctionStatus(r.Status),
			DeadlineAt: timep(r.DeadlineAt), LocationFa: textp(r.LocationFa), LocationEn: textp(r.LocationEn),
			OrganizerFa: textp(r.OrganizerFa), OrganizerEn: textp(r.OrganizerEn), DetailsFa: textp(r.DetailsFa), DetailsEn: textp(r.DetailsEn),
			PdfName: textp(r.PdfName), CreatedAt: r.CreatedAt.Time.UTC(), UpdatedAt: r.UpdatedAt.Time.UTC(),
		}
		if r.PdfSize.Valid {
			n := int(r.PdfSize.Int32)
			a.PdfSize = &n
		}
		out.Items = append(out.Items, a)
	}
	return out, nil
}

// AdminCreateAuction adds an auction (editor, admin).
func (s *Server) AdminCreateAuction(ctx context.Context, req AdminCreateAuctionRequestObject) (AdminCreateAuctionResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminCreateAuctiondefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in, err := auctionInput(req.Body)
	if err != nil {
		return fail[AdminCreateAuctiondefaultApplicationProblemPlusJSONResponse](badRequest(ctx, err.Error())), nil
	}
	var id pgtype.UUID
	err = s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		id, err = q.InsertAuction(ctx, dbq.InsertAuctionParams{
			TitleFa: in.TitleFa, TitleEn: optText(in.TitleEn), MetalSlug: req.Body.Metal, Category: in.Category,
			Quantity: in.Quantity, Unit: in.Unit, Status: in.Status, DeadlineAt: tsn(req.Body.DeadlineAt),
			LocationFa: optText(in.Texts["locationFa"]), LocationEn: optText(in.Texts["locationEn"]),
			OrganizerFa: optText(in.Texts["organizerFa"]), OrganizerEn: optText(in.Texts["organizerEn"]),
			DetailsFa: optText(in.Texts["detailsFa"]), DetailsEn: optText(in.Texts["detailsEn"]), CreatedBy: p.ID,
		})
		if err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "auction.create", Entity: "auction", EntityID: *uuidString(id),
			Data: map[string]string{"title": in.TitleFa, "status": in.Status}})
	})
	if isNotNullViolation(err) {
		return fail[AdminCreateAuctiondefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown metal")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("create auction: %w", err)
	}
	return AdminCreateAuction201JSONResponse{Id: id.Bytes}, nil
}

// AdminUpdateAuction edits an auction, its status included (editor, admin).
func (s *Server) AdminUpdateAuction(ctx context.Context, req AdminUpdateAuctionRequestObject) (AdminUpdateAuctionResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminUpdateAuctiondefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	in, err := auctionInput(req.Body)
	if err != nil {
		return fail[AdminUpdateAuctiondefaultApplicationProblemPlusJSONResponse](badRequest(ctx, err.Error())), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	var n int64
	err = s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		n, err = q.UpdateAuction(ctx, dbq.UpdateAuctionParams{
			ID: id, TitleFa: in.TitleFa, TitleEn: optText(in.TitleEn), MetalSlug: req.Body.Metal, Category: in.Category,
			Quantity: in.Quantity, Unit: in.Unit, Status: in.Status, DeadlineAt: tsn(req.Body.DeadlineAt),
			LocationFa: optText(in.Texts["locationFa"]), LocationEn: optText(in.Texts["locationEn"]),
			OrganizerFa: optText(in.Texts["organizerFa"]), OrganizerEn: optText(in.Texts["organizerEn"]),
			DetailsFa: optText(in.Texts["detailsFa"]), DetailsEn: optText(in.Texts["detailsEn"]),
		})
		if err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "auction.update", Entity: "auction", EntityID: *uuidString(id),
			Data: map[string]string{"title": in.TitleFa, "status": in.Status}})
	})
	if isNotNullViolation(err) {
		return fail[AdminUpdateAuctiondefaultApplicationProblemPlusJSONResponse](badRequest(ctx, "unknown metal")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("update auction: %w", err)
	}
	if n == 0 {
		return fail[AdminUpdateAuctiondefaultApplicationProblemPlusJSONResponse](notFound(ctx, "auction")), nil
	}
	return AdminUpdateAuction204Response{}, nil
}

// AdminDeleteAuction deletes an auction and its PDF (editor, admin).
func (s *Server) AdminDeleteAuction(ctx context.Context, req AdminDeleteAuctionRequestObject) (AdminDeleteAuctionResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminDeleteAuctiondefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	err := s.tx(ctx, func(q *dbq.Queries) error {
		title, err := q.DeleteAuction(ctx, id)
		if err != nil {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "auction.delete", Entity: "auction", EntityID: *uuidString(id),
			Data: map[string]string{"title": title}})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminDeleteAuctiondefaultApplicationProblemPlusJSONResponse](notFound(ctx, "auction")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("delete auction: %w", err)
	}
	return AdminDeleteAuction204Response{}, nil
}

// AdminGetAuctionPdf sends the PDF notice to staff, to check what was uploaded.
func (s *Server) AdminGetAuctionPdf(ctx context.Context, req AdminGetAuctionPdfRequestObject) (AdminGetAuctionPdfResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminGetAuctionPdfdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	f, err := s.q.GetAuctionFile(ctx, pgtype.UUID{Bytes: req.Id, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return fail[AdminGetAuctionPdfdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "auction PDF")), nil
	}
	if err != nil {
		return nil, fmt.Errorf("auction pdf: %w", err)
	}
	cd := contentDisposition(f.FileName)
	return AdminGetAuctionPdf200ApplicationpdfResponse{Body: bytes.NewReader(f.Content), ContentLength: int64(len(f.Content)),
		Headers: AdminGetAuctionPdf200ResponseHeaders{ContentDisposition: &cd}}, nil
}

// AdminPutAuctionPdf uploads or replaces the PDF notice (editor, admin): a real PDF of at most 10 MB.
func (s *Server) AdminPutAuctionPdf(ctx context.Context, req AdminPutAuctionPdfRequestObject) (AdminPutAuctionPdfResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminPutAuctionPdfdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	// One byte more than allowed tells "too big" apart from "exactly the limit".
	b, err := io.ReadAll(io.LimitReader(req.Body, auctions.MaxPDFBytes+1))
	if err != nil {
		return fail[AdminPutAuctionPdfdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, auctions.ErrPDFSize.Error())), nil
	}
	if err := auctions.CheckPDF(b); err != nil {
		return fail[AdminPutAuctionPdfdefaultApplicationProblemPlusJSONResponse](badRequest(ctx, err.Error())), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	name := auctions.FileName(req.Params.FileName)
	var n int64
	err = s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		n, err = q.PutAuctionFile(ctx, dbq.PutAuctionFileParams{AuctionID: id, FileName: name, SizeBytes: int32(len(b)), Content: b, UploadedBy: p.ID}) //nolint:gosec // bounded by MaxPDFBytes (10 MB)
		if err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "auction.pdf", Entity: "auction", EntityID: *uuidString(id),
			Data: map[string]any{"file": name, "bytes": len(b)}})
	})
	if err != nil {
		return nil, fmt.Errorf("save auction pdf: %w", err)
	}
	if n == 0 {
		return fail[AdminPutAuctionPdfdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "auction")), nil
	}
	return AdminPutAuctionPdf204Response{}, nil
}

// AdminDeleteAuctionPdf removes the PDF notice (editor, admin).
func (s *Server) AdminDeleteAuctionPdf(ctx context.Context, req AdminDeleteAuctionPdfRequestObject) (AdminDeleteAuctionPdfResponseObject, error) {
	p, pr := requireRoles(ctx, rolesPriceWrite...)
	if pr != nil {
		return fail[AdminDeleteAuctionPdfdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	id := pgtype.UUID{Bytes: req.Id, Valid: true}
	var n int64
	err := s.tx(ctx, func(q *dbq.Queries) error {
		var err error
		n, err = q.DeleteAuctionFile(ctx, id)
		if err != nil || n == 0 {
			return err
		}
		return audit.Write(ctx, q, actorOf(ctx, p), audit.Entry{Action: "auction.pdf.delete", Entity: "auction", EntityID: *uuidString(id)})
	})
	if err != nil {
		return nil, fmt.Errorf("delete auction pdf: %w", err)
	}
	if n == 0 {
		return fail[AdminDeleteAuctionPdfdefaultApplicationProblemPlusJSONResponse](notFound(ctx, "auction PDF")), nil
	}
	return AdminDeleteAuctionPdf204Response{}, nil
}

// --- helpers ------------------------------------------------------------------------------

func auctionInput(b *AdminAuctionInput) (auctions.Input, error) {
	in, err := auctions.Validate(auctions.Input{
		TitleFa: b.TitleFa, TitleEn: b.TitleEn, Category: string(b.Category), Unit: string(b.Unit), Status: string(b.Status),
		Quantity: b.Quantity, Texts: map[string]*string{
			"locationFa": b.LocationFa, "locationEn": b.LocationEn, "organizerFa": b.OrganizerFa,
			"organizerEn": b.OrganizerEn, "detailsFa": b.DetailsFa, "detailsEn": b.DetailsEn,
		},
	})
	if err != nil {
		return in, fmt.Errorf("auction: %w", err)
	}
	return in, nil
}

// contentDisposition names the download; the RFC 2231 form keeps a Persian file name intact.
func contentDisposition(name string) string {
	return mime.FormatMediaType("inline", map[string]string{"filename": name})
}

// clampInt32 is an optional query number with its default, kept inside [lo, hi].
func clampInt32(v *int, def, lo, hi int32) int32 {
	if v == nil {
		return def
	}
	return int32(min(max(*v, int(lo)), int(hi))) //nolint:gosec // clamped to [lo, hi] just above
}

func enumText[T ~string](v *T) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: string(*v), Valid: true}
}

func localizedp(lang string, fa, en pgtype.Text) *string {
	if !fa.Valid {
		return nil
	}
	v := localized(lang, fa.String, en)
	return &v
}

func tsn(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}
