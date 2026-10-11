const $ = id => document.getElementById(id);
const MAX_QTY = 10;
let menu;
let qty = 1;

init();

async function init() {
  $('demo-banner').hidden = !DEMO;
  try {
    menu = await api('menu');
  } catch (err) {
    $('mains').replaceChildren();
    $('form-error').textContent = "Couldn't load the menu. Refresh the page to try again.";
    $('to-pay').disabled = true;
    return;
  }
  if (!menu.shop.open) {
    document.body.classList.add('is-closed');
    $('order').hidden = true;
    $('closed').hidden = false;
    return;
  }
  if (menu.mains.length) {
    $('from-price').textContent = 'from ' + money(Math.min(...menu.mains.map(m => m.price)));
    $('from-price').hidden = false;
  }
  $('mains').replaceChildren(...menu.mains.map((m, i) => option('radio', 'main', m, money(m.price), i === 0)));
  $('mains').removeAttribute('aria-busy');
  $('extras').replaceChildren(...menu.extras.map(x => option('checkbox', 'extra', x, '+' + money(x.price))));
  // A shop with no extras skips that step entirely.
  $('extras').closest('fieldset').hidden = !menu.extras.length;
  update();
}

function option(type, group, item, priceText, checked = false) {
  const label = document.createElement('label');
  label.className = type === 'radio' ? 'tile' : 'chip';
  const input = Object.assign(document.createElement('input'), { type, name: group, value: item.name, checked });
  const name = Object.assign(document.createElement('span'), { className: 'opt-name', textContent: item.name });
  const price = Object.assign(document.createElement('span'), { className: 'opt-price', textContent: priceText });
  label.append(input, name, price);
  return label;
}

function selection() {
  return {
    main: document.querySelector('input[name=main]:checked')?.value,
    extras: [...document.querySelectorAll('input[name=extra]:checked')].map(i => i.value),
    qty,
    name: $('name').value.trim(),
    room: $('room').value.trim(),
    note: $('note').value.trim(),
  };
}

function line(text, amount) {
  const li = document.createElement('li');
  li.append(Object.assign(document.createElement('span'), { textContent: text }));
  li.append(Object.assign(document.createElement('span'), { textContent: amount }));
  return li;
}

function update() {
  const sel = selection();
  const main = menu.mains.find(m => m.name === sel.main);
  const lines = [];
  if (main) {
    lines.push(line(main.name + ' ' + SHOP.item, money(main.price)));
    menu.extras.filter(x => sel.extras.includes(x.name)).forEach(x => lines.push(line('+ ' + x.name, money(x.price))));
    if (qty > 1) lines.push(line('× ' + qty, ''));
  }
  $('ticket-lines').replaceChildren(...lines);
  $('total').textContent = money(priceOf(menu, sel));
  $('qty').textContent = qty;
  $('qty-minus').disabled = qty <= 1;
  $('qty-plus').disabled = qty >= MAX_QTY;
}

$('order-form').addEventListener('change', () => menu && update());
$('qty-minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); update(); });
$('qty-plus').addEventListener('click', () => { qty = Math.min(MAX_QTY, qty + 1); update(); });
['name', 'room'].forEach(id => $(id).addEventListener('input', () => {
  $(id).removeAttribute('aria-invalid');
  $('form-error').textContent = '';
}));

$('order-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!menu) return;
  const sel = selection();
  if (!sel.main) return fail('Pick one to start your ' + SHOP.item + '.');
  const missing = !sel.name ? 'name' : !sel.room ? 'room' : null;
  if (missing) {
    $(missing).setAttribute('aria-invalid', 'true');
    $(missing).focus();
    return fail(missing === 'name' ? 'Add your name so we know who it’s for.' : 'Add your room number so we know where to bring it.');
  }
  // Check again before showing Zelle details, so nobody pays after the seller closed the shop.
  $('to-pay').disabled = true;
  try {
    if (!(await api('menu')).shop.open) return location.reload();
  } catch (err) {
    // Can't reach the shop: carry on. Placing the order will show the real error.
  } finally {
    $('to-pay').disabled = false;
  }
  $('pay-amount').textContent = money(priceOf(menu, sel));
  $('zelle-to').textContent = menu.shop.zelleTo || '';
  $('memo').textContent = `${sel.name} – Room ${sel.room}`;
  $('pay-error').textContent = '';
  show('pay');
});

function fail(message) {
  $('form-error').textContent = message;
}

function show(view) {
  document.querySelector('.hero').hidden = view !== 'order';
  $('order').hidden = view !== 'order';
  $('pay').hidden = view !== 'pay';
  $('done').hidden = view !== 'done';
  document.body.dataset.view = view;
  window.scrollTo(0, 0);
  if (view !== 'order') $(view).focus();
}

$('back').addEventListener('click', () => show('order'));

$('place').addEventListener('click', async () => {
  const button = $('place');
  button.disabled = true;
  button.textContent = 'Placing your order…';
  $('pay-error').textContent = '';
  try {
    const sel = selection();
    const result = await api('order', sel);
    $('done-id').textContent = result.id;
    $('done-total').textContent = money(result.total);
    $('done-room').textContent = sel.room;
    show('done');
  } catch (err) {
    $('pay-error').textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = 'I sent it — place my order';
  }
});

$('again').addEventListener('click', () => {
  $('order-form').reset();
  qty = 1;
  document.querySelector('input[name=main]').checked = true;
  update();
  show('order');
});

document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($(button.dataset.copy).textContent);
    button.textContent = 'Copied';
  } catch (err) {
    button.textContent = 'Press and hold to copy';
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 2000);
}));

// Hidden way in for the seller: tap the shop name 5 times quickly.
// The admin page still needs the password; this only saves typing the address.
let taps = 0;
let tapTimer;
document.querySelector('.shop-name').addEventListener('click', () => {
  taps++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { taps = 0; }, 1500);
  if (taps >= 5) location.href = 'admin.html';
});
