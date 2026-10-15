// Backend for one shop. Lives inside the shop's Google Sheet (Extensions > Apps Script).
// Deploy as a web app: Execute as "Me", access "Anyone". See SETUP.md.

const MAX_QTY = 10;
// Column 10 is the Paid tick (called Zelled before cash existed; older Sheets keep that header).
const ORDER_HEADERS = ['#', 'Time', 'Name', 'Room', 'Item', 'Extras', 'Qty', 'Total', 'Note', 'Paid', 'Completed', 'Payment'];
const ZELLED_COL = 10;
const COMPLETED_COL = 11;
const PAYMENT_COL = 12;
const MENU_HEADERS = ['Type', 'Name', 'Price', 'Sale price', 'Sold out'];
const MAX_MENU_ITEMS = 60;
// Opening hours: one Settings row per day, hoursSun ... hoursSat, like "11:00-00:00".
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'menu') return json_(publicMenu_());
  return json_({ error: 'Unknown action.' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'order') return json_(placeOrder_(body));
    if (body.action === 'list') {
      checkPassword_(body.password);
      return json_({ orders: listOrders_(), ...status_(getMenu_().shop) });
    }
    if (body.action === 'update') {
      checkPassword_(body.password);
      return json_(updateOrder_(Number(body.id), body));
    }
    if (body.action === 'setOpen') {
      checkPassword_(body.password);
      return json_(setOpen_(body.open === true));
    }
    if (body.action === 'setCash') {
      checkPassword_(body.password);
      setSetting_('cash', body.cash === true ? 'yes' : 'no');
      return json_({ ok: true, ...status_(getMenu_().shop) });
    }
    if (body.action === 'setHours') {
      checkPassword_(body.password);
      return json_(setHours_(body.hours));
    }
    if (body.action === 'saveMenu') {
      checkPassword_(body.password);
      return json_(saveMenu_(body.items));
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
  // Sale price: optional, lower than Price; while set, buyers pay it and see the old price crossed out.
  // Sold out: tick it and buyers see the item but can't pick it.
  make('Menu', [
    MENU_HEADERS,
    ['main', 'Example item', 6, '', false],
    ['main', 'Another item', 7, '', false],
    ['extra', 'Example extra', 0.5, '', false],
  ]);
  make('Settings', [
    ['Key', 'Value'],
    ['zelleTo', "CHANGE ME: the seller's Zelle phone or email"],
    ['open', 'yes'],
    ['deliveryFee', 1],
    // Buyers may choose to pay cash when they get their food (yes/no). The admin page has a switch.
    ['cash', 'yes'],
    // Who gets a Telegram message per order: chat ids, comma-separated. Find them with telegramChats().
    ['telegramChatId', ''],
    // Who gets an email per order: addresses, comma-separated (optional).
    ['notifyEmail', ''],
  ]);
  make('Orders', [ORDER_HEADERS]);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) props.setProperty('ADMIN_PASSWORD', '1234');
}

function getMenu_() {
  const ss = SpreadsheetApp.getActive();
  const menu = { shop: {}, mains: [], extras: [] };
  rows_(ss.getSheetByName('Menu')).forEach(([type, name, price, sale, soldOut]) => {
    const item = { name: String(name).trim(), price: Number(price) };
    if (!item.name || !(item.price >= 0)) return;
    // On sale: `price` becomes the sale price, so every total (here and in the browser) uses it
    // with no extra code; `was` keeps the regular price for the crossed-out label.
    const salePrice = Number(sale);
    if (sale !== '' && sale != null && salePrice >= 0 && salePrice < item.price) {
      item.was = item.price;
      item.price = salePrice;
    }
    if (ticked_(soldOut)) item.soldOut = true;
    const t = String(type).trim().toLowerCase();
    if (t === 'main') menu.mains.push(item);
    else if (t === 'extra') menu.extras.push(item);
  });
  rows_(ss.getSheetByName('Settings')).forEach(([key, value]) => {
    if (key) menu.shop[String(key).trim()] = String(value).trim();
  });
  // The Close/Open button: open unless the sheet says no (also covers an unticked checkbox, which reads as "false").
  const switchOpen = !/^(no|false|closed)$/i.test(menu.shop.open || '');
  // No hours rows at all = no hours: open whenever the switch is (how every shop worked before hours).
  const hasHours = DAYS.some(d => menu.shop['hours' + d] !== undefined);
  const hours = hasHours ? DAYS.map(d => menu.shop['hours' + d] || '') : null;
  // The Sheet's own time zone (File > Settings), so a buyer's phone clock can't change it.
  // 'u' = day of the week, 1 = Monday ... 7 = Sunday.
  const [u, hm] = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'u HH:mm').split(' ');
  const now = hoursNow_(hours, Number(u) % 7, toMinutes_(hm));
  Object.assign(menu.shop, {
    open: switchOpen && now.open, // what decides if an order goes through
    switchOpen,
    closedBy: !switchOpen ? 'switch' : !now.open ? 'hours' : null,
    hours,
    today: Number(u) % 7,
    nextOpen: now.next,
  });
  // Cash on delivery/pickup: allowed unless the sheet says no (missing row = allowed).
  menu.shop.cash = !/^(no|false|off)$/i.test(menu.shop.cash || '');
  // Delivery costs a flat fee per order (default $1); pickup is free.
  const fee = Number(menu.shop.deliveryFee);
  menu.shop.deliveryFee = menu.shop.deliveryFee !== undefined && menu.shop.deliveryFee !== '' && fee >= 0 ? fee : 1;
  return menu;
}

// The menu link is public: only the settings the website uses. Everything else in Settings
// (like telegramChatId and notifyEmail) stays private.
function publicMenu_() {
  const menu = getMenu_();
  const { zelleTo, open, deliveryFee } = menu.shop;
  return { ...menu, shop: { zelleTo, deliveryFee, ...status_(menu.shop), open } }; // open last: can order now
}

// Open/closed details for the shop page and the admin page. `open` here is the Close/Open
// button; publicMenu_ keeps `open` = "can order right now".
function status_(shop) {
  const { switchOpen, closedBy, hours, today, nextOpen, cash } = shop;
  return { open: switchOpen, closedBy, hours, today, nextOpen, cash };
}

// "13:30" -> 810 minutes after midnight, or null if it isn't a time from 00:00 to 23:59.
function toMinutes_(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// One day's hours, "11:00-00:00" -> { from: 660, to: 1440 }. Closing at 00:00 means midnight; closing
// before opening (18:00-01:00) runs past midnight. Blank, "closed" or anything unreadable = closed.
function dayHours_(text) {
  const parts = String(text || '').split('-');
  if (parts.length !== 2) return null;
  const from = toMinutes_(parts[0]);
  let to = toMinutes_(parts[1]);
  if (from === null || to === null) return null;
  if (to === 0) to = 1440; // 00:00-00:00 = open all day (any other 00:00 close works either way)
  if (to === from) return null;
  return { from, to: to < from ? to + 1440 : to };
}

// Is the shop inside its hours at `day` (0 = Sunday) and `minute` (after midnight), and when does it
// open next ({ day, inDays, time: "11:00" }, or null if it never does)? No hours = always open.
function hoursNow_(hours, day, minute) {
  if (!hours) return { open: true, next: null };
  const at = d => dayHours_(hours[(d + 7) % 7]);
  const today = at(day);
  const yesterday = at(day - 1);
  const open = !!(today && minute >= today.from && minute < today.to) || !!(yesterday && minute + 1440 < yesterday.to);
  let next = null;
  for (let i = 0; i < 8 && !next; i++) {
    const h = at(day + i);
    if (h && (i > 0 || h.from > minute)) {
      next = { day: (day + i) % 7, inDays: i, time: String(Math.floor(h.from / 60)).padStart(2, '0') + ':' + String(h.from % 60).padStart(2, '0') };
    }
  }
  return { open, next };
}

// Works out the real price from the Menu tab. Anything the browser says about price is ignored.
function priceOrder_(menu, o) {
  const name = clean_(o.name, 40);
  const delivery = o.delivery === true;
  const room = delivery ? clean_(o.room, 20) : 'Pickup';
  const note = clean_(o.note, 200);
  const cash = o.payment === 'cash'; // anything else is Zelle, as before cash existed
  if (cash && !menu.shop.cash) throw new Error("This shop isn't taking cash right now. Please pay with Zelle.");
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
  return { name, room, note, cash, mains: mains.map(m => m.name), extras: extras.map(x => x.name), qty, total: (unit * qty + fee) / 100 };
}

function pickItems_(list, names) {
  return [...new Set(Array.isArray(names) ? names : [])].map(n => {
    const found = list.find(i => i.name === n);
    if (!found) throw new Error('That is not on the menu anymore: ' + n);
    if (found.soldOut) throw new Error('Sorry, ' + n + ' just sold out. Please pick something else.');
    return found;
  });
}

function placeOrder_(body) {
  const menu = getMenu_();
  if (!menu.shop.open) {
    throw new Error((menu.shop.closedBy === 'hours' ? 'Sorry, we just closed' : 'Sorry, we just sold out') +
      ", so this order didn't go through. If you already sent the Zelle, message the seller for a refund.");
  }
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
      order.qty, order.total, order.note, false, false, order.cash ? 'Cash' : 'Zelle',
    ].map(safeCell_));
    // Real checkboxes, so the seller can also tick "Paid"/"Completed" right in the Sheet.
    // Added per row: pre-filling empty rows with checkboxes would make appendRow skip past them.
    sheet.getRange(sheet.getLastRow(), ZELLED_COL).insertCheckboxes();
    sheet.getRange(sheet.getLastRow(), COMPLETED_COL).insertCheckboxes();
  } finally {
    lock.releaseLock();
  }
  notify_(menu.shop, id, order);
  return { id, total: order.total };
}

// Tells the seller about a new order, by Telegram and/or email, whichever the Settings tab has:
// - telegramChatId: Telegram chat ids (comma-separated). One bot for every shop; its token is the
//   Script Property TELEGRAM_TOKEN (a password: never in the Sheet or the code).
// - notifyEmail: email addresses (comma-separated). Sent from the Google account that deployed the
//   script, so every shop shares that account's Gmail quota (~100 recipients a day on a free account).
// Neither set = nothing sent. Never fails the order: it is already saved, and a missed message is the
// smaller problem. Returns false if anything that was tried failed (testNotify uses that).
// (ntfy.sh was tried first: its free per-address limit is shared by every Apps Script user, so it refused.)
function notify_(shop, id, order) {
  const title = 'New order #' + id + ' · ' + order.name;
  const lines = [
    order.qty + ' × ' + order.mains.join(' + ') + (order.extras.length ? ' + ' + order.extras.join(', ') : ''),
    (order.room === 'Pickup' ? 'Pickup' : 'Room ' + order.room) + ' · $' + order.total.toFixed(2) + ' · ' + (order.cash ? 'Cash' : 'Zelle'),
  ];
  if (order.note) lines.push('“' + order.note + '”');
  const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  // map, not every: one failed chat must not stop the rest from getting the order.
  const results = list(shop.telegramChatId).map(chat => telegram_('sendMessage', { chat_id: chat, text: [title, ...lines].join('\n') }) !== null);
  const emails = list(shop.notifyEmail).filter(x => x.includes('@'));
  if (emails.length) {
    try {
      MailApp.sendEmail({ to: emails.join(','), subject: title, body: lines.join('\n') });
      results.push(true);
    } catch (err) {
      console.error('Email failed: ' + err.message);
      results.push(false);
    }
  }
  return results.every(Boolean);
}

// One Telegram API call. Returns the answer, or null (and logs why) if it failed or there's no token.
function telegram_(method, payload) {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
  if (!token) return null;
  try {
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      payload: JSON.stringify(payload || {}),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) throw new Error('Telegram answered ' + res.getResponseCode() + ': ' + res.getContentText());
    return JSON.parse(res.getContentText());
  } catch (err) {
    // Network errors quote the URL, which contains the token: blank it out before logging.
    console.error('Telegram failed: ' + err.message.split(token).join('<token>'));
    return null;
  }
}

// Run by hand from the Apps Script editor after filling telegramChatId and/or notifyEmail.
// Sends a test order message. The first time, Google asks for permission ("connect to an external
// service", "send email as you"): tick every box.
function testNotify() {
  const shop = getMenu_().shop;
  if (!shop.telegramChatId && !shop.notifyEmail) {
    throw new Error('Fill the Settings row telegramChatId (run telegramChats to find it) and/or notifyEmail first.');
  }
  if (shop.telegramChatId && !PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN')) {
    throw new Error('Add the bot token first: Project Settings (gear) > Script Properties > TELEGRAM_TOKEN.');
  }
  const sent = notify_(shop, 0, { name: 'Test', room: '101', mains: ['Test item'], extras: [], qty: 1, total: 0, note: 'It works!' });
  if (!sent) throw new Error('Test message FAILED (reason in the log above). Telegram: did they press Start on the bot?');
  console.log('Test message sent to ' + [shop.telegramChatId, shop.notifyEmail].filter(Boolean).join(', '));
}

// Run by hand: lists everyone who pressed Start on the bot recently (Telegram keeps about a day),
// so their chat id can be copied into Settings > telegramChatId.
function telegramChats() {
  const res = telegram_('getUpdates', {});
  if (!res) throw new Error('Could not reach Telegram. Is TELEGRAM_TOKEN set? (See the log.)');
  const seen = {};
  res.result.forEach(u => {
    const c = (u.message || u.my_chat_member || {}).chat;
    if (c && !seen[c.id]) seen[c.id] = c.id + '  ' + [c.first_name, c.last_name].filter(Boolean).join(' ') + (c.username ? '  @' + c.username : '');
  });
  const list = Object.values(seen);
  console.log(list.length ? 'Chat ids:\n' + list.join('\n') : 'Nobody yet: open the bot in Telegram, press Start, then run this again.');
}

function listOrders_() {
  return rows_(SpreadsheetApp.getActive().getSheetByName('Orders')).map(r => ({
    id: r[0],
    time: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
    name: r[2], room: r[3], item: r[4], extras: r[5], qty: r[6], total: r[7], note: r[8],
    zelled: ticked_(r[9]),
    completed: ticked_(r[10]), // blank on rows from before the Completed column existed
    payment: /^cash$/i.test(String(r[11] || '').trim()) ? 'cash' : 'zelle', // blank on rows from before cash
  })).reverse();
}

// A checkbox reads as true; a TRUE typed by hand can come back as the text "TRUE".
function ticked_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

// Shops set up before the Completed and Payment columns existed get their headers on first use.
function ordersSheet_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Orders');
  [[COMPLETED_COL, 'Completed'], [PAYMENT_COL, 'Payment']].forEach(([col, title]) => {
    const header = sheet.getRange(1, col);
    if (header.getValue() !== title) header.setValue(title);
  });
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
  setSetting_('open', open ? 'yes' : 'no');
  return { ok: true, ...status_(getMenu_().shop) };
}

// The admin page's Hours tab sends 7 days, Sunday first: "" (closed) or "11:00-00:00".
// All 7 are checked before anything is written.
function setHours_(hours) {
  if (!Array.isArray(hours) || hours.length !== 7) throw new Error('Send hours for all 7 days.');
  const values = hours.map((h, i) => {
    const text = String(h == null ? '' : h).trim();
    if (text === '' || text.toLowerCase() === 'closed') return 'closed';
    if (!dayHours_(text)) throw new Error(DAYS[i] + ': pick an opening and a closing time that are different.');
    return text;
  });
  values.forEach((v, i) => setSetting_('hours' + DAYS[i], v));
  return { ok: true, ...status_(getMenu_().shop) };
}

// Changes one Settings row, or adds it. Stored as text, so Sheets can't turn "11:00-00:00" into a time.
function setSetting_(key, value) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Settings');
  const rows = sheet.getDataRange().getValues();
  const i = rows.findIndex((r, n) => n > 0 && String(r[0]).trim() === key);
  if (i > 0) sheet.getRange(i + 1, 2).setValue(safeCell_(value));
  else sheet.appendRow([key, safeCell_(value)]);
}

// The admin page's Menu tab sends the whole menu; it replaces the Menu tab. Everything is checked
// before anything is written, so a bad menu changes nothing.
function saveMenu_(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length > MAX_MENU_ITEMS) throw new Error('A menu can have at most ' + MAX_MENU_ITEMS + ' items.');
  const seen = {};
  const rows = list.map(it => {
    const type = String(it && it.type);
    if (type !== 'main' && type !== 'extra') throw new Error('Unknown item type: ' + type);
    const name = clean_(it.name, 41);
    if (!name || name.length > 40) throw new Error('Every item needs a name of 1 to 40 characters.');
    const key = type + ':' + name.toLowerCase();
    if (seen[key]) throw new Error('"' + name + '" is on the menu twice.');
    seen[key] = true;
    const price = toPrice_(it.price);
    if (price === null) throw new Error('"' + name + '": the price must be a number from 0 to 999.');
    let sale = '';
    if (it.sale !== '' && it.sale != null) {
      sale = toPrice_(it.sale);
      if (sale === null) throw new Error('"' + name + '": the sale price must be a number from 0 to 999.');
      if (sale >= price) throw new Error('"' + name + '": the sale price must be lower than the regular price.');
    }
    return [type, name, price, sale, it.soldOut === true];
  });
  if (!rows.some(r => r[0] === 'main')) throw new Error('The menu needs at least one item (not just extras).');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName('Menu');
    sheet.getRange(1, 1, 1, MENU_HEADERS.length).setValues([MENU_HEADERS]); // older Sheets had no Sale price column
    const old = sheet.getLastRow() - 1;
    if (old > 0) sheet.getRange(2, 1, old, MENU_HEADERS.length).clearContent();
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, MENU_HEADERS.length).setValues(rows.map(r => r.map(safeCell_)));
      sheet.getRange(2, MENU_HEADERS.length, rows.length, 1).insertCheckboxes(); // Sold out: tickable in the Sheet too
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// A price as dollars rounded to the cent, or null if it isn't a number from 0 to 999.
function toPrice_(v) {
  const n = typeof v === 'number' ? v : (String(v).trim() === '' ? NaN : Number(v));
  return n >= 0 && n <= 999 ? cents_(n) / 100 : null;
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
