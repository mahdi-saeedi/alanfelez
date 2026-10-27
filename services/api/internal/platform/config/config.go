// Package config loads process configuration from environment variables (12-factor).
// Every value has a safe local default so `docker compose up` works without an .env file.
package config

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
)

// Environment names. Behaviour differences between them must be driven by explicit
// config values, never by checking the environment name deep inside business code.
const (
	EnvLocal      = "local"
	EnvStaging    = "staging"
	EnvProduction = "production"
)

// Config is the complete process configuration.
type Config struct {
	Env         string   `env:"APP_ENV" envDefault:"local"`
	HTTPAddr    string   `env:"HTTP_ADDR" envDefault:":8080"`
	LogLevel    string   `env:"LOG_LEVEL" envDefault:"info"`
	LogFormat   string   `env:"LOG_FORMAT" envDefault:"json"` // json | text
	DatabaseURL string   `env:"DATABASE_URL" envDefault:"postgres://alanfelez:alanfelez@localhost:5432/alanfelez?sslmode=disable"`
	RedisURL    string   `env:"REDIS_URL" envDefault:"redis://localhost:6379/0"`
	CORSOrigins []string `env:"CORS_ORIGINS" envSeparator:"," envDefault:"http://localhost:3000,http://localhost:5173"`
	// TrustedProxies may set X-Forwarded-For (ingress, the website server). Default: private ranges.
	TrustedProxies  []string      `env:"TRUSTED_PROXIES" envSeparator:"," envDefault:"127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fc00::/7"`
	ShutdownTimeout time.Duration `env:"SHUTDOWN_TIMEOUT" envDefault:"20s"`
	StartupTimeout  time.Duration `env:"STARTUP_TIMEOUT" envDefault:"90s"` // wait for dependencies on boot
	OIDC            OIDC          `envPrefix:"OIDC_"`
	Seed            Seed          `envPrefix:"SEED_"`
	Prices          Prices        `envPrefix:"PRICES_"`
	Payments        Payments      `envPrefix:"PAYMENTS_"`
	// PublicURL is the API as browsers reach it (the mock gateway page is served there).
	PublicURL string `env:"PUBLIC_URL" envDefault:"http://localhost:8080"`
	// WebURL is the public website (links in SMS, payment callback default).
	WebURL      string `env:"WEB_URL" envDefault:"http://localhost:3000"`
	SMSProvider string `env:"SMS_PROVIDER" envDefault:"console"` // console | none (no reminders) | smsir
	SmsIr       SmsIr  `envPrefix:"SMSIR_"`
}

// SmsIr configures the sms.ir sender (SMS_PROVIDER=smsir; internal/notify/smsir.go).
type SmsIr struct {
	APIKey string `env:"API_KEY"` // secret (alanfelez-sms, the same key as the Keycloak OTP sender)
	// Templates maps our message templates to approved sms.ir template ids: "subscription_expiring=…,subscription_ended=…,price_alert=…".
	Templates string `env:"TEMPLATES"`
	BaseURL   string `env:"BASE_URL" envDefault:"https://api.sms.ir/v1"`
}

// Payments configures checkout (internal/billing, internal/payment).
type Payments struct {
	Gateway string `env:"GATEWAY" envDefault:"mock"` // mock | none | <real gateway, F13>
	// CallbackURL is the website route the gateway redirects back to. Empty = WEB_URL + /api/checkout/callback.
	CallbackURL string `env:"CALLBACK_URL"`
}

// PaymentCallbackURL returns the effective callback URL.
func (c Config) PaymentCallbackURL() string {
	if c.Payments.CallbackURL != "" {
		return c.Payments.CallbackURL
	}
	return strings.TrimSuffix(c.WebURL, "/") + "/api/checkout/callback"
}

// Prices configures price ingestion (`alanfelez worker`).
type Prices struct {
	// DemoAllowed registers the demo price generator (internal/prices/source/demo). Refused in production.
	DemoAllowed bool `env:"DEMO_ALLOWED" envDefault:"true"`
}

// OIDC configures access-token validation against Keycloak.
type OIDC struct {
	// IssuerURL is the PUBLIC issuer, i.e. the `iss` claim browsers' tokens carry.
	IssuerURL string `env:"ISSUER_URL" envDefault:"http://localhost:8081/realms/alanfelez"`
	// JWKSURL is where signing keys are fetched. Empty = derived from IssuerURL. Set it when the API reaches
	// Keycloak on an internal address (compose: http://keycloak:8081/..., Kubernetes: the Keycloak service).
	JWKSURL  string `env:"JWKS_URL"`
	Audience string `env:"AUDIENCE" envDefault:"alanfelez-api"`
}

// Seed configures the initial-data loader.
type Seed struct {
	Dir string `env:"DIR" envDefault:"config/seed"`
	// Profiles are applied in order. "reference" = data every environment needs;
	// "demo" = sample data for local/staging only (refused in production).
	Profiles []string `env:"PROFILES" envSeparator:"," envDefault:"reference"`
}

// Load parses and validates configuration.
func Load() (Config, error) {
	var c Config
	if err := env.Parse(&c); err != nil {
		return c, fmt.Errorf("config: parse env: %w", err)
	}
	if err := c.validate(); err != nil {
		return c, fmt.Errorf("config: %w", err)
	}
	return c, nil
}

func (c Config) validate() error {
	var errs []error
	if !slices.Contains([]string{EnvLocal, EnvStaging, EnvProduction}, c.Env) {
		errs = append(errs, fmt.Errorf("APP_ENV must be local|staging|production, got %q", c.Env))
	}
	if !slices.Contains([]string{"json", "text"}, c.LogFormat) {
		errs = append(errs, fmt.Errorf("LOG_FORMAT must be json|text, got %q", c.LogFormat))
	}
	if c.Env == EnvProduction && slices.Contains(c.Seed.Profiles, "demo") {
		errs = append(errs, errors.New(`SEED_PROFILES must not contain "demo" in production`))
	}
	if c.Env == EnvProduction && c.Prices.DemoAllowed {
		errs = append(errs, errors.New("PRICES_DEMO_ALLOWED must be false in production"))
	}
	if c.Env == EnvProduction && c.Payments.Gateway == "mock" {
		errs = append(errs, errors.New("PAYMENTS_GATEWAY=mock is not allowed in production"))
	}
	if c.Env == EnvProduction && c.SMSProvider == "console" {
		errs = append(errs, errors.New("SMS_PROVIDER=console is not allowed in production"))
	}
	return errors.Join(errs...)
}
