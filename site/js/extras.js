/* SHOPROCK extras: gift notes, recommendations, add-ons. All content comes from dashboard config (site_json). */
const DEFAULT_NOTES = [["Romantic Love Note","Romantic","You make my ordinary days feel extraordinary. I am lucky to have you."],["Cute & Flirty","Cute & Playful","A little surprise for my favourite human. Keep smiling, my love!"],["Deep & Emotional","Emotional","No matter where life takes us, you will always have a special place in my heart."],["Birthday / Anniversary","Birthday / Anniversary","Another beautiful memory with you. Here is to more laughter, love, and adventures together."]].map((a, i) => ({id:"n" + (i + 1), name:a[0], cat:a[1], text:a[2], on:true}));
async function siteCfg() { try { return (await loadConfig()).site || {}; } catch { return {}; } }
function giftCfg(s) { const g = s.gift || {}; return {enabled:g.enabled !== false, custom:g.custom !== false, show:g.show !== false, max:Math.max(20, Math.min(300, +g.max || 200)), list:(g.list && g.list.length ? g.list : DEFAULT_NOTES).filter(t => t.on !== false && t.text)}; }
function giftPanel(host, g, cur, onSet) {
  if (!host) return; if (!g.enabled) { host.innerHTML = ""; return; }
  host.innerHTML = `<div class="gift mp"><h3>Make It Personal &#128140;</h3><p class="muted">Add a little message for your favourite person. Optional.</p>${g.show && g.list.length ? `<div class="tcards" id="gt_c">${g.list.map(t => `<button type="button" class="tc" data-id="${esc(t.id)}" aria-pressed="false"><b>${esc(t.name)}</b><span>${esc(t.text)}</span></button>`).join("")}</div>` : ""}${g.custom ? '<button type="button" class="btn ghost sm" id="gt_w">Write Your Own</button>' : ""}<div id="gt_e" hidden>${g.custom ? `<textarea id="gt_t" rows="3" maxlength="${g.max}" aria-label="Your message" placeholder="Write something only they will understand..."></textarea>` : ""}<div class="muted gcount"><a href="#" id="gt_x">Remove message</a><span id="gt_n"></span></div></div><div class="giftcard" id="gt_p" hidden></div></div>`;
  const q = x => host.querySelector(x), t = q("#gt_t"), e = q("#gt_e");
  const set = (v, open) => { v = String(v || "").slice(0, g.max); onSet(v); if (t) t.value = v; q("#gt_n").textContent = v.length + " / " + g.max; const p = q("#gt_p"); p.hidden = !v; p.innerHTML = v ? `<small>For someone special</small><p>${esc(v)}</p><small>With love</small>` : ""; e.hidden = !(t && (v || open));
    host.querySelectorAll(".tc").forEach(b => { const on = !!v && (g.list.find(x => x.id === b.dataset.id) || {}).text === v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); };
  set(cur);
  const c = q("#gt_c"); c && (c.onclick = ev => { const b = ev.target.closest(".tc"), x = b && g.list.find(y => y.id === b.dataset.id); if (x) set(x.text); });
  q("#gt_w") && (q("#gt_w").onclick = () => { set(t.value, true); t.focus(); }); t && (t.oninput = () => set(t.value, true));
  q("#gt_x").onclick = ev => { ev.preventDefault(); set(""); };
}
async function miniCart(pid) {
  let cat = []; try { cat = await loadProducts(); } catch {}
  const c = Cart.get(), it = c.find(i => i.product_id === pid), p = cat.find(x => x.product_id === pid), tot = c.reduce((a, i) => a + ((cat.find(x => x.product_id === i.product_id) || {}).price || 0) * i.qty, 0);
  const old = document.getElementById("mini"); if (old) old.remove(); if (!it) return;
  const m = document.createElement("div"); m.id = "mini"; m.className = "mini";
  m.innerHTML = `<div class="msheet" role="dialog" aria-modal="true" aria-label="Added to cart"><button type="button" class="mx" aria-label="Close">&times;</button><p class="eyebrow">Added to cart &#10003;</p><div class="rc">${p ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : "<span></span>"}<div class="rb"><b>${esc(p ? p.name : "Your gift")}</b><div class="muted">Quantity ${it.qty}</div></div></div><p class="mt">Items total <b>${inr(tot)}</b></p><a class="btn" href="checkout.html">Go to checkout</a><button type="button" class="btn ghost" data-c="1">Continue shopping</button><a class="muted" href="cart.html">View cart</a></div>`;
  m.onclick = ev => { if (ev.target === m || ev.target.closest(".mx,[data-c]")) m.remove(); };
  document.body.appendChild(m); m.querySelector(".mx").focus();
  addEventListener("keydown", function k(ev) { if (ev.key === "Escape") { m.remove(); removeEventListener("keydown", k); } });
}
function recsFor(p, cat, s, exclude, max) {
  const R = s.rec || {}, ok = x => x && x.product_id !== p.product_id && !exclude.includes(x.product_id), man = ((R.map || {})[p.product_id] || []);
  let out = man.filter(x => x.on !== false).map(x => cat.find(c => c.product_id === x.id)).filter(ok);
  if (!man.length) { out = cat.filter(c => ok(c) && c.category && c.category === p.category); if (out.length < max) out = out.concat(cat.filter(c => ok(c) && !out.includes(c))); }
  return [...new Set(out)].slice(0, max || Math.max(1, Math.min(6, +R.max || 3)));
}
function recCard(p) { return `<div class="rc"><a href="product.html?id=${encodeURIComponent(p.product_id)}"><img loading="lazy" src="${esc(p.image_url)}" alt="${esc(p.name)}"></a><div class="rb"><a href="product.html?id=${encodeURIComponent(p.product_id)}">${esc(p.name)}</a><div class="muted">${inr(p.price)}</div></div><button class="btn sm" data-add="${esc(p.product_id)}">Add</button></div>`; }
function recSection(list, title) { return list.length ? `<section class="recs"><h3>${esc(title)}</h3><div class="rgrid">${list.map(recCard).join("")}</div></section>` : ""; }
function addonsFor(cart, cat, s, sel) {
  const A = s.addons || {}, max = Math.max(1, Math.min(4, +A.max || 2)), main = cart.map(i => i.product_id).filter(id => !sel.includes(id)), cats = main.map(id => (cat.find(c => c.product_id === id) || {}).category);
  return (A.items || []).filter(a => a.on !== false && (!(a.for || []).length || a.for.some(k => main.includes(k) || cats.includes(k)))).map(a => cat.find(c => c.product_id === a.id)).filter(p => p && !main.includes(p.product_id)).slice(0, max);
}
