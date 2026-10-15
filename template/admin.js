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
let shown = []; // the orders on screen, so the maaser box and analytics can recount after a tick

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

function renderMaaser() {
  const { month, all } = maaserOf(shown);
  $('maaser-month').textContent = money(month.maaser);
  $('sales-month').textContent = 'of ' + money(month.sales);
  $('maaser-all').textContent = money(all.maaser);
  $('sales-all').textContent = 'of ' + money(all.sales);
}

// Orders | Analytics tabs (arrow keys move between them, as tabs should).
const TABS = ['orders', 'stats'];
function showTab(name, focus) {
  TABS.forEach(t => {
    const on = t === name;
    $('tab-' + t).setAttribute('aria-selected', on);
    $('tab-' + t).tabIndex = on ? 0 : -1;
    $('panel-' + t).hidden = !on;
  });
  if (focus) $('tab-' + name).focus();
}
TABS.forEach((t, i) => {
  $('tab-' + t).addEventListener('click', () => showTab(t));
  $('tab-' + t).addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step) showTab(TABS[(i + step + TABS.length) % TABS.length], true);
  });
});

const hourName = h => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });

function renderStats() {
  const s = analyticsOf(shown);
  $('stat-orders').textContent = s.orders;
  $('stat-sales').textContent = money(s.sales);
  $('stat-average').textContent = money(s.average);
  $('stat-unpaid').textContent = s.unpaid;
  $('stat-today').textContent = s.today;
  $('stat-week').textContent = s.week;

  if (s.busiestHour === null) {
    $('hours-lead').textContent = 'No orders yet.';
    $('hours').replaceChildren();
  } else {
    $('hours-lead').textContent = `Busiest: ${hourName(s.busiestHour)} to ${hourName((s.busiestHour + 1) % 24)}`;
    // Only the hours that had orders, and the gaps between them: 24 bars don't fit a phone.
    const used = s.byHour.map((n, h) => (n ? h : -1)).filter(h => h >= 0);
    const peak = s.byHour[s.busiestHour];
    const bars = [];
    for (let h = used[0]; h <= used[used.length - 1]; h++) {
      const n = s.byHour[h];
      const label = `${hourName(h)}: ${n} order${n === 1 ? '' : 's'}`;
      const col = el('div', 'hour' + (h === s.busiestHour ? ' is-peak' : ''));
      col.title = label;
      const bar = el('div', 'hour-bar');
      bar.style.height = (n / peak) * 100 + '%';
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', label);
      const plot = el('div', 'hour-plot');
      if (h === s.busiestHour) plot.append(el('span', 'hour-count', n)); // label the peak only
      plot.append(bar);
      col.append(plot, el('span', 'hour-label', hourName(h).replace(/s?([AP])M/i, (m, p) => p.toLowerCase())));
      bars.push(col);
    }
    $('hours').replaceChildren(...bars);
  }

  if (!s.best.length) {
    $('best').replaceChildren(el('li', 'best-empty', 'No orders yet.'));
  } else {
    const top = s.best[0].count;
    $('best').replaceChildren(...s.best.map(b => {
      const li = el('li');
      const bar = el('span', 'best-bar');
      bar.style.width = (b.count / top) * 100 + '%';
      li.append(el('span', 'best-name', b.name), el('span', 'best-count', b.count), bar);
      return li;
    }));
  }
}

function render(orders) {
  shown = orders;
  renderMaaser();
  renderStats();
  if (!orders.length) {
    const td = el('td', 'empty', 'No orders yet. Share your link to get the first one.');
    td.colSpan = 5;
    const tr = el('tr');
    tr.append(td);
    $('orders').replaceChildren(tr);
    return;
  }
  $('orders').replaceChildren(...orders.map(row));
}

// One checkbox cell that saves a single field (zelled or completed) for this order.
function tickCell(o, tr, field, cls, label) {
  const td = el('td', 'col-check');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = o[field];
  box.setAttribute('aria-label', label);
  box.addEventListener('change', async () => {
    box.disabled = true;
    saving++;
    ticks++;
    $('board-error').textContent = '';
    try {
      await api('update', { password, id: o.id, [field]: box.checked });
      tr.classList.toggle(cls, box.checked);
      o[field] = box.checked;
      renderMaaser();
      renderStats();
    } catch (err) {
      box.checked = !box.checked; // put it back so the table never lies
      $('board-error').textContent = err.message;
    } finally {
      box.disabled = false;
      saving--;
    }
  });
  td.append(box);
  return td;
}

function row(o) {
  const tr = el('tr');
  tr.classList.toggle('is-zelled', o.zelled);
  tr.classList.toggle('is-done', o.completed);

  const order = el('td', 'col-order');
  order.append(el('span', '', `${o.qty} × ${o.item}${o.extras ? ' + ' + o.extras : ''}`));
  order.append(el('span', 'order-total', money(o.total)));
  if (o.note) order.append(el('span', 'order-note', `“${o.note}”`));

  // When the order came in: the Sheet stamps the time automatically on every new order.
  const who = el('td', 'col-name', o.name);
  const when = new Date(o.time);
  if (!isNaN(when)) {
    who.append(el('span', 'order-when', when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
  }
  tr.append(who, el('td', 'col-room', o.room), order,
    tickCell(o, tr, 'zelled', 'is-zelled', `${o.name} paid with Zelle`),
    tickCell(o, tr, 'completed', 'is-done', `${o.name}'s order completed`));
  return tr;
}
