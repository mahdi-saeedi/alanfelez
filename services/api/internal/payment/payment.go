// Package payment defines the payment-gateway adapter (ADR-0012, SCOPE §15). Business code only talks to Gateway;
// one package per provider implements it, selected by PAYMENTS_GATEWAY.
//
// Flow (SECURITY §7): Request → the browser goes to the gateway's hosted page (no card data touches us) → the gateway
// redirects the browser to our callback → we Verify server-to-server. The callback itself is never trusted.
//
// Adding a real gateway (e.g. Zarinpal, follow-up F13): create internal/payment/<name>/ implementing Gateway with
// recorded-fixture tests, register it in cmd/alanfelez (newGateway), read its merchant id from the environment.
package payment

import (
	"context"
	"errors"
)

// Request starts a payment.
type Request struct {
	OrderID     string
	AmountRial  int64
	CallbackURL string // where the gateway sends the browser back (our website)
	Description string
	Mobile      string // optional, some gateways show saved cards for it
}

// Started is a payment waiting on the gateway's page.
type Started struct {
	Authority   string // the gateway's payment id, echoed in the callback
	RedirectURL string // the gateway's hosted payment page
	Raw         map[string]any
}

// Verified is a completed, verified payment.
type Verified struct {
	RefID    string // the gateway's receipt number, shown to the user
	CardMask string // masked card number, if provided
	Raw      map[string]any
}

// Errors.
var (
	// ErrDeclined: the user cancelled, the card was declined, or the amount doesn't match. Not retryable.
	ErrDeclined = errors.New("payment declined")
	// ErrUnavailable: the gateway didn't answer. The payment may still complete; verify again later.
	ErrUnavailable = errors.New("payment gateway unavailable")
)

// Gateway is one payment provider.
type Gateway interface {
	// Name is stored with each payment (payments.gateway).
	Name() string
	// Request registers a payment and returns where to send the browser.
	Request(ctx context.Context, r Request) (Started, error)
	// Callback extracts the authority and whether the gateway reports success from the callback query.
	// The result only decides whether to call Verify; it proves nothing by itself.
	Callback(query map[string]string) (authority string, ok bool)
	// Verify confirms the payment with the gateway. amountRial must be what we requested.
	// Verifying an already verified payment must succeed again (callbacks can repeat).
	Verify(ctx context.Context, authority string, amountRial int64) (Verified, error)
}

// Disabled is the "none" gateway: the site runs, checkout answers "unavailable". Use it where no gateway is
// configured yet (production before the merchant account exists, F13).
type Disabled struct{}

// Name implements Gateway.
func (Disabled) Name() string { return "none" }

// Request implements Gateway.
func (Disabled) Request(context.Context, Request) (Started, error) { return Started{}, ErrUnavailable }

// Callback implements Gateway.
func (Disabled) Callback(map[string]string) (string, bool) { return "", false }

// Verify implements Gateway.
func (Disabled) Verify(context.Context, string, int64) (Verified, error) {
	return Verified{}, ErrUnavailable
}
