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

- **Current Phase:** First customer site (David's Meat Paninis) built and verified in demo mode
- **Current Goal:** Get it live: Google Sheet + script deployed, site on GitHub Pages
- **Current Priority:** Ethan runs `SETUP.md` (needs his or David's Google account), then a real test order
- **Current Blockers:** David's Zelle phone/email not provided yet (placeholder in the Sheet's Settings tab); no GitHub repo yet
- **Recommended Next Task:** Walk Ethan through `SETUP.md`, paste the web app URL into `api.js`, do one real order end to end; swap in a real panini photo

*Last updated: 2026-10-11*

---

## Purpose

Ethan's business: he builds and runs simple food-ordering websites for students who sell food at
his school. Customers build an order on their phone, pay the seller by Zelle, and the seller sees
orders in an admin page. First customer: **David's Meat Paninis**.

## Business Rules

- **What Ethan charges sellers:** $10 one-time setup + $15/month (set by Ethan 2026-10-11).
  Optional custom domain +$15/yr (costs about $12).
- **Payment is Zelle only, and self-reported.** Zelle has no API, so every order starts
  un-ticked; the seller ticks **Zelled** after checking their bank (on the admin page or right
  in the Sheet's checkbox column). No other statuses (Ethan, 2026-10-12: just name, room, order, Zelled).
- One panini style per order × quantity 1–10. Name ≤ 40, room ≤ 20, note ≤ 200 chars.
- The **server** prices every order from the Sheet's Menu tab; the browser total is display-only.
- Most buyers are on phones, so design and test phone-first.

## Architecture

- **Stack:** plain HTML/CSS/JS (no build, no npm deps) + one Google Apps Script web app.
- **Frontend:** repo root. `index.html` + `shop.js` (customer flow: build → details → Zelle →
  done), `admin.html` + `admin.js`, shared `style.css`, `api.js` (holds `API_URL`, the `api()`
  fetch wrapper, `priceOf()`, and **demo mode** when `API_URL` is empty).
- **Backend:** `apps-script/Code.gs`, pasted into the seller's Google Sheet (Extensions → Apps
  Script) and deployed as a web app (Execute as Me, access Anyone).
- **Data:** the Google Sheet. Tabs `Menu` (Type/Name/Price), `Settings` (Key/Value: shopName,
  tagline, zelleTo, open), `Orders`. Order numbers come from Script Property `NEXT_ID`.
- **Auth:** admin password = Script Property `ADMIN_PASSWORD`, checked server-side on every
  list/update. The browser keeps it in `sessionStorage` only.
- **Open / sold out:** Settings `open` (`yes`/`no`; missing = open). Admin's Close shop button
  sets it. When closed the site shows "Sold out!" and the server refuses orders. The site re-checks
  before showing Zelle details so nobody pays after closing.
- **No emails** (Ethan, 2026-10-12: not needed). The admin page is where orders are seen.
- **Admin access:** same site, unlinked (`admin.html`, `noindex`). Hidden shortcut: tap the shop
  name 5 times within 1.5s (`shop.js`). The password is the real protection, not the hidden URL.

## APIs

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `?action=menu` | none | Menu + public settings, incl. `shop.open` |
| POST | `{action:'order', name, room, note, meat, addons, qty}` | none | Refuse if closed; validate, price, save → `{id,total}` |
| POST | `{action:'list', password}` | password | All orders, newest first, + `open` |
| POST | `{action:'setOpen', password, open}` | password | Open or close the shop |
| POST | `{action:'update', password, id, zelled}` | password | Tick or untick Zelled on one order |

POST bodies are sent as `Content-Type: text/plain` (Apps Script can't answer a CORS preflight).
Errors come back as `{ error: "message" }` with HTTP 200.

## Integrations

- **Google Apps Script / Sheets:** free; runs under the Google account that deployed it.
  If the script is down or the URL is wrong, the shop shows "Couldn't load the menu".
- **Zelle:** link-out only (`https://www.zelle.com/get-started`). No link can pre-fill a payment,
  because Zelle lives inside each bank's app.
- **Google Fonts:** Shrikhand, Bricolage Grotesque, IBM Plex Mono.

## Project Conventions

**Run:** preview server `site` in `.claude/launch.json` (`python -m http.server 5510`). The desktop
app's preview tool may read launch.json from the session's original folder; copy it there if needed.
**Build:** none.
**Test:** `node --test tests/code.test.js` (runs `Code.gs` in `node:vm` with fake Google services).
Node 24 wants the file path, not the `tests/` folder.
**Lint:** none.
**Demo:** leave `API_URL` empty → sample menu, nothing saved, admin password `demo`.

## Design Direction

White, bold, bouncy ("modern but fun", Ethan's words). Ink `#1A1410`, tomato `#D2341B` (main
buttons), mustard `#FFC233` (selected / highlights), cream `#FFF5DE`, pickle `#2E8B4E`
(done/delivered). Thick 2.5px ink borders + hard "sticker" shadow (`4px 4px 0`) that presses in on
tap. Shrikhand only for the shop name and big moments; Bricolage Grotesque for everything else;
IBM Plex Mono for prices and the order ticket. Hero: drawn SVG panini with steam + stickers. A
real photo should replace it (see SETUP.md). Light mode only. Phone: total + Continue pinned to the bottom.

## Roadmap

- [x] **Milestone 1: David's Meat Paninis**: ordering, Zelle step, admin, open/close, demo mode
- [ ] **Milestone 2: Go live**: deploy script + GitHub Pages, real test order, real photo
- [ ] **Milestone 3: Second customer**: decide how to host many shops (folder per shop vs. one
  repo per shop), and make name/colors easy to change per shop

## Important Decisions

| Date | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 2026-10-11 | Google Sheet + Apps Script back end, static site on GitHub Pages | $0, never sleeps, the seller edits the menu in the Sheet | Render + Supabase (free Render sleeps ~50s; 3 accounts), Supabase only (email needs another service), Formspree (50/month cap, no admin) |
| 2026-10-11 | Server recomputes price from the Menu tab | Anyone can edit browser JS to pay $0.01 | Trusting the browser's total |
| 2026-10-11 | Order is saved only after "I sent it" | Matches Yeshivah4All's Zelle flow; fewer junk orders | Saving before showing Zelle details |
| 2026-10-11 | Demo mode when `API_URL` is empty | Preview without Google; show prospects a working demo | Separate mock server |
| 2026-10-12 | Removed order emails | Ethan: not needed; the admin page covers it; one less Google permission | MailApp email per order (built 2026-10-11) |
| 2026-10-12 | Shop open/closed switch; server refuses orders when closed | Seller sells out; a browser-only check could be bypassed | Hiding the form in the browser only |
| 2026-10-11 | Redesign from toasty-gold hero to white/bold/sticker style | Ethan: more white space, bold, more jump, modern but fun | Gold grill-mark hero (v1) |

## Implementation Notes

- `safeCell_` prefixes `'` to text starting with `= + - @` so names can't run as Sheet formulas.
- On phones, `.ticket-paper` must not have a `filter` or `transform`: either one makes the
  `position: fixed` checkout bar stick to the ticket instead of the screen.
- `.layout`/`.tiles` set `display`, so `[hidden] { display:none !important }` is needed for views to hide.
- Admin code defaults to `1234` (Ethan's choice; `setup()` sets it only if none exists). No lockout
  after wrong guesses (`ponytail:` note in Code.gs), so 1234 is guessable; worst case is someone
  viewing orders / ticking boxes, not prices or money.
- Zelled checkboxes are inserted per new row, not pre-filled: pre-filled checkbox cells hold
  `FALSE`, count as data, and `appendRow` would skip past them to row 1000+.
- Apps Script redeploys: **Manage deployments → New version** keeps the URL; "New deployment" changes it.

## Notes

- Spec and plan: `docs/superpowers/specs/2026-10-11-paninis-site-design.md`, `docs/superpowers/plans/2026-10-11-paninis-site.md`.
- Ideas parked: different paninis in one order, pickup times, card payments, dark mode.
