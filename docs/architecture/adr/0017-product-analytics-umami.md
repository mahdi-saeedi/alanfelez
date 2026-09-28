# ADR-0017: Cookieless self-hosted product analytics with Umami

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
We need page views, funnels (visit → sign-up → subscribe) and Core Web Vitals from real users. Google Analytics is unreliable in Iran, needs cookie consent and sends data abroad.

## Decision
Self-host **Umami** (cookieless, privacy-friendly) on the ops server. The web app sends page views, custom events (`signup_started`, `otp_verified`, `checkout_started`, `subscription_activated`, `locked_cta_clicked{feature}`) and **web-vitals** metrics. No PII in events.

## Consequences
Privacy-friendly and data stays in Iran. Enough for product decisions. Less depth than GA4. Can switch to Matomo if richer reports are needed.

## Alternatives considered
Google Analytics (availability/privacy), Matomo (heavier; possible later).
