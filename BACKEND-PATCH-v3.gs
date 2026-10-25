/* ============================================================================
   SHOPROCK BACKEND PATCH v3  -- paste at the VERY BOTTOM of your Code.gs
   (below BACKEND-PATCH.gs / patch v2). Functions defined here REPLACE the older
   functions of the same name (the same trick patch v2 used for publicConfig_).

   ONLY ONE EDIT in your existing code. In route_(), change the last line:
        default: fail_('Unknown action');
   to:
        default: if (v3Handles_(action)) return v3Route_(action, b, s); fail_('Unknown action');

   THEN: Ctrl+S -> Deploy -> Manage deployments -> pencil -> New version -> Deploy.
   (Optional, for reminder emails: run installReminderTrigger once, and in the
   dashboard Settings -> WhatsApp and contact, fill "Website link".)

   WHAT CHANGES
   - createOrder_  : variant prices + bundle saving are computed ON THE SERVER from
                     site_json (never trusted from the browser). A repeat submit with the
                     same idempotency key now returns the full payment details, not just an id.
   - trackOrder_   : rate-limited per order id; returns real status updates (from
                     FulfilmentEvents) -- status + date only, never internal notes/actor ids.
   - public.event / public.preferences / public.optout / analytics.report / prefs.list
   - public.thanksCoupon: one-time thank-you code for a DELIVERED + PAID order. OFF until you set
                     dashboard Settings -> "Thank-you code after delivery" above 0. Not tied to any review or rating.
   - publicConfig_ : same fields as before + shipping_flat, v3, v3_pricing
   TESTED against an in-memory stub of Sheets/Cache/Mail (tests/backend.test.js), NOT your live sheet.
   ========================================================================== */

PUBLIC_ACTIONS['public.thanksCoupon'] = 1; PUBLIC_ACTIONS['public.event'] = 1; PUBLIC_ACTIONS['public.preferences'] = 1; PUBLIC_ACTIONS['public.optout'] = 1;
DEFAULT_SETTINGS.site_url = ''; DEFAULT_SETTINGS.thanks_percent = '0'; DEFAULT_SETTINGS.thanks_days = '30';

var V3_EVENTS_ = ['product_view','add_to_cart','checkout_start','order_complete','addon_add','rec_click','wishlist_add','wa_click','bundle_add'];
var V3_ADMIN_ = {'analytics.report':'reports.read', 'prefs.list':'users.manage'};
var V3_FRIENDLY_ = {SUPPLIER_CONFIRMATION:'Confirmed with our supplier', FULFILMENT_PENDING:'Being prepared', SHIPPED:'Shipped', DELIVERED:'Delivered', CANCELLATION_REQUESTED:'Cancellation requested', CANCELLED:'Cancelled'};
var V3_PREF_HEADERS_ = ['email','consent_at','consent_text','dates_json','opted_out','opted_out_at'];

function v3Handles_(a) { return a === 'public.thanksCoupon' || a === 'public.event' || a === 'public.preferences' || a === 'public.optout' || !!V3_ADMIN_[a]; }
function v3Route_(action, b, s) {
  if (V3_ADMIN_[action]) need_(s, V3_ADMIN_[action]);
  switch (action) {
    case 'public.thanksCoupon': return v3Thanks_(b);
    case 'public.event': return v3Event_(b);
    case 'public.preferences': return v3Prefs_(b);
    case 'public.optout': return v3OptOut_(b);
    case 'analytics.report': return v3Report_();
    case 'prefs.list': return v3PrefsList_();
  }
  fail_('Unknown action');
}

function v3Sheet_(name, headers) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function v3Limit_(key, max, seconds) {
  var c = CacheService.getScriptCache(), n = Number(c.get(key) || 0);
  if (n >= max) fail_('Too many attempts. Please try again in a few minutes.');
  c.put(key, String(n + 1), seconds);
}
function v3Email_(e) { e = String(e || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 120) fail_('Enter a valid email.'); return e; }

/* ---------- analytics events: anonymous, whitelisted, rate-limited, no PII ---------- */
function v3Event_(b) {
  var ev = String(b.event || ''); if (V3_EVENTS_.indexOf(ev) < 0) fail_('Unknown event');
  var anon = String(b.anon || ''); if (!/^[0-9a-fA-F-]{36}$/.test(anon)) fail_('Bad id');
  v3Limit_('ev_' + anon, 120, 600);
  v3Sheet_('Events', ['ts','event','anon','page','product_id','addon','from']).appendRow([new Date(), ev, anon, String(b.page || '').slice(0, 40), String(b.product_id || '').slice(0, 40), b.addon ? 1 : 0, String(b.from || '').slice(0, 20)]);
  return {};
}

/* ---------- reminder consent ---------- */
function v3Prefs_(b) {
  if (b.consent !== true) fail_('Consent is required to sign up for reminders.');
  var email = v3Email_(b.email); v3Limit_('pf_' + email, 5, 3600);
  var dates = (b.dates || []).slice(0, 12).map(function (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.d || ''))) fail_('One of the dates is not valid.');
    return {t: String(d.t || 'Other').slice(0, 20), n: String(d.n || '').slice(0, 40), d: String(d.d)};
  });
  if (!dates.length) fail_('Add at least one date.');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = v3Sheet_('Preferences', V3_PREF_HEADERS_), v = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === email) { row = i + 1; break; }
    var rec = [email, new Date(), String(b.consent_text || '').slice(0, 300), JSON.stringify(dates), '', ''];
    if (row > 0) sh.getRange(row, 1, 1, 6).setValues([rec]); else sh.appendRow(rec);
  } finally { lock.releaseLock(); }
  return {};
}
function v3OptOut_(b) {
  var email = v3Email_(b.email); v3Limit_('oo_' + email, 5, 3600);
  var sh = v3Sheet_('Preferences', V3_PREF_HEADERS_), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === email) sh.getRange(i + 1, 5, 1, 2).setValues([[true, new Date()]]);
  return {}; // identical answer whether or not the email exists
}
function v3PrefsList_() {
  var v = v3Sheet_('Preferences', V3_PREF_HEADERS_).getDataRange().getValues(), rows = [];
  for (var i = 1; i < v.length; i++) rows.push({email: v[i][0], consent_at: v[i][1], dates: parseJson_(v[i][3], []), opted_out: String(v[i][4]) === 'true'});
  var trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sendReminders_'; });
  return {rows: rows, sending: trig ? 'Daily reminder trigger is installed. Emails go only to subscribed addresses, 7 days before a saved date, and only if "Website link" is set in Settings.' : 'No reminder trigger installed, so nothing is being sent. Run installReminderTrigger once to start.'};
}

/* ---------- report: real Events + real (non-demo) Orders; null when it cannot be computed ---------- */
function v3Report_() {
  var ev = v3Sheet_('Events', ['ts','event','anon','page','product_id','addon','from']).getDataRange().getValues(), c = {}, addonOrders = 0, since = null;
  V3_EVENTS_.forEach(function (k) { c[k] = 0; });
  for (var i = 1; i < ev.length; i++) { var k = ev[i][1]; if (c[k] !== undefined) c[k]++; if (k === 'order_complete' && Number(ev[i][5]) === 1) addonOrders++; if (!since) since = ev[i][0]; }
  var orders = readAll_('Orders').filter(function (o) { return String(o.is_test) !== 'true'; }),
      paid = orders.filter(function (o) { return o.payment_status === 'PAID'; }), by = {};
  paid.forEach(function (o) { var h = sha_(String(o.phone).slice(-10)); by[h] = (by[h] || 0) + 1; });
  var cust = Object.keys(by).length, rep = Object.keys(by).filter(function (h) { return by[h] > 1; }).length;
  return {product_view: c.product_view, add_to_cart: c.add_to_cart, checkout_start: c.checkout_start, rec_click: c.rec_click, wishlist_add: c.wishlist_add, wa_click: c.wa_click, bundle_add: c.bundle_add,
    orders: orders.length, paid_orders: paid.length,
    aov: paid.length ? Math.round(paid.reduce(function (a, o) { return a + Number(o.total); }, 0) / paid.length) : null,
    addon_conversion_pct: c.order_complete ? Math.round(addonOrders / c.order_complete * 1000) / 10 : null,
    repeat_pct: cust >= 10 ? Math.round(rep / cust * 1000) / 10 : null,
    since: since ? String(since instanceof Date ? since.toISOString() : since).slice(0, 10) : null};
}

/* ---------- reminder emails (free MailApp quota applies) ---------- */
function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendReminders_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendReminders_').timeBased().everyDays(1).atHour(9).create();
}
function sendReminders_() {
  var site = String(getSetting_('site_url') || '').trim(); if (!/^https:\/\//.test(site)) return; if (site.slice(-1) !== '/') site += '/';
  var log = v3Sheet_('ReminderLog', ['key','sent_at']), sent = {};
  log.getDataRange().getValues().forEach(function (r) { sent[r[0]] = 1; });
  var v = v3Sheet_('Preferences', V3_PREF_HEADERS_).getDataRange().getValues(), now = new Date(),
      target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7), name = getSetting_('store_name') || 'SHOPROCK';
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][4]) === 'true' || !v[i][1]) continue;
    parseJson_(v[i][3], []).forEach(function (d) {
      var p = String(d.d).split('-'); if (Number(p[1]) - 1 !== target.getMonth() || Number(p[2]) !== target.getDate()) return;
      var key = v[i][0] + '|' + d.d + '|' + target.getFullYear(); if (sent[key]) return;
      MailApp.sendEmail({to: v[i][0], subject: d.t + (d.n ? ' for ' + d.n : '') + ' is one week away',
        body: 'Hi! You asked us to remind you: ' + d.t + (d.n ? ' for ' + d.n : '') + ' is on ' + d.d + '.\nGift ideas: ' + site + 'shop.html\n\nYou get this only because you signed up for reminders. To stop, open ' + site + 'wishlist.html and use "Unsubscribe".\n\n' + name});
      log.appendRow([key, new Date()]); sent[key] = 1;
    });
  }
}


/* ---------- post-delivery thank-you code: owner switches it on with thanks_percent (0 = off). NOT tied to any review or rating. ---------- */
function v3ThanksOn_() { var p = Math.floor(Number(getSetting_('thanks_percent')) || 0); return p > 0 ? Math.min(30, p) : 0; }
function v3Thanks_(b) {
  var oid = String(b.order_id || '').trim(); v3Limit_('thx_' + oid.toUpperCase(), 10, 900);
  var o = readAll_('Orders').filter(function (x) { return x.order_id === oid && String(x.phone).slice(-4) === String(b.phone_last4); })[0];
  if (!o) fail_('Order not found');
  var pct = v3ThanksOn_(); if (!pct) fail_('Thank-you codes are not available right now.');
  if (String(o.is_test) === 'true') fail_('Demo orders do not get codes.');
  if (o.order_status !== 'DELIVERED' || o.payment_status !== 'PAID') fail_('Your thank-you code unlocks once your order is delivered.');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var logSh = v3Sheet_('ThanksLog', ['order_id', 'code']), rows = logSh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) if (rows[i][0] === o.order_id) { var ex = couponFind_(rows[i][1]); if (ex) return {code: ex.code, percent: Number(ex.value), expires: String(ex.expires || ''), used: Number(ex.used) > 0}; }
    var days = Math.max(7, Math.min(90, Math.floor(Number(getSetting_('thanks_days')) || 30))), exp = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10), now = new Date().toISOString(), code = 'THX-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    appendRow_('Coupons', {code: code, type: 'PERCENT', value: pct, min_order: 0, max_uses: 1, used: 0, expires: exp, active: true, created_at: now, updated_at: now});
    logSh.appendRow([o.order_id, code]); log_(null, 'thanks.coupon', o.order_id, {code: code});
    return {code: code, percent: pct, expires: exp, used: false};
  } finally { lock.releaseLock(); }
}

/* ---------- ORDER PRICING: variants + bundles, always from server data ---------- */
function v3Site_() { return parseJson_(getSetting_('site_json'), {}); }
function v3Unit_(p, it, site) {
  var vid = String(it.variant || ''); if (!vid) return {price: p.price, label: ''};
  var vs = (((site.meta || {})[p.product_id] || {}).variants) || [], v = vs.filter(function (x) { return x && x.id === vid && x.on !== false; })[0];
  if (!v || v.available === false) fail_('That option is no longer available');
  return {price: Number(v.price) > 0 ? Number(v.price) : p.price, label: String(v.label || '').slice(0, 40)};
}
/** A bundle saving applies only when EVERY product of the bundle is in the order tagged with that bundle id. */
function v3BundleSaving_(lines, site) {
  var saving = 0;
  (site.bundles || []).forEach(function (b) {
    if (!b || b.on === false || !(Number(b.price) > 0) || !b.items || b.items.length < 2) return;
    var found = b.items.map(function (id) { return lines.filter(function (l) { return l.p.product_id === id && l.bundle === b.id; })[0]; });
    if (found.some(function (l) { return !l; })) return;
    var reg = found.reduce(function (a, l) { return a + l.unit; }, 0);
    if (Number(b.price) < reg) saving += Math.round(reg - Number(b.price));
  });
  return saving;
}
function v3OrderOut_(oid, total, cmode, demo) {
  var out = {order_id: oid, total: total, mode: demo ? 'DEMO' : cmode, note: demo ? 'DEMO checkout: payment is NOT collected and this order can never be marked paid.' : (cmode === 'MANUAL' ? 'Order received. Please complete the UPI payment below so we can confirm it.' : 'Proceed to gateway payment.')};
  if (cmode === 'MANUAL') { out.upi_id = getSetting_('upi_id'); out.upi_payee_name = getSetting_('upi_payee_name') || getSetting_('store_name'); out.payment_instructions = getSetting_('payment_instructions'); out.whatsapp_number = getSetting_('whatsapp_number'); }
  return out;
}

function createOrder_(b) {
  var key = String(b.idempotency_key || ''); if (key.length < 8) fail_('Missing idempotency key');
  var existing = readAll_('Orders').filter(function (o) { return o.idempotency_key === key; })[0];
  if (existing) { var o2 = v3OrderOut_(existing.order_id, Number(existing.total), getSetting_('checkout_mode'), String(existing.is_test) === 'true'); o2.duplicate = true; return o2; }
  var errs = [];
  var name = String(b.customer_name || '').trim(), phone = String(b.phone || '').replace(/\D/g, '').slice(-10), pin = String(b.pin || '').trim();
  if (name.length < 2) errs.push('name'); if (!/^[6-9]\d{9}$/.test(phone)) errs.push('phone');
  if (!/^\d{6}$/.test(pin)) errs.push('pin'); if (String(b.address || '').trim().length < 10) errs.push('address');
  if (!b.city) errs.push('city'); if (!b.state) errs.push('state');
  if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) errs.push('email');
  if (!b.accepted_policies) errs.push('policy acknowledgement');
  if (!b.items || !b.items.length || b.items.length > 20) errs.push('items');
  if (errs.length) fail_('Invalid: ' + errs.join(', '));
  var catalogue = publicProducts_(), site = v3Site_(), items = [], subtotal = 0, seen = {};
  b.items.forEach(function (it) {
    var p = catalogue.filter(function (x) { return x.product_id === it.product_id; })[0];
    if (!p) fail_('An item is no longer available');
    if (seen[p.product_id]) fail_('Each product can appear only once; change its quantity instead.'); seen[p.product_id] = 1;
    var qty = Math.floor(Number(it.qty)); if (!(qty >= 1 && qty <= 10)) fail_('Invalid quantity');
    var u = v3Unit_(p, it, site);
    items.push({p: p, qty: qty, unit: u.price, label: u.label, bundle: String(it.bundle || '').slice(0, 40)}); subtotal += u.price * qty; // price from server data only
  });
  var bsave = v3BundleSaving_(items, site), disc = bsave, ccode = '';
  if (b.coupon_code) { var cc = couponCheck_(b.coupon_code, subtotal - bsave); disc += cc.discount; ccode = cc.code; }
  var shipping = Number(getSetting_('shipping_flat')) || 0, freeAbove = Number(getSetting_('free_shipping_above')) || 0; if (freeAbove > 0 && (subtotal - disc) >= freeAbove) shipping = 0;
  var total = subtotal - disc + shipping, now = new Date().toISOString(), oid = newId_('ORD');
  var cmode = getSetting_('checkout_mode'), demo = (cmode !== 'LIVE' && cmode !== 'MANUAL');
  appendRow_('Orders', {order_id: oid, created_at: now, customer_name: clean_(name), phone: phone, email: clean_(b.email || ''), address: clean_(b.address), city: clean_(b.city), state: clean_(b.state), pin: pin, gift_message: clean_(String(b.gift_message || '').slice(0, 300)), subtotal: subtotal, discount: disc, shipping: shipping, total: total, coupon_code: ccode, payment_status: 'UNPAID', fulfilment_status: 'NONE', order_status: 'PENDING_PAYMENT', refund_total: 0, idempotency_key: key, is_test: demo, updated_at: now});
  items.forEach(function (x) {
    var r = readAll_('ProductResearch').filter(function (q) { return q.product_id === x.p.product_id; })[0];
    appendRow_('OrderItems', {item_id: newId_('ITM'), order_id: oid, product_id: x.p.product_id, name: x.p.name + (x.label ? ' (' + x.label + ')' : ''), qty: x.qty, unit_price: x.unit, unit_cost: Number(r.supplier_price) || 0, packaging_cost: Number(r.packaging_cost) || 0, shipping_cost: Number(r.shipping_cost) || 0, payment_fee: x.unit * (Number(r.payment_fee_pct) || 0) / 100});
  });
  log_(null, 'order.create', oid, {total: total, test: demo, bundle_saving: bsave});
  if (ccode) { var cr = couponFind_(ccode); if (cr) updateRow_('Coupons', 'code', cr.code, {used: (Number(cr.used) || 0) + 1}); }
  try { notifyNewOrder_(oid, name, phone, b.email, items, total, cmode, demo); } catch (e) { logError_('notify', e); }
  return v3OrderOut_(oid, total, cmode, demo);
}

function trackOrder_(b) {
  var oid = String(b.order_id || '').trim(); v3Limit_('trk_' + oid.toUpperCase(), 10, 900);
  var o = readAll_('Orders').filter(function (x) { return x.order_id === oid && String(x.phone).slice(-4) === String(b.phone_last4); })[0];
  if (!o) fail_('Order not found');
  var updates = [{at: o.created_at, status: 'Order placed'}].concat(readAll_('FulfilmentEvents').filter(function (e) { return e.order_id === o.order_id && V3_FRIENDLY_[e.status]; })
    .map(function (e) { return {at: e.created_at, status: V3_FRIENDLY_[e.status]}; }));
  return {order_id: o.order_id, created_at: o.created_at, total: o.total, payment_status: o.payment_status, order_status: o.order_status, tracking_number: o.tracking_number || null, delivery_estimate: o.delivery_estimate || null, is_demo: String(o.is_test) === 'true', updates: updates, delivered: o.order_status === 'DELIVERED',
    thanks: !!(v3ThanksOn_() && o.order_status === 'DELIVERED' && o.payment_status === 'PAID' && String(o.is_test) !== 'true'),
    items: readAll_('OrderItems').filter(function (i) { return i.order_id === o.order_id; }).map(function (i) { return {name: i.name, qty: i.qty, unit_price: i.unit_price, product_id: i.product_id}; })};
}

/* ---------- config: same fields as before + flags. v3_pricing is true because createOrder_ above prices variants/bundles on the server. ---------- */
function publicConfig_() {
  var g = getSetting_;
  return {store_name: g('store_name') || 'SHOPROCK', tagline: g('tagline'), announcement: g('announcement'), whatsapp_number: g('whatsapp_number'),
    support_email: g('support_email'), instagram_url: g('instagram_url'), support_contact: g('support_contact'), checkout_mode: g('checkout_mode'),
    hero_title: g('hero_title'), hero_text: g('hero_text'), story_title: g('story_title'), story_text: g('story_text'), occasions: g('occasions'),
    faq: parseJson_(g('faq_json'), []), free_shipping_above: Number(g('free_shipping_above')) || 0, ga_id: g('ga_id'),
    hero_image: g('hero_image'), logo_url: g('logo_url'), wa_greeting: g('wa_greeting'), site: parseJson_(g('site_json'), {}),
    shipping_flat: g('shipping_flat'), v3: true, v3_pricing: true};
}
