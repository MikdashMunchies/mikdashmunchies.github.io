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
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getValue: () => (rows[row - 1] || [])[col - 1] ?? '',
      setValue: v => { rows[row - 1][col - 1] = v; },
      setValues: values => {
        raw.push(...values.map(r => [...r]));
        values.forEach((r, i) => {
          rows[row - 1 + i] = rows[row - 1 + i] || [];
          r.forEach((v, j) => { rows[row - 1 + i][col - 1 + j] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v; });
        });
      },
      clearContent: () => {
        for (let i = row - 1; i < row - 1 + numRows && i < rows.length; i++) for (let j = col - 1; j < col - 1 + numCols; j++) rows[i][j] = '';
        while (rows.length > 1 && rows[rows.length - 1].every(v => v === '' || v === undefined)) rows.pop(); // like Sheets' data range
      },
      insertCheckboxes() { return this; },
    }),
  };
}

function load({ menuRows, open, deliveryFee, chatIds, emails, mailFails, token = 'TOKEN123', fetchFails, oldOrdersTab, updates = [] } = {}) {
  const sheets = {
    Menu: fakeSheet(menuRows || [
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
      ...(chatIds === undefined ? [] : [['telegramChatId', chatIds]]),
      ...(emails === undefined ? [] : [['notifyEmail', emails]]),
    ]),
    Orders: fakeSheet([['#', 'Time', 'Name', 'Room', 'Item', 'Extras', 'Qty', 'Total', 'Note', 'Zelled', ...(oldOrdersTab ? [] : ['Completed'])]]),
  };
  const props = { ADMIN_PASSWORD: 'secret-pass', ...(token ? { TELEGRAM_TOKEN: token } : {}) };
  const sent = [];
  const mails = [];
  const logs = [];
  const ctx = {
    SpreadsheetApp: { getActive: () => ({ getSheetByName: n => sheets[n] }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    UrlFetchApp: {
      fetch: (url, opts = {}) => {
        // Like a real network error, the message names the URL, and so the token.
        if (fetchFails === true) throw new Error('Address unavailable: ' + url);
        const reply = body => ({ getResponseCode: () => (fetchFails === 'http' ? 400 : 200), getContentText: () => JSON.stringify(body) });
        if (url.endsWith('/getUpdates')) return reply({ ok: true, result: updates });
        sent.push({ url, ...opts, body: JSON.parse(opts.payload) });
        return reply({ ok: fetchFails !== 'http' });
      },
    },
    MailApp: { sendEmail: m => { if (mailFails) throw new Error('Service invoked too many times for one day: email.'); mails.push({ ...m }); } },
    console: { log: m => logs.push(String(m)), error: m => logs.push(String(m)) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ text: s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  const testNotify = () => ctx.testNotify();
  const telegramChats = () => ctx.telegramChats();
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const get = action => JSON.parse(ctx.doGet({ parameter: { action } }).text);
  return { post, get, sheets, sent, mails, logs, testNotify, telegramChats };
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

test('a new order sends a Telegram message to every chat listed for the shop', () => {
  const { post, sent } = load({ chatIds: ' 111, 222 ' });
  post({ ...good, note: 'no mustard' });
  assert.deepStrictEqual(sent.map(m => m.body.chat_id), ['111', '222']);
  assert.strictEqual(sent[0].url, 'https://api.telegram.org/botTOKEN123/sendMessage');
  assert.strictEqual(sent[0].body.text, 'New order #1 · Avi\n2 × Pastrami + Pickles, Extra meat\nRoom 204 · $21.00\n“no mustard”');
});

test('pickup orders say Pickup in the message', () => {
  const { post, sent } = load({ chatIds: '111' });
  post({ ...good, delivery: false, extras: [], qty: 1 });
  assert.strictEqual(sent[0].body.text, 'New order #1 · Avi\n1 × Pastrami\nPickup · $7.50');
});

test('no chat id or no bot token: no message, order still saved', () => {
  for (const opts of [{}, { chatIds: '111', token: null }]) {
    const { post, sent, sheets } = load(opts);
    assert.strictEqual(post(good).id, 1);
    assert.strictEqual(sent.length, 0);
    assert.strictEqual(sheets.Orders.rows.length, 2);
  }
});

test('a failed message never loses the order, and the bot token never reaches the log', () => {
  const { post, sheets, logs } = load({ chatIds: '111', fetchFails: true });
  assert.deepStrictEqual(post(good), { id: 1, total: 21 });
  assert.strictEqual(sheets.Orders.rows.length, 2);
  assert.ok(logs.some(l => /Telegram failed/.test(l)));
  assert.ok(!logs.join('\n').includes('TOKEN123'));
});

test('no message for an order that was refused', () => {
  const { post, sent } = load({ chatIds: '111', open: 'no' });
  assert.ok(post(good).error);
  assert.strictEqual(sent.length, 0);
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

test('testNotify fails loudly when Telegram refuses or is not set up', () => {
  assert.throws(() => load({ chatIds: '111', fetchFails: true }).testNotify(), /FAILED/);
  assert.throws(() => load({ chatIds: '111', fetchFails: 'http' }).testNotify(), /FAILED/);
  assert.throws(() => load({ chatIds: '111', token: null }).testNotify(), /TELEGRAM_TOKEN/);
  assert.throws(() => load().testNotify(), /telegramChatId/);
  const ok = load({ chatIds: '111' });
  ok.testNotify();
  assert.strictEqual(ok.sent.length, 1);
});

test('telegramChats lists who pressed Start, once each', () => {
  const msg = (id, first, username) => ({ message: { chat: { id, first_name: first, username } } });
  const { telegramChats, logs } = load({ updates: [msg(111, 'David', 'dmp'), msg(111, 'David', 'dmp'), msg(222, 'Ethan')] });
  telegramChats();
  const out = logs.join('\n');
  assert.match(out, /111.*David.*@dmp/);
  assert.match(out, /222.*Ethan/);
  assert.strictEqual(out.match(/111/g).length, 1);
});

test('the public menu never shows the Telegram chat ids (or any other private setting)', () => {
  const { get, post } = load({ chatIds: 'secret-topic' });
  const m = get('menu');
  assert.deepStrictEqual(Object.keys(m.shop).sort(), ['deliveryFee', 'open', 'zelleTo']);
  assert.ok(!JSON.stringify(m).includes('secret-topic'));
  assert.ok(!JSON.stringify(post({ action: 'list', password: 'secret-pass' })).includes('secret-topic'));
});

test('a new order emails every address in notifyEmail, in one email', () => {
  const { post, mails } = load({ emails: ' eli@example.com, ethan@example.com ,not-an-email' });
  post({ ...good, note: 'no mustard' });
  assert.strictEqual(mails.length, 1);
  assert.strictEqual(mails[0].to, 'eli@example.com,ethan@example.com');
  assert.strictEqual(mails[0].subject, 'New order #1 · Avi');
  assert.strictEqual(mails[0].body, '2 × Pastrami + Pickles, Extra meat\nRoom 204 · $21.00\n“no mustard”');
});

test('email and Telegram both go out when both are set; neither set sends nothing', () => {
  const both = load({ emails: 'eli@example.com', chatIds: '111' });
  both.post(good);
  assert.deepStrictEqual([both.mails.length, both.sent.length], [1, 1]);
  const none = load();
  none.post(good);
  assert.deepStrictEqual([none.mails.length, none.sent.length], [0, 0]);
});

test('a failed email (e.g. daily quota) never loses the order and still lets Telegram go', () => {
  const { post, sheets, sent, logs } = load({ emails: 'eli@example.com', chatIds: '111', mailFails: true });
  assert.deepStrictEqual(post(good), { id: 1, total: 21 });
  assert.strictEqual(sheets.Orders.rows.length, 2);
  assert.strictEqual(sent.length, 1);
  assert.ok(logs.some(l => /Email failed/.test(l)));
});

test('testNotify works with email only, and fails loudly when the email fails', () => {
  const ok = load({ emails: 'eli@example.com', token: null });
  ok.testNotify();
  assert.strictEqual(ok.mails.length, 1);
  assert.throws(() => load({ emails: 'eli@example.com', mailFails: true }).testNotify(), /FAILED/);
});

test('the public menu never shows notifyEmail', () => {
  const { get } = load({ emails: 'eli@example.com' });
  assert.ok(!JSON.stringify(get('menu')).includes('eli@example.com'));
});

const PW = 'secret-pass';
const item = (type, name, price, sale = '') => ({ type, name, price, sale });

test('a sale price is what the menu shows and what the order is charged; the regular price is kept as "was"', () => {
  const { get, post } = load({ menuRows: [
    ['Type', 'Name', 'Price', 'Sale price'],
    ['main', 'Turkey', 6, ''],
    ['main', 'Pastrami', 7.5, 5.5],
    ['extra', 'Pickles', 0.5, ''],
  ] });
  const m = get('menu');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.mains)), [{ name: 'Turkey', price: 6 }, { name: 'Pastrami', price: 5.5, was: 7.5 }]);
  assert.strictEqual(post({ ...good, extras: ['Pickles'], qty: 2 }).total, 13); // (5.5 + 0.5) * 2 + $1 delivery
});

test('a sale price that is not lower than the price is ignored', () => {
  const { get } = load({ menuRows: [['Type', 'Name', 'Price', 'Sale price'], ['main', 'Turkey', 6, 6], ['main', 'Ham', 5, 'abc']] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(get('menu').mains)), [{ name: 'Turkey', price: 6 }, { name: 'Ham', price: 5 }]);
});

test('admin saves the whole menu: names, prices, sale prices, new and removed items', () => {
  const { post, get, sheets } = load(); // old 3-column Menu tab: the Sale price header gets added
  const r = post({ action: 'saveMenu', password: PW, items: [
    item('main', ' Turkey ', 6.5), item('main', 'Roast beef', 8, 6.75), item('extra', '=HACK()', 1),
  ] });
  assert.deepStrictEqual(r, { ok: true });
  assert.deepStrictEqual(sheets.Menu.rows, [
    ['Type', 'Name', 'Price', 'Sale price', 'Sold out'],
    ['main', 'Turkey', 6.5, '', false],
    ['main', 'Roast beef', 8, 6.75, false],
    ['extra', '=HACK()', 1, '', false],
  ]);
  assert.ok(sheets.Menu.raw.some(row => row[1] === "'=HACK()"), 'names are written as plain text, never formulas');
  const m = get('menu');
  assert.deepStrictEqual(m.mains.map(x => [x.name, x.price, x.was]), [['Turkey', 6.5, undefined], ['Roast beef', 6.75, 8]]);
  assert.ok(!m.mains.some(x => x.name === 'Pastrami')); // removed
});

test('saving the menu needs the password', () => {
  const { post, sheets } = load();
  const before = JSON.stringify(sheets.Menu.rows);
  assert.match(post({ action: 'saveMenu', password: 'nope', items: [item('main', 'Free', 0)] }).error, /password/i);
  assert.strictEqual(JSON.stringify(sheets.Menu.rows), before);
});

test('a bad menu is refused and nothing is changed', () => {
  const bad = [
    [[], /at least one/i],
    [[item('extra', 'Pickles', 1)], /at least one/i],
    [[item('main', '', 5)], /name/i],
    [[item('main', 'A'.repeat(41), 5)], /name/i],
    [[item('main', 'Turkey', 5), item('main', 'turkey', 6)], /twice/i],
    [[item('main', 'Turkey', -1)], /price/i],
    [[item('main', 'Turkey', 1000)], /price/i],
    [[item('main', 'Turkey', 'abc')], /price/i],
    [[item('main', 'Turkey', 5, 5)], /lower/i],
    [[item('main', 'Turkey', 5, -1)], /sale/i],
    [[item('soup', 'Turkey', 5)], /type/i],
    ['not a list', /at least one/i],
    [Array.from({ length: 61 }, (_, i) => item('main', 'Item ' + i, 1)), /60/],
  ];
  for (const [items, message] of bad) {
    const { post, sheets } = load();
    const before = JSON.stringify(sheets.Menu.rows);
    const r = post({ action: 'saveMenu', password: PW, items });
    assert.match(r.error || '', message, JSON.stringify(items).slice(0, 80));
    assert.strictEqual(JSON.stringify(sheets.Menu.rows), before);
  }
});

test('a sold-out item shows as sold out on the menu and cannot be ordered', () => {
  const { get, post, sheets } = load({ menuRows: [
    ['Type', 'Name', 'Price', 'Sale price', 'Sold out'],
    ['main', 'Turkey', 6, '', true],
    ['main', 'Pastrami', 7.5, '', ''],
    ['extra', 'Pickles', 0.5, '', 'TRUE'],
  ] });
  const m = get('menu');
  assert.deepStrictEqual(m.mains.map(x => [x.name, !!x.soldOut]), [['Turkey', true], ['Pastrami', false]]);
  assert.strictEqual(m.extras[0].soldOut, true);
  assert.match(post({ ...good, mains: ['Turkey'], extras: [] }).error, /Turkey.*sold out/i);
  assert.match(post({ ...good, mains: ['Pastrami'], extras: ['Pickles'] }).error, /Pickles.*sold out/i);
  assert.strictEqual(sheets.Orders.rows.length, 1); // nothing saved
  assert.strictEqual(post({ ...good, mains: ['Pastrami'], extras: [] }).id, 1);
});

test('admin marks items sold out (and back) with saveMenu', () => {
  const { post, get, sheets } = load();
  post({ action: 'saveMenu', password: PW, items: [
    { type: 'main', name: 'Turkey', price: 6, sale: '', soldOut: true },
    { type: 'main', name: 'Pastrami', price: 7.5, sale: '', soldOut: false },
  ] });
  assert.deepStrictEqual(sheets.Menu.rows[0], ['Type', 'Name', 'Price', 'Sale price', 'Sold out']);
  assert.deepStrictEqual(sheets.Menu.rows.slice(1).map(r => r[4]), [true, false]);
  assert.deepStrictEqual(get('menu').mains.map(x => !!x.soldOut), [true, false]);
  post({ action: 'saveMenu', password: PW, items: [{ type: 'main', name: 'Turkey', price: 6, sale: '', soldOut: false }] });
  assert.strictEqual(get('menu').mains[0].soldOut, undefined);
});
