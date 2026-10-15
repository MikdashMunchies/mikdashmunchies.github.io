// Checks build.js turns shops/<slug>/shop.json + template/ into working pages.
// Run: node --test tests/build.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { build, fill } = require('../build.js');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

function tempBuild() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shops-'));
  build(out);
  return out;
}

test('fills blanks and escapes them so a name cannot inject HTML', () => {
  const html = fill('<h1>{{name}}</h1>', { slug: 'x', name: `<script>alert(1)</script> & Sam's` });
  assert.strictEqual(html, '<h1>&lt;script&gt;alert(1)&lt;/script&gt; &amp; Sam&#39;s</h1>');
});

test('a missing setting stops the build instead of leaving a blank', () => {
  assert.throws(() => fill('{{tagline}}', { slug: 'x', name: 'A' }), /shops\/x\/shop.json is missing "tagline"/);
});

test("the example shop has every setting the pages need", () => {
  const example = { ...JSON.parse(read(ROOT, 'template', 'shop.example.json')), slug: 'example' };
  for (const page of ['index.html', 'admin.html']) {
    assert.doesNotThrow(() => fill(read(ROOT, 'template', page), example), page);
  }
});

test("David's shop builds into working pages", () => {
  const out = tempBuild();
  const shop = path.join(out, 'davids-paninis');
  const index = read(shop, 'index.html');
  assert.ok(!index.includes('{{'), 'no blanks left');
  assert.match(index, /<title>David&#39;s Meat Paninis<\/title>/);
  assert.match(index, /Pick your meat/);
  assert.match(index, /src="panini.svg"/);
  assert.ok(fs.existsSync(path.join(shop, 'panini.svg')));
  assert.ok(!fs.existsSync(path.join(shop, 'shop.json')), 'raw settings file is not copied');
  for (const f of ['style.css', 'api.js', 'shop.js', 'admin.js']) assert.ok(fs.existsSync(path.join(out, 'assets', f)), f);

  const ctx = {};
  vm.runInNewContext(read(shop, 'config.js') + '\nthis.SHOP = SHOP;', ctx);
  assert.strictEqual(ctx.SHOP.slug, 'davids-paninis');
  assert.strictEqual(ctx.SHOP.item, 'panini');
});

// Browsers keep old CSS/JS for a while; a fingerprint that changes with the file forces a fresh copy.
test('pages load shared files with a fingerprint that matches their content', () => {
  const crypto = require('node:crypto');
  const out = tempBuild();
  const pages = [read(out, 'index.html'), read(out, 'davids-paninis', 'index.html'), read(out, 'davids-paninis', 'admin.html')];
  let checked = 0;
  for (const html of pages) {
    for (const [, file, v] of html.matchAll(/assets\/([\w.]+)\?v=(\w+)/g)) {
      const hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(out, 'assets', file))).digest('hex').slice(0, 10);
      assert.strictEqual(v, hash, `${file} fingerprint`);
      checked++;
    }
    assert.ok(!/assets\/[\w.]+"/.test(html), 'no shared file loaded without a fingerprint');
  }
  assert.ok(checked >= 5, `checked ${checked} links`);
});

test('the home page links every shop, with names escaped', () => {
  const out = tempBuild();
  const home = read(out, 'index.html');
  const slugs = fs.readdirSync(path.join(ROOT, 'shops'));
  assert.ok(slugs.length >= 1);
  for (const slug of slugs) {
    assert.match(home, new RegExp(`href="${slug}/"`), `home page links ${slug}`);
  }
  assert.match(home, /David&#39;s Meat Paninis/);
  assert.ok(!home.includes('<!-- SHOPS -->'), 'placeholder was filled');
});

test('README.md lists every shop (run `node build.js` if this fails)', () => {
  const { readme } = require('../build.js');
  assert.strictEqual(read(ROOT, 'README.md').replace(/\r\n/g, '\n'), readme());
  for (const slug of fs.readdirSync(path.join(ROOT, 'shops'))) {
    assert.ok(readme().includes(`https://mikdashmunchies.github.io/${slug}/`), slug);
  }
});

test('the sellers page (features + pricing) is built as a full page and linked from the README', () => {
  const out = tempBuild();
  const html = read(out, 'sellers', 'index.html');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>MikdashMunchies for Sellers<\/title>/);
  assert.ok(html.indexOf('</head>') < html.indexOf('<main'), 'styles in the head, content in the body');
  assert.match(html, /<\/main>\s*<\/body>\s*<\/html>\s*$/);
  const { readme } = require('../build.js');
  assert.ok(readme().includes('https://mikdashmunchies.github.io/sellers/'));
});

// Windows git can leave source files with CRLF on disk; the built site must be LF either way,
// or docs/ "changes" depending on which machine built it.
test('built files always use plain LF line endings', () => {
  const out = tempBuild();
  const files = fs.readdirSync(out, { recursive: true }).map(f => path.join(out, f))
    .filter(f => fs.statSync(f).isFile() && /\.(html|js|css|svg)$/.test(f));
  const withCR = files.filter(f => fs.readFileSync(f).includes(13)); // 13 = '\r'
  assert.deepStrictEqual(withCR.map(f => path.relative(out, f)), []);
});

// The live site is docs/. If someone edits template/ or shops/ and forgets `node build.js`,
// the site would silently stay old. This catches that.
test('docs/ matches a fresh build (run `node build.js` if this fails)', () => {
  const out = tempBuild();
  const list = dir => fs.readdirSync(dir, { recursive: true }).map(f => f.replace(/\\/g, '/')).sort();
  const docs = path.join(ROOT, 'docs');
  assert.deepStrictEqual(list(docs), list(out));
  for (const f of list(out)) {
    if (fs.statSync(path.join(out, f)).isFile()) {
      assert.ok(fs.readFileSync(path.join(docs, f)).equals(fs.readFileSync(path.join(out, f))), `docs/${f} is out of date`);
    }
  }
});
