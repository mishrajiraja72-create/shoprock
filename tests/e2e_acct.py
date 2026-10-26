import json, sys
from harness import *
srv=serve(); R=[]
def t(n,ok,info=""): R.append((n,bool(ok))); print(("PASS " if ok else "FAIL ")+n+((" -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8765/site/"
cart=lambda pg: json.loads(pg.evaluate("localStorage.getItem('sr_cart')") or "[]")
GIFTING={"packaging":{"on":True,"name":"Premium gift box","price":99,"desc":"Rigid box, ribbon, tissue"},"secret":{"on":True,"label":"Send it as a secret","price":0,"note":"No sender name on the parcel."}}
def mk(gifting=GIFTING):
    m=Mock(); orig=m.handle; m.sent=[]; m.verify=[]; m.created=[]; m.out=[]; m.valid={"TOK"*12}
    def h(b):
        a=b.get("action")
        if a=="public.config":
            d=orig(b); d["v3"]=True; d["v3_pricing"]=True; d["free_shipping_above"]=99999; d["site"]={"gifting":gifting} if gifting else {}; return d
        if a=="public.acctSend": m.sent.append(b["email"]); return {"sent":True}
        if a=="public.acctVerify":
            m.verify.append(b)
            if b["code"]!="123456": raise Exception("That code is not valid or has expired. Please request a new one.")
            return {"token":"TOK"*12,"email":b["email"]}
        if a=="public.acctOrders":
            if b["token"] not in m.valid: raise Exception("Please sign in again.")
            return [dict(order_id="ORD-AAAA1111",created_at="2026-10-01T10:00:00Z",total=1398,payment_status="PAID",order_status="SHIPPED",tracking_number="TRK123",delivery_estimate="3-5 days",city="Delhi",gift_message="Love you always",
              items=[dict(name="Couple Name Lamp",qty=1,unit_price=1299,product_id="P1"),dict(name="Gone Product",qty=1,unit_price=10,product_id="PX"),dict(name="Premium gift box",qty=1,unit_price=99,product_id="OPT-PACKAGING")],updates=[{"at":"2026-10-01T10:00:00Z","status":"Order placed"},{"at":"2026-10-02T10:00:00Z","status":"Shipped"}])]
        if a=="public.acctLogout": m.out.append(b); m.valid.discard(b["token"]); return {}
        if a=="public.acctClaim": raise Exception("Order not found")
        if a=="public.createOrder": m.created.append(b)
        return orig(b)
    m.handle=h; return m
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- account ----------
    m=mk(); ctx,pg,errs=new_page(b,m); pg.goto(B+"account.html"); pg.wait_for_selector("#f1")
    t("acct: signed-out visitor sees only the sign-in form (no orders requested)", "public.acctOrders" not in m.calls)
    pg.fill("#em","not-an-email"); pg.click("#b1"); pg.wait_for_timeout(200); t("acct: invalid email blocked before any request", not m.sent)
    pg.fill("#em","Asha@Example.com"); pg.click("#b1"); pg.wait_for_selector("#f2")
    t("acct: code requested for lower-cased email, wording does not reveal if the email exists", m.sent==["asha@example.com"] and "has an order with us" in pg.inner_text("#ac"))
    pg.fill("#cd","000000"); pg.click("#b2"); pg.wait_for_timeout(300); t("acct: wrong code shows error and stays on code page", pg.locator("#f2").count()==1 and not json.loads(pg.evaluate("localStorage.getItem('sr_acct')") or "null"))
    pg.fill("#cd","123456"); pg.click("#b2"); pg.wait_for_selector("#ol .card")
    t("acct: right code signs in, token stored", json.loads(pg.evaluate("localStorage.getItem('sr_acct')"))["email"]=="asha@example.com")
    tx=pg.inner_text("#ol")
    t("acct: order card shows ref, status, items, total, tracking, estimate", all(x in tx for x in ["ORD-AAAA1111","Couple Name Lamp","1,398","TRK123","3-5 days"]) and "SHIPPED" in tx.upper(), tx[:300])
    pg.click("#ol summary:has-text('Your gift note')"); t("acct: customer can re-read their gift note", "Love you always" in pg.inner_text("#ol"))
    t("acct: header has Account link", pg.evaluate("[...document.querySelectorAll('#nl a')].some(a=>a.textContent.trim()==='Account')"))
    pg.click("[data-again]"); pg.wait_for_timeout(500)
    t("acct: 'Gift again' adds only available REAL products (not extras like packaging, not sold-out)", cart(pg)==[{"product_id":"P1","qty":1}], cart(pg))
    pg.goto(B+"account.html"); pg.wait_for_selector("#ol .card"); pg.click("[data-rev]"); pg.wait_for_url("**/reveal.html")
    t("acct: 'Send a surprise reveal' opens the reveal page with the saved note prefilled", pg.input_value("#r_m")=="Love you always")
    pg.goto(B+"account.html"); pg.wait_for_selector("#ol .card"); pg.click("#so"); pg.wait_for_selector("#f1")
    t("acct: sign out clears token and tells the server", pg.evaluate("localStorage.getItem('sr_acct')") is None and len(m.out)==1)
    pg.evaluate("localStorage.setItem('sr_acct',JSON.stringify({token:'EXPIRED'+'x'.repeat(40),email:'a@b.co'}))"); pg.reload(); pg.wait_for_selector("#f1")
    t("acct: expired session => clear message + sign-in form, token removed", "sign in again" in pg.inner_text("#ac").lower() and pg.evaluate("localStorage.getItem('sr_acct')") is None)
    pg.evaluate("localStorage.setItem('sr_acct','{broken')"); pg.reload(); pg.wait_for_selector("#f1"); t("acct: corrupted stored data is safe", True)
    t("acct: no page errors", not errs, errs); ctx.close()
    c,pg,e=new_page(b,mk(),360,800); pg.goto(B+"account.html"); pg.wait_for_selector("#f1"); t("acct: no overflow at 360px (sign-in)", pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
    pg.evaluate("localStorage.setItem('sr_acct',JSON.stringify({token:'TOK'.repeat(12),email:'a@b.co'}))"); pg.reload(); pg.wait_for_selector("#ol .card"); t("acct: no overflow at 360px (orders)", pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0); c.close()
    # ---------- checkout gifting ----------
    def to_checkout(pg):
        pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#add"); pg.click("#add"); pg.wait_for_timeout(500); pg.goto(B+"checkout.html"); pg.wait_for_selector("#summary .sl"); pg.wait_for_selector("#gifting .special")
    def fill(pg):
        for k,v in dict(customer_name="Asha Rao",phone="9876543210",address="12 Rose Street, Sector 5",city="Delhi",state="Delhi",pin="110001").items(): pg.fill("#"+k,v)
        pg.check("#policy")
    m=mk(); ctx,pg,errs=new_page(b,m); pg.evaluate("1"); pg.goto(B+"index.html"); pg.evaluate("localStorage.setItem('sr_acct',JSON.stringify({token:'TOK'.repeat(12),email:'asha@example.com'}))"); to_checkout(pg)
    t("gift: nothing is pre-selected", not pg.is_checked("#g_pkg") and not pg.is_checked("#g_sec") and not pg.is_checked("#g_rec"))
    t("gift: owner's exact wording and prices shown", "Premium gift box" in pg.inner_text("#gifting") and "+₹99" in pg.inner_text("#gifting") and "No sender name on the parcel" in pg.inner_text("#gifting") and "Free" in pg.inner_text("#gifting"))
    t("gift: signed-in customer's email is prefilled", pg.input_value("#email")=="asha@example.com")
    pg.check("#g_pkg"); pg.wait_for_timeout(200); st=pg.inner_text("#summary")
    t("gift: packaging shows as a line and the subtotal updates (1299+99=1,398)", "Premium gift box" in st and "+₹99" in st and "1,398" in st, st[:300])
    pg.uncheck("#g_pkg"); pg.wait_for_timeout(200); t("gift: unticking removes it from the total", "Premium gift box" not in pg.inner_text("#summary") and "1,299" in pg.inner_text("#summary"))
    pg.check("#g_pkg"); pg.check("#g_sec"); pg.check("#g_rec"); fill(pg); pg.click("#go"); pg.wait_for_timeout(500)
    t("gift: recipient name is required when 'Deliver to someone else' is ticked", len(m.created)==0 and pg.locator(".errmsg").count()>=1)
    pg.fill("#g_rn","Priya"); pg.fill("#g_rp","9123456789"); pg.click("#go"); pg.wait_for_selector("#done .card")
    o=m.created[0]
    t("gift: order payload carries ONLY the choices (no prices from the browser)", o["gift"]=={"packaging":True,"secret":True,"recipient_name":"Priya","recipient_phone":"9123456789"}, o.get("gift"))
    dn=pg.inner_text("#done"); t("gift: confirmation lists the chosen extras and recipient", "Premium gift box" in dn and "Deliver to: Priya" in dn, dn[:300])
    t("gift: no page errors", not errs, errs); ctx.close()
    m=mk(); ctx,pg,errs=new_page(b,m); to_checkout(pg); fill(pg); pg.click("#go"); pg.wait_for_selector("#done .card")
    t("gift: no extras chosen => NO gift key sent at all", "gift" not in m.created[0], m.created[0].keys()); ctx.close()
    m=mk(gifting={}); ctx,pg,errs=new_page(b,m); to_checkout(pg)
    t("gift: owner switched everything off => no packaging/secret shown (only deliver-to-someone-else)", pg.locator("#g_pkg").count()==0 and pg.locator("#g_sec").count()==0 and pg.locator("#g_rec").count()==1); ctx.close()
    for w in (360,430):
        c,pg,e=new_page(b,mk(),w,800); to_checkout(pg); pg.check("#g_rec"); t(f"gift: no overflow {w}px checkout", pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0); c.close()
    b.close()
f=[n for n,ok in R if not ok]; print(f"\n{len(R)-len(f)} passed, {len(f)} failed"); sys.exit(1 if f else 0)
