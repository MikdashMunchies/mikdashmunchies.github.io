# Session — 2026-10-13 — SchoolFoodSites

**Date:** 2026-10-11 → 2026-10-13 (one long first session)
**Project:** SchoolFoodSites (business name: MikdashMunchies)
**Branch:** feature branches merged into `main`; everything pushed

## Goals

Start Ethan's business selling food-ordering websites to student sellers at his school: build the
first shop (David's Meat Paninis), make it reusable as a template, get it live for free, then add
four more shops.

## Completed

- **Project + pricing.** Folder, notes, git. Seller pricing set by Ethan: $10 setup + $15/month.
- **Back end:** one Google Apps Script per shop (`apps-script/Code.gs`) bound to a Google Sheet
  (tabs Menu / Settings / Orders). Server-side pricing, admin code (`ADMIN_PASSWORD`, default 1234),
  open/closed switch, Zelled checkboxes, delivery fee.
- **Customer page (phone-first):** pick one or more mains (prices add) + extras, quantity,
  delivery (+$1) or pickup (free), name/room/"Anything special?", Zelle step (Open Zelle + copy
  buttons), "Order completed", "Sold out!" when closed.
- **Admin page:** code 1234, table Name · Room · Order · Zelled ✓ with order date/time,
  Close/Open shop, auto-refresh every 15 s, hidden 5-tap shortcut on the shop name.
- **Template:** `template/` + `shops/<slug>/shop.json` + `node build.js` → `docs/`.
- **Live:** David's Sheet "dmp" + script "Paninis Shop" (deployment now v4). GitHub org
  **MikdashMunchies**, repo `mikdashmunchies.github.io`, Pages from `main`/`docs`.
  Links: `https://mikdashmunchies.github.io/<shop>/`.
- **Shops:** davids-paninis (live), henrys-bakery, yitzs-grill, joshs-hot-dogs, elis-kitchen
  (demo mode — no Sheet yet). Each has its own colors, drawn SVG picture, menu, QR code.
- **Tools:** `qr/make_qr.py` (makes a labelled QR and refuses to save one that doesn't scan back).
- **Global rulebook** v1.37.0: 4 lessons promoted (see Important Context).

## Files Changed

| File | Change |
|---|---|
| `apps-script/Code.gs` | Whole back end (menu, order, list, update, setOpen, setup), delivery fee, plain-text cells |
| `template/*` | Shared pages, JS, CSS for every shop |
| `shops/*/shop.json`, `shops/*/*.svg` | Per-shop details and pictures (5 shops) |
| `build.js` | Builds `docs/`; `new <slug>`; always writes LF |
| `docs/**` | Generated site (never hand-edit) |
| `tests/code.test.js`, `tests/build.test.js` | 19 tests |
| `qr/make_qr.py`, `qr/*.png` | QR maker + 5 codes |
| `SETUP.md`, `CLAUDE.md`, `CHANGELOG.md`, `.gitattributes`, `planning/*` | Docs, settings, first design/plan |

## How It Was Verified

- **Back end:** `node --test` runs `Code.gs` in `node:vm` with fake Google services (13 tests:
  pricing, tampered totals, bad orders, formula/number/date escaping, open/close, password, Zelled,
  delivery/pickup, fee from Sheet). Each new guard was broken on purpose and its test went red.
- **Build:** 6 tests incl. "docs/ matches a fresh build" and "built files are LF".
- **Browser (localhost + live):** full order flows at 375/768/1280 px; console clean; no sideways
  scroll; delivery $9.50 vs pickup $8.50 on Josh's; room only required for delivery.
- **Live Google:** real test orders landed in David's Sheet with server-computed totals; Zelled
  ticks synced both ways (site → Sheet, Sheet → admin in ~12 s); wrong code refused; room "012"
  stored as "012"; v4 script returns `deliveryFee: 1`.
- **Live site:** every served file byte-compared to `docs/` (24/24 match after the last push).
- **QR:** each saved PNG decoded back to its exact link; a blank image fails the check.
- **Not verified:** a real phone camera scan (OpenCV used instead); real Zelle payments (manual by
  design); the 4 new shops against real Google Sheets (they don't have one yet).

## Decisions Made

All recorded with reasons and rejected alternatives in `CLAUDE.md` → Important Decisions. Key ones:
Google Sheet back end (free, never sleeps) over Render/Supabase; server-side pricing; no emails;
single Zelled checkbox instead of statuses; template + build over a repo per shop; GitHub org with
`<org>.github.io` repo for short free links; delivery-or-pickup with a flat fee per order;
no alcohol on menus (student buyers).

## Bugs Fixed

- Phone pay bar stuck to the ticket → `filter` on an ancestor makes `position: fixed` relative to
  it → no filter on phones.
- Demo orders invisible on admin page → kept in one page's memory → localStorage per shop.
- Admin never refreshed → no polling → 15 s auto-refresh + on focus.
- Ticked box flipped back → refresh started before the tick returned old data → drop stale
  responses (`ticks` counter); the first version threw a TDZ error on saved logins → declare early.
- Room "000" saved as 0 (seen live) → Sheets type-guessing → prefix every typed string with `'`.
- Stale-docs test failed on identical content → CRLF on disk (Windows) → `.gitattributes` + build
  always writes LF.
- Eli's QR didn't scan → library's auto mask pattern unreadable by OpenCV → retry other masks.

## Issues Remaining

- David: Zelle still "CHANGE ME" in his Sheet; sample prices; his shop is currently **closed**
  (`open: no`); 2–3 "Test Order" rows in his Orders tab.
- The 4 new shops have no Google Sheet/script yet → demo mode (orders not saved).
- All prices and Zelle numbers are samples. Pictures are drawings, not photos.
- Admin code 1234 has no lockout (accepted by Ethan; worst case is viewing/ticking orders).

## Next Steps

1. With Ethan: Google Sheet + script for Henry's, Yitz's, Josh's, Eli's (SETUP.md steps 2–3),
   paste each web-app URL into its `shop.json` `apiUrl`, `node build.js`, push.
2. Real Zelle numbers + prices in each Sheet; reopen David's shop.
3. Real food photos to replace the drawings.

## Important Context

- Deploying a `Code.gs` change: paste into each shop's Apps Script editor, then Manage deployments →
  the active deployment → pencil → **New version** (keeps the URL). David's active deployment is
  the one with ID `AKfycbxvJTUNcfZ6z0wW3…`; its description is now blank ("Untitled").
- Google permission screens, GitHub email verification and GitHub org Terms need Ethan's own clicks.
- In Chrome automation, use `form_input` for text fields (GitHub shortcuts fired once).
- `grep $'\r'` in this Git Bash does not detect CR — use `file` or Node to check line endings.
- Preview server config is `.claude/launch.json` (`site`, port 5510); shops at `/docs/<slug>/`.

## Addendum (after wrap-up, same day)

- **Home page** https://mikdashmunchies.github.io/ (card per shop) and **README.md** link table,
  both generated by `node build.js` (`template/home.html`, `readme()` in build.js).
- **Asset fingerprints:** shared CSS/JS links carry `?v=<sha1>`; GitHub Pages caches ~10 min, and
  stale styles showed up in testing after each change.
- Verified: 22 tests (missing fingerprint caught), home page at 375 px and 1280 px, 25/25 live files
  byte-identical to `docs/`, README on GitHub lists all 5 shops.
- Still open: the 4 new shops have **no Google Sheets yet** (demo mode) — first task next session.
- Final wrap-up: CLAUDE.md status now links the home page; decision recorded for generated
  home/README + fingerprints. Global rulebook → v1.38.0 (fingerprint assets on static sites).
- **Start next session with:** Google Sheet + script for Henry's, Yitz's, Josh's, Eli's
  (SETUP.md steps 2–3, Ethan clicks "Allow"), put each URL in `shops/<slug>/shop.json` → build → push.
