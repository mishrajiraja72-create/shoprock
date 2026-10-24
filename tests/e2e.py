import json, sys
from harness import *
srv=serve(); R=[]
def t(name, ok, info=""):
    R.append((name, bool(ok))); print(("PASS " if ok else "FAIL ")+name+(("  -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8765/site/"
cart=lambda pg: json.loads(pg.evaluate("localStorage.getItem('sr_cart')") or "[]")
with sync_playwright() as p:
    b=p.chromium.launch()
    m=Mock(); ctx,pg,errs=new_page(b,m)
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#add")
    t("1 button initially ADD TO CART", pg.inner_text("#add").strip().upper()=="ADD TO CART")
    pg.dblclick("#add"); pg.wait_for_timeout(700)
    t("1 double-click adds exactly once", cart(pg)==[{"product_id":"P1","qty":1}], cart(pg))
    t("1 button becomes GO TO CART · 1", pg.inner_text("#add").strip().upper()=="GO TO CART · 1", pg.inner_text("#add"))
    t("1 header count = 1", pg.inner_text("#cartCount")=="1", pg.inner_text("#cartCount"))
    t("2 mini-cart open w/ image, name, price, total", pg.locator("#mini img").count()==1 and "Couple Name Lamp" in pg.inner_text("#mini") and "1,299" in pg.inner_text("#mini"))
    t("2 mini-cart has 3 actions", all(x in pg.inner_text("#mini").upper() for x in ["CONTINUE SHOPPING","GO TO CART","PROCEED TO CHECKOUT"]))
    pg.click("#mini [data-q='1']"); pg.wait_for_timeout(200)
    t("5 qty + in mini-cart syncs button/header", cart(pg)[0]["qty"]==2 and pg.inner_text("#add").strip().upper()=="GO TO CART · 2" and pg.inner_text("#cartCount")=="2", (cart(pg), pg.inner_text("#add"), pg.inner_text("#cartCount")))
    pg.click("#mini [data-c]"); t("2 continue shopping closes mini-cart", pg.locator("#mini").count()==0)
    pg.click("#add"); pg.wait_for_url("**/cart.html"); pg.wait_for_selector(".cl")
    t("3 Go to cart navigates w/o adding", cart(pg)[0]["qty"]==2, cart(pg))
    t("5 cart shows total 2x1299", "2,598" in pg.inner_text("#out"))
    pg.click(".cl [data-q='-1']"); pg.wait_for_timeout(300)
    t("5 qty change in cart persists", cart(pg)[0]["qty"]==1)
    pg.click("[data-rm]"); pg.wait_for_timeout(300)
    t("5 remove last item -> empty cart", cart(pg)==[] and "empty" in pg.inner_text("#out").lower())
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#add")
    t("5 after removal button restored ADD TO CART", pg.inner_text("#add").strip().upper()=="ADD TO CART")
    # buy now no stacking
    pg.fill("#qty","3"); pg.click("#buy"); pg.wait_for_url("**/checkout.html")
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#buy"); pg.fill("#qty","3"); pg.click("#buy"); pg.wait_for_url("**/checkout.html")
    t("4 buy now twice leaves qty 3", cart(pg)==[{"product_id":"P1","qty":3}], cart(pg))
    # refresh persistence
    pg.reload(); t("1 cart persists on refresh", cart(pg)[0]["qty"]==3)
    # corrupted storage
    pg.evaluate("localStorage.setItem('sr_cart','{bad')"); pg.reload(); pg.wait_for_timeout(300)
    t("1 corrupt cart safe", pg.inner_text("#cartCount")=="0")
    # gift note + checkout + order
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#add")
    tc=pg.locator(".tc").first; has_tpl=tc.count()>0
    t("6 gift templates render (4)", pg.locator(".tc").count()==4, pg.locator(".tc").count())
    if has_tpl: tc.click()
    note=pg.input_value("#gt_t") if pg.locator("#gt_t").count() else ""
    t("6 template populates editable message", len(note)>10, note)
    pg.fill("#gt_t","Happy anniversary my love"); pg.click("#add"); pg.wait_for_timeout(600)
    t("6 note stored on cart item", cart(pg)[0].get("note")=="Happy anniversary my love", cart(pg))
    t("6 character counter", "/" in pg.inner_text("#gt_n"))
    pg.goto(B+"checkout.html"); pg.wait_for_selector("#summary .sl")
    t("6 note carried to checkout field", pg.input_value("#gift_message")=="Happy anniversary my love", pg.input_value("#gift_message"))
    t("7 add-on offered, NOT preselected", pg.locator("[data-add='P2']").count()==1 and pg.locator("[data-rm='P2']").count()==0)
    pg.click("[data-add='P2']"); pg.wait_for_timeout(200)
    t("7 add-on adds & items total correct", "1,798" in pg.inner_text("#summary"), pg.inner_text("#summary"))
    pg.click("[data-rm='P2']"); pg.wait_for_timeout(200)
    t("7 add-on removable", "1,299" in pg.inner_text("#summary") and "1,798" not in pg.inner_text("#summary"))
    for k,v in dict(customer_name="Asha Rao",phone="9876543210",address="12 Rose Street, Sector 5",city="Delhi",state="Delhi",pin="110001").items(): pg.fill("#"+k,v)
    pg.check("#policy"); pg.dblclick("#go"); pg.wait_for_timeout(900)
    t("8 duplicate-order protection (1 order)", len(m.orders)==1, len(m.orders))
    o=list(m.orders.values())[0]["body"] if m.orders else {}
    t("9 gift note sent to createOrder", o.get("gift_message")=="Happy anniversary my love", o.get("gift_message"))
    dn=pg.inner_text("#done").lower(); t("10 payment shown as Awaiting (never PAID)", "payment status: awaiting payment" in dn and "status: paid" not in dn)
    oid=list(m.orders.keys())[0] if m.orders else ""
    t("11 confirmation shows order ref + track link", oid in pg.inner_text("#done") and pg.locator("#done a[href='track.html']").count()>0)
    t("8 cart cleared after order", cart(pg)==[])
    pg.goto(B+"track.html"); pg.fill("#oid",oid); pg.fill("#l4","3210"); pg.click("#f button"); pg.wait_for_selector("#out .card")
    t("11 tracking page shows order", oid in pg.inner_text("#out"))
    pg.fill("#oid",oid); pg.fill("#l4","0000"); pg.click("#f button"); pg.wait_for_selector(".errorbox")
    t("11 wrong last-4 rejected", True)
    # whatsapp
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#waq[href^='https://wa.me']")
    href=pg.get_attribute("#waq","href"); t("14 product WhatsApp link encoded & uses configured number", href.startswith("https://wa.me/919876543210?text=") and "Couple%20Name%20Lamp" in href, href)
    t("14 floating WhatsApp exists", pg.locator("#waf").count()==1)
    t("pageerrors none", not errs, errs); ctx.close()
    # overflow
    for w in (360,390,430,1280):
        for path in ("index.html","shop.html","product.html?id=P1","cart.html","checkout.html","track.html","policies.html"):
            m2=Mock(); c2,pg2,e2=new_page(b,m2,w,800,touch=w<600)
            pg2.goto(B+path); pg2.wait_for_timeout(700)
            if path.startswith(("cart","checkout")): pg2.evaluate("localStorage.setItem('sr_cart','[{\"product_id\":\"P1\",\"qty\":1}]')"); pg2.reload(); pg2.wait_for_timeout(700)
            ov=pg2.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
            t(f"15 no horizontal overflow {w}px {path}", ov<=0, ov)
            if w in (360,) and path.startswith("product"):
                bar=pg2.evaluate("(()=>{const a=document.querySelector('.sticky-buy'),w=document.getElementById('waf');if(!a||!w)return null;const A=a.getBoundingClientRect(),W=w.getBoundingClientRect();return W.bottom>A.top&&W.top<A.bottom&&W.right>A.left&&W.left<A.right})()")
                t("14 floating WhatsApp does not cover purchase bar", bar is False, bar)
            c2.close()
    b.close()
f=[n for n,ok in R if not ok]; print(f"\n{len(R)-len(f)} passed, {len(f)} failed"); sys.exit(1 if f else 0)
