const $ = id => document.getElementById(id);

// Session-only: closing the tab logs out.
// Keyed per shop because every shop shares one website (and so one sessionStorage).
const PASSWORD_KEY = 'adminPassword:' + SHOP.slug;
let password = sessionStorage.getItem(PASSWORD_KEY) || '';
let shopOpen = true;
let saving = 0;
// Bumped on every tick. A refresh that started before a tick carries the old answer, so it is
// thrown away instead of drawn (otherwise a just-ticked box would flip back until the next refresh).
let ticks = 0;

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

// Check for new orders by itself: every 15 seconds, and right away when David switches back
// to this tab. Skipped while hidden or mid-tick, so it never fights a checkbox being saved.
const REFRESH_MS = 15000;

const autoRefresh = () => { if (password && !$('board').hidden && !document.hidden && !saving) load(); };
setInterval(autoRefresh, REFRESH_MS);
document.addEventListener('visibilitychange', autoRefresh);

$('logout').addEventListener('click', () => {
  sessionStorage.removeItem(PASSWORD_KEY);
  password = '';
  $('password').value = '';
  showBoard(false);
});

async function load() {
  $('board-error').textContent = '';
  try {
    const ticksAtStart = ticks;
    const { orders, open } = await api('list', { password });
    if (ticksAtStart !== ticks) return;
    sessionStorage.setItem(PASSWORD_KEY, password);
    showBoard(true);
    renderOpen(open);
    render(orders);
  } catch (err) {
    if (/password/i.test(err.message)) {
      sessionStorage.removeItem(PASSWORD_KEY);
      showBoard(false);
      $('login-error').textContent = 'Wrong code. Try again.';
      $('password').value = '';
      $('password').focus();
    } else {
      $('board-error').textContent = err.message;
    }
  }
}

function showBoard(on) {
  $('login').hidden = on;
  $('board').hidden = !on;
  $('refresh').hidden = !on;
  $('logout').hidden = !on;
  if (on) $('login-error').textContent = '';
}

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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(orders) {
  if (!orders.length) {
    const td = el('td', 'empty', 'No orders yet. Share your link to get the first one.');
    td.colSpan = 4;
    const tr = el('tr');
    tr.append(td);
    $('orders').replaceChildren(tr);
    return;
  }
  $('orders').replaceChildren(...orders.map(row));
}

function row(o) {
  const tr = el('tr');
  tr.classList.toggle('is-zelled', o.zelled);

  const order = el('td', 'col-order');
  order.append(el('span', '', `${o.qty} × ${o.item}${o.extras ? ' + ' + o.extras : ''}`));
  order.append(el('span', 'order-total', money(o.total)));
  if (o.note) order.append(el('span', 'order-note', `“${o.note}”`));

  const check = el('td', 'col-check');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = o.zelled;
  box.setAttribute('aria-label', `${o.name} paid with Zelle`);
  box.addEventListener('change', async () => {
    box.disabled = true;
    saving++;
    ticks++;
    $('board-error').textContent = '';
    try {
      await api('update', { password, id: o.id, zelled: box.checked });
      tr.classList.toggle('is-zelled', box.checked);
    } catch (err) {
      box.checked = !box.checked; // put it back so the table never lies
      $('board-error').textContent = err.message;
    } finally {
      box.disabled = false;
      saving--;
    }
  });
  check.append(box);

  // When the order came in: the Sheet stamps the time automatically on every new order.
  const who = el('td', 'col-name', o.name);
  const when = new Date(o.time);
  if (!isNaN(when)) {
    who.append(el('span', 'order-when', when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
  }
  tr.append(who, el('td', 'col-room', o.room), order, check);
  return tr;
}
