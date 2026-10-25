import json, sys, datetime
from harness import *
srv=serve(); R=[]
def t(n,ok,info=""): R.append((n,bool(ok))); print(("PASS " if ok else "FAIL ")+n+((" -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8765/site/"
cart=lambda pg: json.loads(pg.evaluate("localStorage.getItem('sr_cart')") or "[]")
def mk(delivered=True,thanks=True,demo=False,site=None):
    m=Mock(); orig=m.handle; m.reviews=[]; m.thx=[]
    def h(b):
        a=b.get("action")
        if a=="public.config":
            d=orig(b); d["v3"]=True; d["v3_pricing"]=True; d["free_shipping_above"]=99999
            if site: d["site"]=site
            return d
        if a=="public.trackOrder":
            return dict(order_id="ORD-AAAA1111",payment_status="PAID",order_status="DELIVERED" if delivered else "SHIPPED",total=1299,delivered=delivered,thanks=thanks,is_demo=demo,updates=[],items=[dict(name="Couple Name Lamp",qty=1,product_id="P1")])
        if a=="public.reviewCreate": m.reviews.append(b); return {"submitted":True}
        if a=="public.thanksCoupon": m.thx.append(b); return dict(code="THX-ABCD1234",percent=10,expires="2026-12-01",used=False)
        return orig(b)
    m.handle=h; return m
def track(pg):
    pg.goto(B+"track.html"); pg.fill("#oid","ORD-AAAA1111"); pg.fill("#l4","3210"); pg.click("#f button"); pg.wait_for_selector("#out .card"); pg.wait_for_timeout(500)
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- post-delivery ----------
    m=mk(); ctx,pg,errs=new_page(b,m); track(pg)
    t("loop: delivered order shows optional review + thank-you", pg.locator("#tdone").count()==1 and "Optional" in pg.inner_text("#tdone") and pg.locator("#thxbtn").count()==1)
    pg.click("[data-send]"); pg.wait_for_timeout(200); t("loop: review needs a rating", len(m.reviews)==0)
    pg.click(".star[data-s='4']"); pg.fill(".rvbox textarea","short"); pg.click("[data-send]"); pg.wait_for_timeout(200); t("loop: review needs 10+ characters", len(m.reviews)==0)
    t("loop: thank-you code is available WITHOUT writing a review", True)
    pg.click("#thxbtn"); pg.wait_for_selector("#thxcode"); t("loop: thank-you code shown (no review needed), 1 use", pg.inner_text("#thxcode")=="THX-ABCD1234" and len(m.thx)==1 and m.thx[0]["phone_last4"]=="3210" and len(m.reviews)==0 and "One use" in pg.inner_text("#thx"), pg.inner_text("#thx"))
    pg.fill(".rvbox textarea","It made her cry happy tears"); pg.click("[data-send]"); pg.wait_for_timeout(300)
    t("loop: valid review sent with order ref + last4 + rating", len(m.reviews)==1 and m.reviews[0]["rating"]==4 and m.reviews[0]["order_id"]=="ORD-AAAA1111" and m.reviews[0]["phone_last4"]=="3210" and m.reviews[0]["product_id"]=="P1", m.reviews)
    t("loop: review box says it needs approval", "once approved" in pg.inner_text("#tdone"))
    t("loop: no page errors", not errs, errs); ctx.close()
    for name,kw in (("not delivered",dict(delivered=False,thanks=False)),("demo order",dict(demo=True)),("thanks switched off",dict(thanks=False))):
        m=mk(**kw); c,pg,e=new_page(b,m); track(pg)
        if name=="thanks switched off": t("loop: thanks off => review still optional, NO thank-you button", pg.locator("#tdone").count()==1 and pg.locator("#thxbtn").count()==0)
        else: t(f"loop: {name} => no review/thank-you section", pg.locator("#tdone").count()==0)
        c.close()
    # essential tracking info stays above and intact
    m=mk(); c,pg,e=new_page(b,m); track(pg)
    pos=pg.evaluate("(()=>{const a=document.querySelector('#out .card').getBoundingClientRect().top,b=document.getElementById('tdone').getBoundingClientRect().top;return b>a})()")
    t("loop: order info is above the extras", pos and "ORD-AAAA1111" in pg.inner_text("#out")); c.close()
    # ---------- Moments ----------
    today=datetime.date.today(); fmt=lambda d:d.isoformat()
    occ=[{"t":"Anniversary","n":"Sam","d":fmt(today-datetime.timedelta(days=100))},{"t":"Birthday","n":"Asha","d":f"1995-{(today+datetime.timedelta(days=5)).month:02d}-{(today+datetime.timedelta(days=5)).day:02d}"}]
    m=mk(); c,pg,e=new_page(b,m,390,800); pg.goto(B+"wishlist.html"); pg.evaluate("o=>localStorage.setItem('sr_occ',JSON.stringify(o))",occ); pg.reload(); pg.wait_for_selector(".timeline"); tx=pg.inner_text(".timeline")
    t("moments: today's 100-day milestone shown with countdown 'Today'", "100 days together" in tx and "Today" in tx and "Sam" in tx, tx[:200])
    t("moments: birthday in 5 days", "Birthday" in tx and "In 5 days" in tx, tx[:300])
    t("moments: each moment links to REAL products", pg.locator(".tl-ideas a[href^='product.html?id=P']").count()>=2)
    t("moments: email note is honest (yearly date only)", "yearly date only" in pg.inner_text("#occ"))
    t("moments: no overflow 390px", pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
    pg.evaluate("localStorage.setItem('sr_occ','[]')"); pg.reload(); pg.wait_for_timeout(500); t("moments: nothing saved => no fake timeline", pg.locator(".timeline").count()==0); c.close()
    # ---------- Surprise Week ----------
    site={"bundles":[{"id":"W1","name":"Surprise Week","items":["P1","P2","P3"],"price":2000,"on":True,"kind":"week"}]}
    m=mk(site=site); ctx,pg,errs=new_page(b,m); pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("[data-bundle]"); bt=pg.inner_text("#bundles")
    t("week: card labelled Surprise Week with honest delivery note + real saving (2597-2000=597)", "Surprise Week" in bt and "may arrive separately" in bt and "597" in bt, bt[:300])
    t("week: button says Add the week to cart", "add the week to cart" in bt.lower())
    pg.click("[data-bundle='W1']"); pg.wait_for_timeout(300)
    t("week: all 3 products tagged W1 in cart", sorted((i["product_id"],i.get("bundle")) for i in cart(pg))==[("P1","W1"),("P2","W1"),("P3","W1")], cart(pg))
    pg.goto(B+"cart.html"); pg.wait_for_selector(".cl"); t("week: cart shows bundle saving", "597" in pg.inner_text("#out"), pg.inner_text("#out")[:200])
    pg.goto(B+"checkout.html"); pg.wait_for_selector("#summary .sl")
    for k,v in dict(customer_name="Asha Rao",phone="9876543210",address="12 Rose Street, Sector 5",city="Delhi",state="Delhi",pin="110001").items(): pg.fill("#"+k,v)
    pg.check("#policy"); pg.click("#go"); pg.wait_for_selector("#done a[href='reveal.html?week=1']")
    t("week: confirmation offers the 3-message planner", True)
    pg.click("#done a[href='reveal.html?week=1']"); pg.wait_for_selector("#w_go")
    pg.click("#w_go"); pg.wait_for_timeout(200); t("week: needs all 3 messages", pg.locator("#w_out .card").count()==0)
    pg.fill("#w_f","Rahul"); pg.fill("#w_t","Asha")
    for n in (1,2,3): pg.fill(f"#w_m{n}",f"Message for day {n}")
    pg.click("#w_go"); pg.wait_for_selector("#w_out .card"); links=[pg.input_value(f"#w_out .card:nth-child({i}) input") for i in (1,2,3)]
    t("week: 3 distinct links generated", len(set(links))==3 and all("#" in l for l in links))
    c2,pg2,e2=new_page(b,m,390,800); pg2.goto(links[1]); pg2.wait_for_selector("#env"); pg2.click("#env"); pg2.wait_for_timeout(1200)
    t("week: Day 2 link opens Day 2 message with 'Day 2 of 3'", "Message for day 2" in pg2.inner_text("#rcard") and "day 2 of 3" in pg2.inner_text("#rv").lower(), pg2.inner_text("#rv")[:200])
    t("week: no page errors", not errs and not e2, (errs,e2))
    ctx.close(); c2.close()
    # week bundle only shown when all 3 items available (invalid bundles hidden) + not priced when backend can't price
    m=mk(site=site); orig=m.handle
    def h2(body):
        d=orig(body)
        if body.get("action")=="public.config": d["v3_pricing"]=False
        return d
    m.handle=h2; c,pg,e=new_page(b,m); pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("[data-bundle]"); bt=pg.inner_text("#bundles")
    t("week: without server pricing NO saving is claimed", "You save" not in bt and "2,597" in bt, bt[:200]); c.close()
    b.close()
f=[n for n,ok in R if not ok]; print(f"\n{len(R)-len(f)} passed, {len(f)} failed"); sys.exit(1 if f else 0)
