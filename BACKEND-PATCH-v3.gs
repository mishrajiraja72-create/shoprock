/* ============================================================================
   SHOPROCK BACKEND PATCH v3   (paste BELOW your existing Apps Script + BACKEND-PATCH.gs)

   STATUS: WRITTEN BUT NOT RUN against your live Apps Script. Your main Apps Script
   file (router / orders / auth) was not in the ZIP, so I could not execute or
   integrate this. The storefront treats every feature here as OFF until the
   config flag it needs is true, so nothing breaks if you deploy nothing.

   WHAT THIS ADDS
     public.event         anonymous analytics events (no names/phones/emails)
     public.preferences   reminder sign-up (requires consent === true)
     public.optout        unsubscribe by email
     analytics.report     owner-only report from real events + orders
     prefs.list           owner-only list of consents
     sendReminders_()     daily email reminders (needs installReminderTrigger once)

   WHAT THIS DOES NOT DO (needs your createOrder code, which I have not seen)
     - honour variant prices or bundle prices at order time  -> v3_pricing stays false
     - add tracking "updates" / delivery_estimate to public.trackOrder
     Do NOT set v3_pricing true until createOrder prices each line from the
     product/variant/bundle on the SERVER. Otherwise customers would see a price
     the server does not charge.

   ONE-TIME INTEGRATION (3 steps)
   1) Paste this file below your existing code. This redefines publicConfig_ (same
      fields as BACKEND-PATCH.gs plus v3, v3_pricing, shipping_flat).
   2) In doPost, BEFORE your existing action switch, add:
          if (v3Handles_(action)) { return <your usual JSON response helper>({ok:true, data: v3Route_(action, body)}); }
      (use the same helper/format your other actions use to return {ok:true,data}).
      Errors thrown here should go through your normal error response.
   3) Replace the body of v3Admin_ with a call to your EXISTING owner-session check
      (the one your other admin actions use). Until you do, analytics.report and
      prefs.list refuse every request (fail closed).
   Then: run installReminderTrigger once if you want reminder emails, and set a
   setting "site_url" (e.g. https://yourname.github.io/shoprock/site/) so emails
   can point to the opt-out page. Without site_url, no reminder is sent.
   ========================================================================== */

var V3_EVENTS_ = ['product_view','add_to_cart','checkout_start','order_complete','addon_add','rec_click','wishlist_add','wa_click','bundle_add'];
var V3_ACTIONS_ = ['public.event','public.preferences','public.optout','analytics.report','prefs.list'];

function v3Handles_(action) { return V3_ACTIONS_.indexOf(action) >= 0; }

function v3Route_(action, body) {
  switch (action) {
    case 'public.event': return v3Event_(body);
    case 'public.preferences': return v3Prefs_(body);
    case 'public.optout': return v3OptOut_(body);
    case 'analytics.report': v3Admin_(body); return v3Report_();
    case 'prefs.list': v3Admin_(body); return v3PrefsList_();
  }
  throw new Error('Unknown action');
}

/* FAIL CLOSED until wired to your real owner check. */
function v3Admin_(body) {
  throw new Error('Not authorised: wire v3Admin_ to your existing owner-session check in BACKEND-PATCH-v3.gs');
}

function v3Sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); // standalone script? use SpreadsheetApp.openById('YOUR_SHEET_ID')
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

function v3Limit_(key, max, seconds) { // simple per-key rate limit
  var c = CacheService.getScriptCache(), n = Number(c.get(key) || 0);
  if (n >= max) throw new Error('Too many requests. Please try again shortly.');
  c.put(key, String(n + 1), seconds);
}

function v3Email_(e) { e = String(e || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 120) throw new Error('Enter a valid email.'); return e; }

/* ---- analytics events: anonymous, whitelisted, rate-limited ---- */
function v3Event_(b) {
  var ev = String(b.event || '');
  if (V3_EVENTS_.indexOf(ev) < 0) throw new Error('Unknown event');
  var anon = String(b.anon || ''); if (!/^[0-9a-fA-F-]{36}$/.test(anon)) throw new Error('Bad id');
  v3Limit_('ev_' + anon, 120, 600);
  var total = Number(b.total); if (!isFinite(total) || total < 0 || total > 1000000) total = '';
  var sh = v3Sheet_('Events', ['ts','event','anon','page','product_id','order_id','total','addon','from']);
  sh.appendRow([new Date(), ev, anon, String(b.page || '').slice(0, 40), String(b.product_id || '').slice(0, 40), String(b.order_id || '').slice(0, 40), total, b.addon ? 1 : 0, String(b.from || '').slice(0, 20)]);
  return {};
}

/* ---- reminder consent: explicit consent required, stored with timestamp + the exact wording shown ---- */
function v3Prefs_(b) {
  if (b.consent !== true) throw new Error('Consent is required to sign up for reminders.');
  var email = v3Email_(b.email); v3Limit_('pf_' + email, 5, 3600);
  var dates = (b.dates || []).slice(0, 12).map(function (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.d || ''))) throw new Error('Bad date');
    return {t: String(d.t || 'Other').slice(0, 20), n: String(d.n || '').slice(0, 40), d: String(d.d)};
  });
  if (!dates.length) throw new Error('Add at least one date.');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = v3Sheet_('Preferences', ['email','consent_at','consent_text','dates_json','opted_out','opted_out_at']), v = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === email) { row = i + 1; break; }
    var rec = [email, new Date(), String(b.consent_text || '').slice(0, 300), JSON.stringify(dates), '', ''];
    if (row > 0) sh.getRange(row, 1, 1, 6).setValues([rec]); else sh.appendRow(rec);
  } finally { lock.releaseLock(); }
  return {};
}

function v3OptOut_(b) {
  var email = v3Email_(b.email); v3Limit_('oo_' + email, 5, 3600);
  var sh = v3Sheet_('Preferences', ['email','consent_at','consent_text','dates_json','opted_out','opted_out_at']), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === email) { sh.getRange(i + 1, 5, 1, 2).setValues([[true, new Date()]]); }
  return {}; // same answer whether or not the email existed (no account enumeration)
}

function v3PrefsList_() {
  var sh = v3Sheet_('Preferences', ['email','consent_at','consent_text','dates_json','opted_out','opted_out_at']), v = sh.getDataRange().getValues(), rows = [];
  for (var i = 1; i < v.length; i++) rows.push({email: v[i][0], consent_at: v[i][1], dates: JSON.parse(v[i][3] || '[]'), opted_out: String(v[i][4]) === 'true'});
  var trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sendReminders_'; });
  return {rows: rows, sending: trig ? 'Daily reminder trigger is installed. Emails go only to subscribed, non-opted-out addresses, 7 days before a saved date.' : 'No reminder trigger installed: nothing is being sent. Run installReminderTrigger once to start.'};
}

/* ---- report: from REAL Events + Orders rows. Anything it cannot compute is null (dashboard shows a dash). ---- */
function v3Report_() {
  var ev = v3Sheet_('Events', ['ts','event','anon','page','product_id','order_id','total','addon','from']).getDataRange().getValues(), c = {}, addonOrders = 0, since = null;
  V3_EVENTS_.forEach(function (k) { c[k] = 0; });
  for (var i = 1; i < ev.length; i++) { var k = ev[i][1]; if (c[k] !== undefined) c[k]++; if (k === 'order_complete' && Number(ev[i][7]) === 1) addonOrders++; if (!since) since = ev[i][0]; }
  var out = {product_view: c.product_view, add_to_cart: c.add_to_cart, checkout_start: c.checkout_start, rec_click: c.rec_click, wishlist_add: c.wishlist_add, wa_click: c.wa_click,
    orders: null, aov: null, addon_conversion_pct: c.order_complete ? Math.round(addonOrders / c.order_complete * 1000) / 10 : null, repeat_pct: null,
    since: since ? Utilities.formatDate(new Date(since), Session.getScriptTimeZone(), 'yyyy-MM-dd') : null};
  var osh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders'); // adjust if your orders sheet has another name
  if (osh && osh.getLastRow() > 1) {
    var v = osh.getDataRange().getValues(), h = v[0].map(function (x) { return String(x).toLowerCase(); }), ti = h.indexOf('total'), pi = h.indexOf('phone'), di = h.indexOf('is_demo'), n = 0, sum = 0, by = {};
    for (var r = 1; r < v.length; r++) {
      if (di >= 0 && String(v[r][di]).toLowerCase() === 'true') continue;
      n++; if (ti >= 0) sum += Number(v[r][ti]) || 0;
      if (pi >= 0 && v[r][pi]) { var hsh = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(v[r][pi]).slice(-10))); by[hsh] = (by[hsh] || 0) + 1; }
    }
    out.orders = n; if (ti >= 0 && n) out.aov = Math.round(sum / n);
    var cust = Object.keys(by).length; if (pi >= 0 && cust >= 10) out.repeat_pct = Math.round(Object.keys(by).filter(function (k) { return by[k] > 1; }).length / cust * 1000) / 10; // null below 10 customers: too little data
  }
  return out;
}

/* ---- reminder emails: real, free (MailApp), only if you install the trigger ---- */
function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendReminders_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendReminders_').timeBased().everyDays(1).atHour(9).create();
}
function sendReminders_() {
  var site = String(getSetting_('site_url') || ''); if (!/^https:\/\//.test(site)) return; // no opt-out page => do not send
  var sh = v3Sheet_('Preferences', ['email','consent_at','consent_text','dates_json','opted_out','opted_out_at']), log = v3Sheet_('ReminderLog', ['key','sent_at']);
  var sent = {}; log.getDataRange().getValues().forEach(function (r) { sent[r[0]] = 1; });
  var v = sh.getDataRange().getValues(), today = new Date(), target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7), name = String(getSetting_('store_name') || 'SHOPROCK');
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][4]) === 'true' || !v[i][1]) continue; // opted out or no consent timestamp
    JSON.parse(v[i][3] || '[]').forEach(function (d) {
      var dt = new Date(d.d + 'T00:00:00'); if (dt.getMonth() !== target.getMonth() || dt.getDate() !== target.getDate()) return;
      var key = v[i][0] + '|' + d.d + '|' + target.getFullYear(); if (sent[key]) return;
      MailApp.sendEmail({to: v[i][0], subject: d.t + (d.n ? ' for ' + d.n : '') + ' is one week away',
        body: 'Hi! You asked us to remind you: ' + d.t + (d.n ? ' for ' + d.n : '') + ' is on ' + d.d + '.\nGift ideas: ' + site + 'shop.html\n\nYou are receiving this only because you signed up for reminders. To stop, go to ' + site + 'wishlist.html and use "Unsubscribe".\n' + name});
      log.appendRow([key, new Date()]);
    });
  }
}

/* ---- config: same as BACKEND-PATCH.gs + v3 flags. Redefines publicConfig_ (last definition wins). ---- */
function publicConfig_() {
  var g = getSetting_;
  return {store_name: g('store_name') || 'SHOPROCK', tagline: g('tagline'), announcement: g('announcement'), whatsapp_number: g('whatsapp_number'),
    support_email: g('support_email'), instagram_url: g('instagram_url'), support_contact: g('support_contact'), checkout_mode: g('checkout_mode'),
    hero_title: g('hero_title'), hero_text: g('hero_text'), story_title: g('story_title'), story_text: g('story_text'), occasions: g('occasions'),
    faq: parseJson_(g('faq_json'), []), free_shipping_above: Number(g('free_shipping_above')) || 0, ga_id: g('ga_id'),
    hero_image: g('hero_image'), logo_url: g('logo_url'), wa_greeting: g('wa_greeting'), site: parseJson_(g('site_json'), {}),
    shipping_flat: g('shipping_flat'),
    v3: true,            // events + reminder sign-up are live (this patch deployed and wired)
    v3_pricing: false};  // KEEP FALSE until createOrder prices variants/bundles on the server
}
