/* Shared storefront logic: config, API client, cart, formatters */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyZylsb_FYFTlIvz9QyHKRPKqkxhCP1gcYXvfvMPJBLIRChGmyer7LAIUHYQkGI4h1p/exec",  // set after deploying backend
  CONTACT: "[OWNER REVIEW] support email / phone"
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
  get() { try { return JSON.parse(localStorage.getItem("sr_cart") || "[]"); } catch { return []; } },
  set(c) { try { localStorage.setItem("sr_cart", JSON.stringify(c)); } catch {} Cart.badge(); },
  add(id, qty = 1) { const c = Cart.get(), i = c.find(x => x.product_id === id); i ? i.qty = Math.min(10, i.qty + qty) : c.push({product_id:id, qty}); Cart.set(c); },
  setQty(id, q) { q = Math.floor(q); const c = Cart.get().map(x => x.product_id === id ? {...x, qty: Math.max(0, Math.min(10, q))} : x).filter(x => x.qty > 0); Cart.set(c); },
  remove(id) { Cart.set(Cart.get().filter(x => x.product_id !== id)); },
  clear() { Cart.set([]); },
  count() { return Cart.get().reduce((a, x) => a + x.qty, 0); },
  badge() { const e = document.getElementById("cartCount"); if (e) e.textContent = Cart.count(); }
};

function header(active) {
  return `<div class="announce">Curated gifts for the people who matter · Delivery times are confirmed per product</div>
  <div class="container"><nav class="nav"><a class="logo" href="index.html">SHOP<b>ROCK</b></a>
  <button class="nav-toggle" onclick="document.getElementById('nl').classList.toggle('open')" aria-label="Menu">Menu</button>
  <ul id="nl"><li><a href="shop.html">Shop</a></li><li><a href="index.html#occasions">Occasions</a></li><li><a href="index.html#story">Our story</a></li><li><a href="policies.html#faq">FAQ</a></li><li><a href="cart.html">Cart (<span id="cartCount">0</span>)</a></li></ul></nav></div>`;
}
function footer() {
  return `<footer><div class="container cols"><div><div class="logo">SHOP<b>ROCK</b></div><p style="margin-top:12px">Thoughtful gifts for couples.</p></div>
  <div><p class="eyebrow">Policies</p><p><a href="policies.html#shipping">Shipping</a><br><a href="policies.html#returns">Returns &amp; refunds</a><br><a href="policies.html#privacy">Privacy</a><br><a href="policies.html#terms">Terms</a></p></div>
  <div><p class="eyebrow">Support</p><p><span class="owner-review">${esc(CONFIG.CONTACT)}</span></p></div></div></footer>`;
}
document.addEventListener("DOMContentLoaded", () => {
  const h = document.getElementById("hdr"), f = document.getElementById("ftr");
  if (h) h.innerHTML = header(); if (f) f.innerHTML = footer(); Cart.badge();
});
async function loadProducts() { return api("public.products"); }
if (typeof module !== "undefined") module.exports = {inr, esc};
