# ADR-0028: Members' analyses, published at once, images in Postgres

- **Status:** Proposed (built on a branch; waiting for the owner's OK on the tier matrix)
- **Date:** 2026-10-30

## Context
The client wants Silver and Gold members to post their own technical analysis («تحلیل کاربران»): a title, text, an
optional metal and view, and one chart image, shown with the team's analyses newest first and signed «تحلیل توسط <name>»
in a different color from «تحلیل توسط تحلیل‌گران الان‌فلز». Checking every post before it appears would take the client
too long, so posts go live at once and a disclaimer says whose responsibility a decision is.

## Decision
- Two features in `internal/access`: `community.read` and `community.post`, both Silver. Free callers get the number of
  posts only (`locked`), never the posts.
- Table `app.community_posts` (plain text, at most 3,000 characters; the author's sign-up name copied in at posting time)
  and `app.community_post_images` (one image per post, apart so the feed never reads files).
- Rules in `internal/community`: three posts per member per 24 hours (429), promises of profit or a "certain" price refused
  (400, the site's own copy rule), HTML stripped. Staff hide a post (editor/admin, audited) from the admin page; the author
  can delete their own.
- Images: uploaded through `PUT /v1/community/posts/{id}/image` (at most 5 MB, the website proxies it with the user's
  token), decoded and **re-encoded** as JPEG at most 1,600 px wide (drops metadata and anything that isn't pixels), stored
  in Postgres like the auction PDFs (ADR-0027), read back only through the API's tier check.

## Consequences
No new infrastructure; the files are in the backups. A re-encoded chart is about 100–300 KB, so even 100 posts a day with
images is under 30 MB a day; when Object Storage exists the images move there behind the same endpoints. Moderation is
after the fact, so the disclaimer is shown on the page, on every member's card and above the form.

## Alternatives considered
Approval before publishing (too slow for the client), Object Storage now (no bucket yet), comments under each team analysis
(mixes the team's work with members' and hides newer posts).
