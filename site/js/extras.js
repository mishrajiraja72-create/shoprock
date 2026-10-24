/* SHOPROCK extras: gift notes, recommendations, add-ons. All content comes from dashboard config (site_json). */
const DEFAULT_NOTES = [["Romantic Love Note","Romantic","You make my ordinary days feel extraordinary. I am lucky to have you."],["Cute and Playful","Cute & Playful","A little surprise for my favourite human. Keep smiling, my love!"],["Emotional and Meaningful","Emotional","No matter where life takes us, you will always have a special place in my heart."],["Birthday / Anniversary","Birthday / Anniversary","Another beautiful memory with you. Here is to more laughter, love, and adventures together."]].map((a, i) => ({id:"n" + (i + 1), name:a[0], cat:a[1], text:a[2], on:true}));
async function siteCfg() { try { return (await loadConfig()).site || {}; } catch { return {}; } }
function giftCfg(s) { const g = s.gift || {}; return {enabled:g.enabled !== false, custom:g.custom !== false, show:g.show !== false, max:Math.max(20, Math.min(300, +g.max || 200)), list:(g.list && g.list.length ? g.list : DEFAULT_NOTES).filter(t => t.on !== false && t.text)}; }
function giftPanel(host, g, cur, onSet) {
  if (!g.enabled || !host) { if (host) host.innerHTML = ""; return; }
  host.innerHTML = `<details class="gift" ${cur ? "open" : ""}><summary>Add a personal gift note <span class="muted">(optional)</span></summary>${g.show && g.list.length ? `<div class="chips" id="gt_c">${g.list.map(t => `<button type="button" class="btn ghost sm" data-id="${esc(t.id)}">${esc(t.name)}</button>`).join("")}</div>` : ""}${g.custom ? `<textarea id="gt_t" rows="3" maxlength="${g.max}" placeholder="Write your own message..."></textarea>` : ""}<div class="muted gcount"><a href="#" id="gt_x">Clear</a><span id="gt_n"></span></div><div class="giftcard" id="gt_p"></div></details>`;
  const t = host.querySelector("#gt_t"), set = v => { v = String(v || "").slice(0, g.max); onSet(v); if (t) t.value = v; host.querySelector("#gt_n").textContent = v.length + " / " + g.max; host.querySelector("#gt_p").innerHTML = v ? `<small>For someone special</small><p>${esc(v)}</p><small>With love</small>` : '<p class="muted">Your note preview appears here.</p>'; };
  set(cur);
  host.querySelector("#gt_c") && (host.querySelector("#gt_c").onclick = e => { const b = e.target.closest("button"); const x = b && g.list.find(q => q.id === b.dataset.id); if (x) set(x.text); });
  t && (t.oninput = () => set(t.value)); host.querySelector("#gt_x").onclick = e => { e.preventDefault(); set(""); };
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
