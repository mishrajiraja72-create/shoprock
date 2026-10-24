# SHOPROCK v3 — what is real, what is blocked

## Tested (all actually run, Chromium via Playwright; see tests/)
`sh tests/run_all.sh` -> unit 19/19, storefront flow 63/63, v3 features 34/34, dashboard->storefront 12/12.
Browser tests run against a MOCK of your Apps Script API (tests/mock_api.py), not your live backend.

## Bugs found in the uploaded ZIP and fixed
1. Add to Cart threw "Assignment to constant variable" (const busy) -> nothing was added, no mini-cart.
2. Double-click on Add to Cart navigated to the cart instead of adding once.
3. Checkout with empty/corrupt cart threw a null error.
4. Literal "[OWNER REVIEW] support email / phone" could show to customers (footer/tracking).
5. Product schema always said InStock; reviews block always shown; add-on "Add" could stack quantity.

## Works now with NO backend change (persists via existing settings.set -> site_json)
Variants (options), story/occasion/recipient/tags, bundles (regular prices), gift-note templates + reset/skip,
wishlist (guest, this device), saved occasion dates (this device), previous gifts (this device),
qty controls in checkout that keep entered details, WhatsApp links, mini-cart, shipping line, confirmation items.

## Needs BACKEND-PATCH-v3.gs (written, NOT run against your live script — main script not in ZIP)
Analytics events + dashboard report, reminder consent + opt-out + email reminders, owner lists.
## Still blocked (needs your createOrder code)
Variant/bundle PRICES at checkout (v3_pricing stays false), order-saved gift note + tracking updates/estimates
cannot be verified, order-lookup brute-force limits. Payment verification is unchanged and never auto-marks PAID.

## Deploy
1. GitHub Pages: replace repo contents with this project, commit, push; wait for Pages build; hard-refresh.
2. Apps Script: (optional, for analytics/reminders) paste BACKEND-PATCH-v3.gs below existing code, follow the 3 integration steps in its header, run initializeDatabase if you use it, Deploy -> Manage deployments -> New version.
3. Dashboard: open it, Product details & variants / Bundles. Config is cached ~5 min per visitor.
