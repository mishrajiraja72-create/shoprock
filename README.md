# SHOPROCK — Premium Couples Gifting Store + Internal Dashboard

Zero-investment MVP. Static storefront + Google Apps Script backend + Google Sheets as the database.

## PHASE 1 — ARCHITECTURE

### Chosen stack (all free tiers)
| Layer | Choice | Account needed |
|---|---|---|
| Storefront + dashboard UI | Static HTML/CSS/JS | GitHub (free) |
| Hosting | GitHub Pages or Cloudflare Pages (HTTPS, custom domain supported) | GitHub / Cloudflare |
| Backend | Google Apps Script Web App | Google account |
| Database | Google Sheets (private, owned by the owner account) | Google account |
| Payments | Razorpay or Cashfree (no monthly fee; per-transaction fee) | Gateway KYC |
| Images | Supplier-licensed or own photos in GitHub repo / Google Drive | — |

### What is really free
- Hosting, Apps Script, Sheets: free. Payment gateways charge a per-transaction fee (typically ~2% + GST); that is a variable cost, not a setup cost. A custom domain (~₹700–1,000/yr) is optional; the free `*.github.io` / `*.pages.dev` URL works for validation.
- Needing KYC/business documents for a gateway is unavoidable for live prepaid payments.

### Limits and bottlenecks (be honest)
- Apps Script: ~6 min per execution, ~20,000 URL fetches/day, 30 simultaneous executions, quota varies by account type. Fine for 100–200 orders.
- Sheets: ~10M cells; slow with tens of thousands of rows. Fine for the MVP.
- No built-in rate limiting; we add a LockService + per-key throttle via CacheService.
- Apps Script web apps cannot read custom HTTP headers; webhook signature verification must use a signed query token plus payload verification via the gateway's API (see `docs/PAYMENTS.md`, below).
- Sheets is not a real database: no transactions, no row-level security. **All access is only through the Apps Script API; the sheet itself is never shared with the team.** This is the key security boundary.

### Auth model
- Dashboard users sign in with email + password. Passwords are stored as salted SHA-256 hashes (stretched), never plain text; session tokens are random, stored hashed in CacheService/`Sessions` sheet with expiry.
- Every API action calls `requireRole_(session, [...])` server-side.
- Upgrade path: move to Supabase/Firebase Auth + Postgres after the first 100–200 orders.

### What happens at 100–200 orders
Still comfortable. At ~1,000+ orders or heavy concurrent traffic, migrate to Supabase (free tier) or a paid Postgres. All sheets are plain tables with stable IDs, so CSV export → import is straightforward.

### Data model
```
Users 1─* ProductResearch (researcher)
Suppliers 1─* SupplierQuotes *─1 ProductResearch
ProductResearch 1─0..1 Products (published catalogue record)
Orders 1─* OrderItems *─1 Products
Orders 1─* PaymentEvents (idempotent by provider_event_id)
Orders 1─* FulfilmentEvents
Orders 1─* Refunds
Tasks *─0..1 Product/Order
ActivityLog  (append-only; references any record)
BusinessSettings (key/value: score weights, target margin, fee %, etc.)
```
IDs are prefixed UUID fragments (`PRD-xxxx`, `ORD-xxxx`), never row numbers.

### Roles
OWNER, RESEARCHER, REVIEWER, ORDER_OPS, SUPPORT, FINANCE — permission matrix in `backend/Code.gs` (`PERMISSIONS`).

### Security boundaries
1. Public: product listing (approved+published only, no costs), order creation, order lookup by reference + phone last-4.
2. Authenticated: everything else, role-checked per action.
3. Secrets (gateway keys, webhook secret) live in Apps Script **Script Properties**, never in repo.

### Unavoidable external dependencies
Google account; payment gateway account for live sales. Until configured, checkout runs in clearly labelled **DEMO mode** and cannot create PAID orders.

## Folder structure
```
shoprock/
├── README.md
├── backend/Code.gs            # Apps Script: init, auth, RBAC, pricing, orders, logs
├── site/
│   ├── css/shoprock.css       # design system
│   ├── js/common.js           # config, API client, cart, formatters
│   ├── index.html
│   ├── shop.html
│   ├── product.html
│   ├── cart.html
│   ├── checkout.html
│   └── policies.html          # owner-review placeholders
├── dashboard/
│   ├── index.html
│   └── dashboard.js
└── tests/pricing.test.js
```

## Setup (beginner)
1. Create a new Google Sheet named `SHOPROCK_DB` (private).
2. Extensions → Apps Script. Paste `backend/Code.gs`.
3. Run `initializeDatabase()` once (grants permission). It creates all sheets, settings, and prints a one-time OWNER password in the log — change it on first login.
4. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**. (Anonymous callers can only reach public actions; everything else needs a session token.) Copy the URL into `site/js/common.js` → `CONFIG.API_URL` (and `dashboard/dashboard.js`).
5. Push `site/` and `dashboard/` to a GitHub repo; enable Pages.
6. Optional: run `loadTestData()` for TEST DATA rows (prefixed `TEST-`); `clearTestData()` removes only those.

## Known limitations
- Not production-secure until reviewed/penetration-tested.
- Payment gateway webhook is scaffolded, not live; fill `verifyPaymentWithProvider_()`.
- No fake payment success is possible: the only code path to PAID is `recordVerifiedPayment_()`.
- Policies contain `[OWNER REVIEW]` placeholders; legal text must be reviewed by you.
