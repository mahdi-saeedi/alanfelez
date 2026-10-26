# ADR-0027: Auction PDF notices are stored in Postgres until Object Storage exists

- **Status:** Accepted
- **Date:** 2026-10-26

## Context
The client wants metal auctions («مزایدات») with a PDF notice per auction, uploaded by staff and shown to Gold subscribers
only. ARCHITECTURE.md plans uploads in ArvanCloud Object Storage (presigned uploads), but the bucket doesn't exist yet
(docs/TODO.md, waiting on the owner). The files are few (one notice per auction), small (≤ 10 MB) and must never reach a
non-Gold user, so a public bucket URL wouldn't do anyway: the download has to go through the API's tier check.

## Decision
- One table `market.auction_files` (auction id, file name, size, `bytea` content), apart from `market.auctions` so
  lists never read the files. At most one PDF per auction; uploading again replaces it; deleting the auction deletes it.
- Upload: `PUT /v1/admin/auctions/{id}/pdf` with the raw PDF body (editor/admin, audited). The API accepts only files that
  start with the PDF signature (`%PDF-`) and are at most 10 MB; the router allows 11 MB bodies on `PUT …/pdf` only
  (`httpx.requestSize`), 2 MB everywhere else.
- Download: `GET /v1/auctions/{id}/pdf` (Gold → the file; others 401/403 FEATURE_LOCKED). The website proxies it through
  `/api/auctions/{id}/pdf`, adding the user's token, like the price stream.

## Consequences
Works today with no new infrastructure, and the files are in the same backups as the rest of the data. The database grows
by the PDFs' size (expected: a few hundred MB a year at most). When Object Storage exists, the files can move there with a
one-off job: the API keeps the same endpoints (it would stream from the bucket after the tier check), so the admin and the
website don't change.

## Alternatives considered
Object Storage now (blocked on the bucket), files on the API pods' disk (lost on redeploy, not shared between replicas),
a public link to the organiser's notice (not every notice is online, and it would bypass the Gold check).
