import json, sys
from harness import *
srv=serve(); R=[]
def t(n,ok,info=""): R.append((n,bool(ok))); print(("PASS " if ok else "FAIL ")+n+((" -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8765/site/"
cart=lambda pg: json.loads(pg.evaluate("localStorage.getItem('sr_cart')") or "[]")
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---- WITHOUT v3 backend (current real state) ----
    m=Mock(); ctx,pg,errs=new_page(b,m)
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#heart"); pg.click("#heart"); pg.wait_for_timeout(200)
    t("13 wishlist heart saves (guest, no account)", json.loads(pg.evaluate("localStorage.getItem('sr_wish')"))==["P1"] and pg.get_attribute("#heart","aria-pressed")=="true")
    t("13 header Saved count = 1", pg.inner_text("#wishCount")=="1")
    pg.goto(B+"wishlist.html"); pg.wait_for_selector("#wl .cl")
    t("13 wishlist page lists the product", "Couple Name Lamp" in pg.inner_text("#wl"))
    pg.click("[data-c='P1']"); pg.wait_for_timeout(200); t("13 wishlist add-to-cart works once", cart(pg)==[{"product_id":"P1","qty":1}], cart(pg))
    t("13 consent unticked by default", not pg.is_checked("#p_c"))
    t("13 reminders honestly disabled when backend lacks v3", pg.is_disabled("#p_go") and "not switched on" in pg.inner_text("#p_s"))
    pg.fill("#o_d","2027-02-14"); pg.click("#o_add"); pg.wait_for_timeout(200); t("13 occasion date stored locally", len(json.loads(pg.evaluate("localStorage.getItem('sr_occ')")))==1)
    t("14 analytics sends NOTHING without v3", "public.event" not in m.calls, m.calls)
    pg.click("[data-w='P1']"); pg.wait_for_timeout(200); t("13 wishlist remove", pg.evaluate("localStorage.getItem('sr_wish')")=="[]")
    ctx.close()
    # ---- WITH v3 flag: variants, bundles, events, consent ----
    m=Mock(); import mock_api
    orig=m.handle
    def h(body):
        a=body.get("action")
        if a=="public.config":
            d=orig(body); d["v3"]=True; d["v3_pricing"]=True; d["shipping_flat"]=79; d["free_shipping_above"]=5000; d["site"]={"addons":{"items":[{"id":"P2","on":True}]},
              "meta":{"P1":{"occasion":"Anniversary","recipient":"Partner","story":"Born from a late-night idea.","gift_suitability":"Great for anniversaries","tags":["lamp","glow"],"variants":[{"id":"v1","label":"Warm white","on":True},{"id":"v2","label":"Pink glow","price":1499,"on":True},{"id":"v3","label":"Blue","available":False,"on":True}]}},
              "bundles":[{"id":"B1","name":"Cosy night in","items":["P1","P2"],"price":1599,"on":True},{"id":"B2","name":"Broken","items":["P1","PX"],"price":1,"on":True}]}; return d
        if a=="public.event": ev.append(body); return {}
        if a=="public.preferences": prefs.append(body); return {}
        if a=="public.optout": outs.append(body); return {}
        return orig(body)
    ev=[];prefs=[];outs=[]; m.handle=h
    ctx,pg,errs=new_page(b,m)
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector(".vchip"); pg.wait_for_timeout(500)
    t("variants rendered; sold-out disabled", pg.locator(".vchip").count()==3 and pg.is_disabled(".vchip[data-v='v3']"))
    t("variant price changes displayed price (v3)", (pg.click(".vchip[data-v='v2']") or True) and "1,499" in pg.inner_text("#pprice"))
    t("product story/meta fields shown", "Anniversary" in pg.text_content(".acc") and "late-night" in pg.inner_text(".acc"))
    pg.click("#add"); pg.wait_for_timeout(700)
    t("variant saved on cart line", cart(pg)==[{"product_id":"P1","qty":1,"variant":"v2"}], cart(pg))
    t("mini-cart uses variant price + label", "1,499" in pg.inner_text("#mini") and "Pink glow" in pg.inner_text("#mini"))
    pg.click("#mini [data-c]")
    t("bundle price follows chosen variant (1499+499-1599=399), invalid bundle hidden", "You save" in pg.inner_text("#bundles") and "399" in pg.inner_text("#bundles") and "Broken" not in pg.inner_text("#bundles"), pg.inner_text("#bundles")[:200])
    pg.click("[data-bundle='B1']"); pg.wait_for_timeout(300)
    t("bundle add tags BOTH lines (even the one already in cart)", sorted((i["product_id"],i.get("bundle")) for i in cart(pg))==[("P1","B1"),("P2","B1")] and cart(pg)[0].get("variant")=="v2", cart(pg))
    t("analytics events recorded (view+add)", {"product_view","add_to_cart"}<={e["event"] for e in ev}, [e["event"] for e in ev])
    t("analytics payload has no PII", all(not ({"phone","email","customer_name","address"}&set(e)) for e in ev))
    pg.goto(B+"cart.html"); pg.wait_for_selector(".cl")
    t("cart shows bundle saving -399 and items total 1,599 (matches server rule)", "399" in pg.inner_text("#out") and "1,599" in pg.inner_text("#out"), pg.inner_text("#out")[:400])
    pg.click("[data-rm='P2']"); pg.wait_for_timeout(300)
    t("removing a bundle item removes the saving", "Bundle saving" not in pg.inner_text("#out"), pg.inner_text("#out")[:300])
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#add"); pg.evaluate("localStorage.setItem('sr_cart','[{\"product_id\":\"P1\",\"qty\":1,\"variant\":\"v2\"}]')")
    pg.goto(B+"cart.html"); pg.wait_for_selector(".cl")
    t("cart: variant label + variant price + flat shipping", "Pink glow" in pg.inner_text("#out") and "1,499" in pg.inner_text("#out") and "79" in pg.inner_text("#out"), pg.inner_text("#out")[:300])
    pg.goto(B+"checkout.html"); pg.wait_for_selector("#summary .sl")
    pg.fill("#customer_name","Asha Rao"); pg.fill("#address","12 Rose Street, Sector 5")
    pg.click("#summary [data-cq='1']"); pg.wait_for_timeout(300)
    t("8 qty change in checkout keeps entered details", pg.input_value("#customer_name")=="Asha Rao" and "2,998" in pg.inner_text("#summary") and "79" in pg.inner_text("#summary"), pg.inner_text("#summary")[:200])
    t("checkout_start event", "checkout_start" in [e["event"] for e in ev])
    t("addon offered unticked", pg.locator("[data-rm='P2']").count()==0)
    # consent flow
    pg.goto(B+"wishlist.html"); pg.wait_for_selector("#pref"); pg.fill("#o_d","2027-02-14"); pg.click("#o_add"); pg.fill("#p_e","a@b.co")
    pg.click("#p_go"); pg.wait_for_timeout(300); t("13 consent required before signup", len(prefs)==0)
    pg.check("#p_c"); pg.click("#p_go"); pg.wait_for_timeout(400); t("13 signup sent with explicit consent=True + dates", len(prefs)==1 and prefs[0]["consent"] is True and prefs[0]["dates"][0]["d"]=="2027-02-14", prefs)
    pg.fill("#u_e","a@b.co"); pg.click("#u_go"); pg.wait_for_timeout(300); t("13 opt-out sent", len(outs)==1 and outs[0]["email"]=="a@b.co")
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#waq[href]"); pg.click("#waq", modifiers=[]) if False else None
    pg.evaluate("document.querySelector('#waq').addEventListener('click',e=>e.preventDefault())"); pg.click("#waq"); pg.wait_for_timeout(300)
    t("14 wa_click event recorded", "wa_click" in [e["event"] for e in ev])
    t("no page errors", not errs, errs)
    for w in (360,390,430):
        c2,pg2,e2=new_page(b,m,w,800); pg2.goto(B+"product.html?id=P1"); pg2.wait_for_selector(".vchip"); pg2.wait_for_timeout(500)
        t(f"15 v3 product page no overflow {w}px", pg2.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
        pg2.goto(B+"wishlist.html"); pg2.wait_for_timeout(500); t(f"15 wishlist no overflow {w}px", pg2.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0); c2.close()
    # v3 events ON but pricing OFF: must NOT show variant price or bundle saving
    m3=Mock(); o3=m3.handle
    def h3(body):
        d=o3(body)
        if body.get("action")=="public.config":
            d["v3"]=True; d["site"]={"meta":{"P1":{"variants":[{"id":"v2","label":"Pink","price":1499,"on":True}]}},"bundles":[{"id":"B1","name":"Set","items":["P1","P2"],"price":1000,"on":True}]}
        return d
    m3.handle=h3; c3,pg3,e3=new_page(b,m3); pg3.goto(B+"product.html?id=P1"); pg3.wait_for_selector(".vchip"); pg3.wait_for_timeout(500)
    t("pricing flag OFF: variant price NOT shown", "1,499" not in pg3.inner_text("#pprice") and "1,299" in pg3.inner_text("#pprice"))
    t("pricing flag OFF: bundle shows regular price, no saving claimed", "You save" not in pg3.inner_text("#bundles") and "1,798" in pg3.inner_text("#bundles"), pg3.inner_text("#bundles")[:200])
    b.close()
f=[n for n,ok in R if not ok]; print(f"\n{len(R)-len(f)} passed, {len(f)} failed"); sys.exit(1 if f else 0)
