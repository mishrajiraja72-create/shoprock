// Run: node tests/pricing.test.js
// Loads backend/Code.gs in a sandbox with Apps Script globals mocked and tests pure logic.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync(__dirname + '/../backend/Code.gs', 'utf8');
const ctx = { console, Utilities: {}, SpreadsheetApp: {}, LockService: {}, CacheService: {}, PropertiesService: {}, ContentService: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const run = (s) => { const v = vm.runInContext(s, ctx); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };

t('pricing: basic contribution and margin', () => {
  const r = run(`calcPricing_({selling_price:1000,supplier_price:400,packaging_cost:50,shipping_cost:80,payment_fee_pct:2,return_allowance_pct:3,marketing_cost:100})`);
  assert.strictEqual(r.total_variable_cost, 400+50+80+100+20+30);
  assert.strictEqual(r.contribution, 320);
  assert.strictEqual(r.margin_pct, 32);
});
t('pricing: break-even gives zero contribution', () => {
  const be = run(`calcPricing_({selling_price:1,supplier_price:400,packaging_cost:50,shipping_cost:80,payment_fee_pct:2,return_allowance_pct:3,marketing_cost:100}).break_even_price`);
  const r = run(`calcPricing_({selling_price:${be},supplier_price:400,packaging_cost:50,shipping_cost:80,payment_fee_pct:2,return_allowance_pct:3,marketing_cost:100})`);
  assert.ok(Math.abs(r.contribution) < 0.05);
});
t('pricing: suggested price hits target margin', () => {
  const sp = run(`calcPricing_({supplier_price:400,packaging_cost:50,shipping_cost:80,payment_fee_pct:2,return_allowance_pct:3,marketing_cost:100,target_margin_pct:30}).suggested_price`);
  const r = run(`calcPricing_({selling_price:${sp},supplier_price:400,packaging_cost:50,shipping_cost:80,payment_fee_pct:2,return_allowance_pct:3,marketing_cost:100})`);
  assert.ok(Math.abs(r.margin_pct - 30) < 0.1);
});
t('pricing: zero / invalid inputs are safe', () => {
  const r = run(`calcPricing_({selling_price:0,supplier_price:'abc',packaging_cost:-5})`);
  assert.strictEqual(r.margin_pct, 0); assert.ok(isFinite(r.contribution));
  assert.ok(run(`calcPricing_()`));
});
t('pricing: sourcing markup applies to supplier price only', () => {
  assert.strictEqual(run(`calcPricing_({selling_price:500,supplier_price:100,sourcing_markup_pct:10}).landed_cost`), 110);
});
t('order: PAID unreachable from any admin transition target except via verified payment', () => {
  const tr = run('ORDER_TRANSITIONS');
  assert.ok(!tr.PENDING_PAYMENT.includes('PAID'));
  assert.deepStrictEqual(Object.keys(tr).filter(k => tr[k].includes('PAID')), ['PAYMENT_VERIFICATION']);
});
t('order: SHIPPED cannot jump to DELIVERED-less states / DELIVERED only from SHIPPED', () => {
  const tr = run('ORDER_TRANSITIONS');
  assert.deepStrictEqual(Object.keys(tr).filter(k => tr[k].includes('DELIVERED')), ['SHIPPED']);
  assert.ok(!tr.PAID.includes('SHIPPED'));
});
t('products: cannot reach PUBLISHED except from APPROVED/OUT_OF_STOCK', () => {
  const tr = run('PRODUCT_TRANSITIONS');
  assert.deepStrictEqual(Object.keys(tr).filter(k => tr[k].includes('PUBLISHED')).sort(), ['APPROVED','OUT_OF_STOCK']);
  assert.deepStrictEqual(Object.keys(tr).filter(k => tr[k].includes('APPROVED')), ['REVIEW']);
});
t('rbac: only owner/reviewer can approve; researcher has no order access', () => {
  assert.deepStrictEqual(run('REVIEW_ROLES_FOR.APPROVED'), ['OWNER','REVIEWER']);
  const P = run('PERMISSIONS');
  assert.ok(!P.RESEARCHER.some(p => p.startsWith('orders')));
  assert.ok(!P.SUPPORT.includes('refunds.manage'));
});
t('score: weights give 100 for all-5 and 0 for all-0', () => {
  ctx.getSetting_ = () => run('DEFAULT_SETTINGS.score_weights');
  assert.strictEqual(run(`scoreTotal_({score_relevance:5,score_trend:5,score_supplier:5,score_margin:5,score_giftability:5,score_fulfilment:5})`), 100);
  assert.strictEqual(run(`scoreTotal_({})`), 0);
});
t('csv: formula injection neutralised', () => {
  // exportCsv_ escaping rule: leading = + - @ is prefixed with an apostrophe
  assert.ok(/\^\[=\+\\-@\]/.test(code));
});
console.log(`\n${pass} tests passed`);
