// Runs template/api.js (a plain browser script) in a vm with a fake shop config.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'template', 'api.js'), 'utf8');
const SHOP = { slug: 'test', apiUrl: 'https://example.com', demoMenu: { zelleTo: '', mains: [{ name: 'A', price: 1 }], extras: [] } };

const ctx = { SHOP, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(ctx);
vm.runInContext(CODE, ctx);
const maaser = (...args) => JSON.parse(JSON.stringify(ctx.maaserOf(...args))); // plain object, not the vm's

const now = new Date(2026, 9, 15, 12); // Oct 15 2026, local time
const order = (total, zelled, y, m, d) => ({ total, zelled, time: new Date(y, m, d, 9).toISOString() });

test('maaser is 10% of Zelled sales, this month and all time', () => {
  const orders = [
    order(21, true, 2026, 9, 14),
    order(7.5, true, 2026, 9, 1),
    order(100, false, 2026, 9, 14), // not paid yet: not counted
    order(12, true, 2026, 8, 30), // last month: all time only
    order(5, true, 2025, 9, 15), // same month last year: all time only
  ];
  assert.deepStrictEqual(maaser(orders, now), {
    month: { sales: 28.5, maaser: 2.85 },
    all: { sales: 45.5, maaser: 4.55 },
  });
});

test('maaser rounds to the cent without float drift', () => {
  const orders = [order(0.1, true, 2026, 9, 1), order(0.2, true, 2026, 9, 2), order(6.75, true, 2026, 9, 3)];
  assert.deepStrictEqual(maaser(orders, now).month, { sales: 7.05, maaser: 0.71 }); // 70.5¢ rounds up
});

test('no orders: zero', () => {
  assert.deepStrictEqual(maaser([], now), { month: { sales: 0, maaser: 0 }, all: { sales: 0, maaser: 0 } });
});

const stats = (...args) => JSON.parse(JSON.stringify(ctx.analyticsOf(...args)));
const at = (d, h, extra) => ({ time: new Date(2026, 9, d, h, 15).toISOString(), zelled: false, qty: 1, total: 5, item: 'Turkey', ...extra });

test('analytics: counts, sales, average, unpaid, today and this week', () => {
  const orders = [
    at(15, 12, { zelled: true, total: 10 }),
    at(15, 12, { total: 6 }),
    at(10, 9, { zelled: true, total: 7.5 }),
    at(1, 13, { total: 2.5 }), // more than 7 days ago
  ];
  const s = stats(orders, now);
  assert.strictEqual(s.orders, 4);
  assert.strictEqual(s.sales, 17.5); // Zelled only
  assert.strictEqual(s.average, 6.5); // (10 + 6 + 7.5 + 2.5) / 4, all orders
  assert.strictEqual(s.unpaid, 2);
  assert.strictEqual(s.today, 2);
  assert.strictEqual(s.week, 3);
});

test('analytics: busiest hour and orders per hour', () => {
  const s = stats([at(15, 12), at(14, 12), at(13, 9), at(12, 13)], now);
  assert.strictEqual(s.byHour.length, 24);
  assert.strictEqual(s.byHour[12], 2);
  assert.strictEqual(s.byHour[9], 1);
  assert.strictEqual(s.busiestHour, 12);
});

test('analytics: best sellers count each main by quantity, combined items split', () => {
  const s = stats([
    at(15, 12, { item: 'Turkey + Pastrami', qty: 2 }),
    at(15, 12, { item: 'Pastrami', qty: 1 }),
    at(15, 12, { item: 'Chicken', qty: 1 }),
  ], now);
  assert.deepStrictEqual(s.best, [{ name: 'Pastrami', count: 3 }, { name: 'Turkey', count: 2 }, { name: 'Chicken', count: 1 }]);
});

test('analytics: no orders', () => {
  const s = stats([], now);
  assert.deepStrictEqual([s.orders, s.sales, s.average, s.unpaid, s.busiestHour, s.best.length], [0, 0, 0, 0, null, 0]);
});

// --- Opening hours ---------------------------------------------------------

test('hours are written out for people', () => {
  assert.strictEqual(ctx.timeText('13:30'), '1:30 PM');
  assert.strictEqual(ctx.timeText('09:00'), '9:00 AM');
  assert.strictEqual(ctx.timeText('00:00'), 'midnight');
  assert.strictEqual(ctx.dayText('11:00-00:00'), '11:00 AM – midnight');
  assert.strictEqual(ctx.dayText('closed'), 'Closed');
  assert.strictEqual(ctx.dayText(''), 'Closed');
  assert.strictEqual(ctx.whenText({ day: 3, inDays: 0, time: '11:00' }), 'today at 11:00 AM');
  assert.strictEqual(ctx.whenText({ day: 4, inDays: 1, time: '11:00' }), 'tomorrow at 11:00 AM');
  assert.strictEqual(ctx.whenText({ day: 0, inDays: 3, time: '09:30' }), 'Sunday at 9:30 AM');
  assert.strictEqual(ctx.whenText(null), null);
});

// Demo mode works out open/closed in the browser with the same rules as the Google script.
function demoShop() {
  const store = {};
  const c = { SHOP: { ...SHOP, apiUrl: '' }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  vm.createContext(c);
  vm.runInContext(CODE, c);
  return c;
}
const week = ['11:00-00:00', '11:00-00:00', '11:00-00:00', '11:00-00:00', '11:00-00:00', '09:00-14:00', 'closed'];
const dayAt = (day, h, m = 0) => new Date(2026, 9, 11 + day, h, m); // Oct 11 2026 is a Sunday

test('demo hours: no hours = open; inside / outside / past midnight / closed day', () => {
  const c = demoShop();
  assert.strictEqual(c.demoStatus(dayAt(6, 3)).closedBy, null);
  c.demoHours(week);
  assert.strictEqual(c.demoStatus(dayAt(3, 12)).closedBy, null); // Wed noon
  assert.strictEqual(c.demoStatus(dayAt(3, 10, 59)).closedBy, 'hours');
  assert.strictEqual(c.demoStatus(dayAt(4, 0)).closedBy, 'hours'); // midnight close
  const fri = c.demoStatus(dayAt(5, 14));
  assert.strictEqual(fri.closedBy, 'hours');
  assert.deepStrictEqual({ ...fri.nextOpen }, { day: 0, inDays: 2, time: '11:00' });
  c.demoHours(week.map((h, i) => (i === 3 ? '18:00-01:00' : h)));
  assert.strictEqual(c.demoStatus(dayAt(4, 0, 59)).closedBy, null); // still Wednesday night
  c.demoOpen(false);
  assert.strictEqual(c.demoStatus(dayAt(4, 0, 59)).closedBy, 'switch'); // the Close button wins
});
