# SchoolFoodSites

> Project knowledge base. Global standards live in `~/.claude/CLAUDE.md` — do not repeat them here.

---

## 🟢 Start here

**New session? Do this before anything else:**

1. `git status` and `git log --oneline -5` — see what's uncommitted.
2. `git fetch` — report if the remote is ahead.
3. Read **Current Project Status** below.
4. Read the newest file in `session-logs/`.
5. Report back: current state, goal, priorities, blockers, and where the last session said to pick up. Then start.

**Finishing up?** Run `/wrap-up` — it updates this file, writes the session log, promotes anything reusable to the global rulebook, and commits.

---

## Current Project Status

*Update this at the end of every session. A future session reads it first.*

- **Current Phase:** Idea — folder just created
- **Current Goal:** Decide what the first website looks like and who the first customer is
- **Current Priority:** Brainstorm the offer (what businesses get, what it costs)
- **Current Blockers:** None
- **Recommended Next Task:** Run a brainstorm on the first customer and the site template

*Last updated: 2026-10-11*

---

## Purpose

A business that builds and sells food-ordering websites to food-selling businesses at Ethan's school (student vendors, clubs, bake sales, etc.). Details still to be decided.

## Business Rules

Domain rules that are not inferable from the code. Pricing, tiers, limits, eligibility,
edge cases the business cares about. This is the section that saves the most time later.

## Architecture

- **Stack:**
- **Frontend:** location, framework, routing, state
- **Backend:** location, framework, entry point
- **Data:** engine, location, key tables, isolation model
- **Auth:** mechanism, where enforced

Include what is client-side vs server-side, and what is persisted vs derived.

## APIs

| Method | Route | Auth | Purpose |
|---|---|---|---|

## Integrations

Third-party services, what they're used for, where credentials come from, what breaks
if they're unavailable.

## Project Conventions

Conventions specific to this project that differ from or extend the global standards.
Directory rules, naming, test placement, build/run commands.

**Run:**
**Build:**
**Test:**
**Lint:**

## Design Direction

Visual language, tokens, type scale, spacing, component patterns, light/dark support.

## Roadmap

- [ ] **Milestone N — Name** — goal, deliverables

## Important Decisions

| Date | Decision | Why | Alternatives rejected |
|---|---|---|---|

## Implementation Notes

Non-obvious details, known workarounds, gotchas, and things that look wrong but are correct.

## Notes

Anything that doesn't fit above. Open questions, ideas, parked work.
