// Runs apps-script/Code.gs in a vm with fake Google services.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

// Behaves like Sheets for typed text: a leading ' means "keep as text" and is not part of the
// stored value. `raw` keeps exactly what the script sent, to check the ' was added.
function fakeSheet(rows) {
  const raw = [];
  return {
    rows,
    raw,
    getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
    appendRow: r => {
      raw.push([...r]);
      rows.push([...r].map(v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v))); // [...r]: plain array, not the vm's
    },
    getLastRow: () => rows.length,
    getRange: (row, col) => ({
      getValue: () => (rows[row - 1] || [])[col - 1] ?? '',
      setValue: v => { rows[row - 1][col - 1] = v; },
      insertCheckboxes() { return this; },
    }),
  };
}

function load({ open, deliveryFee, ntfyTopic, fetchFails, oldOrdersTab } = {}) {
  const sheets = {
    Menu: fakeSheet([
      ['Type', 'Name', 'Price'],
      ['main', 'Turkey', 6],
      ['main', 'Pastrami', 7.5],
      ['extra', 'Pickles', 0.5],
      ['extra', 'Extra meat', 2],
    ]),
    Settings: fakeSheet([
      ['Key', 'Value'],
      ['zelleTo', '555-123-4567'],
      ...(open === undefined ? [] : [['open', open]]),
      ...(deliveryFee === undefined ? [] : [['deliveryFee', deliveryFee]]),
      ...(ntfyTopic === undefined ? [] : [['ntfyTopic', ntfyTopic]]),
    ]),
    Orders: fakeSheet([['#', 'Time', 'Name', 'Room', 'Item', 'Extras', 'Qty', 'Total', 'Note', 'Zelled', ...(oldOrdersTab ? [] : ['Completed'])]]),
  };
  const props = { ADMIN_PASSWORD: 'secret-pass' };
  const pushes = [];
  const ctx = {
    SpreadsheetApp: { getActive: () => ({ getSheetByName: n => sheets[n] }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    UrlFetchApp: { fetch: (url, opts) => { if (fetchFails === true) throw new Error('ntfy is down'); pushes.push({ url, ...opts, body: JSON.parse(opts.payload) }); return { getResponseCode: () => (fetchFails === 'http' ? 400 : 200), getContentText: () => '' }; } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ text: s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  const testNotify = () => ctx.testNotify();
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const get = action => JSON.parse(ctx.doGet({ parameter: { action } }).text);
  return { post, get, sheets, pushes, testNotify };
}

const good = { action: 'order', name: 'Avi', delivery: true, room: '204', mains: ['Pastrami'], extras: ['Pickles', 'Extra meat'], qty: 2 };

test('menu comes from the sheet', () => {
  const { get } = load();
  const m = get('menu');
  assert.strictEqual(m.shop.zelleTo, '555-123-4567');
  assert.deepStrictEqual(m.mains.map(x => x.name), ['Turkey', 'Pastrami']);
  assert.deepStrictEqual(m.extras.map(x => x.price), [0.5, 2]);
});

test('order is priced by the server, ignoring a tampered total', () => {
  const { post, sheets } = load();
  const r = post({ ...good, total: 0.01 });
  assert.deepStrictEqual(r, { id: 1, total: 21 }); // (7.5 + 0.5 + 2) * 2, + $1 delivery once
  const row = sheets.Orders.rows[1];
  assert.deepStrictEqual(row.slice(2), ['Avi', '204', 'Pastrami', 'Pickles, Extra meat', 2, 21, '', false, false]);
});

test('several mains go in one item and their prices add up', () => {
  const { post, sheets } = load();
  const r = post({ ...good, mains: ['Turkey', 'Pastrami', 'Turkey'], extras: ['Pickles'], qty: 1 });
  assert.strictEqual(r.total, 15); // 6 + 7.5 + 0.5 (the repeated Turkey counts once) + $1 delivery
  assert.strictEqual(sheets.Orders.rows[1][4], 'Turkey + Pastrami');
});

test('pickup has no fee and needs no room', () => {
  const { post, sheets } = load();
  const r = post({ ...good, delivery: false, room: '', qty: 1 });
  assert.strictEqual(r.total, 10); // 7.5 + 0.5 + 2, no delivery fee
  assert.strictEqual(sheets.Orders.rows[1][3], 'Pickup');
});

test('delivery fee comes from the sheet (default $1) and is shown on the menu', () => {
  assert.strictEqual(load().get('menu').shop.deliveryFee, 1);
  const pricey = load({ deliveryFee: 1.5 });
  assert.strictEqual(pricey.get('menu').shop.deliveryFee, 1.5);
  assert.strictEqual(pricey.post({ ...good, qty: 1 }).total, 11.5); // 10 + 1.5
  assert.strictEqual(load({ deliveryFee: 'abc' }).get('menu').shop.deliveryFee, 1); // junk -> default
});

test('order ids go up', () => {
  const { post } = load();
  assert.strictEqual(post(good).id, 1);
  assert.strictEqual(post(good).id, 2);
});

test('bad orders are rejected and not saved', () => {
  const { post, sheets } = load();
  const bad = [
    { ...good, mains: ['Lobster'] },
    { ...good, mains: [] },
    { ...good, mains: 'Pastrami' },
    { ...good, extras: ['Gold flakes'] },
    { ...good, qty: 0 },
    { ...good, qty: 11 },
    { ...good, qty: 1.5 },
    { ...good, name: '   ' },
    { ...good, room: '' },
  ];
  for (const b of bad) assert.ok(post(b).error, JSON.stringify(b));
  assert.strictEqual(sheets.Orders.rows.length, 1);
});

test('typed text is stored as plain text: no formulas, no number or date guessing', () => {
  const { post, sheets } = load();
  post({ ...good, name: '=HYPERLINK("http://x")', room: '012', note: '3-12' });
  const sent = sheets.Orders.raw[0];
  assert.strictEqual(sent[2], '\'=HYPERLINK("http://x")'); // would run as a formula
  assert.strictEqual(sent[3], "'012"); // would become the number 12
  assert.strictEqual(sent[8], "'3-12"); // would become a date
  assert.strictEqual(sheets.Orders.rows[1][3], '012');
  assert.strictEqual(sent[6], 2); // numbers stay numbers
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
  assert.deepStrictEqual(list.map(o => o.zelled), [false, false]);
  assert.strictEqual(list[1].item, 'Pastrami');
  assert.strictEqual(list[1].extras, 'Pickles, Extra meat');

  assert.ok(post({ action: 'update', password: 'nope', id: 1, zelled: true }).error);
  assert.ok(post({ action: 'update', password: 'secret-pass', id: 99, zelled: true }).error);
  assert.deepStrictEqual(post({ action: 'update', password: 'secret-pass', id: 1, zelled: true }), { ok: true });
  assert.strictEqual(sheets.Orders.rows[1][9], true);
  assert.strictEqual(post({ action: 'list', password: 'secret-pass' }).orders[1].zelled, true);

  post({ action: 'update', password: 'secret-pass', id: 1, zelled: false }); // untick
  assert.strictEqual(sheets.Orders.rows[1][9], false);
});

test('a box ticked by hand in the Sheet reads as zelled', () => {
  const { post, sheets } = load();
  post(good);
  sheets.Orders.rows[1][9] = 'TRUE'; // how a typed TRUE can come back
  assert.strictEqual(post({ action: 'list', password: 'secret-pass' }).orders[0].zelled, true);
});

test("a new order sends a push to the shop's ntfy topic", () => {
  const { post, pushes } = load({ ntfyTopic: ' dmp-orders-k3x9 ' });
  post({ ...good, note: 'no mustard' });
  assert.strictEqual(pushes.length, 1);
  assert.strictEqual(pushes[0].url, 'https://ntfy.sh/');
  assert.strictEqual(pushes[0].body.topic, 'dmp-orders-k3x9');
  assert.strictEqual(pushes[0].body.title, 'Order #1 · Avi');
  assert.strictEqual(pushes[0].body.message, '2 × Pastrami + Pickles, Extra meat\nRoom 204 · $21.00\n“no mustard”');
});

test('pickup orders say Pickup in the push', () => {
  const { post, pushes } = load({ ntfyTopic: 'abc' });
  post({ ...good, delivery: false, extras: [], qty: 1 });
  assert.strictEqual(pushes[0].body.message, '1 × Pastrami\nPickup · $7.50');
});

test('no ntfy topic: no push, order still saved', () => {
  const { post, pushes, sheets } = load();
  assert.strictEqual(post(good).id, 1);
  assert.strictEqual(pushes.length, 0);
  assert.strictEqual(sheets.Orders.rows.length, 2);
});

test('a failed push never loses the order', () => {
  const { post, sheets } = load({ ntfyTopic: 'abc', fetchFails: true });
  assert.deepStrictEqual(post(good), { id: 1, total: 21 });
  assert.strictEqual(sheets.Orders.rows.length, 2);
});

test('no push for an order that was refused', () => {
  const { post, pushes } = load({ ntfyTopic: 'abc', open: 'no' });
  assert.ok(post(good).error);
  assert.strictEqual(pushes.length, 0);
});

test('admin can mark an order completed and undo it, with the password only', () => {
  const { post, sheets } = load();
  post(good);
  const pw = 'secret-pass';
  assert.strictEqual(post({ action: 'list', password: pw }).orders[0].completed, false);
  assert.ok(post({ action: 'update', password: 'nope', id: 1, completed: true }).error);
  assert.deepStrictEqual(post({ action: 'update', password: pw, id: 1, completed: true }), { ok: true });
  assert.strictEqual(sheets.Orders.rows[1][10], true);
  assert.strictEqual(sheets.Orders.rows[1][9], false); // completed without being Zelled is allowed, Zelled untouched
  const o = post({ action: 'list', password: pw }).orders[0];
  assert.deepStrictEqual([o.zelled, o.completed], [false, true]);
  post({ action: 'update', password: pw, id: 1, completed: false });
  assert.strictEqual(sheets.Orders.rows[1][10], false);
});

test('ticking Zelled leaves Completed alone', () => {
  const { post, sheets } = load();
  post(good);
  post({ action: 'update', password: 'secret-pass', id: 1, completed: true });
  post({ action: 'update', password: 'secret-pass', id: 1, zelled: true });
  assert.deepStrictEqual(sheets.Orders.rows[1].slice(9), [true, true]);
});

test('an update with nothing to change is refused', () => {
  const { post } = load();
  post(good);
  assert.ok(post({ action: 'update', password: 'secret-pass', id: 1 }).error);
});

test('an older Orders tab gets the Completed header added; its old rows read as not completed', () => {
  const { post, sheets } = load({ oldOrdersTab: true });
  sheets.Orders.rows.push([1, new Date(), 'Old', '1', 'Turkey', '', 1, 7, '', true]); // a row from before the column existed
  assert.strictEqual(post({ action: 'list', password: 'secret-pass' }).orders[0].completed, false);
  post({ ...good });
  assert.strictEqual(sheets.Orders.rows[0][10], 'Completed');
  post({ action: 'update', password: 'secret-pass', id: 1, completed: true });
  assert.strictEqual(sheets.Orders.rows[1][10], true);
});

test('testNotify fails loudly when ntfy cannot be reached or refuses', () => {
  assert.throws(() => load({ ntfyTopic: 'abc', fetchFails: true }).testNotify(), /FAILED/);
  assert.throws(() => load({ ntfyTopic: 'abc', fetchFails: 'http' }).testNotify(), /FAILED/);
  assert.throws(() => load().testNotify(), /ntfyTopic/);
  const ok = load({ ntfyTopic: 'abc' });
  ok.testNotify();
  assert.strictEqual(ok.pushes.length, 1);
});

test('the public menu never shows the ntfy topic (or any other private setting)', () => {
  const { get, post } = load({ ntfyTopic: 'secret-topic' });
  const m = get('menu');
  assert.deepStrictEqual(Object.keys(m.shop).sort(), ['deliveryFee', 'open', 'zelleTo']);
  assert.ok(!JSON.stringify(m).includes('secret-topic'));
  assert.ok(!JSON.stringify(post({ action: 'list', password: 'secret-pass' })).includes('secret-topic'));
});
