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
let cashOn = true;
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
    const { orders, ...status } = await api('list', { password });
    if (ticksAtStart !== ticks) return;
    sessionStorage.setItem(PASSWORD_KEY, password);
    if ($('board').hidden) loadMenu(); // once per login, never on auto-refresh: it would wipe edits in progress
    showBoard(true);
    renderOpen(status);
    renderCash(status);
    if (!hoursDirty) renderHours(status.hours);
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

// `open` is the Close/Open button; `closedBy` says why buyers can't order ('switch', 'hours' or null).
function renderOpen({ open, closedBy, nextOpen }) {
  shopOpen = open;
  const when = whenText(nextOpen);
  $('shop-status').dataset.open = !closedBy;
  $('shop-state').textContent = closedBy === 'switch' ? 'Sold out' : closedBy === 'hours' ? 'Closed' : 'Open';
  $('shop-hint').textContent = closedBy === 'switch' ? 'The site says sold out. No new orders.'
    : closedBy === 'hours' ? 'Outside your hours. ' + (when ? 'Opens ' + when + '.' : 'No open days set.')
    : 'Taking orders';
  $('toggle-open').textContent = open ? 'Close shop' : 'Open shop';
  $('toggle-open').className = open ? 'btn btn-dark' : 'btn btn-primary';
}

// "Accept cash": buyers can choose to pay cash when they get their food. On unless switched off.
function renderCash({ cash }) {
  cashOn = cash !== false;
  $('cash-status').dataset.on = cashOn;
  $('cash-state').textContent = cashOn ? 'Accepted' : 'Not accepted';
  $('toggle-cash').textContent = cashOn ? 'Turn off cash' : 'Accept cash';
}

$('toggle-cash').addEventListener('click', async () => {
  const b = $('toggle-cash');
  b.disabled = true;
  $('board-error').textContent = '';
  try {
    renderCash(await api('setCash', { password, cash: !cashOn }));
  } catch (err) {
    $('board-error').textContent = err.message;
  } finally {
    b.disabled = false;
  }
});

$('toggle-open').addEventListener('click', async () => {
  const b = $('toggle-open');
  b.disabled = true;
  $('board-error').textContent = '';
  try {
    renderOpen(await api('setOpen', { password, open: !shopOpen }));
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

// Orders | Menu | Hours | Analytics tabs (arrow keys move between them, as tabs should).
const TABS = ['orders', 'menu', 'hours', 'stats'];
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
  tr.classList.toggle('is-zelled', !!o.zelled);
  tr.classList.toggle('is-done', !!o.completed); // !!: toggle(x, undefined) would flip it on

  const order = el('td', 'col-order');
  order.append(el('span', '', `${o.qty} × ${o.item}${o.extras ? ' + ' + o.extras : ''}`));
  order.append(el('span', 'order-total', money(o.total)));
  order.append(el('span', 'pay-tag' + (o.payment === 'cash' ? ' is-cash' : ''), o.payment === 'cash' ? 'Cash' : 'Zelle'));
  if (o.note) order.append(el('span', 'order-note', `“${o.note}”`));

  // When the order came in: the Sheet stamps the time automatically on every new order.
  const who = el('td', 'col-name', o.name);
  const when = new Date(o.time);
  if (!isNaN(when)) {
    who.append(el('span', 'order-when', when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
  }
  tr.append(who, el('td', 'col-room', o.room), order,
    tickCell(o, tr, 'zelled', 'is-zelled', `${o.name} paid`),
    tickCell(o, tr, 'completed', 'is-done', `${o.name}'s order completed`));
  return tr;
}

// --- Menu tab: edit names and prices, add/remove items, discounts (a sale price) ---------------
// The Google script checks everything again on save; these checks are only for friendly messages.

let menuDirty = false;
let rowCount = 0;

async function loadMenu() {
  try {
    const m = await api('menu');
    // The menu gives an item on sale as price = sale price, was = regular price.
    const toRow = type => x => ({ type, name: x.name, price: x.was ?? x.price, sale: x.was ? x.price : '', soldOut: !!x.soldOut });
    renderMenu([...m.mains.map(toRow('main')), ...m.extras.map(toRow('extra'))]);
    setMenuStatus('');
  } catch (err) {
    setMenuStatus("Couldn't load the menu: " + err.message, true);
  }
}

function setMenuStatus(text, isError) {
  $('menu-status').textContent = text;
  $('menu-status').classList.toggle('error', !!isError);
}

function markDirty() {
  menuDirty = true;
  setMenuStatus('Unsaved changes. Tap Save menu when you are done.');
}

const priceText = n => (n === '' || n == null ? '' : Number(n).toFixed(2));

function renderMenu(items) {
  $('menu-main').replaceChildren(...items.filter(i => i.type === 'main').map(menuRow));
  $('menu-extra').replaceChildren(...items.filter(i => i.type === 'extra').map(menuRow));
  menuDirty = false;
}

function field(cls, label, value, inputClass, extra = {}) {
  const n = ++rowCount; // unique ids so every label points at its own input
  const wrap = el('div', 'menu-field ' + cls);
  const lab = el('label', '', label);
  lab.htmlFor = 'menu-in-' + n;
  const input = Object.assign(el('input', inputClass), { id: 'menu-in-' + n, value, autocomplete: 'off', ...extra });
  wrap.append(lab, input);
  return [wrap, input];
}

function button(cls, text) {
  const b = el('button', 'btn ' + cls, text);
  b.type = 'button';
  return b;
}

function menuRow(it) {
  const row = el('div', 'menu-row');
  row.dataset.type = it.type;
  const [nameField, name] = field('menu-name', 'Name', it.name, 'm-name', { maxLength: 40 });
  const [priceField, price] = field('menu-price', 'Price $', priceText(it.price), 'm-price', { inputMode: 'decimal' });
  const [saleField, sale] = field('menu-sale', 'Sale price $', priceText(it.sale), 'm-sale', { inputMode: 'decimal' });
  const discount = button('menu-discount', 'Discount');
  const remove = button('menu-remove', 'Remove');
  // Sold out: a toggle. The item stays on the menu but buyers can't pick it until it's switched back.
  const soldOut = button('menu-sold-out', 'Sold out');
  const setSoldOut = on => {
    soldOut.setAttribute('aria-pressed', on);
    row.classList.toggle('is-sold-out', on);
  };
  setSoldOut(!!it.soldOut);
  soldOut.addEventListener('click', () => { setSoldOut(soldOut.getAttribute('aria-pressed') !== 'true'); markDirty(); });
  remove.setAttribute('aria-label', 'Remove ' + (it.name || 'this item'));
  const endSale = button('menu-end-sale', 'End sale');
  saleField.append(endSale);

  const setSale = on => {
    saleField.hidden = !on;
    discount.hidden = on;
    row.classList.toggle('is-on-sale', on);
  };
  setSale(it.sale !== '' && it.sale != null);

  discount.addEventListener('click', () => { setSale(true); sale.focus(); });
  endSale.addEventListener('click', () => { sale.value = ''; setSale(false); markDirty(); discount.focus(); });
  remove.addEventListener('click', () => { row.remove(); markDirty(); });
  [name, price, sale].forEach(i => i.addEventListener('input', markDirty));

  row.append(nameField, priceField, discount, soldOut, remove, saleField);
  return row;
}

function addRow(type) {
  const row = menuRow({ type, name: '', price: '', sale: '', soldOut: false });
  $('menu-' + type).append(row);
  row.querySelector('.m-name').focus();
  markDirty();
}
$('add-main').addEventListener('click', () => addRow('main'));
$('add-extra').addEventListener('click', () => addRow('extra'));

const dollars = v => v.trim().replace(/^\$/, '');

function readMenu() {
  return [...document.querySelectorAll('.menu-row')].map(row => ({
    type: row.dataset.type,
    name: row.querySelector('.m-name').value.trim(),
    price: dollars(row.querySelector('.m-price').value),
    sale: row.querySelector('.menu-sale').hidden ? '' : dollars(row.querySelector('.m-sale').value),
    soldOut: row.querySelector('.menu-sold-out').getAttribute('aria-pressed') === 'true',
  }));
}

$('save-menu').addEventListener('click', async () => {
  const items = readMenu();
  const bad = items.find(i => !i.name || i.price === '' || isNaN(Number(i.price)) || (i.sale !== '' && isNaN(Number(i.sale))));
  if (bad) return setMenuStatus((bad.name || 'An item') + ' needs a name and a price in numbers, like 6.50.', true);
  if (!items.some(i => i.type === 'main')) return setMenuStatus('Keep at least one item on the menu.', true);
  const b = $('save-menu');
  b.disabled = true;
  setMenuStatus('Saving…');
  try {
    await api('saveMenu', {
      password,
      items: items.map(i => ({ ...i, price: Number(i.price), sale: i.sale === '' ? '' : Number(i.sale) })),
    });
    await loadMenu();
    setMenuStatus('Saved. Your shop shows the new menu now.');
  } catch (err) {
    setMenuStatus(err.message, true);
  } finally {
    b.disabled = false;
  }
});

// Leaving with unsaved menu edits asks first (the browser's own "Leave site?" prompt).
window.addEventListener('beforeunload', e => { if (menuDirty || hoursDirty) e.preventDefault(); });

// --- Hours tab ---------------------------------------------------------------
// One row per day, Sunday first. Saved as "11:00-00:00" or "closed", like the Sheet's hoursSun ... hoursSat.
// The Google script checks the times again and is what actually closes the shop.

let hoursDirty = false;

function renderHours(hours) {
  $('hours-note').hidden = !!hours;
  $('day-rows').replaceChildren(...DAY_NAMES.map((day, i) => {
    // No hours yet: suggest 11 AM to midnight every day; nothing changes until Save.
    const [from, to] = hours ? String(hours[i] || '').split('-') : ['11:00', '00:00'];
    const isOpen = hours ? /:/.test(from || '') && !!to : true;
    const row = el('div', 'day-row');
    const box = Object.assign(el('input'), { type: 'checkbox', checked: isOpen });
    const name = el('label', 'day-name');
    name.append(box, ' ' + day);
    const time = (value, label) => {
      const t = Object.assign(el('input', 'day-time'), { type: 'time', value });
      t.setAttribute('aria-label', day + ' ' + label);
      return t;
    };
    const open = time(isOpen ? from : '11:00', 'opens');
    const close = time(isOpen ? to : '00:00', 'closes');
    const times = el('div', 'day-times');
    times.append(open, el('span', 'day-to', 'to'), close);
    const closedNote = el('span', 'day-closed', 'Closed');
    const show = () => { times.hidden = !box.checked; closedNote.hidden = box.checked; };
    show();
    box.addEventListener('change', () => { show(); markHoursDirty(); });
    [open, close].forEach(t => t.addEventListener('input', markHoursDirty));
    row.append(name, times, closedNote);
    return row;
  }));
  hoursDirty = false;
}

function setHoursStatus(text, isError) {
  $('hours-status').textContent = text;
  $('hours-status').classList.toggle('error', !!isError);
}

function markHoursDirty() {
  hoursDirty = true;
  setHoursStatus('Unsaved changes. Tap Save hours when you are done.');
}

$('save-hours').addEventListener('click', async () => {
  const hours = [...document.querySelectorAll('.day-row')].map(r => {
    const [box, open, close] = r.querySelectorAll('input');
    return box.checked ? open.value + '-' + close.value : 'closed';
  });
  const bad = hours.findIndex(h => h !== 'closed' && (!/^\d\d:\d\d-\d\d:\d\d$/.test(h) || h.slice(0, 5) === h.slice(6)));
  if (bad >= 0) return setHoursStatus(DAY_NAMES[bad] + ' needs an opening and a closing time that are different.', true);
  const b = $('save-hours');
  b.disabled = true;
  setHoursStatus('Saving…');
  try {
    const status = await api('setHours', { password, hours });
    renderOpen(status);
    renderHours(status.hours);
    setHoursStatus('Saved. Your shop follows these hours now.');
  } catch (err) {
    setHoursStatus(err.message, true);
  } finally {
    b.disabled = false;
  }
});
