# SHOPROCK v3

## Deploy in this ORDER
1. **Apps Script first.** Open Code.gs, scroll to the very bottom, paste ALL of BACKEND-PATCH-v3.gs there.
   Then change ONE line in route_():  `default: fail_('Unknown action');`  ->
   `default: if (v3Handles_(action)) return v3Route_(action, b, s); fail_('Unknown action');`
   Ctrl+S -> Deploy -> Manage deployments -> pencil -> New version -> Deploy.
2. **GitHub:** upload the contents of this folder (site/, dashboard/, etc.), commit, wait 1-2 min, hard refresh.
3. Optional reminder emails: in Apps Script run `installReminderTrigger` once; in dashboard Settings fill "Website link".

## Tests actually run (`sh tests/run_all.sh`)
unit 19, backend patch 41 (in-memory Sheets stub + verbatim helper copies from your Code.gs), storefront browser 63,
v3 browser 37, dashboard->storefront browser 12. NOT run: your live Apps Script / live sheet / live site.

## Server-side behaviour (BACKEND-PATCH-v3.gs)
- Variant prices and bundle savings are computed on the server from site_json. Browser prices are ignored.
- Gift note: already saved by your createOrder_ into Orders.gift_message (max 300 chars, all item notes joined).
- Repeat submit with the same key returns full payment details.
- Tracking: rate-limited (10 tries / 15 min per order id); real status updates; no internal notes.
- Analytics events, reminder consent/opt-out, owner-only report + sign-up list (OWNER / FINANCE roles).

## Still not done / limits
- Reminder emails use Gmail's free MailApp quota (small daily limit); WhatsApp reminders need a paid API (not built).
- Wishlist and saved dates live in the customer's browser only (no accounts).
- Dashboard config changes reach customers within ~5 min (cache).
- Payment verification is unchanged: nothing becomes PAID without your existing manual/gateway confirmation.

## Creative features (no backend needed)
- gift-finder.html: 4 questions -> up to 3 real products; reasons only from real product data; budget is a hard filter.
- reveal.html: write a message, get a link; recipient taps an envelope to read it. The message lives inside the link
  (nothing stored on any server). Linked from the order confirmation and the tracking page.

## Customer loop features (this round)
- **After delivery** (track.html): optional per-item review (existing moderated reviewCreate) + optional one-time thank-you code.
  The code is NOT tied to a review or rating. Off until Settings -> "Thank-you code after delivery" is above 0 (max 30%).
  Needs BACKEND-PATCH-v3.gs deployed (public.thanksCoupon).
- **Moments** (wishlist.html): from saved dates, upcoming birthdays/anniversaries and milestones (50/100/200/300/500/1000... days, yearly) with gift ideas
  from real products. Works with no backend. Email reminders still cover the yearly date only.
- **Surprise Week**: Dashboard -> Bundles -> tick "Surprise Week" (exactly 3 products). One order, real bundle saving (only when server pricing is on),
  plus a planner (reveal.html?week=1) that makes 3 reveal links (Day 1/2/3 of 3). Does NOT promise separate-day delivery.

## Special dates on the order confirmation
After an order, a card asks (optional) for a birthday/anniversary. It saves on the device only. The email-reminder box appears only after a date
is saved and only if the backend patch is live; consent is UNTICKED by default and nothing is sent to the server without the tick.

## Dashboard cache
dashboard/index.html loads dashboard.js?v=<tag>. Change the tag on every release, or browsers keep the old dashboard.

## Customer accounts, secret gift, premium packaging (this round)
- **Account** (site/account.html): passwordless. Customer enters the email used on an order, gets a 6-digit code (valid 10 min, 5 tries, stored hashed),
  and sees THEIR orders (matched by email, plus older orders they add with order ref + last 4 digits). Gift again / Send a reveal / Sign out everywhere.
  Only emails that appear on a real order can sign in. Uses the free Gmail quota (about 100 emails/day; the patch caps code emails at 40 per 6 hours).
- **Gifting options** (Dashboard -> Gifting options): owner switches on Premium packaging and/or Secret gift, sets exact wording + price.
  Customers see them (unticked) in checkout under "Make it extra special"; the SERVER charges the price from your settings.
  Orders get a 'gift_json' column + a readable note in internal_notes, and the Orders page shows a "Gift / packing" column for staff.
  Your packaging COST is private (not in the public site config).
- **Deliver to someone else**: recipient name (+ optional mobile) saved with the order.
