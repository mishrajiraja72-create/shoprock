# SHOPROCK guides

## Admin onboarding
1. Run `initializeDatabase()`; read the one-time OWNER password in Execution log. The OWNER email is the Google account running the script.
2. Open `dashboard/` (hosted), sign in, go to **Team** and add members with the correct role. Share temporary passwords privately. Deactivate leavers immediately.
3. Add suppliers first, then start research.

## Team onboarding
- Researcher: Quick add ~10 products/day with source URL, evidence and supplier price. Duplicate source URLs warn you. Move records forward only when facts are verified.
- Reviewer: tick the 10-item checklist honestly; approval is blocked if any item, price, stock, image, description or positive contribution is missing.
- Order ops: confirm with supplier before moving an order forward. Shipping needs a tracking number.
- Finance: record refunds only after the gateway refund is made.

## Payment gateway (Razorpay/Cashfree) — do this before LIVE
1. Complete gateway KYC; get test keys first.
2. Apps Script → Project Settings → Script properties: add `GATEWAY_KEY_ID`, `GATEWAY_KEY_SECRET`, `WEBHOOK_TOKEN` (long random string). Never paste secrets in chat or code.
3. Implement `verifyPaymentWithProvider_()` in Code.gs: call the gateway's fetch-payment API with those keys, require status captured, matching order reference and amount, and return `{order_id,event_id,amount}`.
4. Register webhook URL: `<web app URL>?action=public.payWebhook&token=<WEBHOOK_TOKEN>`. (Apps Script cannot read signature headers, so we trust only what the gateway API confirms.)
5. Create the gateway order/payment link server-side from `createOrder_` (not yet wired — owner/dev task). Test with test keys; check duplicate webhooks do nothing; only then set `checkout_mode` to LIVE.

## Backup / export
- Dashboard has CSV export for research, suppliers, orders, refunds, activity. Also File → Make a copy of the Sheet weekly. Sheet is the source of truth; keep it private to the owner.

## Test checklist (manual, plus `node tests/pricing.test.js`)
- [ ] Empty DB: dashboard shows onboarding states, storefront shows "collection being prepared".
- [ ] Create product; duplicate URL shows warning.
- [ ] Try APPROVED with missing checklist/price/stock → refused with exact missing list.
- [ ] Researcher cannot approve, cannot see orders (try API call with researcher token → Forbidden).
- [ ] No token → `Unauthorized` on every non-public action.
- [ ] Demo order created; cannot become PAID; tracking page shows "Demo order".
- [ ] Same idempotency key twice → one order.
- [ ] Repeated webhook with same event id → no double payment.
- [ ] Shipped needs tracking; DELIVERED only from SHIPPED.
- [ ] Refund > total refused; refund on unpaid refused.
- [ ] CSV export opens without formula execution.
- [ ] Mobile widths 360–414px: no horizontal overflow outside tables.
- [ ] `loadTestData()` rows are TEST-prefixed; `clearTestData()` removes only those and demo orders.

## Production-readiness checklist / known limitations
- Checkout is DEMO only; payment creation and verification are owner/dev setup tasks above.
- Not security-audited. Passwords use salted iterated SHA-256 (Apps Script has no bcrypt); move to a managed auth provider after validation.
- Session tokens kept in `sessionStorage` on the dashboard; use HTTPS only.
- Apps Script quotas apply; Sheets is not transactional (LockService serialises writes).
- Policies, contact, brand story, packaging copy all contain `[OWNER REVIEW]` placeholders.
- Product data is not yet synced to supplier quotes automatically (`SupplierQuotes` sheet exists; UI not built).
- Tax/GST treatment is not modelled; consult an accountant.
- Customer/Orders view for SUPPORT is a limited listing; no per-order detail page yet.
- Future costs: custom domain, gateway fees per transaction, possibly paid DB after ~1,000 orders.
