// Package notify sends messages to users (SMS). Providers: "console" (writes the message to the log; local and
// staging) and "smsir" (sms.ir verify templates, smsir.go). Like the Keycloak OTP sender (ADR-0022).
package notify

import (
	"context"
	"log/slog"
)

// Param is one named value of a template.
type Param struct{ Name, Value string }

// Message is one SMS: Template and Params for template providers (sms.ir only sends approved templates, filling in
// the parameters), Body is the full text (the console provider and the notifications log).
type Message struct {
	Template string
	Params   []Param
	Body     string
}

// SMS sends one text message.
type SMS interface {
	Name() string
	// Send delivers m to an E.164 number and returns its cost in Rial (0 if unknown).
	Send(ctx context.Context, to string, m Message) (costRial int, err error)
}

// Console logs messages instead of sending them (local, staging). Refused in production.
type Console struct{ Log *slog.Logger }

// Name implements SMS.
func (Console) Name() string { return "console" }

// Send implements SMS.
func (c Console) Send(ctx context.Context, to string, m Message) (int, error) {
	c.Log.InfoContext(ctx, "SMS (console provider, not sent)", "to", to, "template", m.Template, "body", m.Body)
	return 0, nil
}
