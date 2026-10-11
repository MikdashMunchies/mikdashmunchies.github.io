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
