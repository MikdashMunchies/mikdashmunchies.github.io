// SHOP comes from the shop's config.js, which build.js writes from shops/<slug>/shop.json.
// With no apiUrl the site runs in demo mode: the shop's demoMenu, nothing is saved.
const API_URL = SHOP.apiUrl;
const DEMO = !API_URL;

const money = n => '$' + Number(n).toFixed(2);

// Display-only price. The real charge is worked out by the Google script.
function priceOf(menu, sel) {
  const cents = p => Math.round(p * 100);
  const picked = [...menu.mains.filter(m => sel.mains.includes(m.name)), ...menu.extras.filter(x => sel.extras.includes(x.name))];
  const fee = sel.delivery ? cents(menu.shop.deliveryFee) : 0; // once per order, like the Google script
  return (picked.reduce((s, x) => s + cents(x.price), 0) * sel.qty + fee) / 100;
}

// Maaser = 10% of Zelled sales (Ethan, 2026-10-15: of sales, not profit; delivery fees count).
// Unpaid orders aren't money yet. Cents, so many small orders never add up to $X.0000001.
function maaserOf(orders, now = new Date()) {
  const paid = orders.filter(o => o.zelled);
  const thisMonth = o => { const d = new Date(o.time); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); };
  const sum = list => {
    const cents = list.reduce((s, o) => s + Math.round(Number(o.total) * 100), 0);
    return { sales: cents / 100, maaser: Math.round(cents / 10) / 100 };
  };
  return { month: sum(paid.filter(thisMonth)), all: sum(paid) };
}

// Numbers for the admin Analytics tab, from the same order list the table shows.
// Hours and days are the viewer's local time. Best sellers count mains only (extras are add-ons).
function analyticsOf(orders, now = new Date()) {
  const cents = n => Math.round(Number(n) * 100);
  const when = o => new Date(o.time);
  const byHour = Array(24).fill(0);
  const sold = {};
  orders.forEach(o => {
    const d = when(o);
    if (!isNaN(d)) byHour[d.getHours()]++;
    String(o.item || '').split(' + ').filter(Boolean).forEach(name => { sold[name] = (sold[name] || 0) + Number(o.qty || 1); });
  });
  const peak = Math.max(...byHour);
  const allCents = orders.reduce((s, o) => s + cents(o.total), 0);
  return {
    orders: orders.length,
    sales: orders.filter(o => o.zelled).reduce((s, o) => s + cents(o.total), 0) / 100,
    average: orders.length ? Math.round(allCents / orders.length) / 100 : 0,
    unpaid: orders.filter(o => !o.zelled).length,
    today: orders.filter(o => when(o).toDateString() === now.toDateString()).length,
    week: orders.filter(o => now - when(o) < 7 * 864e5).length,
    byHour,
    busiestHour: peak ? byHour.indexOf(peak) : null,
    best: Object.entries(sold).map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
  };
}

// --- Opening hours (the Google script decides; these only write it out) ---------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "13:30" -> "1:30 PM", "00:00" -> "midnight".
function timeText(t) {
  const [h, m] = String(t).split(':').map(Number);
  if (h === 0 && m === 0) return 'midnight';
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// One day as the Sheet stores it ("11:00-00:00", "closed" or "") -> "11:00 AM – midnight" or "Closed".
function dayText(h) {
  const parts = String(h || '').split('-');
  return parts.length === 2 && /:/.test(parts[0]) ? timeText(parts[0]) + ' – ' + timeText(parts[1]) : 'Closed';
}

// The Google script's nextOpen -> "today at 11:00 AM", "tomorrow at …", "Sunday at …".
function whenText(next) {
  if (!next) return null;
  const day = next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : DAY_NAMES[next.day];
  return day + ' at ' + timeText(next.time);
}

async function api(action, data = {}) {
  if (DEMO) return demoApi(action, data);
  let out;
  try {
    // text/plain skips the CORS preflight that Apps Script can't answer.
    const res = action === 'menu'
      ? await fetch(API_URL + '?action=menu')
      : await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, ...data }) });
    out = await res.json();
  } catch (err) {
    throw new Error("Couldn't reach the shop. Check your connection and try again.");
  }
  if (out.error) throw new Error(out.error);
  return out;
}

// --- Demo mode -------------------------------------------------------------

const DEMO_MENU = {
  shop: { zelleTo: SHOP.demoMenu.zelleTo, deliveryFee: SHOP.demoMenu.deliveryFee ?? 1 },
  mains: SHOP.demoMenu.mains,
  extras: SHOP.demoMenu.extras,
};

// Demo orders are saved in localStorage (per shop) so an order placed on the shop page shows up
// on the admin page, which is a separate page with its own memory.
const DEMO_KEY = 'demoOrders:' + SHOP.slug;
const [m1, m2 = m1] = DEMO_MENU.mains;
const demoOrders = demoLoad() || [
  { id: 2, time: new Date(Date.now() - 8 * 60000).toISOString(), name: 'Avi Cohen', room: '204', item: m2.name, extras: '', qty: 2, total: m2.price * 2, note: '', zelled: false },
  { id: 1, time: new Date(Date.now() - 40 * 60000).toISOString(), name: 'Ben Levi', room: '118', item: m1.name, extras: '', qty: 1, total: m1.price, note: '', zelled: true },
];

// Kept in localStorage so closing the shop on the demo admin page shows on the demo shop page.
// Keyed per shop because every shop shares one website (and so one localStorage).
function demoOpen(value) {
  const key = 'demoOpen:' + SHOP.slug;
  try {
    if (value !== undefined) localStorage.setItem(key, value ? 'yes' : 'no');
    return localStorage.getItem(key) !== 'no';
  } catch (err) {
    return true;
  }
}

// The demo admin page's "Accept cash" switch, kept like demoOpen. On unless switched off.
function demoCash(value) {
  const key = 'demoCash:' + SHOP.slug;
  try {
    if (value !== undefined) localStorage.setItem(key, value ? 'yes' : 'no');
    return localStorage.getItem(key) !== 'no';
  } catch (err) {
    return true;
  }
}

function demoLoad() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY));
  } catch (err) {
    return null;
  }
}

function demoSave() {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(demoOrders));
  } catch (err) {
    // Private browsing: the demo still works on one page, it just isn't shared.
  }
}

// Menu edits from the demo admin page, kept per shop like demo orders. Same shape as the Google
// script's menu: an item on sale has price = sale price and was = regular price.
const DEMO_MENU_KEY = 'demoMenu:' + SHOP.slug;
function demoMenu() {
  let items = null;
  try {
    items = JSON.parse(localStorage.getItem(DEMO_MENU_KEY));
  } catch (err) {
    // Private browsing: the demo menu just isn't editable across pages.
  }
  if (!Array.isArray(items)) return DEMO_MENU;
  const toItem = it => {
    const x = { name: it.name, price: Number(it.price) };
    if (it.sale !== '' && it.sale != null && Number(it.sale) < x.price) Object.assign(x, { was: x.price, price: Number(it.sale) });
    if (it.soldOut) x.soldOut = true;
    if (it.image) x.image = it.image;
    if (it.desc) x.desc = it.desc;
    return x;
  };
  return { ...DEMO_MENU, mains: items.filter(i => i.type === 'main').map(toItem), extras: items.filter(i => i.type === 'extra').map(toItem) };
}

// Demo hours, kept per shop like the demo menu. Same rules as the Google script's hoursNow_
// (copied, because the demo has no script), using this browser's clock.
const DEMO_HOURS_KEY = 'demoHours:' + SHOP.slug;
function demoHours(value) {
  try {
    if (value !== undefined) localStorage.setItem(DEMO_HOURS_KEY, JSON.stringify(value));
    const h = JSON.parse(localStorage.getItem(DEMO_HOURS_KEY));
    return Array.isArray(h) ? h : null;
  } catch (err) {
    return null;
  }
}

function demoDay(text) {
  const mins = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim()); return m && m[1] < 24 && m[2] < 60 ? m[1] * 60 + Number(m[2]) : null; };
  const parts = String(text || '').split('-');
  if (parts.length !== 2) return null;
  const from = mins(parts[0]);
  let to = mins(parts[1]);
  if (from === null || to === null) return null;
  if (to === 0) to = 1440;
  if (to === from) return null;
  return { from, to: to < from ? to + 1440 : to };
}

function demoStatus(now = new Date()) {
  const hours = demoHours();
  const switchOpen = demoOpen();
  const day = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  let inHours = true;
  let next = null;
  if (hours) {
    const at = d => demoDay(hours[(d + 7) % 7]);
    const today = at(day);
    const yesterday = at(day - 1);
    inHours = !!(today && minute >= today.from && minute < today.to) || !!(yesterday && minute + 1440 < yesterday.to);
    for (let i = 0; i < 8 && !next; i++) {
      const h = at(day + i);
      if (h && (i > 0 || h.from > minute)) next = { day: (day + i) % 7, inDays: i, time: String(Math.floor(h.from / 60)).padStart(2, '0') + ':' + String(h.from % 60).padStart(2, '0') };
    }
  }
  return { open: switchOpen, closedBy: !switchOpen ? 'switch' : !inHours ? 'hours' : null, hours, today: day, nextOpen: next, cash: demoCash() };
}

function demoApi(action, data) {
  const wait = v => new Promise(r => setTimeout(() => r(v), 350));
  const fail = message => wait(null).then(() => { throw new Error(message); });
  if (action === 'menu') {
    const st = demoStatus();
    return wait({ ...demoMenu(), shop: { ...DEMO_MENU.shop, ...st, open: !st.closedBy } });
  }
  if (action === 'order') {
    const closedBy = demoStatus().closedBy;
    if (closedBy) return fail((closedBy === 'hours' ? 'Sorry, we just closed' : 'Sorry, we just sold out') + ", so this order didn't go through. If you already sent the Zelle, message the seller for a refund.");
    if (data.payment === 'cash' && !demoCash()) return fail("This shop isn't taking cash right now. Please pay with Zelle.");
    const total = priceOf(demoMenu(), data);
    demoOrders.splice(0, demoOrders.length, ...(demoLoad() || demoOrders)); // pick up the admin page's ticks
    const id = Math.max(0, ...demoOrders.map(o => o.id)) + 1;
    demoOrders.unshift({ id, time: new Date().toISOString(), name: data.name, room: data.delivery ? data.room : 'Pickup', item: data.mains.join(' + '), extras: data.extras.join(', '), qty: data.qty, total, note: data.note, zelled: false, payment: data.payment === 'cash' ? 'cash' : 'zelle' });
    demoSave();
    return wait({ id, total });
  }
  if (data.password !== '1234') return fail('Wrong password. (Demo code: 1234)');
  if (action === 'list') return wait({ orders: (demoLoad() || demoOrders).map(o => ({ ...o })), ...demoStatus() });
  if (action === 'setCash') {
    demoCash(data.cash === true);
    return wait({ ok: true, ...demoStatus() });
  }
  if (action === 'setOpen') {
    demoOpen(data.open === true);
    return wait({ ok: true, ...demoStatus() });
  }
  if (action === 'setHours') {
    const bad = (data.hours || []).findIndex(h => h && h !== 'closed' && !demoDay(h));
    if (bad >= 0) return fail(DAY_NAMES[bad].slice(0, 3) + ': pick an opening and a closing time that are different.');
    demoHours(data.hours.map(h => h || 'closed'));
    return wait({ ok: true, ...demoStatus() });
  }
  if (action === 'saveMenu') {
    try {
      localStorage.setItem(DEMO_MENU_KEY, JSON.stringify(data.items));
    } catch (err) {
      return fail("This browser won't save the demo menu (private browsing?).");
    }
    return wait({ ok: true });
  }
  if (action === 'update') {
    demoOrders.splice(0, demoOrders.length, ...(demoLoad() || demoOrders));
    const o = demoOrders.find(x => x.id === data.id);
    if (typeof data.zelled === 'boolean') o.zelled = data.zelled;
    if (typeof data.completed === 'boolean') o.completed = data.completed;
    demoSave();
    return wait({ ok: true });
  }
}
