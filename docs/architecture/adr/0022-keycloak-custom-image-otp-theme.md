# ADR-0022: Custom Keycloak image: phone-OTP authenticator, pluggable SMS SPI, Keycloakify theme

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The client requires SMS OTP at sign-up (answer #11), and Iranian users expect phone login. The login pages must match the brand (fa/en, RTL). No SMS provider has been chosen yet (F7).

## Decision
Build our own Keycloak image (`services/keycloak/Dockerfile`, optimized `kc.sh build`) containing: (1) **`alanfelez-phone-otp` authenticator** (Java SPI): mobile normalization (Iranian numbers, Persian digits), salted-hash codes kept in the auth session, TTL, attempt limit, resend cooldown, a per-phone hourly limit shared across nodes, and sign-up on first successful OTP. (2) A custom **`sms-sender` SPI** (`SmsSender` interface). The provider is selected by the authenticator setting `smsProvider`. The first implementation is **`console`** (logs the code, disabled in production via `KC_SPI_SMS_SENDER__CONSOLE__ALLOWED=false`). A real provider is one class + registration. (3) The **login theme**, built with **Keycloakify** (React + Tailwind, sharing design tokens with the web apps) in `apps/keycloak-theme`, including the custom OTP pages. An interim FreeMarker theme in `services/keycloak/themes/` is used until the Keycloakify build is wired in. Realm (clients, roles, flows, user profile) is in `services/keycloak/realm/`.

## Consequences
Sign-up and login work end to end locally today (codes via `task otp`). Changing SMS provider doesn't touch the auth flow. The theme shares the design system. We own a small Java codebase and must rebuild the image on Keycloak upgrades (pinned version, CI builds it). Custom SPIs produce 'unsupported SPI' warnings, which are expected.

## Alternatives considered
Community phone-provider extensions (less control, unclear maintenance), OTP in the Go API with token exchange (more custom security code), a plain FreeMarker theme only (no shared design system).
