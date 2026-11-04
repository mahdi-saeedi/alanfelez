# ADR-0030: Article videos in ArvanCloud Object Storage, uploaded straight from the browser

- **Status:** Accepted (client and owner, 2026-11-04)
- **Date:** 2026-11-04

## Context
The client wants videos on news, analyses and the new «مقالات», mainly for advertising, kept on our own servers for now
(Aparat maybe later). Pictures and PDFs are small and live in Postgres (ADR-0027, ADR-0028), but a video is tens or
hundreds of megabytes: in Postgres it would fill the 10 GB volume, bloat every nightly backup, and stream through the API.
A 300 MB upload through the API would also hit the ingress timeouts and the API's body limits.

## Decision
- One **private** bucket per environment in ArvanCloud Object Storage (S3-compatible, in Iran; the same service the
  database backups use), reached with `internal/storage` (minio-go). Settings `STORAGE_ENDPOINT/REGION/BUCKET` from the
  chart's `storage:` values, the key from the sealed secret `alanfelez-media-s3`. Without them, upload is off and the
  admin says so.
- **Upload:** the admin asks the API for a signed PUT link (`POST /v1/admin/articles/{id}/video`, editor/admin, MP4, WebM
  or MOV up to 500 MB), the browser PUTs the file straight to the bucket (with a progress bar), then attaches it
  (`PUT …/video`): the API checks the object exists, is a video and isn't too big, stores its key on the article
  (`app.articles.video_key`, audited) and deletes the file it replaces.
- **Playback:** the article API returns `videoFileUrl`, a signed GET link valid 6 hours, only when the caller may read the
  body, so an analysis's video is as locked as its text. The site shows the picture with a play button; a click starts the
  browser's own player. The CSP allows the storage origin for `media-src` (web) and `connect-src` (admin).
- The bucket needs CORS: PUT from the admin host, GET/HEAD from the web host.

## Consequences
Large files never touch the API, the database or the backups of the database. Videos cost storage and traffic on
ArvanCloud. A video link copied from the page works for 6 hours, which is acceptable for this content. Moving a video to
Aparat later is the existing `videoUrl` field (00033). Bucket backups (versioning) are a later decision.

## Alternatives considered
Postgres (too big, see above); a volume on the API pods (several replicas, no shared disk); streaming uploads through the
API (timeouts, body limits); a public bucket (a locked analysis's video would be open to anyone with the link).
