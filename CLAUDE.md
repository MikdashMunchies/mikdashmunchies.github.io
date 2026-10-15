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

- **Current Phase:** 5 shops built. David's Meat Paninis is LIVE end to end (Sheet "dmp", script "Paninis
  Shop", deployment v4 — description now blank/"Untitled" in Manage deployments, same URL). Henry's Bakery,
  Yitz's Grill, Josh's Hot Dog Stand, Eli's Kitchen are published in **demo mode** (no Google Sheet yet).
- **Business name:** MikdashMunchies (GitHub organization, owned by Ethan's account).
- **Home page (all shops):** https://mikdashmunchies.github.io/ · repo README lists every link.
- **Live:** https://mikdashmunchies.github.io/<shop>/ for davids-paninis, henrys-bakery, yitzs-grill,
  joshs-hot-dogs, elis-kitchen (admin: + `admin.html`). QR codes: `qr/<shop>.png`.
  Repo https://github.com/MikdashMunchies/mikdashmunchies.github.io (public; Pages = `main` / `/docs`).
  The repo is named `<org>.github.io` on purpose: that gives the short link with no repo name in it.
- **Current Goal:** Make all 5 shops take real orders
- **Current Priority:** Google Sheet + script for each of the 4 new shops (SETUP.md steps 2–3; needs Ethan's clicks for permissions), then `apiUrl` in each shop.json
- **Current Blockers:** Real Zelle numbers and prices for every seller (all sample); David's shop is currently set to CLOSED (`open: no`) in his Sheet
- **Recommended Next Task:** Set up the 4 Google Sheets with Ethan; fill in Zelle + prices; real food photos; delete test-order rows in David's Sheet

*Last updated: 2026-10-13*

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
- One item per order = one or more mains combined (turkey + pastrami; prices add up) + any extras, × quantity 1–10. No free-text "Other" (can't be priced); special requests go in the "Anything special?" note. Name ≤ 40, room ≤ 20, note ≤ 200 chars.
- **Delivery or pickup** (Ethan, 2026-10-13): delivery adds a flat fee once per order (Settings `deliveryFee`, default $1) and needs a room; pickup is free and stores Room = "Pickup".
- **No alcohol** on any menu: buyers are students at school (beer was dropped from Josh's list).
- The **server** prices every order from the Sheet's Menu tab; the browser total is display-only.
- Most buyers are on phones, so design and test phone-first.

## Architecture

- **Stack:** plain HTML/CSS/JS (no npm deps) + one Google Apps Script web app per shop.
  A tiny `build.js` (Node stdlib only) stamps out one site per shop.
- **Template (shared core):** `template/`. `index.html` + `shop.js` (customer flow: build →
  details → Zelle → done), `admin.html` + `admin.js`, `style.css`, `api.js` (the `api()` fetch
  wrapper, `priceOf()`, and **demo mode** when the shop has no `apiUrl`). Pages hold `{{blanks}}`.
- **Shops:** `shops/<slug>/shop.json` (name, tagline, item word, step labels, sticker, picture,
  `accent`/`highlight` colors, `apiUrl`, `demoMenu`) + its picture. `template/shop.example.json`
  is the starting point (`node build.js new <slug>`).
- **Build:** `node build.js` → `docs/` (GitHub Pages serves `/docs`): `docs/assets/` (shared
  CSS/JS, once) + `docs/<slug>/` (filled `index.html`/`admin.html`, `config.js` = `const SHOP =
  {...shop.json, slug}`, picture). Values are HTML-escaped; a missing `{{key}}` fails the build.
  Also generated: `docs/index.html` (MikdashMunchies home page, one card per shop, from
  `template/home.html`) and the repo's `README.md` (all links). Shared CSS/JS links carry a content
  fingerprint (`style.css?v=<sha1>`) so visitors never get stale files after a deploy.
  `docs/` is generated: never edit it by hand. All shops share one origin, so browser storage
  keys are per shop (`adminPassword:<slug>`, `demoOpen:<slug>`).
- **Backend:** `apps-script/Code.gs`, pasted into the seller's Google Sheet (Extensions → Apps
  Script) and deployed as a web app (Execute as Me, access Anyone).
- **Data:** each shop's own Google Sheet. Tabs `Menu` (Type `main`/`extra`, Name, Price),
  `Settings` (Key/Value: zelleTo, open, deliveryFee, ntfyTopic), `Orders` (… Item, Extras, …, Zelled checkbox).
  The site can't store anything itself; the Sheet is the database (admin page reads it). Order numbers come from Script Property `NEXT_ID`.
- **Auth:** admin password = Script Property `ADMIN_PASSWORD`, checked server-side on every
  list/update. The browser keeps it in `sessionStorage` only.
- **Open / sold out:** Settings `open` (`yes`/`no`; missing = open). Admin's Close shop button
  sets it. When closed the site shows "Sold out!" and the server refuses orders. The site re-checks
  before showing Zelle details so nobody pays after closing.
- **No emails** (Ethan, 2026-10-12: not needed). The admin page is where orders are seen.
- **Order notifications:** free **ntfy** app push (not SMS). After saving an order, `notify_()` POSTs
  JSON to `https://ntfy.sh/` with the Settings `ntfyTopic` (random = private). No topic = no push; a
  failed push is logged and never fails the order. Needs the UrlFetchApp "Allow": run `testNotify`
  in the editor BEFORE deploying a new version, or the live web app fails every request.
- **Maaser box (admin):** 10% of **Zelled** order totals (incl. delivery fees), this month + all
  time, computed in the browser by `maaserOf()` in `api.js` from the `list` answer. No backend change.
- **Admin auto-refresh:** every 15s and on tab focus; skipped while the tab is hidden or a tick is saving.
- **Admin access:** same site, unlinked (`admin.html`, `noindex`). Hidden shortcut: tap the shop
  name 5 times within 1.5s (`shop.js`). The password is the real protection, not the hidden URL.

## APIs

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `?action=menu` | none | Menu + public settings, incl. `shop.open` |
| POST | `{action:'order', name, delivery, room, note, mains, extras, qty}` | none | Refuse if closed; validate, price (+ fee if delivery), save → `{id,total}` |
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
Shops are at `http://localhost:5510/docs/<slug>/`.
**Build:** `node build.js` after ANY change to `template/` or `shops/`, then commit `docs/`.
**New shop:** `node build.js new <slug>` → fill in `shops/<slug>/shop.json` → `node build.js`.
**QR code:** `python qr/make_qr.py <link> "<Shop name>" qr/<slug>.png` (needs `pip install --user "qrcode[pil]" opencv-python-headless`;
the script scans its own output and fails if it doesn't decode to the link).
**Test:** `node --test tests/build.test.js tests/code.test.js tests/api.test.js` (Node 24 wants file paths, not
the folder). `code.test.js` runs `Code.gs` in `node:vm` with fake Google services; `api.test.js` runs `template/api.js` (maaser math);
`build.test.js` checks the build and **fails if `docs/` is stale**.
**Lint:** none.
**Demo:** a shop with `"apiUrl": ""` uses its `demoMenu`; demo orders live in localStorage (`demoOrders:<slug>`) so shop and admin pages share them; admin code `1234`.

## Design Direction

White, bold, bouncy ("modern but fun", Ethan's words). Ink `#1A1410`, `--accent` (main buttons;
David: tomato `#D2341B`), `--highlight` (selected items; David: mustard `#FFC233`). Each shop sets
those two in shop.json; everything else is shared: cream `#FFF5DE`, pickle `#2E8B4E`
(done/delivered). Thick 2.5px ink borders + hard "sticker" shadow (`4px 4px 0`) that presses in on
tap. Shrikhand only for the shop name and big moments; Bricolage Grotesque for everything else;
IBM Plex Mono for prices and the order ticket. Hero: the shop's picture (David: drawn
`panini.svg` with steam) + stickers; a real photo should replace it. No picture → text only. Light mode only. Phone: total + Continue pinned to the bottom.

## Roadmap

- [x] **Milestone 1: David's Meat Paninis**: ordering, Zelle step, admin, open/close, demo mode
- [x] **Milestone 2: Go live**: script deployed, GitHub Pages under MikdashMunchies, real test orders, QR code
- [ ] **Milestone 2b: Launch David**: real Zelle + prices in the Sheet, real panini photo, share link/QR
- [x] **Milestone 3a: Template**: one repo, folder per shop, `node build.js`
- [x] **Milestone 3b: More shops**: Henry's Bakery, Yitz's Grill, Josh's Hot Dog Stand, Eli's Kitchen (demo mode)
- [ ] **Milestone 3c: New shops live**: a Google Sheet + script per shop, real menus/Zelle

## Important Decisions

| Date | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 2026-10-11 | Google Sheet + Apps Script back end, static site on GitHub Pages | $0, never sleeps, the seller edits the menu in the Sheet | Render + Supabase (free Render sleeps ~50s; 3 accounts), Supabase only (email needs another service), Formspree (50/month cap, no admin) |
| 2026-10-11 | Server recomputes price from the Menu tab | Anyone can edit browser JS to pay $0.01 | Trusting the browser's total |
| 2026-10-11 | Order is saved only after "I sent it" | Matches Yeshivah4All's Zelle flow; fewer junk orders | Saving before showing Zelle details |
| 2026-10-11 | Demo mode when `API_URL` is empty | Preview without Google; show prospects a working demo | Separate mock server |
| 2026-10-12 | Removed order emails | Ethan: not needed; the admin page covers it; one less Google permission | MailApp email per order (built 2026-10-11) |
| 2026-10-12 | Shop open/closed switch; server refuses orders when closed | Seller sells out; a browser-only check could be bypassed | Hiding the form in the browser only |
| 2026-10-12 | Host under GitHub org **MikdashMunchies**, repo named `mikdashmunchies.github.io` → links like `mikdashmunchies.github.io/<shop>/` | Free, short, carries the business name; one push updates every shop | Bought business domain (~$12/yr, maybe later); a .com per shop (offer as paid add-on; address bar would still show the long link after redirect); keeping `ethan08madar-web.github.io/school-food-sites/...` (long, personal) |
| 2026-10-15 | Order notifications via ntfy push, not SMS | Free, instant, any carrier, no signup; fits the $0 setup | Twilio SMS (~$1–2/mo + ~1¢/text + A2P business registration), email-to-text gateways (AT&T shut down 2025, others unreliable) |
| 2026-10-15 | Maaser = 10% of Zelled **sales**, shown on admin; no cost tracking | Ethan's choice; simplest; paid orders only | 10% of profit with a Costs tab (more accurate, more input); one cost box |
| 2026-10-13 | Home page + README link table generated by `node build.js`; shared CSS/JS links fingerprinted (`?v=<sha1>`) | New shops appear everywhere automatically; GitHub Pages' ~10-min browser cache served stale styles after updates | Hand-maintained link lists (go stale); telling visitors to hard-refresh |
| 2026-10-12 | Template: one repo, `shops/<slug>/shop.json` + shared `template/`, `node build.js` → `docs/` | Ethan: every shop works the same, only details differ; fix once → all shops update | A separate repo copy per shop (fixes copied by hand); runtime `?shop=` URLs (ugly links) |
| 2026-10-12 | Shop name/tagline moved from the Sheet to shop.json; menu types renamed `meat`/`add-on` → `main`/`extra` | One source of truth; works for any food | Keeping panini words in the core |
| 2026-10-12 | Admin = one table (Name, Room, Order, Zelled ✓), code 1234 | Ethan asked for exactly that | Waiting/To deliver/Delivered tabs |
| 2026-10-11 | Redesign from toasty-gold hero to white/bold/sticker style | Ethan: more white space, bold, more jump, modern but fun | Gold grill-mark hero (v1) |

## Implementation Notes

- `safeCell_` prefixes `'` to EVERY non-empty typed string: Sheets otherwise runs `=...` as a
  formula, turns room "012" into 12, and "3-12" into a date (seen live 2026-10-12: room "000" saved as 0).
- Admin refresh vs. tick race: a `list` that started before a tick returns old data; `load()`
  drops its answer if `ticks` changed meanwhile. Counters must be declared before the startup
  `if (password) load()` (a TDZ error broke saved logins once).
- Live deployment: `shops/davids-paninis/shop.json` `apiUrl` = deployment "davids panninis test"
  (there's also an unused "Shop v1" deployment). After changing Code.gs: paste into the Apps Script
  editor, then Deploy → Manage deployments → "davids panninis test" → pencil → New version.
- On phones, `.ticket-paper` must not have a `filter` or `transform`: either one makes the
  `position: fixed` checkout bar stick to the ticket instead of the screen.
- `.layout`/`.tiles` set `display`, so `[hidden] { display:none !important }` is needed for views to hide.
- Admin code defaults to `1234` (Ethan's choice; `setup()` sets it only if none exists). No lockout
  after wrong guesses (`ponytail:` note in Code.gs), so 1234 is guessable; worst case is someone
  viewing orders / ticking boxes, not prices or money.
- Zelled checkboxes are inserted per new row, not pre-filled: pre-filled checkbox cells hold
  `FALSE`, count as data, and `appendRow` would skip past them to row 1000+.
- `.gitattributes` forces LF: with Windows `core.autocrlf=true`, git rewrote `docs/` files with CRLF and the stale-`docs/` test failed on identical content.
- Apps Script redeploys: **Manage deployments → New version** keeps the URL; "New deployment" changes it.

## Notes

- Spec and plan (first design, partly superseded — see Important Decisions): `planning/specs/2026-10-11-paninis-site-design.md`, `planning/plans/2026-10-11-paninis-site.md`.
- Ideas parked: different paninis in one order, pickup times, card payments, dark mode.
