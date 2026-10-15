// Backend for one shop. Lives inside the shop's Google Sheet (Extensions > Apps Script).
// Deploy as a web app: Execute as "Me", access "Anyone". See SETUP.md.

const MAX_QTY = 10;
const ORDER_HEADERS = ['#', 'Time', 'Name', 'Room', 'Item', 'Extras', 'Qty', 'Total', 'Note', 'Zelled', 'Completed'];
const ZELLED_COL = 10;
const COMPLETED_COL = 11;

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
      return json_(updateOrder_(Number(body.id), body));
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
  // Example rows. Replace them with the shop's real menu.
  // Type "main" = the main choice (e.g. the meat; buyers can combine several). Type "extra" = optional add-ons.
  make('Menu', [
    ['Type', 'Name', 'Price'],
    ['main', 'Example item', 6],
    ['main', 'Another item', 7],
    ['extra', 'Example extra', 0.5],
  ]);
  make('Settings', [
    ['Key', 'Value'],
    ['zelleTo', "CHANGE ME: the seller's Zelle phone or email"],
    ['open', 'yes'],
    ['deliveryFee', 1],
    // The seller subscribes to this in the ntfy app to get a notification per order. Random = private.
    ['ntfyTopic', 'orders-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16)],
  ]);
  make('Orders', [ORDER_HEADERS]);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) props.setProperty('ADMIN_PASSWORD', '1234');
}

function getMenu_() {
  const ss = SpreadsheetApp.getActive();
  const menu = { shop: {}, mains: [], extras: [] };
  rows_(ss.getSheetByName('Menu')).forEach(([type, name, price]) => {
    const item = { name: String(name).trim(), price: Number(price) };
    if (!item.name || !(item.price >= 0)) return;
    const t = String(type).trim().toLowerCase();
    if (t === 'main') menu.mains.push(item);
    else if (t === 'extra') menu.extras.push(item);
  });
  rows_(ss.getSheetByName('Settings')).forEach(([key, value]) => {
    if (key) menu.shop[String(key).trim()] = String(value).trim();
  });
  // Open unless the sheet says no (also covers an unticked checkbox, which reads as "false").
  menu.shop.open = !/^(no|false|closed)$/i.test(menu.shop.open || '');
  // Delivery costs a flat fee per order (default $1); pickup is free.
  const fee = Number(menu.shop.deliveryFee);
  menu.shop.deliveryFee = menu.shop.deliveryFee !== undefined && menu.shop.deliveryFee !== '' && fee >= 0 ? fee : 1;
  return menu;
}

// Works out the real price from the Menu tab. Anything the browser says about price is ignored.
function priceOrder_(menu, o) {
  const name = clean_(o.name, 40);
  const delivery = o.delivery === true;
  const room = delivery ? clean_(o.room, 20) : 'Pickup';
  const note = clean_(o.note, 200);
  if (!name) throw new Error('Please enter your name.');
  if (!room) throw new Error('Please enter your room number for delivery.');
  // Mains can be combined (turkey + pastrami in one); their prices add up.
  const mains = pickItems_(menu.mains, o.mains);
  if (!mains.length) throw new Error('Please pick at least one item.');
  const extras = pickItems_(menu.extras, o.extras);
  const qty = Number(o.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new Error('Quantity must be 1 to ' + MAX_QTY + '.');
  // Cents, so 0.1 + 0.2 style rounding never shows up on a bill.
  const unit = [...mains, ...extras].reduce((sum, x) => sum + cents_(x.price), 0);
  const fee = delivery ? cents_(menu.shop.deliveryFee) : 0; // once per order, not per item
  return { name, room, note, mains: mains.map(m => m.name), extras: extras.map(x => x.name), qty, total: (unit * qty + fee) / 100 };
}

function pickItems_(list, names) {
  return [...new Set(Array.isArray(names) ? names : [])].map(n => {
    const found = list.find(i => i.name === n);
    if (!found) throw new Error('That is not on the menu anymore: ' + n);
    return found;
  });
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
    const sheet = ordersSheet_();
    sheet.appendRow([
      id, new Date(), order.name, order.room, order.mains.join(' + '), order.extras.join(', '),
      order.qty, order.total, order.note, false, false,
    ].map(safeCell_));
    // Real checkboxes, so the seller can also tick "Zelled"/"Completed" right in the Sheet.
    // Added per row: pre-filling empty rows with checkboxes would make appendRow skip past them.
    sheet.getRange(sheet.getLastRow(), ZELLED_COL).insertCheckboxes();
    sheet.getRange(sheet.getLastRow(), COMPLETED_COL).insertCheckboxes();
  } finally {
    lock.releaseLock();
  }
  notify_(menu.shop.ntfyTopic, id, order);
  return { id, total: order.total };
}

// Phone notification through the free ntfy app (ntfy.sh): the seller subscribes to the Settings
// `ntfyTopic`. No topic = no notification. Anyone who knows the topic can read the notifications, so keep it random.
// Never fails the order: it is already saved, and a missed notification is the smaller problem.
function notify_(topic, id, order) {
  if (!topic) return;
  const lines = [
    order.qty + ' × ' + order.mains.join(' + ') + (order.extras.length ? ' + ' + order.extras.join(', ') : ''),
    (order.room === 'Pickup' ? 'Pickup' : 'Room ' + order.room) + ' · $' + order.total.toFixed(2),
  ];
  if (order.note) lines.push('“' + order.note + '”');
  try {
    // JSON body, not ntfy's Title header: headers can't carry names like "José".
    const res = UrlFetchApp.fetch('https://ntfy.sh/', {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      payload: JSON.stringify({ topic: topic.trim(), title: 'Order #' + id + ' · ' + order.name, message: lines.join('\n') }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) throw new Error('ntfy answered ' + res.getResponseCode() + ': ' + res.getContentText());
    return true;
  } catch (err) {
    console.error('ntfy failed: ' + err.message);
    return false;
  }
}

// Run once by hand from the Apps Script editor after adding `ntfyTopic` to Settings. It asks
// Google's "Allow" for outside requests (needed before deploying, or the live shop breaks) and
// sends a test notification.
function testNotify() {
  const topic = getMenu_().shop.ntfyTopic;
  if (!topic) throw new Error('Add an ntfyTopic row to the Settings tab first.');
  const sent = notify_(topic, 0, { name: 'Test', room: '101', mains: ['Test item'], extras: [], qty: 1, total: 0, note: 'It works!' });
  if (!sent) throw new Error('Test notification FAILED (reason in the log above). If it says permission: remove the script at myaccount.google.com/connections, run again, tick every box.');
  console.log('Test notification sent to ' + topic);
}

function listOrders_() {
  return rows_(SpreadsheetApp.getActive().getSheetByName('Orders')).map(r => ({
    id: r[0],
    time: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
    name: r[2], room: r[3], item: r[4], extras: r[5], qty: r[6], total: r[7], note: r[8],
    zelled: ticked_(r[9]),
    completed: ticked_(r[10]), // blank on rows from before the Completed column existed
  })).reverse();
}

// A checkbox reads as true; a TRUE typed by hand can come back as the text "TRUE".
function ticked_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

// Shops set up before the Completed column existed get its header on first use.
function ordersSheet_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Orders');
  const header = sheet.getRange(1, COMPLETED_COL);
  if (header.getValue() !== 'Completed') header.setValue('Completed');
  return sheet;
}

// Changes only the boxes sent: { zelled: true } leaves Completed alone and the other way round.
function updateOrder_(id, body) {
  const changes = [[ZELLED_COL, body.zelled], [COMPLETED_COL, body.completed]].filter(([, v]) => typeof v === 'boolean');
  if (!changes.length) throw new Error('Nothing to update.');
  const sheet = ordersSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === id) {
      // insertCheckboxes: rows from before the Completed column have a plain cell there.
      changes.forEach(([col, v]) => sheet.getRange(i + 1, col).insertCheckboxes().setValue(v));
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

// A leading ' tells Sheets "this is plain text": "=..." can't run as a formula, room "012" stays
// "012" (not 12), and "3-12" stays text (not a date). The ' itself is not stored.
// Empty strings stay empty (a lone ' would show up as a visible apostrophe-only cell).
function safeCell_(v) {
  return typeof v === 'string' && v !== '' ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
