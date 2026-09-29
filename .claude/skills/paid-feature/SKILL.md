---
name: paid-feature
description: Add a feature that only some plans (Free/Silver/Gold) may use, or change which plan unlocks what. Use whenever access depends on the subscription tier.
---

# A tier-gated (paid) feature

The rule (ADR-0010): **the Go API decides, the UIs only display.** Locked data never leaves the server.
Example end to end: IME auctions — `access.AuctionsRead`, `GetAuctions` in `services/api/internal/api/gold.go`,
`TestAuctionsTeaserAndGold` in `gold_integration_test.go`, `apps/web/src/app/[locale]/auctions/page.tsx`.

**Changing which tier gets an existing feature is a business decision (SCOPE §6, the client's F2). Ask the owner first.**

## Steps
1. `services/api/internal/access/access.go`: add a `Feature` constant (stable key like `area.verb`, never renamed later) and its
   minimum tier in `minTier`. A numeric per-tier limit goes in `limits` (`LimitKey`). Update `access_test.go`.
2. Handler: `cur, err := s.tiers.Tier(ctx, auth.FromContext(ctx))`, then either
   - refuse: `if !access.Allowed(cur.Tier, access.X) { return fail[...](lockedProblem(ctx, access.X)), nil }`, or
   - teaser: `resp.Locked, resp.RequiredPlan = featureLock(cur.Tier, access.X)` and leave the gated fields/rows out.
   After a successful paid use: `s.billing.RecordUsage(ctx, cur.SubscriptionID, access.X)` (the refund rule depends on it).
3. Contract: teaser responses have `locked: boolean` and `requiredPlan` like `AuctionDay`.
4. Tests: anonymous and Free see no gated data (assert the field is absent, not just hidden); Gold (`e.grantGold()`) sees it;
   usage is recorded (`e.count("SELECT count(*) FROM app.entitlement_usage WHERE feature = '…'")`).
5. UIs read `locked`/`requiredPlan` (or the `FEATURE_LOCKED` problem) and show `<Locked plan=…>` with the upgrade link.
   The plans page lists features from message keys (`features` namespace in `apps/web/messages/*.json`): add the new one.
6. Update the feature matrix in `docs/product/SCOPE.md` §6 if it changed.
