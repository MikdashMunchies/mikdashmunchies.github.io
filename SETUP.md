# Running the shops

Every shop uses the same core (`template/` + `apps-script/Code.gs`). Only its details differ:

| Detail | Where it lives | Who changes it |
|---|---|---|
| Name, tagline, words ("Pick your meat"), colors, picture | `shops/<shop>/shop.json` + picture file | You |
| Menu and prices, Zelle number, open/sold out | That shop's Google Sheet (and the admin page) | The seller or you |
| Orders | That shop's Google Sheet, viewed on the admin page | Saved automatically |

The website itself can't store anything. Each shop's Google Sheet is where its orders are saved.
The seller never has to open the Sheet: the admin page shows everything.

## Add a new shop (about 20 minutes)

### 1. Make its settings file

```bash
node build.js new sarahs-cookies
```

Open `shops/sarahs-cookies/shop.json` and fill it in:

- `name`, `tagline`: shown big at the top.
- `item`: what one order is called ("panini", "cookie box"). Used in "Build your ___".
- `mainLabel`: step 1's title ("Pick your meat"). `extrasLabel`: step 2's title ("Add-ons").
- `notePlaceholder`, `sticker`: small touches.
- `image`: a picture file you put in the same folder (`photo.jpg`). Leave it `""` for no picture.
  Best photo: the food cut open so you can see inside, natural light, shot from slightly above.
- `accent` (buttons) and `highlight` (selected items): any colors, like `#6D3BD2`.
- `apiUrl`: leave `""` for now (step 3). While it's empty the shop runs as a **demo** using `demoMenu`.

Then build and look at it:

```bash
node build.js
```

The shop is now in `docs/sarahs-cookies/`.

### 2. Make its Google Sheet + script

Use whichever Google account should own the orders: yours if you run it for the seller.

1. Go to [sheets.new](https://sheets.new). Name it like `Sarah's Cookies — Orders`.
2. **Extensions → Apps Script**. Delete everything in the code box, paste in all of
   `apps-script/Code.gs`, and click save.
3. At the top, pick the function **`setup`** and click **Run**. Google asks for permission:
   **Review permissions → pick the account → Advanced → Go to (project) (unsafe) → Allow**.
   ("Unsafe" just means Google hasn't reviewed your own script. That's normal.)
4. Back in the Sheet there are three new tabs:
   - **Menu**: one row per item. `Type` is `main` (pick one, e.g. the meat) or `extra`
     (optional add-ons). Prices are plain numbers (`6.5`). Replace the example rows.
   - **Settings**: set `zelleTo` to the seller's Zelle phone or email. `open` is `yes`/`no`.
     `deliveryFee` is what delivery costs per order (default `1`; pickup is always free).
     `ntfyTopic` is a random name for order notifications (see step 3b). Keep it secret.
   - **Orders**: new orders show up here. Don't change the headers.
5. The admin code is **1234**. To change it: in Apps Script click the gear (**Project
   Settings**) → **Script Properties** → edit `ADMIN_PASSWORD` → **Save script properties**.
   There's no lockout after wrong guesses, so a longer code is safer.

### 3. Put the script online and connect it

1. In Apps Script: **Deploy → New deployment** → gear → **Web app**.
2. **Execute as: Me**, **Who has access: Anyone** → **Deploy**. Copy the **Web app URL** (ends in `/exec`).
3. Paste it into the shop's `shop.json` as `"apiUrl": "https://script.google.com/macros/s/.../exec"`.
4. Run `node build.js`.

Changed `Code.gs` later? **Deploy → Manage deployments → pencil → Version: New version → Deploy**.
The URL stays the same. (A "New deployment" would give a new URL.)

### 3b. Order notifications on the seller's phone (free, ntfy)

1. The seller installs **ntfy** (App Store / Google Play), taps **+**, and subscribes to the
   `ntfyTopic` from the Settings tab (server: the default, ntfy.sh).
   Older Sheet without that row? Add one: `ntfyTopic` | a random name like `dmp-orders-7k2x9q4m`.
2. In Apps Script, pick the function **`testNotify`** and click **Run**. The first time, Google
   asks for permission to "connect to an external service": **Allow** (same steps as above).
   The seller's phone should buzz with a test notification.
3. **Do step 2 before deploying a new version** of a script that didn't have notifications yet.
   Without that Allow, the live shop can't take orders at all.

No `ntfyTopic` row = no notifications; everything else works the same.

### 4. Publish

Commit and push. The first time only, on GitHub: **Settings → Pages → Deploy from a branch →
`main` / `/docs` → Save**. After about a minute every shop is live:

- Shop: `https://mikdashmunchies.github.io/sarahs-cookies/`
- It also appears automatically on the home page (https://mikdashmunchies.github.io/) and in the
  repo's README link list — both are rebuilt by `node build.js`.
- Admin: tap the shop name **5 times quickly**, or add `admin.html` to the end of that link.

### 5. Make its QR code

```bash
python qr/make_qr.py https://mikdashmunchies.github.io/sarahs-cookies/ "Sarah's Cookies" qr/sarahs-cookies.png
```

It prints `OK: scans to the right link` only after reading the code back. Print it or post it in the group chat.

### 6. Test it for real

1. Place an order on your phone. Check a row shows up in the Sheet's **Orders** tab.
2. Open the admin page, enter the code, tick **Zelled**. The box in the Sheet should tick too,
   and the **Maaser** box should go up by 10% of that order.
   The seller's phone should have buzzed with the order (if `ntfyTopic` is set).
3. Tap **Close shop**: the shop page should say **Sold out!** Then **Open shop** again.

## Changing the core (affects every shop)

Edit files in `template/` or `apps-script/Code.gs`, then:

```bash
node build.js
node --test tests/build.test.js tests/code.test.js tests/api.test.js
```

The tests fail if you forgot `node build.js`. Push, and every shop updates at once. If you changed
`Code.gs`, each shop's script also needs the new code pasted in and a **New version** deployed.
