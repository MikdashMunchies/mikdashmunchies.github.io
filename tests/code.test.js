// Runs apps-script/Code.gs in a vm with fake Google services.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

function fakeSheet(rows) {
  return {
    rows,
    getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
    appendRow: r => rows.push([...r]),
    getRange: (row, col) => ({ setValue: v => { rows[row - 1][col - 1] = v; } }),
  };
}

function load({ open } = {}) {
  const sheets = {
    Menu: fakeSheet([
      ['Type', 'Name', 'Price'],
      ['meat', 'Turkey', 6],
      ['meat', 'Pastrami', 7.5],
      ['add-on', 'Pickles', 0.5],
      ['add-on', 'Extra meat', 2],
    ]),
    Settings: fakeSheet([
      ['Key', 'Value'],
      ['shopName', "David's Meat Paninis"],
      ['tagline', 'Hot off the press'],
      ['zelleTo', '555-123-4567'],
      ...(open === undefined ? [] : [['open', open]]),
    ]),
    Orders: fakeSheet([['#', 'Time', 'Name', 'Room', 'Meat', 'Add-ons', 'Qty', 'Total', 'Note', 'Status']]),
  };
  const props = { ADMIN_PASSWORD: 'secret-pass' };
  const ctx = {
    SpreadsheetApp: { getActive: () => ({ getSheetByName: n => sheets[n] }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ text: s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const get = action => JSON.parse(ctx.doGet({ parameter: { action } }).text);
  return { post, get, sheets };
}

const good = { action: 'order', name: 'Avi', room: '204', meat: 'Pastrami', addons: ['Pickles', 'Extra meat'], qty: 2 };

test('menu comes from the sheet', () => {
  const { get } = load();
  const m = get('menu');
  assert.strictEqual(m.shop.shopName, "David's Meat Paninis");
  assert.strictEqual(m.shop.zelleTo, '555-123-4567');
  assert.deepStrictEqual(m.meats.map(x => x.name), ['Turkey', 'Pastrami']);
  assert.deepStrictEqual(m.addons.map(x => x.price), [0.5, 2]);
});

test('order is priced by the server, ignoring a tampered total', () => {
  const { post, sheets } = load();
  const r = post({ ...good, total: 0.01 });
  assert.deepStrictEqual(r, { id: 1, total: 20 }); // (7.5 + 0.5 + 2) * 2
  const row = sheets.Orders.rows[1];
  assert.deepStrictEqual(row.slice(2), ['Avi', '204', 'Pastrami', 'Pickles, Extra meat', 2, 20, '', 'Pending payment']);
});

test('order ids go up', () => {
  const { post } = load();
  assert.strictEqual(post(good).id, 1);
  assert.strictEqual(post(good).id, 2);
});

test('bad orders are rejected and not saved', () => {
  const { post, sheets } = load();
  const bad = [
    { ...good, meat: 'Lobster' },
    { ...good, addons: ['Gold flakes'] },
    { ...good, qty: 0 },
    { ...good, qty: 11 },
    { ...good, qty: 1.5 },
    { ...good, name: '   ' },
    { ...good, room: '' },
  ];
  for (const b of bad) assert.ok(post(b).error, JSON.stringify(b));
  assert.strictEqual(sheets.Orders.rows.length, 1);
});

test('formula-looking text is escaped before it reaches the sheet', () => {
  const { post, sheets } = load();
  post({ ...good, name: '=HYPERLINK("http://x")', note: '+1 extra' });
  const row = sheets.Orders.rows[1];
  assert.strictEqual(row[2], '\'=HYPERLINK("http://x")');
  assert.strictEqual(row[8], "'+1 extra");
});

test('shop is open unless the sheet says no', () => {
  assert.strictEqual(load().get('menu').shop.open, true); // no "open" row at all
  assert.strictEqual(load({ open: 'yes' }).get('menu').shop.open, true);
  assert.strictEqual(load({ open: 'no' }).get('menu').shop.open, false);
  assert.strictEqual(load({ open: false }).get('menu').shop.open, false); // a Sheets checkbox
});

test('a closed shop refuses orders and saves nothing', () => {
  const { post, sheets } = load({ open: 'no' });
  assert.match(post(good).error, /sold out/i);
  assert.strictEqual(sheets.Orders.rows.length, 1);
});

test('admin can close and reopen the shop, with the password only', () => {
  const { post, get, sheets } = load();
  assert.ok(post({ action: 'setOpen', password: 'nope', open: false }).error);
  assert.strictEqual(get('menu').shop.open, true);

  assert.deepStrictEqual(post({ action: 'setOpen', password: 'secret-pass', open: false }), { ok: true, open: false });
  assert.strictEqual(get('menu').shop.open, false);
  assert.strictEqual(post({ action: 'list', password: 'secret-pass' }).open, false);
  assert.ok(post(good).error);

  post({ action: 'setOpen', password: 'secret-pass', open: true });
  assert.strictEqual(get('menu').shop.open, true);
  assert.strictEqual(post(good).id, 1);
  assert.strictEqual(sheets.Settings.rows.filter(r => r[0] === 'open').length, 1); // reuses the row
});

test('admin list and update need the right password', () => {
  const { post, sheets } = load();
  post(good);
  post({ ...good, name: 'Ben' });
  assert.ok(post({ action: 'list', password: 'nope' }).error);
  assert.ok(post({ action: 'list' }).error);

  const list = post({ action: 'list', password: 'secret-pass' }).orders;
  assert.deepStrictEqual(list.map(o => o.name), ['Ben', 'Avi']); // newest first

  assert.ok(post({ action: 'update', password: 'nope', id: 1, status: 'Paid' }).error);
  assert.ok(post({ action: 'update', password: 'secret-pass', id: 1, status: 'Free' }).error);
  assert.deepStrictEqual(post({ action: 'update', password: 'secret-pass', id: 1, status: 'Paid' }), { ok: true });
  assert.strictEqual(sheets.Orders.rows[1][9], 'Paid');
});
