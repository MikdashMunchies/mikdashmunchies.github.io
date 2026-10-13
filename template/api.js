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

function demoApi(action, data) {
  const wait = v => new Promise(r => setTimeout(() => r(v), 350));
  const fail = message => wait(null).then(() => { throw new Error(message); });
  if (action === 'menu') return wait({ ...DEMO_MENU, shop: { ...DEMO_MENU.shop, open: demoOpen() } });
  if (action === 'order') {
    if (!demoOpen()) return fail("Sorry, we just sold out, so this order didn't go through. If you already sent the Zelle, message the seller for a refund.");
    const total = priceOf(DEMO_MENU, data);
    demoOrders.splice(0, demoOrders.length, ...(demoLoad() || demoOrders)); // pick up the admin page's ticks
    const id = Math.max(0, ...demoOrders.map(o => o.id)) + 1;
    demoOrders.unshift({ id, time: new Date().toISOString(), name: data.name, room: data.delivery ? data.room : 'Pickup', item: data.mains.join(' + '), extras: data.extras.join(', '), qty: data.qty, total, note: data.note, zelled: false });
    demoSave();
    return wait({ id, total });
  }
  if (data.password !== '1234') return fail('Wrong password. (Demo code: 1234)');
  if (action === 'list') return wait({ orders: (demoLoad() || demoOrders).map(o => ({ ...o })), open: demoOpen() });
  if (action === 'setOpen') return wait({ ok: true, open: demoOpen(data.open === true) });
  if (action === 'update') {
    demoOrders.splice(0, demoOrders.length, ...(demoLoad() || demoOrders));
    demoOrders.find(o => o.id === data.id).zelled = data.zelled === true;
    demoSave();
    return wait({ ok: true });
  }
}
