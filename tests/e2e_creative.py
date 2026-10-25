import json, sys
from harness import *
srv=serve(); R=[]
def t(n,ok,info=""): R.append((n,bool(ok))); print(("PASS " if ok else "FAIL ")+n+((" -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8765/site/"
with sync_playwright() as p:
    b=p.chromium.launch(); m=Mock(); orig=m.handle
    def h(body):
        d=orig(body)
        if body.get("action")=="public.config": d["site"]={"meta":{"P1":{"occasion":"Anniversary","recipient":"Partner","tags":["romantic","lamp"]},"P3":{"occasion":"Birthday","tags":["romantic"]}}}
        return d
    m.handle=h; ctx,pg,errs=new_page(b,m)
    # ---- Gift finder ----
    pg.goto(B+"gift-finder.html"); pg.wait_for_selector(".vchip")
    t("finder: question 1 of 4 shown", "Question 1 of 4" in pg.inner_text("#fq"))
    for i in (0,0,0,2): pg.click(f".vchip[data-i='{i}']"); pg.wait_for_timeout(120)   # partner, anniversary, romantic, 1000-2000
    pg.wait_for_selector("#fr .cl")
    txt=pg.inner_text("#fr")
    t("finder: recommends the real in-budget product (P1 lamp 1299)", "Couple Name Lamp" in txt and "Love Letter Box" not in txt and "Rose Bouquet" not in txt, txt[:200])
    t("finder: reasons come only from real data (anniversary, romantic, budget)", "made for anniversary" in txt.lower() and "within your budget" in txt.lower(), txt[:300])
    pg.click("#again"); pg.wait_for_selector(".vchip")
    for i in (0,1,1,0): pg.click(f".vchip[data-i='{i}']"); pg.wait_for_timeout(120)   # birthday, under 500
    pg.wait_for_selector("#fr .cl"); txt=pg.inner_text("#fr")
    t("finder: budget is a hard filter (only Love Letter Box 499)", "Love Letter Box" in txt and "Couple Name Lamp" not in txt and "Rose Bouquet" not in txt, txt[:200])
    pg.click("#again"); pg.wait_for_selector(".vchip")
    for i in (0,0,0,3): pg.click(f".vchip[data-i='{i}']"); pg.wait_for_timeout(120)   # 2000+
    pg.wait_for_selector("#fr h3"); txt=pg.inner_text("#fr")
    t("finder: nothing in budget => honest 'closest' message, labelled outside budget", "closest" in txt.lower() and "outside your budget" in txt.lower(), txt[:200])
    # ---- Reveal ----
    pg.goto(B+"reveal.html"); pg.wait_for_selector("#r_go")
    pg.fill("#r_f","Rahul"); pg.fill("#r_t","Asha"); pg.fill("#r_m","Happy anniversary,\nmy favourite person.")
    pg.click("#r_go"); pg.wait_for_selector("#r_u"); url=pg.input_value("#r_u")
    t("reveal: link generated, message lives in the link (not sent to any server)", "#" in url and not any(a for a in m.calls if "reveal" in str(a)), url[:80])
    wa=pg.get_attribute("a:has-text('Send on WhatsApp')","href"); t("reveal: WhatsApp share link is encoded & has no invented number", wa.startswith("https://wa.me/?text=") and "%23" in wa, wa[:60])
    c2,pg2,e2=new_page(b,m,390,800); pg2.goto(url); pg2.wait_for_selector("#env")
    t("reveal: recipient sees sealed envelope, message hidden", pg2.locator("#rcard").is_hidden() and "favourite person" not in pg2.inner_text("#rv"))
    pg2.click("#env"); pg2.wait_for_timeout(1300)
    t("reveal: envelope opens, message + sender shown", "my favourite person" in pg2.inner_text("#rcard") and "With love, Rahul" in pg2.inner_text("#rcard"))
    t("reveal: CTA to Gift Finder appears after the message", pg2.locator("#cta a[href='gift-finder.html']").is_visible())
    t("reveal: no horizontal overflow at 390px", pg2.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
    # security: HTML in message must render as text
    import base64
    payload=json.dumps({"f":"<b>x</b>","t":"","m":"<img src=x onerror=window.__pwn=1>hello"})
    tok=base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    pg2.goto(B+"reveal.html#"+tok); pg2.wait_for_selector("#env"); pg2.click("#env"); pg2.wait_for_timeout(300)
    t("reveal: HTML/script in a crafted link is shown as plain text (no XSS)", pg2.evaluate("window.__pwn")is None and "<img" in pg2.inner_text("#rmsg"))
    pg2.goto(B+"reveal.html#%%%garbage"); pg2.wait_for_timeout(300); t("reveal: garbage link shows friendly message, no crash", "incomplete" in pg2.inner_text("#rv"))
    t("nav has Gift Finder", pg.evaluate("[...document.querySelectorAll('#nl a')].some(a=>a.textContent.includes('Gift Finder'))") or pg2.evaluate("[...document.querySelectorAll('#nl a')].some(a=>a.textContent.includes('Gift Finder'))"))
    t("no page errors", not errs and not e2, (errs,e2))
    for w in (360,430):
        c3,pg3,e3=new_page(b,m,w,800)
        for path in ("gift-finder.html","reveal.html"): pg3.goto(B+path); pg3.wait_for_timeout(500); t(f"15 no overflow {w}px {path}", pg3.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
        c3.close()
    b.close()
f=[n for n,ok in R if not ok]; print(f"\n{len(R)-len(f)} passed, {len(f)} failed"); sys.exit(1 if f else 0)
