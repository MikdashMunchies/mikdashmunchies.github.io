// Builds every shop in shops/<slug>/ into docs/<slug>/, which GitHub Pages serves.
//
//   node build.js              rebuild every shop (run after any change, then commit docs/)
//   node build.js new <slug>   start a new shop from template/shop.example.json
//
// Shared code goes to docs/assets/ once; each shop gets its own pages, config.js and picture.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const TEMPLATE = path.join(ROOT, 'template');
const SHOPS = path.join(ROOT, 'shops');
const SHARED = ['style.css', 'api.js', 'shop.js', 'admin.js'];
const PAGES = ['index.html', 'admin.html'];

// Text output is always written with LF line endings: Windows git can leave CRLF on disk, and
// the built site must not change depending on which machine (or checkout) built it.
const TEXT = /\.(html|js|css|svg|json|txt)$/i;
const lf = text => text.replace(/\r\n/g, '\n');
const copy = (from, to) => (TEXT.test(from) ? fs.writeFileSync(to, lf(fs.readFileSync(from, 'utf8'))) : fs.copyFileSync(from, to));

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Swaps each {{key}} for the shop's value. A missing key is an error, not a blank on the live site.
function fill(html, shop) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in shop)) throw new Error(`shops/${shop.slug}/shop.json is missing "${key}"`);
    return escapeHtml(shop[key]);
  });
}

const SITE = 'https://mikdashmunchies.github.io';

function loadShops() {
  return fs.readdirSync(SHOPS)
    .filter(f => fs.statSync(path.join(SHOPS, f)).isDirectory())
    .map(slug => ({ ...JSON.parse(fs.readFileSync(path.join(SHOPS, slug, 'shop.json'), 'utf8')), slug }));
}

// Only a plain hex color may go into a style attribute; anything else falls back to the default.
const color = (value, fallback) => (/^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback);

function homeCard(shop) {
  const e = escapeHtml;
  const art = shop.image ? `<span class="shop-card-art"><img src="${e(shop.slug)}/${e(shop.image)}" alt=""></span>` : '';
  return `      <li><a class="shop-card" href="${e(shop.slug)}/" style="--card-accent: ${color(shop.accent, '#D2341B')}; --card-highlight: ${color(shop.highlight, '#FFC233')}">
        ${art}<span class="shop-card-name">${e(shop.name)}</span>
        <span class="shop-card-tagline">${e(shop.tagline)}</span>
        <span class="shop-card-go">Order now</span>
      </a></li>`;
}

function build(out = path.join(ROOT, 'docs')) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  for (const file of SHARED) copy(path.join(TEMPLATE, file), path.join(out, 'assets', file));
  // Browsers keep shared CSS/JS for a while (GitHub Pages: ~10 min). A fingerprint of each file's
  // content in its link changes with every edit, so visitors get the new version right away.
  const version = Object.fromEntries(SHARED.map(file => [file,
    crypto.createHash('sha1').update(fs.readFileSync(path.join(out, 'assets', file))).digest('hex').slice(0, 10)]));
  const stamp = html => html.replace(/assets\/([\w.]+)"/g, (whole, file) => (version[file] ? `assets/${file}?v=${version[file]}"` : whole));
  fs.writeFileSync(path.join(out, '.nojekyll'), ''); // tell GitHub Pages to serve files as-is

  const shops = loadShops();
  for (const shop of shops) {
    const dir = path.join(SHOPS, shop.slug);
    const dest = path.join(out, shop.slug);
    fs.mkdirSync(dest);
    for (const page of PAGES) {
      fs.writeFileSync(path.join(dest, page), stamp(fill(lf(fs.readFileSync(path.join(TEMPLATE, page), 'utf8')), shop)));
    }
    fs.writeFileSync(path.join(dest, 'config.js'), `const SHOP = ${JSON.stringify(shop, null, 2)};\n`);
    for (const file of fs.readdirSync(dir)) {
      if (file !== 'shop.json') copy(path.join(dir, file), path.join(dest, file));
    }
  }
  // The MikdashMunchies home page lists every shop.
  const home = lf(fs.readFileSync(path.join(TEMPLATE, 'home.html'), 'utf8'));
  fs.writeFileSync(path.join(out, 'index.html'), stamp(home.replace('<!-- SHOPS -->', shops.map(homeCard).join('\n'))));
  return shops.map(s => s.slug);
}

// README.md (the repo's front page on GitHub) is generated too, so the link list never goes stale.
function readme() {
  const rows = loadShops().map(s => `| ${s.name} | ${SITE}/${s.slug}/ | ${SITE}/${s.slug}/admin.html | [qr/${s.slug}.png](qr/${s.slug}.png) |`);
  return [
    '# MikdashMunchies',
    '',
    'Food-ordering websites for student sellers: delivery or pickup, pay with Zelle.',
    '',
    `**Home page (all shops):** ${SITE}/`,
    '',
    '| Shop | Order link | Admin page (code 1234) | QR code |',
    '|---|---|---|---|',
    ...rows,
    '',
    'Add a shop: see [SETUP.md](SETUP.md). Notes for maintainers: [CLAUDE.md](CLAUDE.md).',
    '',
    '<!-- This file is generated by `node build.js` from shops/*/shop.json. Edit build.js, not this file. -->',
    '',
  ].join('\n');
}

function newShop(slug) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug || '')) {
    throw new Error('Give the shop a short web name like: node build.js new sarahs-cookies');
  }
  const dir = path.join(SHOPS, slug);
  if (fs.existsSync(dir)) throw new Error(`shops/${slug} already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE, 'shop.example.json'), path.join(dir, 'shop.json'));
  return dir;
}

if (require.main === module) {
  try {
    const [command, arg] = process.argv.slice(2);
    if (command === 'new') {
      newShop(arg);
      console.log(`Created shops/${arg}/shop.json. Fill it in, add a picture, then run: node build.js`);
    } else {
      for (const slug of build()) console.log(`built docs/${slug}/`);
      fs.writeFileSync(path.join(ROOT, 'README.md'), readme());
      console.log('built docs/index.html (home page) and README.md');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { build, fill, newShop, readme };
