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
