// Builds every shop in shops/<slug>/ into docs/<slug>/, which GitHub Pages serves.
//
//   node build.js              rebuild every shop (run after any change, then commit docs/)
//   node build.js new <slug>   start a new shop from template/shop.example.json
//
// Shared code goes to docs/assets/ once; each shop gets its own pages, config.js and picture.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const TEMPLATE = path.join(ROOT, 'template');
const SHOPS = path.join(ROOT, 'shops');
const SHARED = ['style.css', 'api.js', 'shop.js', 'admin.js'];
const PAGES = ['index.html', 'admin.html'];

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Swaps each {{key}} for the shop's value. A missing key is an error, not a blank on the live site.
function fill(html, shop) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in shop)) throw new Error(`shops/${shop.slug}/shop.json is missing "${key}"`);
    return escapeHtml(shop[key]);
  });
}

function build(out = path.join(ROOT, 'docs')) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  for (const file of SHARED) fs.copyFileSync(path.join(TEMPLATE, file), path.join(out, 'assets', file));
  fs.writeFileSync(path.join(out, '.nojekyll'), ''); // tell GitHub Pages to serve files as-is

  const slugs = fs.readdirSync(SHOPS).filter(f => fs.statSync(path.join(SHOPS, f)).isDirectory());
  for (const slug of slugs) {
    const dir = path.join(SHOPS, slug);
    const shop = { ...JSON.parse(fs.readFileSync(path.join(dir, 'shop.json'), 'utf8')), slug };
    const dest = path.join(out, slug);
    fs.mkdirSync(dest);
    for (const page of PAGES) {
      fs.writeFileSync(path.join(dest, page), fill(fs.readFileSync(path.join(TEMPLATE, page), 'utf8'), shop));
    }
    fs.writeFileSync(path.join(dest, 'config.js'), `const SHOP = ${JSON.stringify(shop, null, 2)};\n`);
    for (const file of fs.readdirSync(dir)) {
      if (file !== 'shop.json') fs.copyFileSync(path.join(dir, file), path.join(dest, file));
    }
  }
  return slugs;
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
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { build, fill, newShop };
