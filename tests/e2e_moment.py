import json, sys
from harness import *
srv=serve(); R=[]
def t(n,ok,info=""): R.append((n,bool(ok))); print(("PASS " if ok else "FAIL ")+n+((" -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8765/site/"
def run(v3):
    m=Mock(); orig=m.handle; prefs=[]
    def h(b):
        a=b.get("action")
        if a=="public.config":
            d=orig(b); d["v3"]=v3; return d
        if a=="public.preferences": prefs.append(b); return {}
        return orig(b)
    m.handle=h; return m,prefs
def order(pg):
    pg.goto(B+"product.html?id=P1"); pg.wait_for_selector("#add"); pg.click("#add"); pg.wait_for_timeout(500)
    pg.goto(B+"checkout.html"); pg.wait_for_selector("#summary .sl")
    for k,v in dict(customer_name="Asha Rao",phone="9876543210",email="asha@example.com",address="12 Rose Street, Sector 5",city="Delhi",state="Delhi",pin="110001").items(): pg.fill("#"+k,v)
    pg.check("#policy"); pg.click("#go"); pg.wait_for_selector("#mp")
with sync_playwright() as p:
    b=p.chromium.launch()
    m,prefs=run(True); ctx,pg,errs=new_page(b,m); order(pg)
    t("prompt appears on confirmation, BELOW the order info", pg.evaluate("document.querySelector('#done h3').getBoundingClientRect().top<document.getElementById('mp').getBoundingClientRect().top") and "ORD-" in pg.inner_text("#done"))
    t("nothing is subscribed or collected up front (consent unticked, email section hidden)", pg.is_hidden("#mp_r") and not prefs)
    pg.click("#mp_s"); pg.wait_for_timeout(200); t("saving without a date is blocked", pg.evaluate("localStorage.getItem('sr_occ')") in (None,"[]"))
    pg.select_option("#mp_t","Anniversary"); pg.fill("#mp_n","Sam"); pg.fill("#mp_d","2026-07-17"); pg.click("#mp_s"); pg.wait_for_timeout(200)
    occ=json.loads(pg.evaluate("localStorage.getItem('sr_occ')"))
    t("date saved on THIS device only (no server call yet)", occ==[{"t":"Anniversary","n":"Sam","d":"2026-07-17"}] and not prefs, occ)
    t("email box appears only after a date is saved, prefilled but NOT consented", pg.is_visible("#mp_r") and pg.input_value("#mp_e")=="asha@example.com" and not pg.is_checked("#mp_c"))
    pg.click("#mp_g"); pg.wait_for_timeout(300); t("email reminders refused without ticking consent", not prefs)
    pg.check("#mp_c"); pg.click("#mp_g"); pg.wait_for_timeout(400)
    t("with explicit tick: preferences sent with consent=True + the saved date", len(prefs)==1 and prefs[0]["consent"] is True and prefs[0]["dates"]==[{"t":"Anniversary","n":"Sam","d":"2026-07-17"}] and prefs[0]["email"]=="asha@example.com", prefs)
    t("no page errors", not errs, errs); ctx.close()
    m,prefs=run(False); ctx,pg,errs=new_page(b,m); order(pg)
    t("without backend support: no email/consent section is even shown", pg.locator("#mp_r").count()==0 and pg.locator("#mp_g").count()==0)
    pg.fill("#mp_d","2027-02-14"); pg.click("#mp_s"); pg.wait_for_timeout(200); t("without backend support: date still saved locally", len(json.loads(pg.evaluate("localStorage.getItem('sr_occ')")))==1 and not prefs)
    t("no overflow 360px on confirmation", (pg.set_viewport_size({"width":360,"height":800}) or True) and pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
    b.close()
f=[n for n,ok in R if not ok]; print(f"\n{len(R)-len(f)} passed, {len(f)} failed"); sys.exit(1 if f else 0)
