// Package source defines price-source adapters (ADR-0012). One adapter per provider, selected by
// market.sources.provider; the database row's config is passed to the adapter's factory.
//
// Adding a real provider (e.g. a price API, follow-up F5):
//  1. create internal/prices/source/<provider>/ with a Factory that returns a Fetcher
//  2. register it in NewRegistry
//  3. add a market.sources row with provider = "<provider>" (seed file or admin)
//
// Secrets (API keys) never go into market.sources.config: read them from the environment in the factory.
package source

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/alanfelez/alanfelez/services/api/internal/prices"
)

// ProviderManual is the source for staff entries. It isn't fetched.
const ProviderManual = "manual"

// Fetcher returns the current quotes of a source.
type Fetcher interface {
	Fetch(ctx context.Context, now time.Time) ([]prices.Quote, error)
}

// Backfiller is implemented by sources that can load history on first start (the demo generator).
type Backfiller interface {
	Backfill(ctx context.Context, now time.Time) ([]prices.Quote, error)
}

// Deps are what adapters may use besides their config.
type Deps struct {
	// Latest returns the latest published price per series slug.
	Latest func(ctx context.Context) (map[string]int64, error)
}

// Factory builds a fetcher from a source's config.
type Factory func(config json.RawMessage, deps Deps) (Fetcher, error)

// Errors.
var (
	ErrUnknownProvider = errors.New("unknown provider")
	ErrNotFetchable    = errors.New("provider is not fetched")
)

// Registry maps provider ids to factories.
type Registry struct{ factories map[string]Factory }

// NewRegistry returns an empty registry. Register providers with Register.
func NewRegistry() *Registry { return &Registry{factories: map[string]Factory{}} }

// Register adds a provider.
func (r *Registry) Register(provider string, f Factory) { r.factories[provider] = f }

// Providers lists registered provider ids.
func (r *Registry) Providers() []string {
	out := make([]string, 0, len(r.factories))
	for p := range r.factories {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

// New builds the fetcher for provider.
func (r *Registry) New(provider string, config json.RawMessage, deps Deps) (Fetcher, error) {
	if provider == ProviderManual {
		return nil, ErrNotFetchable
	}
	f, ok := r.factories[provider]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrUnknownProvider, provider)
	}
	return f(config, deps)
}
