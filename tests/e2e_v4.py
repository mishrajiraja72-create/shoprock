import json, sys, copy
from harness import *
import mock_api
srv=serve(8766); R=[]
def t(n,ok,info=""): R.append((n,bool(ok))); print(("PASS " if ok else "FAIL ")+n+((" -- "+str(info)) if (info and not ok) else ""))
B="http://127.0.0.1:8766/site/"
SQ="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23b9a3e3'/%3E%3C/svg%3E"
TALL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='220'%3E%3Crect width='100' height='220' fill='%23e3a3b9'/%3E%3C/svg%3E"
def prods():
    P=copy.deepcopy(mock_api.PRODUCTS)
    P[0].update(image_url=SQ, featured=True, category="Lamps")
    P[1].update(image_url=TALL, category="Keepsakes")
    P[2].update(image_url=SQ, category="Flowers", available=True)
    P.append(dict(product_id="P4",name="Cheap Sticker Pack",price=199,category="Keepsakes",image_url=SQ,gallery=[],description="Cute stickers",available=True))
    P.append(dict(product_id="P5",name="Sold Out Teddy",price=999,category="Plush",image_url=SQ,gallery=[],description="Gone",available=False))
    return P
def mk(v4=False, products=None, extra_cfg=None, google=False):
    m=mock_api.Mock(); orig=m.handle; m.P=products if products is not None else prods(); m.log=[]
    m.sessions={}
    def h(b):
        a=b.get("action"); m.log.append(b)
        if a=="public.config":
            d=orig(b); d["v3"]=True; d["v3_pricing"]=True; d["occasions"]="Anniversary, Birthday, Nonexistent"
            d["site"]={"meta":{"P1":{"occasion":"Anniversary","tags":["romantic","gf"],"recipient":"Girlfriend"},"P4":{"tags":["cute"]}},"bundles":[{"id":"B1","name":"Night in","items":["P1","P4"],"price":1299,"on":True}]}
            if v4: d["v4"]=True
            if google: d["google_client_id"]="123-abc.apps.googleusercontent.com"
            if extra_cfg: d.update(extra_cfg)
            return d
        if a=="public.products": return m.P
        if a=="public.product": return next(p for p in m.P if p["product_id"]==b["product_id"])
        if a=="public.acctGoogle":
            if b["credential"]!="FAKE-GOOGLE-CRED": raise Exception("Google sign-in could not be verified. Please try again.")
            m.sessions["GTOK"*10]="gina@gmail.com"; return {"token":"GTOK"*10,"email":"gina@gmail.com","name":"Gina Rao"}
        if a=="public.acctLogin":
            if b["password"]!="rightpass1": raise Exception("Email or password is incorrect.")
            m.sessions["PTOK"*10]=b["email"]; return {"token":"PTOK"*10,"email":b["email"],"name":""}
        if a=="public.acctRegisterStart": m.regs=b; return {"sent":True}
        if a=="public.acctRegisterVerify":
            if b["code"]!="123456": raise Exception("That code is not valid or has expired. Please start again.")
            m.sessions["RTOK"*10]=b["email"]; return {"token":"RTOK"*10,"email":b["email"],"name":""}
        if a=="public.acctSend": return {"sent":True}
        if a=="public.acctVerify":
            if b["code"]!="123456": raise Exception("That code is not valid or has expired. Please request a new one.")
            m.sessions["VTOK"*10]=b["email"]; return {"token":"VTOK"*10,"email":b["email"]}
        if a=="public.acctSetPassword":
            if b["token"] not in m.sessions: raise Exception("Please sign in again."); 
            m.newpw=b["password"]; return {}
        if a=="public.acctMe":
            if b["token"] not in m.sessions: raise Exception("Please sign in again.")
            return {"email":m.sessions[b["token"]],"name":"Gina Rao" if "gina" in m.sessions[b["token"]] else "","providers":["google"] if "gina" in m.sessions[b["token"]] else ["password"],"has_password":False,"member_since":"2026-10-01T10:00:00Z"}
        if a=="public.acctOrders":
            if getattr(m,"netfail",False): raise Exception("Failed to fetch")
            if b["token"] not in m.sessions: raise Exception("Please sign in again.")
            return [dict(order_id="ORD-AAAA1111",created_at="2026-10-01T10:00:00Z",total=1299,payment_status="PAID",order_status="SHIPPED",tracking_number="TRK1",delivery_estimate="3-5 days",city="Delhi",gift_message="",items=[dict(name="Couple Name Lamp",qty=1,unit_price=1299,product_id="P1")],updates=[dict(at="2026-10-01T10:00:00Z",status="Order placed")])]
        if a=="public.acctLogout": m.sessions.pop(b["token"],None); return {}
        return orig(b)
    m.handle=h; return m
GIS_STUB="""window.__gis={};window.google={accounts:{id:{initialize:o=>{window.__gis.cfg=o},renderButton:(el,o)=>{window.__gis.opts=o;el.innerHTML='<button id="fakeg">Sign in with Google</button>'}}}};"""
with sync_playwright() as p:
    b=p.chromium.launch()
    # ================= HOME, mobile =================
    m=mk(); ctx,pg,errs=new_page(b,m,390,844); pg.goto(B+"index.html"); pg.wait_for_selector("#featured .pc")
    cards=pg.locator("#featured .pc"); n=cards.count()
    t("home: only AVAILABLE products shown (sold-out hidden), 4 here",n==4,n)
    bx=[cards.nth(i).bounding_box() for i in range(n)]
    t("home: products are visible on the first screen (first card starts above the fold)", bx[0]["y"]<700, bx[0])
    t("home: 2 products per row on mobile, equal width", abs(bx[0]["y"]-bx[1]["y"])<2 and bx[1]["x"]>bx[0]["x"]+100 and abs(bx[0]["width"]-bx[1]["width"])<2 and bx[2]["y"]>bx[0]["y"]+100, bx)
    ib=pg.locator("#featured .pc-img").first.bounding_box()
    t("home: thumbnails are square", abs(ib["width"]-ib["height"])<2, ib)
    t("home: featured product listed first", "Couple Name Lamp" in cards.first.inner_text())
    t("home: card = image, short name, price, wishlist heart only (no long text)", all(x in cards.first.inner_text() for x in ["Couple Name Lamp","1,299"]) and "A glowing lamp" not in cards.first.inner_text() and cards.first.locator("[data-wish]").count()==1)
    t("home: section order = header, Gift Finder, categories, products", pg.evaluate("""()=>{const y=s=>document.querySelector(s).getBoundingClientRect().top;return y('.topbar')<y('#gfcta')&&y('#gfcta')<y('#cats')&&y('#cats')<y('#featured')}"""))
    t("home: no big banner/hero (3D scene gone)", pg.locator(".hero3d,#scene").count()==0)
    t("home: Gift Finder shortcut goes to the existing finder", pg.get_attribute("#gfcta","href")=="gift-finder.html")
    cats=pg.locator("#cats .cat-t"); t("home: category shortcuts built from real categories (Lamps/Keepsakes/Flowers; sold-out-only 'Plush' hidden)", sorted(cats.all_inner_texts())==["Flowers","Keepsakes","Lamps"], cats.all_inner_texts())
    t("home: category circle uses a real product photo", pg.locator("#cats img").first.get_attribute("src").startswith("data:image/svg"))
    tall=pg.evaluate("()=>[...document.querySelectorAll('#featured .pc')].map(c=>({n:c.innerText.split('\\n')[0],fit:c.querySelector('img').classList.contains('fit')}))")
    t("home: tall photo is NOT cropped (shown whole), square photo fills", [x["fit"] for x in tall if "Love Letter" in x["n"]]==[True] and [x["fit"] for x in tall if "Couple" in x["n"]]==[False], tall)
    cols=pg.evaluate("""()=>{const r=document.querySelectorAll('.setcard');return r.length}""")
    t("home: collections: gift set from real bundle shown", pg.locator(".setcard").count()==1 and "Night in" in pg.inner_text("#collections"))
    t("home: 'under 499' only when it is a real subset (2 items: 499 and 199)", "Gifts under ₹499" in pg.inner_text("#collections") and "Gifts under ₹999" in pg.inner_text("#collections"))
    t("home: occasion chips only for occasions that have products (Nonexistent hidden)", pg.locator("#occ .chip").all_inner_texts()==["Anniversary"], pg.locator("#occ .chip").all_inner_texts())
    t("home: trust row links to real policy pages", all(pg.locator(f"#trustrow a[href='{h}']").count()==1 for h in ["policies.html#shipping","policies.html#returns"]))
    t("home: payment trust item follows real checkout mode (MANUAL => 'Pay by UPI')", "Pay by UPI" in pg.inner_text("#trustrow"))
    t("home: footer has policy + support links", all(pg.locator(f"footer a[href='{h}']").count()>=1 for h in ["policies.html#shipping","policies.html#returns","policies.html#privacy","policies.html#terms","policies.html#contact"]))
    # card -> product page
    pg.locator("#featured .pc").nth(1).locator(".pc-body").click(); pg.wait_for_url("**/product.html?id=P2"); pg.wait_for_selector("#add")
    t("home: card opens ITS product page (id P2, correct title)", "Love Letter Box" in pg.inner_text("h1"))
    t("product page keeps gallery, price, description, add to cart, buy now", all(pg.locator(s).count()>=1 for s in ["#gm","#pprice","#add","#buy",".lead2"]))
    t("product page: no bottom nav stacked on the purchase bar", pg.locator(".bnav").count()==0)
    # wishlist heart
    pg.goto(B+"index.html"); pg.wait_for_selector("#featured .pc"); h=pg.locator("#featured .pc").first.locator("[data-wish]")
    h.click(); pg.wait_for_timeout(200)
    t("wishlist: heart saves product (localStorage sr_wish) and badge shows 1", json.loads(pg.evaluate("localStorage.getItem('sr_wish')"))==["P1"] and pg.locator(".bnav .js-wish").inner_text()=="1" and h.get_attribute("aria-pressed")=="true")
    pg.click(".bnav a[href='wishlist.html']"); pg.wait_for_url("**/wishlist.html"); pg.wait_for_selector(".cl")
    t("wishlist: bottom-bar Wishlist opens the real wishlist page with that product", "Couple Name Lamp" in pg.inner_text("#wl"))
    pg.goto(B+"index.html"); pg.wait_for_selector("#featured .pc"); pg.locator("#featured .pc").first.locator("[data-wish]").click(); pg.wait_for_timeout(150)
    t("wishlist: heart again removes it", json.loads(pg.evaluate("localStorage.getItem('sr_wish')"))==[])
    # search overlay
    pg.click("#sbtn"); pg.wait_for_selector("#sr-in")
    pg.fill("#sr-in","lamp"); pg.wait_for_selector(".sr-r")
    t("search: finds a published product by name", pg.locator(".sr-r").count()==1 and "Couple Name Lamp" in pg.inner_text("#sr-out"))
    pg.fill("#sr-in","gf"); pg.wait_for_timeout(150); t("search: 'gf' finds product tagged girlfriend/gf (dashboard tags)", "Couple Name Lamp" in pg.inner_text("#sr-out"))
    pg.fill("#sr-in","keepsakes"); pg.wait_for_timeout(150); t("search: matches category (2 keepsakes)", pg.locator(".sr-r").count()==2)
    pg.fill("#sr-in","anniversary"); pg.wait_for_timeout(150); t("search: matches occasion from dashboard meta", "Couple Name Lamp" in pg.inner_text("#sr-out"))
    pg.fill("#sr-in","sold out teddy"); pg.wait_for_timeout(150); t("search: sold-out products are not offered", pg.locator(".sr-r").count()==0 and "No gifts match" in pg.inner_text("#sr-out"))
    pg.fill("#sr-in","zzzz"); pg.wait_for_timeout(150); t("search: useful empty state links to Gift Finder", pg.locator("#sr-out a[href='gift-finder.html']").count()==1)
    pg.fill("#sr-in","lamp"); pg.wait_for_selector(".sr-r"); pg.click(".sr-r"); pg.wait_for_url("**/product.html?id=P1")
    t("search: result opens the right product", True)
    pg.goto(B+"index.html"); pg.click("#sbtn"); pg.fill("#sr-in","love"); pg.press("#sr-in","Enter"); pg.wait_for_url("**/shop.html?q=love"); pg.wait_for_selector("#out .pc")
    t("search: Enter goes to shop results page", pg.locator("#out .pc").count()==1 and "Love Letter Box" in pg.inner_text("#out"))
    pg.goto(B+"index.html"); pg.click("#sbtn"); pg.keyboard.press("Escape"); t("search: Esc closes overlay", pg.locator("#sr-ov").count()==0)
    # ================= bottom bar =================
    pg.goto(B+"index.html"); pg.wait_for_selector("#featured .pc")
    nav=pg.locator(".bnav a"); t("bar: exactly 5 items in the requested order", pg.locator(".bnav .bl").all_inner_texts()==["Home","Gift Finder","Categories","Wishlist","Account"], pg.locator(".bnav .bl").all_inner_texts())
    hrefs=[nav.nth(i).get_attribute("href") for i in range(5)]
    t("bar: every button points to a real page", hrefs==["index.html","gift-finder.html","shop.html?view=cats","wishlist.html","account.html"], hrefs)
    t("bar: Home is marked active on home (aria-current)", pg.get_attribute(".bnav a.on","href")=="index.html" and pg.get_attribute(".bnav a.on","aria-current")=="page")
    st=pg.evaluate("()=>{const b=document.querySelector('.bnav').getBoundingClientRect();return {pos:getComputedStyle(document.querySelector('.bnav')).position,bottom:Math.round(b.bottom),vh:innerHeight,h:Math.round(b.height)}}")
    pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); pg.wait_for_timeout(200)
    st2=pg.evaluate("()=>{const b=document.querySelector('.bnav').getBoundingClientRect(),f=document.querySelector('footer').getBoundingClientRect();return {navTop:b.top,footBottom:f.bottom,navBottom:b.bottom,vh:innerHeight}}")
    t("bar: stays fixed at the bottom while scrolled to the very end", st["pos"]=="fixed" and abs(st2["navBottom"]-st2["vh"])<2, st2)
    t("bar: page content is not hidden under it (footer ends above the bar)", st2["footBottom"]<=st2["navTop"]+1, st2)
    t("bar: tap targets >= 44px high", st["h"]>=56)
    wa=pg.evaluate("()=>{const w=document.getElementById('waf');if(!w)return null;const a=w.getBoundingClientRect(),b=document.querySelector('.bnav').getBoundingClientRect();return {wb:a.bottom,nt:b.top}}")
    t("bar: WhatsApp button sits above the bar (no overlap)", wa and wa["wb"]<=wa["nt"], wa)
    pg.click(".bnav a[href='gift-finder.html']"); pg.wait_for_url("**/gift-finder.html"); pg.wait_for_selector(".vchip")
    t("bar: Gift Finder opens the existing finder (4 questions) and is marked active", pg.get_attribute(".bnav a.on","href")=="gift-finder.html" and "Question 1 of 4" in pg.inner_text("#fq"))
    pg.click(".bnav a[href='shop.html?view=cats']"); pg.wait_for_url("**/shop.html?view=cats"); pg.wait_for_selector("#cats .cat-t")
    t("bar: Categories opens shop with category tiles, active", pg.get_attribute(".bnav a.on","href")=="shop.html?view=cats" and pg.locator("#cats .cat-t").count()==3)
    pg.click("#cats .cat-t >> text=Keepsakes"); pg.wait_for_url("**/shop.html?cat=Keepsakes"); pg.wait_for_selector("#out .pc")
    t("category tile filters to exactly that category's products", pg.locator("#out .pc").count()==2 and pg.input_value("#cat")=="Keepsakes" and pg.locator("#cats .cat-t.on").count()==1)
    pg.goto(B+"shop.html?max=499"); pg.wait_for_selector("#out .pc"); t("collection link ?max=499 filters by real price", pg.locator("#out .pc").count()==2)
    pg.click(".bnav a[href='account.html']"); pg.wait_for_url("**/account.html"); t("bar: Account opens account page, active", pg.get_attribute(".bnav a.on","href")=="account.html")
    pg.goto(B+"checkout.html"); pg.wait_for_timeout(300); t("checkout: bar hidden so it cannot cover the pay button", pg.locator(".bnav").count()==0)
    pg.goto(B+"cart.html"); pg.wait_for_timeout(300); t("cart: bar present with bottom padding", pg.locator(".bnav").count()==1 and pg.evaluate("parseFloat(getComputedStyle(document.body).paddingBottom)")>=60)
    t("header: logo, search, account, cart (cart badge present)", all(pg.locator(s).count()>=1 for s in [".topbar .logo","#sbtn",".topbar a[href='account.html']","#cartCount"]))
    t("home page: no JS errors", not errs, errs)
    # ================= desktop / tablet =================
    c2,pd,e2=new_page(b,mk(),1280,800,touch=False); pd.goto(B+"index.html"); pd.wait_for_selector("#featured .pc")
    xs=sorted({round(pd.locator("#featured .pc").nth(i).bounding_box()["x"]) for i in range(4)})
    t("desktop: 4 columns, bottom bar hidden, top links shown", len(xs)==4 and pd.locator(".bnav").is_hidden() and pd.locator(".dlinks").is_visible())
    t("desktop: top links are real pages", all(pd.locator(f".dlinks a[href='{h}']").count()==1 for h in ["shop.html","gift-finder.html","track.html","wishlist.html","account.html"]))
    t("desktop: no horizontal overflow", pd.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
    c3,ptb,e3=new_page(b,mk(),768,900,touch=True); ptb.goto(B+"index.html"); ptb.wait_for_selector("#featured .pc")
    xs=sorted({round(ptb.locator("#featured .pc").nth(i).bounding_box()["x"]) for i in range(4)}); t("tablet 768px: 3 columns, readable", len(xs)==3 and ptb.locator("#featured .pc-name").first.bounding_box()["width"]>120, xs)
    for w in (320,360,414):
        c4,pn,e4=new_page(b,mk(),w,800); 
        for path in ("index.html","shop.html","account.html","wishlist.html"): pn.goto(B+path); pn.wait_for_timeout(500); t(f"no overflow {w}px {path}", pn.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")<=0)
    # ================= dashboard-published product appears; updates reflect =================
    m5=mk(); c5,p5,e5=new_page(b,m5,390,844); p5.goto(B+"index.html"); p5.wait_for_selector("#featured .pc")
    m5.P.append(dict(product_id="P9",name="Brand New Dashboard Gift",price=1111,category="Fresh",image_url=SQ,gallery=[],description="x",available=True)); m5.P[1]["price"]=555
    p5.evaluate("sessionStorage.clear()"); p5.reload(); p5.wait_for_selector("#featured .pc")
    tx=p5.inner_text("#featured"); t("dashboard: newly published product appears on home with its real name, price, link", "Brand New Dashboard Gift" in tx and "1,111" in tx and p5.locator("#featured a[href='product.html?id=P9']").count()>=1)
    t("dashboard: price update is reflected; new category appears as a shortcut", "555" in tx and "Fresh" in p5.inner_text("#cats"))
    # states
    c6,p6,e6=new_page(b,mk(products=[]),390,844); p6.goto(B+"index.html"); p6.wait_for_selector(".empty"); t("empty catalogue: friendly message, no broken grid/categories", "first collection" in p6.inner_text("#featured") and p6.locator("#cats").is_hidden())
    m7=mk(); orig7=m7.handle
    def bad(bd):
        if bd.get("action")=="public.products": raise Exception("boom")
        return orig7(bd)
    m7.handle=bad; c7,p7,e7=new_page(b,m7,390,844); p7.goto(B+"index.html"); p7.wait_for_selector(".errorbox"); t("backend error: clear message + retry, page still usable", "could not be loaded" in p7.inner_text("#featured") and p7.locator("#sbtn").is_visible())
    # ================= ACCOUNT (v4 UI) =================
    def acct(m, w=390):
        c,pg,er=new_page(b,m,w,844); c.route("https://accounts.google.com/gsi/client", lambda r: r.fulfill(status=200,content_type="application/javascript",body=GIS_STUB)); return c,pg,er
    m=mk(v4=True,google=True); c,pg,er=acct(m); pg.goto(B+"account.html"); pg.wait_for_selector("#fp")
    t("account: Google button rendered by Google's script when a client id is configured", pg.locator("#fakeg").count()==1 and pg.evaluate("__gis.cfg.client_id")=="123-abc.apps.googleusercontent.com" and pg.evaluate("__gis.cfg.ux_mode")=="popup")
    t("account: signed-out page makes no order requests", not any(x.get("action")=="public.acctOrders" for x in m.log))
    t("account: shows email + password and create-account options", pg.locator("#t_in").count()==1 and pg.locator("#t_up").count()==1 and pg.locator("#pw").get_attribute("type")=="password")
    # SIMULATED Google response (the real Google popup cannot run here)
    pg.evaluate("__gis.cfg.callback({credential:'FAKE-GOOGLE-CRED'})"); pg.wait_for_selector("#det")
    t("account[SIMULATED google callback]: credential sent to OUR backend, session saved, account details + orders shown", any(x.get("action")=="public.acctGoogle" and x["credential"]=="FAKE-GOOGLE-CRED" for x in m.log) and "gina@gmail.com" in pg.inner_text("#det") and "Gina Rao" in pg.inner_text("#det") and "ORD-AAAA1111" in pg.inner_text("#ol"), pg.inner_text("#ac")[:200])
    t("account: greeting uses name; sign-in method shown", "Hi, Gina" in pg.inner_text("#ah") and "Google" in pg.inner_text("#det"))
    pg.reload(); pg.wait_for_selector("#det"); t("session persists across refresh", "gina@gmail.com" in pg.inner_text("#det"))
    pg.goto(B+"index.html"); pg.goto(B+"account.html"); pg.wait_for_selector("#det"); t("session persists after navigating away and back", True)
    m.netfail=True; pg.reload(); pg.wait_for_selector(".errorbox"); t("transient network failure does NOT log the customer out", pg.evaluate("localStorage.getItem('sr_acct')") is not None and "still signed in" in pg.inner_text("#ac"))
    m.netfail=False; pg.click("#retry"); pg.wait_for_selector("#det"); t("retry restores the account page", True)
    pg.click("#so"); pg.wait_for_selector("#fp"); t("logout: token removed locally AND server told", pg.evaluate("localStorage.getItem('sr_acct')") is None and any(x.get("action")=="public.acctLogout" for x in m.log))
    pg.reload(); pg.wait_for_selector("#fp"); t("after logout a refresh stays signed out", pg.locator("#det").count()==0)
    # google with a bad credential
    pg.evaluate("__gis.cfg.callback({credential:'TAMPERED'})"); pg.wait_for_timeout(400); t("google: server rejection shows a clear error and stays signed out", "could not be verified" in pg.inner_text("#toast") and pg.locator("#det").count()==0)
    pg.evaluate("__gis.cfg.callback({})"); pg.wait_for_timeout(200); t("google: cancelled popup shows a message, no crash", "cancelled" in pg.inner_text("#gmsg"))
    # password login
    pg.fill("#em","pat@x.co"); pg.fill("#pw","wrongpass"); pg.click("#bp"); pg.wait_for_selector(".field.err")
    t("login: wrong password => clear inline error, not signed in", "incorrect" in pg.inner_text("#fp").lower() and pg.evaluate("localStorage.getItem('sr_acct')") is None)
    pg.fill("#em","not-an-email"); pg.click("#bp"); t("login: invalid email blocked client-side", "valid email" in pg.inner_text("#fp"))
    pg.fill("#em","pat@x.co"); pg.fill("#pw","rightpass1"); pg.click("#bp"); pg.wait_for_selector("#det"); t("login: email + password signs in and shows account", "pat@x.co" in pg.inner_text("#det"))
    pg.click("#sp"); pg.wait_for_selector("#np"); pg.fill("#np","short"); pg.click("#b4"); t("set password: weak password blocked", "at least 8" in pg.inner_text("#f4"))
    pg.fill("#np","a much better pass"); pg.click("#b4"); pg.wait_for_selector("#det"); t("set password: saved via backend", getattr(m,"newpw","")=="a much better pass")
    pg.click("#so"); pg.wait_for_selector("#fp")
    # register
    pg.click("#t_up"); pg.fill("#em","new@x.co"); pg.fill("#pw","short"); pg.click("#bp"); t("register: short password blocked before any request", "at least 8" in pg.inner_text("#fp") and not hasattr(m,"regs"))
    pg.fill("#pw","long enough pw"); pg.click("#bp"); pg.wait_for_selector("#f3")
    t("register: backend asked to send a code; user asked to confirm email", m.regs["email"]=="new@x.co" and m.regs["password"]=="long enough pw" and "6-digit" in pg.inner_text("#f3"))
    pg.fill("#cd","000000"); pg.click("#b3"); pg.wait_for_timeout(300); t("register: wrong code => error, still on code page", pg.locator("#f3").count()==1 and pg.evaluate("localStorage.getItem('sr_acct')") is None)
    pg.fill("#cd","123456"); pg.click("#b3"); pg.wait_for_selector("#det"); t("register: right code => account created and signed in", "new@x.co" in pg.inner_text("#det"))
    pg.click("#so"); pg.wait_for_selector("#fp")
    # forgot password
    pg.fill("#em","pat@x.co"); pg.click("#forgot"); pg.wait_for_selector("#f2"); pg.fill("#cd","123456"); pg.click("#b2"); pg.wait_for_selector("#f4")
    t("forgot password: code => signed in => asked for a new password", "Set a new password" in pg.inner_text("#f4"))
    pg.fill("#np","reset password 1"); pg.click("#b4"); pg.wait_for_selector("#det"); t("forgot password: new password saved", m.newpw=="reset password 1")
    # expired session
    pg.evaluate("localStorage.setItem('sr_acct',JSON.stringify({token:'EXPIRED'+'x'.repeat(40),email:'a@b.co'}))"); pg.reload(); pg.wait_for_selector("#fp")
    t("expired session => clear message + sign-in, token removed", "sign in again" in pg.inner_text("#ac").lower() and pg.evaluate("localStorage.getItem('sr_acct')") is None)
    t("account page: no JS errors", not er, er)
    # Google script blocked
    m2=mk(v4=True,google=True); c2_,pg2,er2=new_page(b,m2,390,844); c2_.route("https://accounts.google.com/**", lambda r: r.abort()); pg2.goto(B+"account.html"); pg2.wait_for_selector("#fp"); pg2.wait_for_timeout(500)
    t("google script blocked => friendly fallback message, email options still work", "could not load" in pg2.inner_text("#gmsg") and pg2.locator("#em").count()==1)
    # no google configured => no google button; no v4 => legacy form
    m3=mk(v4=True); c3_,pg3,er3=new_page(b,m3,390,844); pg3.goto(B+"account.html"); pg3.wait_for_selector("#fp"); t("google not configured => no Google button shown", pg3.locator("#gbtn,#gwrap").count()==0)
    m4=mk(); c4_,pg4,er4=new_page(b,m4,390,844); pg4.goto(B+"account.html"); pg4.wait_for_selector("#f1"); t("backend v4 not installed => safe legacy email-code form (no broken buttons)", pg4.locator("#gbtn").count()==0 and pg4.locator("#pw").count()==0)
    # setup diagnostics
    pg2b=mk(v4=False,google=False); c8,p8,e8=new_page(b,pg2b,390,844); p8.goto(B+"account.html?setup=1"); p8.wait_for_selector(".setup"); tx=p8.inner_text(".setup")
    t("setup panel: names the missing pieces + the exact origin to authorise", "patch v4" in tx and "GOOGLE_CLIENT_ID" in tx and "http://127.0.0.1:8766" in tx and "OTP" in tx)
    # ================= checkout / order / tracking still work =================
    m9=mk(); c9,p9,e9=new_page(b,m9,390,844); p9.goto(B+"index.html"); p9.wait_for_selector("#featured .pc"); p9.locator("#featured .pc-body").first.click(); p9.wait_for_selector("#buy"); p9.click("#buy"); p9.wait_for_url("**/checkout.html"); p9.wait_for_selector("#summary .sl")
    for k,v in dict(customer_name="Asha Rao",phone="9876543210",address="12 Rose Street, Sector 5",city="Delhi",state="Delhi",pin="110001").items(): p9.fill("#"+k,v)
    p9.check("#policy"); p9.click("#go"); p9.wait_for_selector("#done .card"); oid=p9.inner_text("#done h3")
    t("home -> product -> buy now -> checkout -> order placed (UPI details shown, unpaid)", oid.startswith("ORD-") and "AWAITING PAYMENT" in p9.inner_text("#done").upper() and len(m9.orders)==1 and m9.orders[oid]["body"]["items"][0]["product_id"]=="P1")
    p9.goto(B+"track.html"); p9.fill("#oid",oid); p9.fill("#l4","3210"); p9.click("#f button"); p9.wait_for_selector("#out .card"); t("tracking still finds the order", oid in p9.inner_text("#out") and "UNPAID" in p9.inner_text("#out"))
    t("checkout/track: no JS errors", not e9, e9)
    ok=sum(1 for _,o in R if o); print(f"\n{ok} passed, {len(R)-ok} failed"); sys.exit(0 if ok==len(R) else 1)
