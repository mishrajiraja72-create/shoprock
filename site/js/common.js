document.documentElement.classList.add("js");
/* Shared storefront logic: config, API client, cart, formatters */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyZylsb_FYFTlIvz9QyHKRPKqkxhCP1gcYXvfvMPJBLIRChGmyer7LAIUHYQkGI4h1p/exec",  // set after deploying backend
  CONTACT: ""
};
const inr = n => new Intl.NumberFormat("en-IN", {style:"currency", currency:"INR", maximumFractionDigits:0}).format(Number(n)||0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const apiReady = () => CONFIG.API_URL && !CONFIG.API_URL.startsWith("PASTE");

async function api(action, body = {}) {
  if (!apiReady()) throw new Error("Store backend is not connected yet.");
  // text/plain avoids a CORS preflight, which Apps Script does not answer
  const res = await fetch(CONFIG.API_URL, {method:"POST", headers:{"Content-Type":"text/plain"}, body: JSON.stringify({action, ...body})});
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || "Request failed");
  return j.data;
}
function toast(msg, bad) {
  let t = document.getElementById("toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  const d = document.createElement("div"); d.textContent = msg; if (bad) d.className = "bad"; t.appendChild(d); setTimeout(() => d.remove(), 4000);
}

/* Cart: stores only product_id + qty. Prices are ALWAYS re-fetched from the server. */
const Cart = {
  get() { try { const c = JSON.parse(localStorage.getItem("sr_cart") || "[]"); return Array.isArray(c) ? c.filter(x => x && typeof x.product_id === "string" && x.qty > 0) : []; } catch { return []; } },
  set(c) { try { localStorage.setItem("sr_cart", JSON.stringify(c)); } catch {} Cart.badge(); try { document.dispatchEvent(new Event("cart:change")); } catch {} },
  add(id, qty = 1, note, variant, bundle) { const c = Cart.get(), i = c.find(x => x.product_id === id); if (i) { i.qty = Math.min(10, i.qty + qty); if (note) i.note = note; if (variant) i.variant = variant; } else { const o = {product_id:id, qty}; if (note) o.note = note; if (variant) o.variant = String(variant).slice(0, 40); if (bundle) o.bundle = String(bundle).slice(0, 40); c.push(o); } Cart.set(c); },
  setBundle(id, b) { Cart.set(Cart.get().map(x => x.product_id === id ? {...x, bundle:String(b || "").slice(0, 40)} : x)); },
  setVariant(id, v) { Cart.set(Cart.get().map(x => x.product_id === id ? {...x, variant:String(v || "").slice(0, 40)} : x)); },
  setNote(id, note) { Cart.set(Cart.get().map(x => x.product_id === id ? {...x, note:String(note || "").slice(0, 300)} : x)); },
  setQty(id, q) { q = Math.floor(Number(q)); if (!isFinite(q)) return; const c = Cart.get().map(x => x.product_id === id ? {...x, qty: Math.max(0, Math.min(10, q))} : x).filter(x => x.qty > 0); Cart.set(c); },
  remove(id) { Cart.set(Cart.get().filter(x => x.product_id !== id)); },
  clear() { Cart.set([]); },
  count() { return Cart.get().reduce((a, x) => a + x.qty, 0); },
  badge() { const n = Cart.count(); document.querySelectorAll("#cartCount,.js-cart").forEach(e => { e.textContent = n; e.dataset.n = n; }); }
};

/* Wishlist: guest-safe, stored only in this browser. No account needed. */
const Wish = {
  get() { try { const a = JSON.parse(localStorage.getItem("sr_wish") || "[]"); return Array.isArray(a) ? [...new Set(a.filter(x => typeof x === "string"))].slice(0, 100) : []; } catch { return []; } },
  set(a) { try { localStorage.setItem("sr_wish", JSON.stringify(a)); } catch {} Wish.badge(); try { document.dispatchEvent(new Event("wish:change")); } catch {} },
  has(id) { return Wish.get().includes(id); },
  toggle(id) { const a = Wish.get(), on = !a.includes(id); Wish.set(on ? [...a, id] : a.filter(x => x !== id)); if (on) track("wishlist_add", {product_id:id}); return on; },
  badge() { const n = Wish.get().length; document.querySelectorAll("#wishCount,.js-wish").forEach(e => { e.textContent = n; e.dataset.n = n; }); }
};
/* Analytics: records ONLY when the backend reports v3 support (SITE.v3). Random anonymous id, no name/phone/email, honours Do-Not-Track. */
const EVENTS = ["product_view","add_to_cart","checkout_start","order_complete","addon_add","rec_click","wishlist_add","wa_click","bundle_add"];
function track(ev, data) { try {
  if (!EVENTS.includes(ev) || navigator.doNotTrack === "1") return;
  loadConfig().then(c => { if (!c || !c.v3) return; let a = ""; try { a = localStorage.getItem("sr_anon") || (crypto.randomUUID()); localStorage.setItem("sr_anon", a); } catch {}
    api("public.event", {event:ev, anon:a, page:location.pathname.split("/").pop(), ...(data || {})}).catch(() => {}); });
} catch {} }
document.addEventListener("click", e => { const a = e.target.closest && e.target.closest('a[href^="https://wa.me/"]'); if (a) track("wa_click", {page:location.pathname.split("/").pop()}); });
let SITE = {};
async function loadConfig() {
  try { const c = JSON.parse(sessionStorage.getItem("sr_cfg") || "null"); if (c && Date.now() - c.t < 300000) { SITE = c.v; return SITE; } } catch {}
  try { SITE = await api("public.config"); try { sessionStorage.setItem("sr_cfg", JSON.stringify({t:Date.now(), v:SITE})); } catch {} } catch {}
  return SITE;
}
const waUrl = (text, number) => { const n = String(number || SITE.whatsapp_number || "").replace(/\D/g, ""); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text || "Hi! I have a question about SHOPROCK.")}` : ""; };
const IC = {
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10"/></svg>',
  gift:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v9H4zM3 7.5h18V11H3zM12 7.5V20M12 7.5c-1.5-3.5-5-3.5-5-1.2 0 1.4 2 1.2 5 1.2zm0 0c1.5-3.5 5-3.5 5-1.2 0 1.4-2 1.2-5 1.2z"/></svg>',
  grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
  heart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S4 15 4 9.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.4C20 15 12 20.5 12 20.5z"/></svg>',
  user:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.7-6 7.5-6s6.7 2 7.5 6"/></svg>',
  bag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>'
};
function header() {
  return `<div class="announce" id="announce">Curated gifts for couples &middot; Secure ordering &middot; Track every order</div>
  <header class="topbar"><div class="container tb"><a class="logo" href="index.html" aria-label="SHOPROCK home">SHOP<b>ROCK</b></a>
  <ul id="nl" class="dlinks"><li><a href="shop.html">Shop</a></li><li><a href="gift-finder.html">Gift Finder</a></li><li><a href="track.html">Track order</a></li><li><a href="wishlist.html">Saved (<span class="js-wish" id="wishCount">0</span>)</a></li><li><a href="account.html">Account</a></li><li><a href="policies.html#faq">FAQ</a></li></ul>
  <div class="tb-icons"><button type="button" class="ib" id="sbtn" aria-label="Search gifts">${IC.search}</button><a class="ib" href="account.html" aria-label="Account">${IC.user}</a><a class="ib" href="cart.html" aria-label="Cart">${IC.bag}<span class="bdg js-cart" id="cartCount" data-n="0">0</span></a></div></div></header>`;
}
const BNAV_HIDE = /\/(product|checkout)\.html$/;
function bottomNav() {
  const p = location.pathname, q = location.search, on = (re, extra) => re.test(p) && (extra === undefined || extra);
  const items = [
    ["Home", "index.html", IC.home, /\/(index\.html)?$|\/site\/?$/.test(p) || /\/index\.html$/.test(p)],
    ["Gift Finder", "gift-finder.html", IC.gift, /gift-finder\.html$/.test(p), "fab"],
    ["Categories", "shop.html?view=cats", IC.grid, /shop\.html$/.test(p) && /view=cats|cat=/.test(q)],
    ["Wishlist", "wishlist.html", IC.heart + '<span class="bdg js-wish" data-n="0">0</span>', /wishlist\.html$/.test(p)],
    ["Account", "account.html", IC.user, /account\.html$/.test(p)]];
  return `<nav class="bnav" aria-label="Main">${items.map(i => `<a href="${i[1]}" class="${i[4] || ""}${i[3] ? " on" : ""}"${i[3] ? ' aria-current="page"' : ""}><span class="bi">${i[2]}</span><span class="bl">${i[0]}</span></a>`).join("")}</nav>`;
}
function footer() {
  return `<footer><div class="container cols"><div><div class="logo">SHOP<b>ROCK</b></div><p style="margin-top:12px" id="ftag">Thoughtful gifts for couples.</p><p style="margin-top:10px" id="fsoc"></p></div>
  <div><p class="eyebrow">Shop</p><p><a href="shop.html">All gifts</a><br><a href="gift-finder.html">Gift Finder</a><br><a href="track.html">Track order</a><br><a href="account.html">My account</a></p></div>
  <div><p class="eyebrow">Policies</p><p><a href="policies.html#shipping">Shipping</a><br><a href="policies.html#returns">Returns &amp; refunds</a><br><a href="policies.html#privacy">Privacy</a><br><a href="policies.html#terms">Terms</a><br><a href="policies.html#contact">Contact &amp; support</a></p></div>
  <div><p class="eyebrow">Support</p><p id="fsup"><a href="policies.html#contact">Contact &amp; support</a></p></div></div></footer>`;
}
const WA_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9 3 3.4 8.6 3.4 15.5c0 2.4.7 4.6 1.9 6.5L3 29l7.2-2.3c1.8 1 3.8 1.5 5.8 1.5 7 0 12.6-5.6 12.6-12.5S23 3 16 3zm0 22.6c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-4.3 1.4 1.4-4.2-.3-.4a10 10 0 0 1-1.6-5.4C5.7 9.9 10.3 5.4 16 5.4s10.3 4.5 10.3 10.1S21.7 25.6 16 25.6zm5.6-7.5c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.3 8.3 0 0 1-4.1-3.6c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3 2 3.1 4.9 4.3c1.8.8 2.6.9 3.5.7.5-.1 1.8-.7 2-1.4s.2-1.3.2-1.4-.3-.2-.6-.4z"/></svg>';
function applySite() {
  const d = SITE.site || {}, q = x => document.querySelector(x), sec = x => { const e = q(x); return e && (e.tagName === "SECTION" ? e : e.closest("section")); }, R = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(d.accent || "")) { R.setProperty("--gold", d.accent); R.setProperty("--champagne", `color-mix(in srgb, ${d.accent} 62%, white)`); R.setProperty("--line", `color-mix(in srgb, ${d.accent} 24%, transparent)`); }
  const sh = d.show || {}, map = {trust:".trust", occasions:"#occasions", featured:"#featured", story:"#story", steps:".steps", faq:"#faq"};
  Object.keys(map).forEach(k => { if (sh[k] === false) { const e = k === "trust" ? q(map[k]) : sec(map[k]); if (e) e.style.display = "none"; } });
  const tr = q(".trust .container"); if (tr && (d.trust || []).length) tr.innerHTML = d.trust.map((t,i) => `<div><i>${["&#10003;","&#9993;","&#9737;","&#9825;"][i%4]}</i>${esc(t)}</div>`).join("");
  const anchor = sec("#faq"); if (!anchor || document.getElementById("studio-x")) return;
  let h = ""; const b = d.banner || {};
  if (sh.banner !== false && b.title) h += `<section class="rule" id="studio-x"><div class="container"><div class="promo reveal" ${/^https:\/\//.test(b.img||"") ? `style="background-image:linear-gradient(90deg,rgba(8,8,7,.92),rgba(8,8,7,.35)),url('${esc(b.img)}')"` : ""}><p class="eyebrow">Special</p><h2>${esc(b.title)}</h2><p class="muted">${esc(b.text||"")}</p>${b.btn ? `<a class="btn" href="${esc(b.link||"shop.html")}">${esc(b.btn)}</a>` : ""}</div></div></section>`;
  if (sh.reviews !== false && (d.reviews || []).length) h += `<section class="rule"><div class="container"><p class="eyebrow reveal">Loved by customers</p><h2 class="reveal" style="margin:8px 0 28px">What they say</h2><div class="feat">${d.reviews.map(r => `<div class="card tilt reveal"><div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><p style="margin:12px 0">${esc(r.t)}</p><p class="muted">— ${esc(r.n)}</p></div>`).join("")}</div></div></section>`;
  if (h) anchor.insertAdjacentHTML("beforebegin", h); initReveal();
}
function applyConfig() {
  applySite();
  const a = document.getElementById("announce"); if (a && SITE.announcement) a.textContent = SITE.announcement;
  const t = document.getElementById("ftag"); if (t && SITE.tagline) t.textContent = SITE.tagline;
  const s = document.getElementById("fsup"); if (s) { const bits = []; if (SITE.whatsapp_number) bits.push(`<a href="${waUrl("Hi! I have a question.")}" target="_blank" rel="noopener">Chat on WhatsApp</a>`); if (SITE.support_email) bits.push(`<a href="mailto:${esc(SITE.support_email)}">${esc(SITE.support_email)}</a>`); if (SITE.support_contact && !/OWNER REVIEW/.test(SITE.support_contact)) bits.push(esc(SITE.support_contact)); if (bits.length) s.innerHTML = bits.join("<br>"); }
  const so = document.getElementById("fsoc"); if (so && SITE.instagram_url && /^https:\/\//.test(SITE.instagram_url)) so.innerHTML = `<a href="${esc(SITE.instagram_url)}" target="_blank" rel="noopener">Instagram</a>`;
  if (SITE.whatsapp_number && !document.getElementById("waf")) document.body.insertAdjacentHTML("beforeend", `<a id="waf" class="wa-float" href="${waUrl(SITE.wa_greeting||"Hi! I'd like help choosing a gift.")}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${WA_ICON}</a>`);
  if (SITE.ga_id && /^G-[A-Z0-9]{6,14}$/.test(SITE.ga_id) && !window.__ga) { window.__ga = 1; const g = document.createElement("script"); g.async = true; g.src = "https://www.googletagmanager.com/gtag/js?id=" + SITE.ga_id; document.head.appendChild(g); window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); }; gtag("js", new Date()); gtag("config", SITE.ga_id); }
  if (SITE.logo_url && /^https:\/\//.test(SITE.logo_url)) document.querySelectorAll(".topbar .logo").forEach(l => l.innerHTML = `<img src="${esc(SITE.logo_url)}" alt="${esc(SITE.store_name||"SHOPROCK")}" style="height:34px;width:auto">`);
  document.querySelectorAll("[data-wa]").forEach(el => { const u = waUrl(el.dataset.wa); if (u) { el.href = u; el.style.display = ""; } });
}
function initReveal() {
  const els = document.querySelectorAll(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(en => en.forEach(x => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), {threshold:.12});
  els.forEach(e => io.observe(e));
}
const stars = n => { n = Math.round(Number(n) || 0); return `<span class="stars" aria-label="${n} out of 5">${"&#9733;".repeat(n)}<i>${"&#9733;".repeat(5 - n)}</i></span>`; };
function productCard(x) {
  const img = x.image_url || (x.gallery && x.gallery[0]) || "", id = x.product_id, on = Wish.has(id), href = "product.html?id=" + encodeURIComponent(id);
  return `<article class="pc"><a class="pc-img" href="${href}" tabindex="-1" aria-hidden="true">${x.badge ? `<span class="pbadge">${esc(x.badge)}</span>` : ""}${img ? `<img loading="lazy" decoding="async" src="${esc(img)}" alt="">` : ""}</a><button type="button" class="wishbtn${on ? " on" : ""}" data-wish="${esc(id)}" aria-pressed="${on}" aria-label="${on ? "Remove " : "Save "}${esc(x.name)}${on ? " from" : " to"} wishlist">${IC.heart}</button><a class="pc-body" href="${href}"><span class="pc-name">${esc(x.name)}</span><span class="pc-price">${inr(x.price)}</span>${x.rating_count ? `<span class="pc-rate">${stars(x.rating_avg)} <span class="muted">${esc(x.rating_avg)} (${esc(x.rating_count)})</span></span>` : ""}</a></article>`;
}
/* Wishlist heart on any product card (one delegated handler for the whole site) */
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-wish]"); if (!b) return; e.preventDefault();
  const on = Wish.toggle(b.dataset.wish); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", (on ? "Remove from" : "Save to") + " wishlist"); toast(on ? "Saved to your wishlist" : "Removed from wishlist"); });
/* images: crop to a square only when the photo is already close to square, otherwise show the whole product */
document.addEventListener("load", e => { const t = e.target; if (t && t.tagName === "IMG" && t.closest && t.closest(".pc-img,.cat-ic,.sr-th") && t.naturalWidth) { const r = t.naturalWidth / t.naturalHeight; if (r < .8 || r > 1.25) t.classList.add("fit"); } }, true);

/* ---------- catalogue helpers shared by home, shop and search (all derived from the real product list) ---------- */
const SYN = {gf:"girlfriend", bf:"boyfriend", bday:"birthday", anniv:"anniversary", teddy:"plush", plushie:"plush", plushies:"plush", bae:"partner", wife:"partner", husband:"partner"};
function metaFor(pid) { return (((SITE || {}).site || {}).meta || {})[pid] || {}; }
function searchText(p) { const m = metaFor(p.product_id); return [p.name, p.category, catsCfg().filter(c => (c.items || []).includes(p.product_id)).map(c => c.name).join(" "), p.occasion, p.badge, p.description, m.occasion, m.recipient, m.gift_suitability, (m.tags || []).join(" ")].filter(Boolean).join(" ").toLowerCase(); }
function searchProducts(list, q) {
  const toks = String(q || "").toLowerCase().split(/[^a-z0-9₹]+/).filter(Boolean); if (!toks.length) return list.slice();
  return list.filter(p => { const h = searchText(p); return toks.every(t => h.includes(t) || (t.length > 3 && t.endsWith("s") && h.includes(t.slice(0, -1))) || (SYN[t] && h.includes(SYN[t]))); });
}
/* Categories are managed in the dashboard (Home categories -> site_json.categories). Nothing is guessed from free-text product fields. */
function catsCfg() { return (((SITE || {}).site || {}).categories || []).filter(c => c && c.name && c.on !== false); }
function inCat(p, name) { const c = catsCfg().find(x => x.name === name); return c ? (c.items || []).includes(p.product_id) : false; }
function catsOf(list) {
  return catsCfg().map(c => { const ids = c.items || [], m = list.filter(p => p.available !== false && ids.includes(p.product_id)), f = m[0];
    return {name:c.name, count:m.length, img:(c.img && /^https:\/\//.test(c.img)) ? c.img : (f ? (f.image_url || (f.gallery && f.gallery[0]) || "") : "")}; }).filter(c => c.count > 0);
}
function catTiles(cats, active) {
  return cats.map(c => `<a class="cat-t${active === c.name ? " on" : ""}" href="shop.html?cat=${encodeURIComponent(c.name)}"><span class="cat-ic">${c.img ? `<img loading="lazy" decoding="async" src="${esc(c.img)}" alt="">` : `<i>${esc(c.name.slice(0, 1).toUpperCase())}</i>`}</span><span class="cat-n">${esc(c.name)}</span></a>`).join("");
}

/* ---------- search overlay (header search icon) ---------- */
let _srCat = null;
async function openSearch() {
  if (document.getElementById("sr-ov")) { document.getElementById("sr-in").focus(); return; }
  const o = document.createElement("div"); o.id = "sr-ov"; o.className = "sr-ov";
  o.innerHTML = `<div class="sr-box" role="dialog" aria-modal="true" aria-label="Search gifts"><form class="sr-f" id="sr-f" role="search"><input id="sr-in" type="search" placeholder="Search gifts, e.g. plush, anniversary" autocomplete="off" aria-label="Search gifts"><button type="button" class="sr-x" aria-label="Close search">&times;</button></form><div id="sr-out" class="sr-out" aria-live="polite"><p class="muted">Type to search the collection.</p></div></div>`;
  document.body.appendChild(o); document.body.classList.add("sr-open"); const inp = o.querySelector("#sr-in"), out = o.querySelector("#sr-out"); inp.focus();
  const close = () => { o.remove(); document.body.classList.remove("sr-open"); removeEventListener("keydown", key); }, key = ev => { if (ev.key === "Escape") close(); };
  addEventListener("keydown", key); o.querySelector(".sr-x").onclick = close; o.onclick = ev => { if (ev.target === o || ev.target.closest("a")) close(); };
  try { await loadConfig(); _srCat = _srCat || (await loadProducts()).filter(p => p.available !== false); } catch { out.innerHTML = '<p class="errmsg">Search could not load right now. Please try again.</p>'; return; }
  const draw = () => { const q = inp.value.trim(); if (!q) { out.innerHTML = '<p class="muted">Type to search the collection.</p>'; return; }
    const r = searchProducts(_srCat, q); out.innerHTML = r.length ? r.slice(0, 8).map(p => `<a class="sr-r" href="product.html?id=${encodeURIComponent(p.product_id)}"><span class="sr-th">${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ""}</span><span class="sr-n">${esc(p.name)}<small class="muted">${esc(p.category || "")}</small></span><b>${inr(p.price)}</b></a>`).join("") + `<a class="sr-all" href="shop.html?q=${encodeURIComponent(q)}">See all ${r.length} result${r.length > 1 ? "s" : ""}</a>` : `<p class="muted">No gifts match &ldquo;${esc(q)}&rdquo;. Try a category, an occasion, or <a href="gift-finder.html">use the Gift Finder</a>.</p>`; };
  inp.oninput = draw; o.querySelector("#sr-f").onsubmit = ev => { ev.preventDefault(); const q = inp.value.trim(); if (q) location.href = "shop.html?q=" + encodeURIComponent(q); };
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#sbtn")) openSearch(); });
function videoEmbed(u) {
  try { const x = new URL(u), h = x.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return {k:"i", s:"https://www.youtube-nocookie.com/embed/" + encodeURIComponent(x.pathname.slice(1))};
    if (h.endsWith("youtube.com")) { const id = x.searchParams.get("v") || (x.pathname.match(/\/(shorts|embed)\/([\w-]+)/) || [])[2]; if (id) return {k:"i", s:"https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id)}; }
    if (h === "drive.google.com") { const m = x.pathname.match(/\/file\/d\/([\w-]+)/); if (m) return {k:"i", s:"https://drive.google.com/file/d/" + m[1] + "/preview"}; }
    if (/\.(mp4|webm)$/i.test(x.pathname) && x.protocol === "https:") return {k:"v", s:u};
  } catch {}
  return null;
}
if (!document.querySelector('link[rel="icon"]')) document.head.insertAdjacentHTML("beforeend", '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%278%27 fill=%27%2311110f%27/%3E%3Cpath d=%27M16 26S6 19 6 12.5A5.5 5.5 0 0 1 16 9.5a5.5 5.5 0 0 1 10 3C26 19 16 26 16 26z%27 fill=%27%23c8a76a%27/%3E%3C/svg%3E">');
document.addEventListener("DOMContentLoaded", () => {
  const h = document.getElementById("hdr"), f = document.getElementById("ftr");
  if (h) h.innerHTML = header(); if (f) f.innerHTML = footer();
  if (h && !BNAV_HIDE.test(location.pathname)) { document.body.classList.add("has-bnav"); document.body.insertAdjacentHTML("beforeend", bottomNav()); }
  Cart.badge(); Wish.badge(); initReveal();
  loadConfig().then(applyConfig);
});
async function loadProducts() { return api("public.products"); }
if (typeof module !== "undefined") module.exports = {inr, esc};

/* images: tasteful fallback if a photo genuinely fails to load (never swaps in another product) */
document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG" && !t.dataset.fb) { t.dataset.fb = 1; t.style.visibility = "visible"; t.alt = t.alt || "Photo unavailable"; t.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#17140f"/><text x="60" y="64" fill="#8c7a55" font-family="sans-serif" font-size="9" text-anchor="middle">Photo coming soon</text></svg>'); } }, true);
/* friendly dates: never show raw ISO timestamps */
function fmtDate(v) { const d = new Date(v); return v && !isNaN(d) && d.getFullYear() > 2000 ? d.toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"}) : ""; }
/* product gallery: swipe on touch + tap to enlarge */
function galleryExtras() { const g = document.getElementById("gm"); if (!g || g.dataset.x) return; g.dataset.x = 1; let x0 = null;
  const go = d => { const b = [...document.querySelectorAll("#gt button")], i = b.findIndex(y => y.classList.contains("on")); if (b.length > 1) b[(i + d + b.length) % b.length].click(); };
  g.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, {passive:true});
  g.addEventListener("touchend", e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1); }, {passive:true});
  g.addEventListener("click", () => { const im = g.querySelector("img"); if (!im) return; const o = document.createElement("div"); o.className = "lightbox"; o.innerHTML = `<img src="${im.src}" alt="${esc(im.alt)}"><button type="button" aria-label="Close">&times;</button>`; o.onclick = () => o.remove(); document.body.appendChild(o); addEventListener("keydown", function k(e) { if (e.key === "Escape") { o.remove(); removeEventListener("keydown", k); } }); }); }
