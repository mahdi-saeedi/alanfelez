package api

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

// AdminListNotifications is the SMS log (admin «پیامک‌ها»): what was sent or failed and why, so staff can check an
// SMS without the server logs.
func (s *Server) AdminListNotifications(ctx context.Context, req AdminListNotificationsRequestObject) (AdminListNotificationsResponseObject, error) {
	if _, pr := requireRoles(ctx, rolesRead...); pr != nil {
		return fail[AdminListNotificationsdefaultApplicationProblemPlusJSONResponse](*pr), nil
	}
	var status pgtype.Text
	if req.Params.Status != nil {
		status = pgtype.Text{String: string(*req.Params.Status), Valid: true}
	}
	rows, err := s.q.AdminListNotifications(ctx, status)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	items := make([]AdminNotification, 0, len(rows))
	for _, r := range rows {
		n := AdminNotification{
			Id: r.ID.Bytes, CreatedAt: r.CreatedAt.Time.UTC(), Template: r.Template, Recipient: r.Recipient,
			Status: AdminNotificationStatus(r.Status), Provider: r.Provider, Error: textp(r.Error),
		}
		name := strings.TrimSpace(r.FirstName.String + " " + r.LastName.String)
		if name == "" {
			name = r.Username.String
		}
		if name != "" {
			n.User = &name
		}
		items = append(items, n)
	}
	return AdminListNotifications200JSONResponse{Items: items}, nil
}
