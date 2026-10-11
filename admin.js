const $ = id => document.getElementById(id);
const NEXT = { 'Pending payment': ['Paid', 'Got their Zelle'], 'Paid': ['Delivered', 'Delivered it'] };
const TABS = [
  ['Pending payment', 'Waiting for Zelle'],
  ['Paid', 'To deliver'],
  ['Delivered', 'Delivered'],
  ['', 'All'],
];
let tab = 'Pending payment';
let lastOrders = [];
const UNDO = { 'Paid': 'Pending payment', 'Delivered': 'Paid' };

// Session-only: closing the tab logs out.
let password = sessionStorage.getItem('adminPassword') || '';

$('demo-banner').hidden = !DEMO;
if (password) load();

$('login').addEventListener('submit', async e => {
  e.preventDefault();
  password = $('password').value;
  $('login-btn').disabled = true;
  await load();
  $('login-btn').disabled = false;
});

$('refresh').addEventListener('click', load);

$('logout').addEventListener('click', () => {
  sessionStorage.removeItem('adminPassword');
  password = '';
  $('password').value = '';
  showBoard(false);
});

async function load() {
  $('board-error').textContent = '';
  try {
    const { orders, open } = await api('list', { password });
    sessionStorage.setItem('adminPassword', password);
    showBoard(true);
    renderOpen(open);
    render(orders);
  } catch (err) {
    if (/password/i.test(err.message)) {
      sessionStorage.removeItem('adminPassword');
      showBoard(false);
      $('login-error').textContent = err.message;
      $('password').focus();
    } else {
      $('board-error').textContent = err.message;
    }
  }
}

let shopOpen = true;

function renderOpen(open) {
  shopOpen = open;
  $('shop-status').dataset.open = open;
  $('shop-state').textContent = open ? 'Open' : 'Sold out';
  $('shop-hint').textContent = open ? 'Taking orders' : 'The site says sold out. No new orders.';
  $('toggle-open').textContent = open ? 'Close shop' : 'Open shop';
  $('toggle-open').className = open ? 'btn btn-dark' : 'btn btn-primary';
}

$('toggle-open').addEventListener('click', async () => {
  const b = $('toggle-open');
  b.disabled = true;
  $('board-error').textContent = '';
  try {
    renderOpen((await api('setOpen', { password, open: !shopOpen })).open);
  } catch (err) {
    $('board-error').textContent = err.message;
  } finally {
    b.disabled = false;
  }
});

function showBoard(on) {
  $('login').hidden = on;
  $('board').hidden = !on;
  $('refresh').hidden = !on;
  $('logout').hidden = !on;
  if (on) $('login-error').textContent = '';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const EMPTY = {
  'Pending payment': 'Nobody is waiting on a Zelle check right now.',
  'Paid': 'Nothing to deliver. Every paid order is out the door.',
  'Delivered': 'No delivered orders yet.',
  '': 'No orders yet. Share your link to get the first one.',
};

function render(orders = lastOrders) {
  lastOrders = orders;
  const count = s => (s ? orders.filter(o => o.status === s) : orders).length;
  $('tabs').replaceChildren(...TABS.map(([status, label]) => {
    const b = el('button', 'tab', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(status === tab));
    b.append(el('span', 'count', count(status)));
    b.addEventListener('click', () => { tab = status; render(); });
    return b;
  }));
  const owed = orders.filter(o => o.status === 'Pending payment').reduce((sum, o) => sum + Number(o.total), 0);
  $('owed').textContent = tab === 'Pending payment' && owed ? `${money(owed)} in Zelle to look for in your bank app` : '';
  const shown = tab ? orders.filter(o => o.status === tab) : orders;
  $('orders').replaceChildren(...(shown.length ? shown.map(card) : [el('li', 'empty', EMPTY[tab])]));
}

function card(o) {
  const li = el('li', 'order');
  li.dataset.status = o.status;

  const head = el('div', 'order-head');
  head.append(el('span', 'order-who', `${o.name} · Room ${o.room}`));
  const time = new Date(o.time);
  head.append(el('span', 'order-meta', `#${o.id} · ${isNaN(time) ? '' : time.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`));

  const items = el('p', 'order-items', `${o.qty} × ${o.meat}${o.addons ? ' + ' + o.addons : ''}`);
  li.append(head, items);
  if (o.note) li.append(el('p', 'order-note', `“${o.note}”`));

  const foot = el('div', 'order-foot');
  const status = el('span', 'status', `${o.status} · ${money(o.total)}`);
  status.dataset.status = o.status;
  const actions = el('div', 'order-actions');
  if (UNDO[o.status]) actions.append(button('Undo', 'btn-link', o, UNDO[o.status]));
  if (NEXT[o.status]) actions.append(button(NEXT[o.status][1], 'btn btn-primary', o, NEXT[o.status][0]));
  foot.append(status, actions);
  li.append(foot);
  return li;
}

function button(label, className, order, status) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await api('update', { password, id: order.id, status });
      await load();
    } catch (err) {
      $('board-error').textContent = err.message;
      b.disabled = false;
    }
  });
  return b;
}
