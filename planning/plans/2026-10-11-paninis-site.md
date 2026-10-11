# David's Meat Paninis Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static ordering site + admin page for David's Meat Paninis, backed by a Google Sheet via Apps Script.

**Architecture:** Plain HTML/CSS/JS on GitHub Pages talks to one Apps Script web app (`apps-script/Code.gs`) bound to a Google Sheet. The Sheet holds `Menu`, `Settings`, `Orders`. The script prices orders itself, saves them, emails the owner, and guards admin actions with a Script Property password. With no `API_URL` set, the site runs in demo mode (sample menu, fake orders) so it can be previewed and shown to prospects.

**Tech Stack:** HTML/CSS/vanilla JS, Google Apps Script, Node (built-in `node:test` + `node:vm`) for backend tests.

**Spec:** `docs/superpowers/specs/2026-10-11-paninis-site-design.md`

## Global Constraints

- No build step, no npm dependencies. Node is used only to run tests.
- Server recomputes every price; client totals are display-only.
- Admin password lives only in Script Property `ADMIN_PASSWORD`.
- Every user string written to the Sheet is formula-escaped (leading `= + - @` → prefixed `'`).
- Order statuses: exactly `Pending payment`, `Paid`, `Delivered`.
- Qty 1–10. Name ≤ 40 chars, room ≤ 20, note ≤ 200.
- Requests: GET `?action=menu`; POST body JSON sent as `text/plain`.
- Responsive at 375 / 768 / 1280 px. Accessible labels and focus states.

## File Structure

| File | Responsibility |
|---|---|
| `apps-script/Code.gs` | Backend: setup, menu, pricing, orders, email, admin |
| `tests/code.test.js` | Runs `Code.gs` in `node:vm` with fake Google services |
| `api.js` | `API_URL`, `api(action, data)` fetch wrapper, demo-mode fallback |
| `index.html` + `shop.js` | Customer page: hero, builder, details, Zelle, confirmation |
| `admin.html` + `admin.js` | Password → order list → mark Paid / Delivered |
| `style.css` | Shared design tokens and components |
| `SETUP.md` | Click-by-click Google + GitHub Pages setup for Ethan |

---

### Task 1: Backend (`Code.gs`) with tests

**Interfaces — Produces:**
- `doGet(e)` → `?action=menu` → `{ shop:{shopName,tagline,zelleTo}, meats:[{name,price}], addons:[{name,price}] }`
- `doPost(e)` with `{action:'order', name, room, note, meat, addons:[names], qty}` → `{ id, total }` or `{ error }`
- `{action:'list', password}` → `{ orders:[{id,time,name,room,meat,addons,qty,total,note,status}] }` (newest first)
- `{action:'update', password, id, status}` → `{ ok:true }`
- `setup()` — creates the three tabs with headers + sample menu/settings (run once by hand).

- [ ] Write `tests/code.test.js` covering: menu read from sheet; order priced server-side (tampered `total` ignored); unknown meat/add-on rejected; qty 0 and 11 rejected; missing name/room rejected; formula-escape of `=HYPERLINK(...)` name; order ids increment; email sent and an email failure still saves the order; list/update reject wrong password; update rejects unknown status.
- [ ] Run `node --test tests/code.test.js` → FAIL (no `Code.gs`).
- [ ] Implement `apps-script/Code.gs`.
- [ ] Run `node --test tests/code.test.js` → PASS. Break the price math on purpose → confirm a test goes red → restore.
- [ ] Commit.

### Task 2: Customer page

**Interfaces — Consumes:** Task 1 responses. **Produces:** `api(action, data)` in `api.js` returning parsed JSON or throwing `Error(message)`.

- [ ] Load `frontend-design` + `ui-ux-pro-max` for direction (warm, toasty, appetizing; light theme only).
- [ ] Write `style.css`, `api.js` (demo mode when `API_URL` is empty), `index.html`, `shop.js`.
- [ ] Preview in the browser at 375/768/1280: build a panini, total updates, validation messages, Zelle step shows amount + memo + copy button, confirmation shows order number. Console clean.
- [ ] Commit.

### Task 3: Admin page

- [ ] Write `admin.html`, `admin.js`: password form (kept in `sessionStorage`), order cards newest first, Paid/Delivered buttons, refresh, clear error on wrong password.
- [ ] Preview at 375/1280 in demo mode; console clean.
- [ ] Commit.

### Task 4: Setup guide + docs

- [ ] Write `SETUP.md`: create Sheet → Extensions › Apps Script → paste `Code.gs` → run `setup` → set `ADMIN_PASSWORD` → Deploy as web app (Execute as: Me, Access: Anyone) → paste URL into `api.js` → GitHub Pages.
- [ ] Update `CLAUDE.md` (status, business rules, architecture, run/test commands, decisions) and `CHANGELOG.md`.
- [ ] Commit, merge to `main`.
