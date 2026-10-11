// Paste the Apps Script web app URL here (see SETUP.md).
// Left empty, the site runs in demo mode: sample menu, nothing is saved.
const API_URL = '';
const DEMO = !API_URL;

const money = n => '$' + Number(n).toFixed(2);

// Display-only price. The real charge is worked out by the Google script.
function priceOf(menu, sel) {
  const meat = menu.meats.find(m => m.name === sel.meat);
  if (!meat) return 0;
  const cents = p => Math.round(p * 100);
  const extras = menu.addons.filter(a => sel.addons.includes(a.name)).reduce((s, a) => s + cents(a.price), 0);
  return ((cents(meat.price) + extras) * sel.qty) / 100;
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
  shop: {
    shopName: "David's Meat Paninis",
    tagline: 'Pressed hot, delivered to your classroom.',
    zelleTo: '(555) 123-4567',
  },
  meats: [
    { name: 'Turkey', price: 6 },
    { name: 'Pastrami', price: 7 },
    { name: 'Salami', price: 6.5 },
    { name: 'Roast beef', price: 7 },
  ],
  addons: [
    { name: 'Extra meat', price: 2 },
    { name: 'Pickles', price: 0.5 },
    { name: 'Grilled onions', price: 0.5 },
    { name: 'Spicy mayo', price: 0.5 },
    { name: 'Avocado', price: 1 },
  ],
};

const demoOrders = [
  { id: 2, time: new Date(Date.now() - 8 * 60000).toISOString(), name: 'Avi Cohen', room: '204', meat: 'Pastrami', addons: 'Pickles, Spicy mayo', qty: 2, total: 16, note: 'Extra crispy', status: 'Pending payment' },
  { id: 1, time: new Date(Date.now() - 40 * 60000).toISOString(), name: 'Ben Levi', room: '118', meat: 'Turkey', addons: '', qty: 1, total: 6, note: '', status: 'Paid' },
];

function demoApi(action, data) {
  const wait = v => new Promise(r => setTimeout(() => r(v), 350));
  if (action === 'menu') return wait(DEMO_MENU);
  if (action === 'order') {
    const total = priceOf(DEMO_MENU, data);
    const id = demoOrders.length + 1;
    demoOrders.unshift({ id, time: new Date().toISOString(), name: data.name, room: data.room, meat: data.meat, addons: data.addons.join(', '), qty: data.qty, total, note: data.note, status: 'Pending payment' });
    return wait({ id, total });
  }
  if (data.password !== 'demo') return wait(null).then(() => { throw new Error('Wrong password. (Demo password: demo)'); });
  if (action === 'list') return wait({ orders: demoOrders.map(o => ({ ...o })) });
  if (action === 'update') {
    demoOrders.find(o => o.id === data.id).status = data.status;
    return wait({ ok: true });
  }
}
