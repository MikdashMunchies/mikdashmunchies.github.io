# Setting up a shop (about 15 minutes)

You do this once per customer. You need a Google account and a GitHub account.

Use whichever Google account should own the order Sheet: yours if you run it for the seller,
or the seller's (David's) if they want it in their own Drive.

## 1. Make the Google Sheet + script

1. Go to [sheets.new](https://sheets.new). Name it something like `David's Meat Paninis — Orders`.
2. Click **Extensions → Apps Script**.
3. Delete everything in the code box. Paste in everything from `apps-script/Code.gs`. Click the save icon.
4. At the top, pick the function **`setup`** and click **Run**.
   - Google asks for permission. Click **Review permissions**, pick the account, then
     **Advanced → Go to (project name) (unsafe) → Allow**. ("Unsafe" just means Google
     hasn't reviewed your own script. That's normal.)
   - Go back to the Sheet. You'll see three new tabs: **Menu**, **Settings**, **Orders**.
5. The admin code is now **1234** (`setup` set it). To change it: in Apps Script click the gear
   (**Project Settings**) → **Script Properties** → edit `ADMIN_PASSWORD` → **Save script properties**.
   There's no lockout after wrong guesses, so a longer code is safer.

## 2. Fill in the shop

In the Sheet:

- **Settings** tab: set `zelleTo` to the seller's Zelle phone number or email. You can also
  change `shopName` and `tagline`. `open` is `yes` or `no`. The admin page's
  **Close shop / Open shop** button changes it for you.
- **Menu** tab: one row per item. `Type` is `meat` or `add-on`. Prices are plain numbers
  (`6.5`, not `$6.50`). The site picks up changes the next time someone opens it.
- **Orders** tab: don't edit the headers. New orders show up here.

## 3. Put the script online

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy**.
4. Copy the **Web app URL** (it ends in `/exec`).
5. Open `api.js` and paste it in: `const API_URL = 'https://script.google.com/macros/s/.../exec';`

**Changed `Code.gs` later?** Use **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**.
The URL stays the same. (A "New deployment" would give you a new URL.)

## 4. Put the website online (GitHub Pages, free)

1. Push this folder to a GitHub repo.
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. After about a minute, the site is live at `https://<your-username>.github.io/<repo-name>/`.
   - The shop is that link.
   - The admin page is on the same site, not linked anywhere. Get there by **tapping the shop
     name 5 times quickly**, or by adding `admin.html` to the end of the link. It still needs the password.

The site has no secrets in it, so a public repo is fine. The password stays inside the Google script.

## 5. Test it for real

1. Open the shop on your phone and place an order.
2. Check that a row showed up in the **Orders** tab.
3. Open the admin page, enter the code, and tick **Zelled** on the order. Check that the box in
   the Sheet's **Zelled** column is ticked too.
4. Tap **Close shop**, then open the shop page: it should say **Sold out!** Tap **Open shop** again.

## Photo

Swap the drawn panini for a real photo: save it as `panini.jpg` in this folder. Then in
`index.html`, replace the `<figure class="hero-art">…</figure>` block with:

```html
<img class="hero-photo" src="panini.jpg" alt="David's pastrami panini, cut in half">
```

Best photo: the panini cut in half so the layers show, natural light, shot from slightly above.
