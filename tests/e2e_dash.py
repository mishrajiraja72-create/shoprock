import json, sys
from harness import *
from mock_api import Mock, PRODUCTS
srv=serve(); R=[]
def t(n,ok,info=""): R.append((n,bool(ok))); print(("PASS " if ok else "FAIL ")+n+((" -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8765/"
class DM(Mock):
    """Mock with a persistent settings store so we can verify dashboard-save -> storefront read."""
    def __init__(s): super().__init__(); s.settings={"site_json":"{}","whatsapp_number":"919876543210","wa_greeting":"Hi!","free_shipping_above":"999"}; s.sets=[]
    def handle(s,b):
        a=b.get("action")
        if a=="auth.login": return dict(token="T",user=dict(name="Owner",role="OWNER"))
        if a=="settings.get": return dict(s.settings)
        if a=="settings.set": s.settings[b["key"]]=b["value"]; s.sets.append(b["key"]); return {}
        if a=="research.list": return [dict(product_id=p["product_id"],name=p["name"],selling_price=p["price"],status="PUBLISHED",category=p["category"]) for p in PRODUCTS]
        if a=="analytics.report": raise Exception("Unknown action analytics.report")
        if a=="prefs.list": raise Exception("Unknown action prefs.list")
        if a=="public.config":
            d=super().handle(b); d["whatsapp_number"]=s.settings["whatsapp_number"]; d["wa_greeting"]=s.settings["wa_greeting"]; d["v3"]=True; d["v3_pricing"]=True; d["site"]=json.loads(s.settings["site_json"]); return d
        return super().handle(b)
with sync_playwright() as p:
    b=p.chromium.launch(); m=DM(); ctx,pg,errs=new_page(b,m,1280,900,touch=False)
    pg.goto(B+"dashboard/index.html"); pg.fill("#le","o@x.co"); pg.fill("#lp","pw"); pg.click("#lf button"); pg.wait_for_selector("#nav a")
    navs=pg.inner_text("#nav"); t("dashboard nav lists new sections", all(x in navs for x in ["Product details","Bundles","Analytics","Reminders"]), navs[:300])
    pg.click("#nav a[data-v='details']"); pg.wait_for_selector("details[data-pid='P1']"); pg.click("details[data-pid='P1'] summary")
    d="details[data-pid='P1'] "
    pg.fill(d+"[data-m='occasion']","Anniversary"); pg.fill(d+"[data-m='story']","A lamp with a story."); pg.fill(d+"[data-m='tags']","lamp, glow")
    pg.fill(d+"[data-m='variants']","Warm white\nPink glow | 1499 | yes\nBlue | | no"); pg.click(d+"[data-save-meta]"); pg.wait_for_timeout(500)
    saved=json.loads(m.settings["site_json"]); mv=saved.get("meta",{}).get("P1",{})
    t("12 details save persisted to backend settings", mv.get("occasion")=="Anniversary" and len(mv.get("variants",[]))==3 and mv["variants"][1]["price"]==1499 and mv["variants"][2]["available"] is False, mv)
    # invalid variant price rejected & not saved
    pg.fill(d+"[data-m='variants']","Bad | abc | yes"); before=json.dumps(m.settings["site_json"]); pg.click(d+"[data-save-meta]"); pg.wait_for_timeout(400)
    t("12 invalid variant price rejected, nothing saved", json.dumps(m.settings["site_json"])==before)
    # storefront reads it
    c2,pg2,e2=new_page(b,m,390,800); pg2.goto(B+"site/product.html?id=P1"); pg2.wait_for_selector(".vchip")
    t("12 storefront shows dashboard-saved variants + story", pg2.locator(".vchip").count()==3 and "A lamp with a story." in pg2.inner_text("body"))
    # bundles
    pg.click("#nav a[data-v='bundles']"); pg.wait_for_selector("#b_go"); pg.fill("#b_n","Cosy night"); pg.check("[data-bp='P1']"); pg.check("[data-bp='P2']"); pg.fill("#b_p","1800"); pg.click("#b_go"); pg.wait_for_timeout(400)
    t("12 bundle price >= total rejected", "bundles" not in json.loads(m.settings["site_json"]))
    pg.fill("#b_p","1599"); pg.click("#b_go"); pg.wait_for_timeout(600)
    bl=json.loads(m.settings["site_json"]).get("bundles",[]); t("12 bundle saved", len(bl)==1 and bl[0]["price"]==1599 and bl[0]["items"]==["P1","P2"], bl)
    pg2.evaluate("sessionStorage.clear()"); pg2.reload(); pg2.wait_for_selector(".vchip"); pg2.wait_for_timeout(600); t("12 storefront shows saved bundle with real saving ₹199", "You save" in pg2.inner_text("#bundles") and "199" in pg2.inner_text("#bundles"), pg2.inner_text("#bundles")[:150])
    # Surprise Week validation
    pg.click("#nav a[data-v='bundles']"); pg.wait_for_selector("#b_go"); pg.fill("#b_n","Week"); pg.check("[data-bp='P1']"); pg.check("[data-bp='P2']"); pg.check("#b_w"); pg.click("#b_go"); pg.wait_for_timeout(400)
    t("12 Surprise Week with 2 products rejected", not any(x.get("kind")=="week" for x in json.loads(m.settings["site_json"]).get("bundles",[])))
    pg.check("[data-bp='P3']"); pg.fill("#b_p","2000"); pg.click("#b_go"); pg.wait_for_timeout(600)
    wk=[x for x in json.loads(m.settings["site_json"]).get("bundles",[]) if x.get("kind")=="week"]; t("12 Surprise Week with exactly 3 products saved (kind=week)", len(wk)==1 and wk[0]["price"]==2000 and len(wk[0]["items"])==3, wk)
    # thank-you setting persists
    pg.click("#nav a[data-v='settings']"); pg.wait_for_selector("[data-s='thanks_percent']"); pg.fill("[data-s='thanks_percent']","10"); pg.click("button:has-text('Save Thank-you code after delivery')"); pg.wait_for_timeout(600)
    t("12 thank-you percent saved via dashboard", m.settings.get("thanks_percent")=="10", m.settings)
    # analytics/reminders honest when backend lacks support
    pg.click("#nav a[data-v='analytics']"); pg.wait_for_timeout(500); t("analytics shows blocker, no fake numbers", "needs BACKEND-PATCH-v3" in pg.inner_text("#view") and "₹" not in pg.inner_text("#view"))
    pg.click("#nav a[data-v='reminders']"); pg.wait_for_timeout(500); t("reminders shows blocker, no fake rows", "Nothing is being collected" in pg.inner_text("#view"))
    # WhatsApp setting -> storefront
    pg.click("#nav a[data-v='settings']"); pg.wait_for_selector("[data-s='whatsapp_number']"); pg.fill("[data-s='whatsapp_number']","911112223334"); pg.click("button:has-text('Save WhatsApp and contact')"); pg.wait_for_timeout(700)
    t("12/14 WhatsApp number saved via dashboard", m.settings["whatsapp_number"]=="911112223334")
    pg2.evaluate("sessionStorage.clear()"); pg2.reload(); pg2.wait_for_selector("#waq[href]"); t("14 storefront WhatsApp link uses dashboard number", "wa.me/911112223334" in pg2.get_attribute("#waq","href"), pg2.get_attribute("#waq","href"))
    t("no page errors", not errs and not e2, (errs,e2)); b.close()
f=[n for n,ok in R if not ok]; print(f"\n{len(R)-len(f)} passed, {len(f)} failed"); sys.exit(1 if f else 0)
