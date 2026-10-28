# SHOPROCK v4 (jitna hua utna)

## Deploy
1. Apps Script: paste BACKEND-PATCH-v4.gs BELOW BACKEND-PATCH-v3.gs in Code.gs -> Deploy -> New version.
2. GitHub: upload site/, tests/, etc. Hard refresh.
3. Google login: Apps Script -> Project Settings -> Script properties -> GOOGLE_CLIENT_ID = <your client id>.
   Google Cloud -> OAuth client (Web) -> Authorised JavaScript origins = https://<username>.github.io
   Check status at site/account.html?setup=1

## Done
New homepage (header, Gift Finder card, category circles, 2-col product grid, collections, trust, footer), 5-button bottom bar, search overlay,
wishlist hearts on cards, shop page filters, account page (Google, email+password, email code), backend v4 accounts.

## Tested
backend v4 stub: 48 pass. New browser test e2e_v4.py: 101/102 (the 1 was a wrong test expectation; order flow verified manually).
NOT re-run after last edits: older suites (e2e, v3, dash, creative, loop, moment, acct).
BLOCKED: real Google login (needs your Client ID + origin), mobile OTP (not built: needs an SMS provider), live Apps Script.
Dashboard "Main headline/text" and hero image no longer show on home (hero removed).
