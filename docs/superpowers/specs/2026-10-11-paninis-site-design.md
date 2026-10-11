# David's Meat Paninis — first customer site (design)

**Date:** 2026-10-11 · **Status:** approved by Ethan

## Goal
A baseline food-ordering site, first for David's Meat Paninis, reusable for every later school seller.

## Customer flow (one page, `index.html`)
1. Hero: "Welcome to David's Meat Paninis" + a title line.
2. Build your panini: one meat (radio), any add-ons (checkboxes), quantity. Live total.
3. Details: name (required), room number (required), note (optional).
4. Pay with Zelle: "Send $X via Zelle to <recipient>, memo: <Name – Room>", copy button,
   then "I sent it — place my order".
5. Confirmation: order number; status shows "waiting for payment" until David confirms.

## Owner flow
- Email to the Sheet owner on every new order (Apps Script `MailApp`).
- `admin.html`: password → list of orders (newest first) → mark **Paid** / **Delivered**.
- Menu is edited in the Sheet's `Menu` tab — no code changes for price/menu edits.

## Architecture
- **Frontend:** plain HTML/CSS/JS, no build step. Hosted free on GitHub Pages.
- **Backend:** one Google Apps Script web app bound to the Sheet (`apps-script/Code.gs`).
  - `GET ?action=menu` → menu + shop settings (name, Zelle recipient).
  - `POST {action:"order"}` → validate, **recompute price server-side from the Menu tab**,
    append row to `Orders`, email owner, return order number.
  - `POST {action:"list"|"update", password}` → admin; password checked against Script
    Property `ADMIN_PASSWORD` (never in site code).
  - `LockService` around order numbering so two simultaneous orders can't share a number.
- **Data:** Sheet tabs `Menu` (type, name, price) and `Orders`.
- Requests use `Content-Type: text/plain` to avoid CORS preflight (Apps Script can't answer one).

## Trust boundary
- The client total is display-only; the server computes the charged total.
- Server validates: name/room present, length-capped; meat exists; add-ons exist; qty 1–10.
- Payment is self-reported (Zelle has no API) → orders start `Pending payment`; David marks Paid.

## Out of scope (add when asked)
Multiple different paninis per order, pickup times, card payments, dark mode, spam rate-limit.

## Testing
- Node `vm` test runs `Code.gs` with fake `SpreadsheetApp`/`MailApp`: price recompute,
  validation failures, tampered prices ignored, wrong admin password rejected.
- Browser preview of `index.html` and `admin.html` at mobile/tablet/desktop with a mocked backend.
- Real Google deploy: done by Ethan (needs his account) using `SETUP.md`.

## Business pricing (what Ethan charges sellers)
- $15 one-time setup · $5/month · or $35 for the school year (push this one) · first month free.
- Optional custom domain +$15/yr (costs ~$12).
