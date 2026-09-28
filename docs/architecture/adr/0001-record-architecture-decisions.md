# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The project is built by one developer and must be handed over later. Decisions and their reasons get lost when they only live in chat.

## Decision
Keep Architecture Decision Records in `docs/architecture/adr/`, one file per decision, numbered, in this format. A **Proposed** ADR may be revised until it is accepted. An **Accepted** ADR is never edited: a change means a new ADR that supersedes it.

## Consequences
A new developer can see why things are the way they are. Small cost: writing a short file per decision.

## Alternatives considered
Wiki pages (drift from the code), no records (knowledge loss).
