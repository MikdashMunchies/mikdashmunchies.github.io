# SchoolFoodSites — Changelog

Notable changes to **this project**, newest first. One dated block per working session.

- This is the scannable summary. Full narrative lives in `session-logs/`. Exact commits live in `git log`.

---

## 2026-10-11

### Added
- Project folder, `CLAUDE.md`, and this changelog.
- Google Apps Script back end (`apps-script/Code.gs`): menu from the Sheet, server-side pricing, order email, password-protected admin actions; 7 tests.
- Customer page for David's Meat Paninis: build-your-panini, live ticket, Zelle step with Open Zelle + copy buttons, "Order completed" screen. Phone-first.
- Admin page: Waiting for Zelle / To deliver / Delivered tabs, "Got their Zelle" button.
- Demo mode (no Google needed) and `SETUP.md`.
- Hidden admin shortcut: tap the shop name 5 times.
- Admin "Close shop / Open shop" switch; site shows "Sold out!" and the server refuses orders while closed.
- Admin is now a simple table (Name · Room · Order · Zelled checkbox) behind code 1234; the Sheet gets real checkboxes.

- **Template:** `template/` (shared core) + `shops/<slug>/shop.json` (details) + `node build.js` → `docs/`. `node build.js new <slug>` starts a shop. Build tests, including a stale-`docs/` check.

### Changed
- Menu types are now `main` / `extra` (were `meat` / `add-on`); shop name and tagline moved from the Sheet to `shop.json`.
- Step numbers count themselves, so a shop with no extras reads 1, 2, 3.

### Removed
- Order emails (not needed; admin page shows orders).
- Seller pricing: $10 setup + $15/month.
