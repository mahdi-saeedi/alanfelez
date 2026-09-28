// Package notify sends messages to users (SMS for now). Like the Keycloak OTP sender (ADR-0022), the first
// provider is "console" (writes the message to the log); a real SMS provider (F7) is one type implementing SMS.
package notify

import (
	"context"
	"log/slog"
)

// SMS sends one text message.
type SMS interface {
	Name() string
	// Send delivers body to an E.164 number and returns its cost in Rial (0 if unknown).
	Send(ctx context.Context, to, body string) (costRial int, err error)
}

// Console logs messages instead of sending them (local, staging). Refused in production.
type Console struct{ Log *slog.Logger }

// Name implements SMS.
func (Console) Name() string { return "console" }

// Send implements SMS.
func (c Console) Send(ctx context.Context, to, body string) (int, error) {
	c.Log.InfoContext(ctx, "SMS (console provider, not sent)", "to", to, "body", body)
	return 0, nil
}
