// Backend for one shop. Lives inside the shop's Google Sheet (Extensions > Apps Script).
// Deploy as a web app: Execute as "Me", access "Anyone". See SETUP.md.

const STATUSES = ['Pending payment', 'Paid', 'Delivered'];
const MAX_QTY = 10;
const ORDER_HEADERS = ['#', 'Time', 'Name', 'Room', 'Meat', 'Add-ons', 'Qty', 'Total', 'Note', 'Status'];

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'menu') return json_(getMenu_());
  return json_({ error: 'Unknown action.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'order') return json_(placeOrder_(body));
    if (body.action === 'list') {
      checkPassword_(body.password);
      return json_({ orders: listOrders_() });
    }
    if (body.action === 'update') {
      checkPassword_(body.password);
      return json_(updateOrder_(Number(body.id), body.status));
    }
    return json_({ error: 'Unknown action.' });
  } catch (err) {
    return json_({ error: err.message });
  }
}

// Run once by hand from the Apps Script editor to create the tabs.
function setup() {
  const ss = SpreadsheetApp.getActive();
  const make = (name, rows) => {
    if (ss.getSheetByName(name)) return;
    const sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);
  };
  make('Menu', [
    ['Type', 'Name', 'Price'],
    ['meat', 'Turkey', 6],
    ['meat', 'Pastrami', 7],
    ['meat', 'Salami', 6.5],
    ['meat', 'Roast beef', 7],
    ['add-on', 'Extra meat', 2],
    ['add-on', 'Pickles', 0.5],
    ['add-on', 'Grilled onions', 0.5],
    ['add-on', 'Spicy mayo', 0.5],
    ['add-on', 'Avocado', 1],
  ]);
  make('Settings', [
    ['Key', 'Value'],
    ['shopName', "David's Meat Paninis"],
    ['tagline', 'Pressed hot, delivered to your classroom.'],
    ['zelleTo', 'CHANGE ME — David\'s Zelle phone or email'],
    ['orderEmail', ''],
  ]);
  make('Orders', [ORDER_HEADERS]);
}

function getMenu_() {
  const ss = SpreadsheetApp.getActive();
  const menu = { shop: {}, meats: [], addons: [] };
  rows_(ss.getSheetByName('Menu')).forEach(([type, name, price]) => {
    const item = { name: String(name).trim(), price: Number(price) };
    if (!item.name || !(item.price >= 0)) return;
    const t = String(type).trim().toLowerCase();
    if (t === 'meat') menu.meats.push(item);
    else if (t === 'add-on' || t === 'addon') menu.addons.push(item);
  });
  rows_(ss.getSheetByName('Settings')).forEach(([key, value]) => {
    // orderEmail stays private; the site doesn't need it.
    if (key && key !== 'orderEmail') menu.shop[String(key).trim()] = String(value).trim();
  });
  return menu;
}

// Works out the real price from the Menu tab. Anything the browser says about price is ignored.
function priceOrder_(menu, o) {
  const name = clean_(o.name, 40);
  const room = clean_(o.room, 20);
  const note = clean_(o.note, 200);
  if (!name) throw new Error('Please enter your name.');
  if (!room) throw new Error('Please enter your room number.');
  const meat = menu.meats.find(m => m.name === o.meat);
  if (!meat) throw new Error('Please pick a meat.');
  const addons = [...new Set(Array.isArray(o.addons) ? o.addons : [])].map(n => {
    const a = menu.addons.find(x => x.name === n);
    if (!a) throw new Error('That add-on is not on the menu anymore: ' + n);
    return a;
  });
  const qty = Number(o.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new Error('Quantity must be 1 to ' + MAX_QTY + '.');
  // Cents, so 0.1 + 0.2 style rounding never shows up on a bill.
  const unit = cents_(meat.price) + addons.reduce((sum, a) => sum + cents_(a.price), 0);
  return { name, room, note, meat: meat.name, addons: addons.map(a => a.name), qty, total: (unit * qty) / 100 };
}

function placeOrder_(body) {
  const menu = getMenu_();
  const order = priceOrder_(menu, body);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let id;
  try {
    const props = PropertiesService.getScriptProperties();
    id = Number(props.getProperty('NEXT_ID') || 1);
    props.setProperty('NEXT_ID', id + 1);
    SpreadsheetApp.getActive().getSheetByName('Orders').appendRow([
      id, new Date(), order.name, order.room, order.meat, order.addons.join(', '),
      order.qty, order.total, order.note, STATUSES[0],
    ].map(safeCell_));
  } finally {
    lock.releaseLock();
  }
  try {
    MailApp.sendEmail(ownerEmail_(), 'New order #' + id + ' — ' + order.name + ', room ' + order.room, [
      order.qty + ' × ' + order.meat + (order.addons.length ? ' + ' + order.addons.join(', ') : ''),
      'Total: $' + order.total.toFixed(2) + ' (waiting for Zelle)',
      'Name: ' + order.name,
      'Room: ' + order.room,
      order.note ? 'Note: ' + order.note : '',
    ].filter(Boolean).join('\n'));
  } catch (err) {
    // The order is already saved; a missed email must not lose it.
  }
  return { id, total: order.total };
}

function listOrders_() {
  return rows_(SpreadsheetApp.getActive().getSheetByName('Orders')).map(r => ({
    id: r[0],
    time: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
    name: r[2], room: r[3], meat: r[4], addons: r[5], qty: r[6], total: r[7], note: r[8], status: r[9],
  })).reverse();
}

function updateOrder_(id, status) {
  if (STATUSES.indexOf(status) === -1) throw new Error('Unknown status.');
  const sheet = SpreadsheetApp.getActive().getSheetByName('Orders');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === id) {
      sheet.getRange(i + 1, 10).setValue(status);
      return { ok: true };
    }
  }
  throw new Error('Order not found.');
}

// ponytail: no lockout after wrong guesses; use a long password (SETUP.md). Add a counter if abused.
function checkPassword_(password) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!real || password !== real) throw new Error('Wrong password.');
}

function ownerEmail_() {
  const row = rows_(SpreadsheetApp.getActive().getSheetByName('Settings')).find(r => r[0] === 'orderEmail');
  return (row && String(row[1]).trim()) || Session.getEffectiveUser().getEmail();
}

function rows_(sheet) {
  return sheet.getDataRange().getValues().slice(1);
}

function clean_(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cents_(price) {
  return Math.round(Number(price) * 100);
}

// Text starting with = + - @ would run as a formula in Sheets.
function safeCell_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
