# ADR-0018: Developer tooling: mise, Taskfile, lefthook, Renovate, release-please

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
A polyglot repo (Go + TS) must set up quickly and identically on any machine and in CI (NFR MNT-3: ≤ 30 min), with guardrails that catch mistakes before CI.

## Decision
**mise** pins Go, Node, pnpm and Task versions (`.tool-versions`), used locally and in CI. **Taskfile** is the single entry point for all commands. **lefthook** runs git hooks (format, lint staged, gitleaks, Conventional Commit check, generate check on push). **Renovate** handles grouped weekly dependency PRs for Go modules, npm, Docker images and GitHub Actions. **release-please** handles versioning and CHANGELOG from Conventional Commits. `.editorconfig` + gofmt/prettier for formatting.

## Consequences
Reproducible environments and fewer "works on my machine" issues. Contributors must install mise once.

## Alternatives considered
Makefiles (awkward cross-platform for polyglot tasks), asdf (mise is a faster, compatible successor), Husky (Node-centric, while lefthook is language-agnostic).
