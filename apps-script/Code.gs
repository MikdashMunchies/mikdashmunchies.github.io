// Backend for one shop. Lives inside the shop's Google Sheet (Extensions > Apps Script).
// Deploy as a web app: Execute as "Me", access "Anyone". See SETUP.md.

const MAX_QTY = 10;
const ORDER_HEADERS = ['#', 'Time', 'Name', 'Room', 'Meat', 'Add-ons', 'Qty', 'Total', 'Note', 'Zelled'];
const ZELLED_COL = 10;

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
      return json_({ orders: listOrders_(), open: getMenu_().shop.open });
    }
    if (body.action === 'update') {
      checkPassword_(body.password);
      return json_(updateOrder_(Number(body.id), body.zelled === true));
    }
    if (body.action === 'setOpen') {
      checkPassword_(body.password);
      return json_(setOpen_(body.open === true));
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
    ['open', 'yes'],
  ]);
  make('Orders', [ORDER_HEADERS]);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) props.setProperty('ADMIN_PASSWORD', '1234');
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
    if (key) menu.shop[String(key).trim()] = String(value).trim();
  });
  // Open unless the sheet says no (also covers an unticked checkbox, which reads as "false").
  menu.shop.open = !/^(no|false|closed)$/i.test(menu.shop.open || '');
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
  if (!menu.shop.open) throw new Error("Sorry, we just sold out, so this order didn't go through. If you already sent the Zelle, message the seller for a refund.");
  const order = priceOrder_(menu, body);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let id;
  try {
    const props = PropertiesService.getScriptProperties();
    id = Number(props.getProperty('NEXT_ID') || 1);
    props.setProperty('NEXT_ID', id + 1);
    const sheet = SpreadsheetApp.getActive().getSheetByName('Orders');
    sheet.appendRow([
      id, new Date(), order.name, order.room, order.meat, order.addons.join(', '),
      order.qty, order.total, order.note, false,
    ].map(safeCell_));
    // A real checkbox, so the seller can also tick "Zelled" right in the Sheet.
    // Added per row: pre-filling empty rows with checkboxes would make appendRow skip past them.
    sheet.getRange(sheet.getLastRow(), ZELLED_COL).insertCheckboxes();
  } finally {
    lock.releaseLock();
  }
  return { id, total: order.total };
}

function listOrders_() {
  return rows_(SpreadsheetApp.getActive().getSheetByName('Orders')).map(r => ({
    id: r[0],
    time: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
    name: r[2], room: r[3], meat: r[4], addons: r[5], qty: r[6], total: r[7], note: r[8],
    zelled: r[9] === true || String(r[9]).toUpperCase() === 'TRUE',
  })).reverse();
}

function updateOrder_(id, zelled) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Orders');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === id) {
      sheet.getRange(i + 1, ZELLED_COL).setValue(zelled);
      return { ok: true };
    }
  }
  throw new Error('Order not found.');
}

function setOpen_(open) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Settings');
  const rows = sheet.getDataRange().getValues();
  const value = open ? 'yes' : 'no';
  const i = rows.findIndex((r, n) => n > 0 && String(r[0]).trim() === 'open');
  if (i > 0) sheet.getRange(i + 1, 2).setValue(value);
  else sheet.appendRow(['open', value]);
  return { ok: true, open };
}

// ponytail: no lockout after wrong guesses; use a long password (SETUP.md). Add a counter if abused.
function checkPassword_(password) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!real || password !== real) throw new Error('Wrong password.');
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
