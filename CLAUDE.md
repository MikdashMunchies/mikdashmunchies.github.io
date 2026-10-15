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

- **Current Phase:** 5 shops built. **Two connected to Google:** David's Meat Paninis (Sheet "dmp", script
  "Paninis Shop", active deployment "Untitled" `AKfycbxvJTUNcf…`) and Eli's Kitchen (Sheet "Eli's Kitchen -
  Orders", script "Eli's Kitchen Shop", deployment `AKfycbyOIN6S…`, real menu loaded 2026-10-15). Henry's
  Bakery, Yitz's Grill, Josh's Hot Dog Stand are in **demo mode** (no Google Sheet yet).
- **Live scripts (2026-10-15, end of day):**
  - **Eli's:** deployment **version 5** = `Code.gs` from `b5c4859` (hours + menu editor + sold out + **cash**;
    editor hash `e3-f2-63-f5`). Checked live: menu has `cash: true`, 10 real items, list works.
  - **David's:** `Code.gs` from `1d98dc5` (hours + menu editor + sold out, no cash). Until cash is deployed there,
    his shop hides the cash choice (old script sends no `cash`), but his admin page wrongly shows "Cash: Accepted"
    and the switch errors ("Unknown action"). Deploy the latest `Code.gs` to fix.
  - Neither shop has hours set (= open per the switch). Neither has Telegram (no bot yet) or `notifyEmail` filled.
- **Notifications not live anywhere yet:** Ethan is making the Telegram bot later (@BotFather → token into each
  script's Script Property `TELEGRAM_TOKEN` himself; Claude must not handle the token). David's Settings has an
  empty `telegramChatId` row; Eli's has empty `telegramChatId` + `notifyEmail` rows. Email works as soon as an
  address is in `notifyEmail` (David's Sheet needs the row added).
- **Business name:** MikdashMunchies (GitHub organization, owned by Ethan's account).
- **Home page (all shops):** https://mikdashmunchies.github.io/ · repo README lists every link.
- **Live:** https://mikdashmunchies.github.io/<shop>/ for davids-paninis, henrys-bakery, yitzs-grill,
  joshs-hot-dogs, elis-kitchen (admin: + `admin.html`). QR codes: `qr/<shop>.png`.
  Repo https://github.com/MikdashMunchies/mikdashmunchies.github.io (public; Pages = `main` / `/docs`).
  The repo is named `<org>.github.io` on purpose: that gives the short link with no repo name in it.
- **Current Goal:** Make all 5 shops take real orders; work through the client's feature list (below).
- **Current Priority:** Eli's Zelle (his shop is open with Zelle "CHANGE ME"); deploy the latest `Code.gs` to
  David's script (cash), together with Telegram once Ethan has the bot; then Google Sheet + script for Henry's,
  Yitz's, Josh's (SETUP.md steps 2–3; needs Ethan's clicks), then `apiUrl` in each shop.json.
- **Two Claude sessions worked on this repo on 2026-10-15** (this one: notifications → cash; another: opening
  hours, in worktree `SchoolFoodSites-hours`). Both deployed to the live scripts. Before deploying `Code.gs`, check
  the active version in Manage deployments and that the editor holds the latest `main` (hash it).
- **Features page for prospective sellers:** https://claude.ai/artifact/7AGZKesSvfanVL6Ysu1ggw (source
  `features/index.html`; private until Ethan shares it). Republish it when features or prices change.
- **Client feature list (2026-10-15)** — done: menu, free editing (admin Menu tab), order form, notifications,
  maaser, analytics, Zelle, opening hours + auto-close, sale prices, per-item sold out, cash. **Not built:**
  surcharge at certain times, meal deals / combo discounts, food labels (meat/dairy/pareve), pictures +
  descriptions per item, order-time estimate with a live timer for the buyer, scheduled pre-orders (same day
  free, calendar paid), pickup time slots, customer confirmation (email/text), loyalty.
- **Current Blockers:** Eli's Zelle number/email (his shop is **open** — someone reopened it ~21:00 after Claude
  closed it; ask Ethan). David's real Zelle + prices (sample). Telegram bot (Ethan, "later").
- **Recommended Next Task:** Get Eli's Zelle → set it in his Sheet (or close his shop). When Ethan has the bot:
  token into both scripts, `telegramChats` → chat ids into Settings, `testNotify`, then deploy the latest
  `Code.gs` to David's script (cash + all) and check live. Then David's real hours; then the next client feature.

*Last updated: 2026-10-15*

---

## Purpose

Ethan's business: he builds and runs simple food-ordering websites for students who sell food at
his school. Customers build an order on their phone, pay the seller by Zelle, and the seller sees
orders in an admin page. First customer: **David's Meat Paninis**.

## Business Rules

- **What Ethan charges sellers:** $20 one-time setup + $10/month (Ethan, 2026-10-15; was $10 + $15/month).
  Optional custom domain +$15/yr (costs about $12).
- **Payment: Zelle or cash** (cash added 2026-10-15, on by default; Settings `cash` yes/no, admin "Accept cash"
  switch). Cash orders skip the Zelle step and are saved at once with Payment = Cash. **Both are self-reported.** Zelle has no API, so every order starts
  un-ticked; the seller ticks **Zelled** after checking their bank (on the admin page or right
  in the Sheet's checkbox column). Second checkbox **Completed** (Ethan, 2026-10-15): the seller ticks it once the
  order is handed over; the row stays listed, faded and crossed out, and can be unticked. Independent of Zelled.
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
- **Data:** each shop's own Google Sheet. Tabs `Menu` (Type `main`/`extra`, Name, Price, Sale price — optional, must be
  lower than Price; the menu then gives `price` = sale price and `was` = regular price, so every total uses it;
  Sold out — checkbox; item stays listed with `soldOut: true`, can't be picked, server refuses orders with it),
  `Settings` (Key/Value: zelleTo, open, deliveryFee, telegramChatId, notifyEmail, hoursSun…hoursSat), `Orders` (… Item, Extras, …, Paid checkbox (header "Zelled" on older Sheets), Completed checkbox = column K,
  Payment = column L "Cash"/"Zelle" (blank on old rows = Zelle); older Sheets get the
  header on first use via `ordersSheet_()`).
  The site can't store anything itself; the Sheet is the database (admin page reads it). Order numbers come from Script Property `NEXT_ID`.
- **Auth:** admin password = Script Property `ADMIN_PASSWORD`, checked server-side on every
  list/update. The browser keeps it in `sessionStorage` only.
- **Open / sold out:** Settings `open` (`yes`/`no`; missing = open). Admin's Close shop button
  sets it. When closed the site shows "Sold out!" and the server refuses orders. The site re-checks
  before showing Zelle details so nobody pays after closing.
- **Opening hours / auto-close** (Ethan, 2026-10-15): Settings `hoursSun`…`hoursSat` = `"11:00-00:00"` or
  `closed` (stored as text via `safeCell_`). No hours rows at all = always open (old behaviour). Close `00:00`
  = midnight; close before open runs past midnight; `00:00-00:00` = all day; unreadable = closed.
  `hoursNow_()` uses the **Sheet's time zone** (`getSpreadsheetTimeZone()`, `formatDate(...,'u HH:mm')`).
  Buyers can order only if the switch is on AND it's inside the hours (`shop.open`); `closedBy` =
  `switch` (shows "Sold out") or `hours` (shows "Closed · opens …", from `nextOpen`). The Close button wins;
  Open can't force the shop open outside its hours. Admin **Hours** tab (Orders | Menu | Hours | Analytics)
  saves via `setHours`. Demo mode copies the rules in `api.js` (`demoStatus()`, browser clock) — keep the two in step.
- **No emails** (Ethan, 2026-10-12: not needed). The admin page is where orders are seen.
- **Order notifications: Telegram and/or email** (Settings `notifyEmail`, comma-separated; `MailApp`, one
  email to all addresses; shares the deploying account's ~100 recipients/day Gmail quota across ALL shops;
  a failed email is logged and never fails the order or blocks Telegram). Telegram: one bot for the business; its token is Script Property
  `TELEGRAM_TOKEN` in each shop's script (secret: never in the Sheet/repo). Settings `telegramChatId` =
  comma-separated chat ids that get each order. `notify_()` → `telegram_('sendMessage')` after saving; no
  token/chat = no message; a failed send is logged (token blanked out) and never fails the order. Editor
  helpers: `telegramChats()` lists who pressed Start (chat ids), `testNotify()` sends a test and throws if it
  failed. Needs the UrlFetchApp permission: with Google's granular consent the box can be left unticked —
  then the log says "permission"; fix by removing the app at myaccount.google.com/connections and re-running.
- **Maaser box (admin):** 10% of **Zelled** order totals (incl. delivery fees), this month + all
  time, computed in the browser by `maaserOf()` in `api.js` from the `list` answer. No backend change.
- **Admin Menu tab:** edit names/prices, add/remove items and extras, **Sold out** toggle per item, **Discount** = a sale price per item
  (Ethan, 2026-10-15: "new price", not a percent). Loads once per login (never on auto-refresh, which would wipe
  edits); Save sends `saveMenu`; the shop shows ~~old~~ new price + a Sale sticker. Demo mode keeps edits in
  localStorage (`demoMenu:<slug>`).
- **Admin tabs: Orders | Menu | Analytics.** Analytics = `analyticsOf()` in `api.js` from the same `list` answer:
  orders, Zelled sales, average order, waiting for Zelle, today, last 7 days, orders by hour (bars in the
  shop's `--accent`, only the hours that had orders, busiest labelled), top 5 best-selling mains. Viewer's local time.
- **Admin auto-refresh:** every 15s and on tab focus; skipped while the tab is hidden or a tick is saving.
- **Admin access:** same site, unlinked (`admin.html`, `noindex`). Hidden shortcut: tap the shop
  name 5 times within 1.5s (`shop.js`). The password is the real protection, not the hidden URL.

## APIs

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `?action=menu` | none | Menu + only the public settings `zelleTo`, `open` (= can order now), `deliveryFee`, `closedBy`, `hours`, `today`, `nextOpen` (`publicMenu_()`; never `telegramChatId`, `notifyEmail` or anything else) |
| POST | `{action:'order', name, delivery, room, note, mains, extras, qty}` | none | Refuse if closed; validate, price (+ fee if delivery), save → `{id,total}` |
| POST | `{action:'list', password}` | password | All orders, newest first, + `open` (the switch), `closedBy`, `hours`, `today`, `nextOpen` |
| POST | `{action:'setOpen', password, open}` | password | Open or close the shop → same status fields |
| POST | `{action:'setCash', password, cash}` | password | Turn cash payments on or off → same status fields (incl. `cash`) |
| POST | `{action:'setHours', password, hours:[7 × "HH:MM-HH:MM" or "closed"]}` | password | Save the week's hours, Sunday first (all 7 checked first) → same status fields |
| POST | `{action:'saveMenu', password, items:[{type,name,price,sale,soldOut}]}` | password | Replace the whole Menu tab (all checked first; ≤60 items, ≥1 main, unique names, prices 0–999, sale < price) |
| POST | `{action:'update', password, id, zelled?, completed?}` | password | Tick or untick Zelled and/or Completed on one order (only the booleans sent change) |

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
the folder). `code.test.js` runs `Code.gs` in `node:vm` with fake Google services; `api.test.js` runs `template/api.js` (maaser + analytics math);
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
- [ ] **Milestone 3c: New shops live**: a Google Sheet + script per shop, real menus/Zelle (Eli done)
- [x] **Milestone 4a: Opening hours + auto-close** (admin Hours tab; server refuses orders outside hours)
- [x] **Milestone 4b: Seller tools**: order alerts (Telegram/email — built, not set up live), maaser, Done column,
  Analytics, Menu tab (edit/add/remove, sale price, sold out), cash + Accept-cash switch
- [ ] **Milestone 4c: Alerts live**: Telegram bot + chat ids / `notifyEmail` for every live shop

## Important Decisions

| Date | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 2026-10-11 | Google Sheet + Apps Script back end, static site on GitHub Pages | $0, never sleeps, the seller edits the menu in the Sheet | Render + Supabase (free Render sleeps ~50s; 3 accounts), Supabase only (email needs another service), Formspree (50/month cap, no admin) |
| 2026-10-11 | Server recomputes price from the Menu tab | Anyone can edit browser JS to pay $0.01 | Trusting the browser's total |
| 2026-10-11 | Order is saved only after "I sent it" | Matches Yeshivah4All's Zelle flow; fewer junk orders | Saving before showing Zelle details |
| 2026-10-11 | Demo mode when `API_URL` is empty | Preview without Google; show prospects a working demo | Separate mock server |
| 2026-10-12 | Removed order emails (**superseded 2026-10-15**: email is back as an optional `notifyEmail`) | Ethan: not needed; the admin page covers it; one less Google permission | MailApp email per order (built 2026-10-11) |
| 2026-10-12 | Shop open/closed switch; server refuses orders when closed | Seller sells out; a browser-only check could be bypassed | Hiding the form in the browser only |
| 2026-10-12 | Host under GitHub org **MikdashMunchies**, repo named `mikdashmunchies.github.io` → links like `mikdashmunchies.github.io/<shop>/` | Free, short, carries the business name; one push updates every shop | Bought business domain (~$12/yr, maybe later); a .com per shop (offer as paid add-on; address bar would still show the long link after redirect); keeping `ethan08madar-web.github.io/school-food-sites/...` (long, personal) |
| 2026-10-15 | Cash payment option, on by default, admin switch | Ethan asked; many students pay cash; seller can turn it off | Zelle only (as before); cash off by default |
| 2026-10-15 | Menu editing + discounts on the admin page (Sheet stays the store) | Ethan: sellers shouldn't need the Sheet | Editing only in the Sheet; percent-off discounts (Ethan chose a sale price); discount codes |
| 2026-10-15 | Email notifications as an option next to Telegram | Ethan asked for it; easiest for sellers (no app) | Telegram only |
| 2026-10-15 | Order notifications via a Telegram bot | Free, reliable from Apps Script, any phone | ntfy.sh push (**tried and shipped first, superseded same day**: its free limit is per IP and all Apps Script shares Google's IPs → 429 "daily quota reached"); paid ntfy (~$5/mo); Gmail email (one ~100/day quota shared by every shop under Ethan's account); Twilio SMS (~$1–2/mo + ~1¢/text + A2P registration); email-to-text (AT&T shut down 2025) |
| 2026-10-15 | Completed checkbox; done rows stay listed, faded + crossed out | Ethan picked it; nothing disappears by accident, easy to undo | Moving done rows to the bottom; hiding them behind "Show completed" |
| 2026-10-15 | Opening hours = one Settings row per day (`hoursSun`…), checked by the Google script in the Sheet's time zone; the Close button wins over hours; no rows = always open | Ethan picked per-day hours (Shabbat: Friday early close, Saturday closed; nightly 12am close); server-side so a phone clock can't bypass it; existing shops keep working untouched | Same hours every day (no early Friday); one JSON cell (unreadable for sellers in the Sheet); browser-only check (bypassable); Open overriding hours (could force 3am orders) |
| 2026-10-15 | Analytics computed in the browser from the `list` answer | No new backend action or Google permission; works in demo mode | A server-side stats action |
| 2026-10-15 | Maaser = 10% of paid **sales** (Paid ticked, Zelle or cash), shown on admin; no cost tracking | Ethan's choice; simplest; paid orders only | 10% of profit with a Costs tab (more accurate, more input); one cost box |
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
- Live deployment: David's `apiUrl` = the **active** deployment "Untitled" (`AKfycbxvJTUNcf…`; "davids
  panninis test" is archived, "Shop v1" unused). Eli's = his one active deployment. After changing Code.gs:
  update the code in each script, then Deploy → Manage deployments → pencil → Version: **New version** → Deploy.
  Agent route (2026-10-15): the Apps Script editor exposes `monaco`; load the committed file from
  `raw.githubusercontent.com/MikdashMunchies/mikdashmunchies.github.io/<commit>/apps-script/Code.gs`, put it in
  with `editor.executeEdits`, compare a SHA-256 of the editor text with the committed file, click Save. Before
  replacing, hash the live text against `git log -- apps-script/Code.gs` versions to prove nobody hand-edited it.
  The **Deploy click**: Claude Code's auto mode blocks it as a production deploy (hours session); in
  bypass-permissions mode Claude clicked it fine (notifications→cash session). Either way, re-check live after.
  `raw.githubusercontent.com` caches `main` for a few minutes after a push: retry until the new code appears
  (or use the commit hash in the URL), then hash-check.
- Apps Script editor quirks (Chrome automation): after the "Authorization required" popup the run can hang on
  "Execution started" — reload the editor, re-pick the function, Run again. The function dropdown only opens
  from its arrow; picking an option by accessibility ref silently does nothing — check the dropdown text after.
- **Google's consent screen has per-permission checkboxes.** An unticked "Connect to an external service" or
  "Send email as you" still leaves the script "authorized": no new prompt, and the call fails at run time
  ("You do not have permission to call UrlFetchApp.fetch"). Fix: remove the app at
  myaccount.google.com/connections, run again, tick every box. `testNotify` throws on this instead of passing.
- Telegram token is a Script Property, never in the Sheet; `telegram_()` blanks it out of logged errors (network
  errors quote the URL, which contains it).
- `classList.toggle(name, undefined)` flips the class ON (undefined = no force). Pass `!!value` — demo orders
  without a `completed` field showed as Done until this was fixed.
- Orders column 10 is "Paid" (header "Zelled" on Sheets made before cash); column L "Payment" = Cash/Zelle,
  blank on old rows = Zelle. `ordersSheet_()` adds missing Completed/Payment headers on first use.
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
