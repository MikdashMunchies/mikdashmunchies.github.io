const $ = id => document.getElementById(id);

// Session-only: closing the tab logs out.
let password = sessionStorage.getItem('adminPassword') || '';
let shopOpen = true;

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
  order.append(el('span', '', `${o.qty} × ${o.meat}${o.addons ? ' + ' + o.addons : ''}`));
  order.append(el('span', 'order-total', money(o.total)));
  if (o.note) order.append(el('span', 'order-note', `“${o.note}”`));

  const check = el('td', 'col-check');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = o.zelled;
  box.setAttribute('aria-label', `${o.name} paid with Zelle`);
  box.addEventListener('change', async () => {
    box.disabled = true;
    $('board-error').textContent = '';
    try {
      await api('update', { password, id: o.id, zelled: box.checked });
      tr.classList.toggle('is-zelled', box.checked);
    } catch (err) {
      box.checked = !box.checked; // put it back so the table never lies
      $('board-error').textContent = err.message;
    } finally {
      box.disabled = false;
    }
  });
  check.append(box);

  tr.append(el('td', 'col-name', o.name), el('td', 'col-room', o.room), order, check);
  return tr;
}
