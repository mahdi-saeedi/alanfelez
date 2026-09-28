# ADR-0025: CMS rich text is stored as sanitized HTML

- **Status:** Accepted (refines ADR-0004, which said "TipTap JSON")
- **Date:** 2026-09-28

## Context
Articles, FAQ answers and static pages (M4) need rich text: headings, emphasis, lists, quotes, links. ADR-0004 planned to store
TipTap's ProseMirror JSON and render it to HTML on the server. That means writing and maintaining a JSON→HTML renderer (in Go
or in the website) for every node type, and the seed files (the client's FAQ, About and Terms) would have to be written as
ProseMirror JSON by hand. The website must never render unsafe HTML (SECURITY T6).

## Decision
- The admin uses **TipTap** (StarterKit: headings 2–4, bold/italic/underline/strike, lists, blockquote, link, rule) and sends
  its `getHTML()` output. The editor offers only what the sanitizer keeps.
- The Go API **sanitizes on every write** with **bluemonday** (`internal/content.Sanitize`): an allow-list of elements and
  attributes; no scripts, styles, event handlers, iframes or forms; `http(s)`, `mailto` and site-relative URLs only; links get
  `rel="noreferrer"`, external ones also `nofollow noopener` and `target="_blank"`. The **sanitized HTML is stored** and served as is.
- The website renders it through a single `RichText` component (the only `dangerouslySetInnerHTML` for data, easy to audit),
  styled by the `.rich` CSS (logical properties, so RTL/LTR both work).
- Seed files are trusted code and are written directly in the same safe subset.
- Plain-text fields (titles, summaries, ticket and contact messages) are never HTML: they are stripped on write and rendered
  escaped by React.

## Consequences
One format everywhere (API, admin, website, seeds), no renderer to maintain, and the stored HTML is safe even if a future client
forgets to escape. Changing the allowed subset later doesn't rewrite old content; tightening it means re-saving (or a one-off
re-sanitize job). Reading time and default summaries come from the stripped text (`content.PlainText`).

## Alternatives considered
ProseMirror JSON + server rendering (ADR-0004's plan: more code, awkward seeds), Markdown (editors aren't used to it, and
Persian/RTL editing of Markdown source is error-prone), sanitizing on read only (every read pays, and a missed path leaks).
