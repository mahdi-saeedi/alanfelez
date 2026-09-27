## What & why
<!-- What does this change and why? Link the issue: Closes #123 -->

## Screenshots (UI changes)
<!-- fa (RTL) and en (LTR), mobile (360px) and desktop -->

## How it was tested
<!-- unit / integration / e2e / manual steps -->

## Risk & rollback
<!-- What could break? Is the migration backward compatible? Is it behind a feature flag? -->

## Definition of Done (CONTRIBUTING.md §5)
- [ ] Matches SCOPE.md / acceptance criteria (deviations noted)
- [ ] OpenAPI updated first + generated code committed (if the API changed)
- [ ] Tests added at the right level. Access-control negative tests for gated data
- [ ] fa + en, 360px + desktop, keyboard + axe clean, no hard-coded copy
- [ ] Migration is expand/contract safe. DATA_MODEL.md updated (if the schema changed)
- [ ] Security checklist (SECURITY.md §10)
- [ ] Logs/metrics/alerts for new jobs or integrations
- [ ] Docs/ADR updated (if setup/architecture/conventions changed)
