/* ============================================================================
   SHOPROCK BACKEND PATCH v4 -- customer sign-in: Google, email + password, email code
   Paste at the VERY BOTTOM of Code.gs, BELOW BACKEND-PATCH-v3.gs (v3 must already be installed).
   NO new edit to route_() is needed: this patch replaces v3Handles_ / v3Route_ (the hook v3 already added).
   If you pasted an older copy of THIS patch, delete it first (first comment line to end of file).

   THEN: Ctrl+S -> Deploy -> Manage deployments -> pencil -> New version -> Deploy.

   GOOGLE SIGN-IN needs ONE setting (the Client ID is public, there is NO secret):
     Apps Script -> Project Settings (gear) -> Script properties -> Add:   GOOGLE_CLIENT_ID = 1234-abc.apps.googleusercontent.com
   and in Google Cloud Console -> APIs & Services -> Credentials -> OAuth client ID (Web application)
     Authorised JavaScript origins:  https://<your-github-username>.github.io   (origin only, no path, no trailing slash)
   Until GOOGLE_CLIENT_ID is set, the Google button is simply not shown to customers.

   WHAT THIS ADDS
   - public.acctGoogle         : verifies a Google ID token with Google, checks audience (= your Client ID), issuer, expiry and
                                 email_verified, then opens a session for that verified email. No secret is ever in the browser.
   - public.acctRegisterStart  : email + password (min 8). The address must be PROVED with a 6-digit emailed code before the account exists,
   - public.acctRegisterVerify : so nobody can register someone else's email and read their orders.
   - public.acctLogin          : email + password. Rate limited. Same error whether the email exists or not.
   - public.acctSetPassword    : a signed-in customer (e.g. after an email code) sets or resets their password.
   - public.acctMe             : account details for the signed-in customer.
   - v3AcctSend_ now also sends a code to emails that have an account (not only emails with orders), so "forgot password" works.
   - publicConfig_ also reports google_client_id (public) and v4:true.
   Passwords are stored as salted, iterated SHA-256 hashes (Apps Script has no bcrypt). Plain passwords are never stored or logged.
   TESTED against an in-memory stub (tests/backend_v4.test.js), NOT against Google or your live sheet.
   ========================================================================== */

['public.acctGoogle', 'public.acctRegisterStart', 'public.acctRegisterVerify', 'public.acctLogin', 'public.acctSetPassword', 'public.acctMe'].forEach(function (a) { PUBLIC_ACTIONS[a] = 1; });

var V4_ACTIONS_ = {'public.acctGoogle': 'v4Google_', 'public.acctRegisterStart': 'v4RegStart_', 'public.acctRegisterVerify': 'v4RegVerify_', 'public.acctLogin': 'v4Login_', 'public.acctSetPassword': 'v4SetPassword_', 'public.acctMe': 'v4Me_'};
var V4_ACCT_HEADERS_ = ['email', 'name', 'pw_salt', 'pw_hash', 'providers', 'created_at', 'last_login'];
var V4_PEND_HEADERS_ = ['email', 'code_hash', 'pw_salt', 'pw_hash', 'expires', 'attempts'];
var V4_ROUNDS_ = 1500;

/* replaces the v3 versions (same names) so the existing route_() hook reaches the new actions */
function v3Handles_(a) { return /^public\.acct(Send|Verify|Orders|Claim|Logout)$/.test(a) || !!V4_ACTIONS_[a] || a === 'public.thanksCoupon' || a === 'public.event' || a === 'public.preferences' || a === 'public.optout' || !!V3_ADMIN_[a]; }
function v3Route_(action, b, s) {
  if (V3_ADMIN_[action]) need_(s, V3_ADMIN_[action]);
  switch (action) {
    case 'public.acctGoogle': return v4Google_(b);
    case 'public.acctRegisterStart': return v4RegStart_(b);
    case 'public.acctRegisterVerify': return v4RegVerify_(b);
    case 'public.acctLogin': return v4Login_(b);
    case 'public.acctSetPassword': return v4SetPassword_(b);
    case 'public.acctMe': return v4Me_(b);
    case 'public.acctSend': return v3AcctSend_(b);
    case 'public.acctVerify': return v3AcctVerify_(b);
    case 'public.acctOrders': return v3AcctOrders_(b);
    case 'public.acctClaim': return v3AcctClaim_(b);
    case 'public.acctLogout': return v3AcctLogout_(b);
    case 'public.thanksCoupon': return v3Thanks_(b);
    case 'public.event': return v3Event_(b);
    case 'public.preferences': return v3Prefs_(b);
    case 'public.optout': return v3OptOut_(b);
    case 'analytics.report': return v3Report_();
    case 'prefs.list': return v3PrefsList_();
  }
  fail_('Unknown action');
}

function v4ClientId_() {
  var id = ''; try { id = String(PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '').trim(); } catch (e) {}
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(id) ? id : '';
}
function v4Pw_(pw) {
  pw = String(pw === undefined || pw === null ? '' : pw);
  if (pw.length < 8) fail_('Password must be at least 8 characters.');
  if (pw.length > 72) fail_('Password is too long (max 72 characters).');
  return pw;
}
function v4Hash_(salt, pw) { var h = sha_(salt + '|' + pw); for (var i = 0; i < V4_ROUNDS_; i++) h = sha_(h + salt + pw); return h; }
function v4Same_(a, b) { a = String(a); b = String(b); var d = a.length ^ b.length; for (var i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function v4Acct_(email) {
  var sh = v3Sheet_('CustAccounts', V4_ACCT_HEADERS_), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === email) return {sh: sh, row: i + 1, rec: v[i]};
  return {sh: sh, row: -1, rec: null};
}
function v4Providers_(cur, add) { var p = String(cur || '').split(',').filter(Boolean); if (add && p.indexOf(add) < 0) p.push(add); return p.join(','); }
function v4Upsert_(email, patch) { // patch: {name, salt, hash, provider}
  var a = v4Acct_(email), now = new Date().toISOString();
  if (a.row < 0) { a.sh.appendRow([email, patch.name || '', patch.salt || '', patch.hash || '', v4Providers_('', patch.provider), now, now]); return; }
  var r = a.rec.slice();
  if (patch.name && !r[1]) r[1] = patch.name;
  if (patch.salt) { r[2] = patch.salt; r[3] = patch.hash; }
  r[4] = v4Providers_(r[4], patch.provider); r[6] = now;
  a.sh.getRange(a.row, 1, 1, 7).setValues([r]);
}
function v4Session_(email, name) {
  var token = randomToken_();
  v3Sheet_('CustSessions', v3SessHeaders_()).appendRow([sha_(token), email, new Date(Date.now() + 30 * 864e5).toISOString()]);
  return {token: token, email: email, name: name || ''};
}
function v4Code_() { return ('00000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000)).slice(-6); }

/* ---------- email + password: register (needs email code), login ---------- */
function v4RegStart_(b) {
  var email = v3Email_(b.email), pw = v4Pw_(b.password); v3Limit_('rs_' + email, 3, 3600); v3Limit_('as_all', 40, 21600); // shares the free Gmail quota guard
  if (v4Acct_(email).row < 0) {
    var code = v4Code_(), salt = Utilities.getUuid(), sh = v3Sheet_('CustPending', V4_PEND_HEADERS_), v = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < v.length; i++) if (v[i][0] === email) { row = i + 1; break; }
    var rec = [email, sha_(email + '|' + code), salt, v4Hash_(salt, pw), new Date(Date.now() + 10 * 60000).toISOString(), 0];
    if (row > 0) sh.getRange(row, 1, 1, 6).setValues([rec]); else sh.appendRow(rec);
    var store = getSetting_('store_name') || 'SHOPROCK';
    MailApp.sendEmail(email, store + ' - confirm your email', 'Your confirmation code is ' + code + '\n\nIt works for 10 minutes. If you did not create an account, ignore this email; nothing is created without this code.\n\n' + store);
  }
  return {sent: true}; // identical answer whether or not the email already has an account
}
function v4RegVerify_(b) {
  var email = v3Email_(b.email), code = String(b.code || '').replace(/\D/g, ''), bad = 'That code is not valid or has expired. Please start again.'; v3Limit_('rv_' + email, 10, 900);
  var sh = v3Sheet_('CustPending', V4_PEND_HEADERS_), v = sh.getDataRange().getValues(), row = -1;
  for (var i = 1; i < v.length; i++) if (v[i][0] === email) { row = i + 1; break; }
  if (row < 0) fail_(bad);
  var att = Number(v[row - 1][5]) || 0;
  if (att >= 5 || new Date(v[row - 1][4]) < new Date()) { sh.deleteRow(row); fail_(bad); }
  if (sha_(email + '|' + code) !== v[row - 1][1]) { sh.getRange(row, 6).setValue(att + 1); fail_(bad); }
  var salt = v[row - 1][2], hash = v[row - 1][3]; sh.deleteRow(row);
  v4Upsert_(email, {salt: salt, hash: hash, provider: 'password'});
  return v4Session_(email, '');
}
function v4Login_(b) {
  var email = v3Email_(b.email), pw = String(b.password === undefined || b.password === null ? '' : b.password).slice(0, 200), bad = 'Email or password is incorrect.';
  v3Limit_('lg_' + email, 8, 900);
  var a = v4Acct_(email), salt = a.rec && a.rec[2] ? String(a.rec[2]) : 'none-' + email, h = v4Hash_(salt, pw); // always hash: same timing for unknown emails
  if (!a.rec || !a.rec[3] || !v4Same_(h, a.rec[3])) fail_(bad);
  v4Upsert_(email, {});
  return v4Session_(email, String(a.rec[1] || ''));
}
function v4SetPassword_(b) {
  var email = v3Session_(b.token), pw = v4Pw_(b.password); v3Limit_('sp_' + email, 10, 3600);
  var salt = Utilities.getUuid(); v4Upsert_(email, {salt: salt, hash: v4Hash_(salt, pw), provider: 'password'});
  return {};
}
function v4Me_(b) {
  var email = v3Session_(b.token), a = v4Acct_(email), r = a.rec;
  return {email: email, name: r ? String(r[1] || '') : '', providers: r ? String(r[4] || '').split(',').filter(Boolean) : ['email-code'], has_password: !!(r && r[3]), member_since: r ? String(r[5] || '') : ''};
}

/* ---------- Google: verify the ID token with Google; trust nothing from the browser ---------- */
function v4Google_(b) {
  var cid = v4ClientId_(); if (!cid) fail_('Google sign-in is not switched on yet.');
  var cred = String(b.credential || ''); if (cred.length < 100 || cred.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(cred)) fail_('Google sign-in could not be verified. Please try again.');
  v3Limit_('gg_all', 600, 600);
  var res, bad = 'Google sign-in could not be verified. Please try again.';
  try { res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred), {muteHttpExceptions: true}); } catch (e) { logError_('google', e); fail_('Could not reach Google right now. Please try again.'); }
  if (res.getResponseCode() !== 200) fail_(bad);
  var t = parseJson_(res.getContentText(), {});
  var okIss = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  var okEmail = String(t.email_verified) === 'true' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(t.email || ''));
  if (t.aud !== cid || !okIss || !okEmail || !(Number(t.exp) > Date.now() / 1000)) fail_(bad);
  var email = String(t.email).trim().toLowerCase(), name = String(t.name || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
  v4Upsert_(email, {name: name, provider: 'google'});
  var a = v4Acct_(email);
  return v4Session_(email, a.rec ? String(a.rec[1] || name) : name);
}

/* replaces v3: an email gets a sign-in code if it has a real order OR an account */
function v3AcctSend_(b) {
  var email = v3Email_(b.email); v3Limit_('as_' + email, 3, 3600); v3Limit_('as_all', 40, 21600); // protects the free Gmail sending quota
  var known = v4Acct_(email).row > 0 || readAll_('Orders').some(function (o) { return String(o.is_test) !== 'true' && String(o.email || '').trim().toLowerCase() === email; });
  if (known) {
    var code = v4Code_(), sh = v3Sheet_('CustCodes', ['email', 'code_hash', 'expires', 'attempts']), v = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < v.length; i++) if (v[i][0] === email) { row = i + 1; break; }
    var rec = [email, sha_(email + '|' + code), new Date(Date.now() + 10 * 60000).toISOString(), 0];
    if (row > 0) sh.getRange(row, 1, 1, 4).setValues([rec]); else sh.appendRow(rec);
    var store = getSetting_('store_name') || 'SHOPROCK';
    MailApp.sendEmail(email, store + ' - your sign-in code', 'Your sign-in code is ' + code + '\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email; nobody can sign in without it.\n\n' + store);
  }
  return {sent: true}; // identical answer whether or not the email is known
}

/* replaces v3: same fields + google_client_id (public) + v4 */
function publicConfig_() {
  var g = getSetting_, cid = v4ClientId_();
  return {store_name: g('store_name') || 'SHOPROCK', tagline: g('tagline'), announcement: g('announcement'), whatsapp_number: g('whatsapp_number'),
    support_email: g('support_email'), instagram_url: g('instagram_url'), support_contact: g('support_contact'), checkout_mode: g('checkout_mode'),
    hero_title: g('hero_title'), hero_text: g('hero_text'), story_title: g('story_title'), story_text: g('story_text'), occasions: g('occasions'),
    faq: parseJson_(g('faq_json'), []), free_shipping_above: Number(g('free_shipping_above')) || 0, ga_id: g('ga_id'),
    hero_image: g('hero_image'), logo_url: g('logo_url'), wa_greeting: g('wa_greeting'), site: parseJson_(g('site_json'), {}),
    shipping_flat: g('shipping_flat'), v3: true, v3_pricing: true, v4: true, google_client_id: cid};
}
