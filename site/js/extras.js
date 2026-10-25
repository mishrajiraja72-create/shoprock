/* SHOPROCK extras: gift notes, recommendations, add-ons. All content comes from dashboard config (site_json). */
const DEFAULT_NOTES = [["Romantic Love Note","Romantic","You make my ordinary days feel extraordinary. I am lucky to have you."],["Cute & Flirty","Cute & Playful","A little surprise for my favourite human. Keep smiling, my love!"],["Deep & Emotional","Emotional","No matter where life takes us, you will always have a special place in my heart."],["Birthday / Anniversary","Birthday / Anniversary","Another beautiful memory with you. Here is to more laughter, love, and adventures together."]].map((a, i) => ({id:"n" + (i + 1), name:a[0], cat:a[1], text:a[2], on:true}));
async function siteCfg() { try { return (await loadConfig()).site || {}; } catch { return {}; } }
function giftCfg(s) { const g = s.gift || {}; return {enabled:g.enabled !== false, custom:g.custom !== false, show:g.show !== false, max:Math.max(20, Math.min(300, +g.max || 200)), list:(g.list && g.list.length ? g.list : DEFAULT_NOTES).filter(t => t.on !== false && t.text)}; }
function giftPanel(host, g, cur, onSet) {
  if (!host) return; if (!g.enabled) { host.innerHTML = ""; return; }
  host.innerHTML = `<div class="gift mp"><h3>Make It Personal &#128140;</h3><p class="muted">Add a little message for your favourite person. Optional.</p>${g.show && g.list.length ? `<div class="tcards" id="gt_c">${g.list.map(t => `<button type="button" class="tc" data-id="${esc(t.id)}" aria-pressed="false"><b>${esc(t.name)}</b><span>${esc(t.text)}</span></button>`).join("")}</div>` : ""}${g.custom ? '<button type="button" class="btn ghost sm" id="gt_w">Write Your Own</button>' : ""}<div id="gt_e" hidden>${g.custom ? `<textarea id="gt_t" rows="3" maxlength="${g.max}" aria-label="Your message" placeholder="Write something only they will understand..."></textarea>` : ""}<div class="muted gcount"><span><a href="#" id="gt_x">Clear</a> &middot; <a href="#" id="gt_r">Reset</a> &middot; <a href="#" id="gt_s">Skip</a></span><span id="gt_n"></span></div></div><div class="giftcard" id="gt_p" hidden></div></div>`;
  const q = x => host.querySelector(x), t = q("#gt_t"), e = q("#gt_e");
  const set = (v, open) => { v = String(v || "").slice(0, g.max); onSet(v); if (t) t.value = v; q("#gt_n").textContent = v.length + " / " + g.max; const p = q("#gt_p"); p.hidden = !v; p.innerHTML = v ? `<small>For someone special</small><p>${esc(v)}</p><small>With love</small>` : ""; e.hidden = !(t && (v || open));
    host.querySelectorAll(".tc").forEach(b => { const on = !!v && (g.list.find(x => x.id === b.dataset.id) || {}).text === v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); };
  set(cur);
  const c = q("#gt_c"); c && (c.onclick = ev => { const b = ev.target.closest(".tc"), x = b && g.list.find(y => y.id === b.dataset.id); if (x) set(x.text); });
  q("#gt_w") && (q("#gt_w").onclick = () => { set(t.value, true); t.focus(); }); t && (t.oninput = () => set(t.value, true));
  q("#gt_x").onclick = ev => { ev.preventDefault(); set(""); };
  q("#gt_r").onclick = ev => { ev.preventDefault(); set(cur); }; q("#gt_s").onclick = ev => { ev.preventDefault(); set(""); e.hidden = true; };
}
const cartQty = id => (Cart.get().find(x => x.product_id === id) || {qty:0}).qty;
function addOnce(pid, qty, note, variant, bundle) { if (cartQty(pid)) return false; Cart.add(pid, qty, note, variant, bundle); return true; }
function buyNow(pid, qty, note, variant) { if (!cartQty(pid)) Cart.add(pid, qty, note, variant); else { Cart.setQty(pid, qty); if (note) Cart.setNote(pid, note); if (variant) Cart.setVariant(pid, variant); } }
/* Variants/meta come from site_json (dashboard). A variant's own price is only honoured when the backend reports v3, because older backends price every line at the product price. */
const metaOf = (S, pid) => ((S || {}).meta || {})[pid] || {};
const variantsOf = (S, pid) => (metaOf(S, pid).variants || []).filter(v => v && v.id && v.label && v.on !== false);
function unitPrice(p, item, S) { const v = item && item.variant && variantsOf(S, p.product_id).find(x => x.id === item.variant); return (v && SITE.v3_pricing && +v.price > 0) ? +v.price : +p.price; }
function variantLabel(p, item, S) { const v = item && item.variant && variantsOf(S, p.product_id).find(x => x.id === item.variant); return v ? v.label : ""; }
function bundlesFor(pid, cat, S, vmap) { vmap = vmap || {}; return ((S || {}).bundles || []).filter(b => b.on !== false && (b.items || []).includes(pid) && b.items.length > 1).map(b => { const it = b.items.map(id => cat.find(c => c.product_id === id)); if (it.some(x => !x || x.available === false)) return null;
  const reg = it.reduce((a, x) => a + unitPrice(x, {variant: vmap[x.product_id] || (Cart.get().find(i => i.product_id === x.product_id) || {}).variant}, S), 0), priced = !!SITE.v3_pricing && +b.price > 0 && +b.price < reg; return {id:b.id, name:b.name, kind:b.kind || "", items:it, reg, price:priced ? +b.price : reg, save:priced ? reg - +b.price : 0, priced}; }).filter(Boolean); }
async function miniCart(pid) {
  let cat = [], S = {}; try { cat = await loadProducts(); S = await siteCfg(); } catch {}
  const old = document.getElementById("mini"); if (old) old.remove();
  const m = document.createElement("div"); m.id = "mini"; m.className = "mini"; document.body.appendChild(m);
  const draw = foc => { const c = Cart.get(), it = c.find(i => i.product_id === pid); if (!it) { m.remove(); return; }
    const p = cat.find(x => x.product_id === pid), tot = c.reduce((a, i) => { const q = cat.find(x => x.product_id === i.product_id); return a + (q ? unitPrice(q, i, S) : 0) * i.qty; }, 0);
    m.innerHTML = `<div class="msheet" role="dialog" aria-modal="true" aria-label="Added to cart"><button type="button" class="mx" aria-label="Close">&times;</button><p class="eyebrow">A little happiness, added to your cart &#128151;</p><div class="rc">${p ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : "<span></span>"}<div class="rb"><b>${esc(p ? p.name : "Your gift")}</b><div class="muted">${p ? inr(unitPrice(p, it, S)) : ""}${p && variantLabel(p, it, S) ? " &middot; " + esc(variantLabel(p, it, S)) : ""}</div><div class="qty"><button type="button" data-q="-1" aria-label="Decrease quantity">&minus;</button><b>${it.qty}</b><button type="button" data-q="1" aria-label="Increase quantity">+</button></div></div></div><p class="mt">Cart total <b>${inr(tot)}</b></p><a class="btn" href="checkout.html">Proceed to checkout</a><a class="btn ghost" href="cart.html">Go to cart</a><button type="button" class="btn ghost" data-c="1">Continue shopping</button></div>`;
    const f = m.querySelector(foc ? `[data-q="${foc}"]` : ".mx"); f && f.focus(); };
  m.onclick = ev => { if (ev.target === m || ev.target.closest(".mx,[data-c]")) { m.remove(); return; } const b = ev.target.closest("[data-q]"); if (b) { Cart.setQty(pid, cartQty(pid) + +b.dataset.q); draw(b.dataset.q); } };
  addEventListener("keydown", function k(ev) { if (ev.key === "Escape") { m.remove(); removeEventListener("keydown", k); } });
  draw();
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

/* after-order / tracking discovery: admin list (site.after) else a few catalogue gifts the customer did not just buy */
function afterRecs(cat, s, exclude, max) { const man = ((s.after || []).filter(x => x.on !== false).map(x => cat.find(c => c.product_id === x.id))).filter(p => p && !exclude.includes(p.product_id)); return (man.length ? man : cat.filter(p => !exclude.includes(p.product_id))).slice(0, max || 3); }
function blank(html) { return html.replace(/<a href="product/g, '<a target="_blank" rel="noopener" href="product'); }
async function waHelp(msg) { try { await loadConfig(); } catch {} const u = waUrl(msg); return u ? `<a class="btn wa" target="_blank" rel="noopener" href="${esc(u)}">Chat with us on WhatsApp</a>` : ""; }

/* Mirrors the server's bundle rule exactly: a saving applies only if EVERY product of an active bundle is in the cart tagged with that bundle id, and only when the backend prices bundles (v3_pricing). */
function bundleSaving(items, prods, S) {
  if (!SITE.v3_pricing) return 0; let s = 0;
  ((S || {}).bundles || []).forEach(b => { if (!b || b.on === false || !(+b.price > 0) || !b.items || b.items.length < 2) return;
    const u = b.items.map(id => { const i = items.find(x => x.product_id === id && x.bundle === b.id), p = prods.find(x => x.product_id === id); return i && p ? unitPrice(p, i, S) : null; });
    if (u.some(x => x === null)) return; const reg = u.reduce((a, x) => a + x, 0); if (+b.price < reg) s += Math.round(reg - +b.price); });
  return s;
}

/* Gift Finder: ranks REAL published products from the customer's answers. It only ever claims a match that exists in the product's own data. */
const FINDER = {
  who: [["My partner",["partner","couple","boyfriend","girlfriend","husband","wife"]],["Long-distance partner",["long distance","long-distance","distance","partner","couple"]],["Someone I'm dating",["dating","crush","new relationship","first"]],["A friend",["friend","bestie"]]],
  occ: [["Anniversary",["anniversary"]],["Birthday",["birthday"]],["Just because",["just because","surprise","everyday"]],["Long distance",["long distance","long-distance","distance"]]],
  vibe: [["Romantic",["romantic","love","rose"]],["Cute & playful",["cute","playful","funny","flirty"]],["Deep & emotional",["emotional","memory","memories","story","letter","forever"]],["Aesthetic & minimal",["aesthetic","minimal","lamp","frame","decor"]]],
  budget: [["Under ₹500",0,500],["₹500 – ₹1,000",500,1000],["₹1,000 – ₹2,000",1000,2000],["₹2,000 and above",2000,1e9]]
};
function finderText(p, S) { const m = metaOf(S, p.product_id); return [p.name, p.category, p.description, p.occasion, m.occasion, m.recipient, m.gift_suitability, (m.tags || []).join(" "), m.story].filter(Boolean).join(" ").toLowerCase(); }
function finderRank(cat, S, a) {
  const b = FINDER.budget[a.budget] || FINDER.budget[3], pick = (g, i) => (FINDER[g][i] || [, []])[1], hit = (txt, kws) => kws.filter(k => txt.includes(k))[0];
  const live = cat.filter(p => p.available !== false), mid = (b[1] + Math.min(b[2], b[1] * 2 + 500)) / 2;
  const rows = live.map(p => { const t = finderText(p, S), o = hit(t, pick("occ", a.occ)), w = hit(t, pick("who", a.who)), v = hit(t, pick("vibe", a.vibe)), inB = p.price >= b[1] && p.price < b[2] || (b[2] === 1e9 && p.price >= b[1]);
    const why = []; if (o) why.push("Made for " + FINDER.occ[a.occ][0].toLowerCase()); if (w) why.push("Great for " + FINDER.who[a.who][0].toLowerCase().replace("my ", "your ")); if (v) why.push("Fits a " + FINDER.vibe[a.vibe][0].toLowerCase() + " mood"); if (inB) why.push("Within your budget");
    return {p, score: (o ? 3 : 0) + (w ? 2 : 0) + (v ? 2 : 0), inB, why, d: Math.abs(p.price - mid)}; });
  const inB = rows.filter(r => r.inB).sort((x, y) => y.score - x.score || y.p.featured - x.p.featured || x.d - y.d);
  if (inB.length) return {exact: true, list: inB.slice(0, 3)};
  return {exact: false, list: rows.sort((x, y) => Math.abs(x.p.price - (b[1] || 0)) - Math.abs(y.p.price - (b[1] || 0))).slice(0, 3).map(r => ({...r, why: ["A little outside your budget"]}))};
}

/* Moments: upcoming dates computed from what the customer saved. Anniversary dates in the past are treated as the day they got together. Pure function, no network. */
function momentsFor(dates, today, max) {
  const DAY = 864e5, t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()), out = [];
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const yearly = dt => { let n = new Date(t0.getFullYear(), dt.getMonth(), dt.getDate()); if (n < t0) n = new Date(t0.getFullYear() + 1, dt.getMonth(), dt.getDate()); return n; };
  (dates || []).forEach(x => { if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.d)) return; const dt = parse(x.d), name = x.n || "";
    if (x.t === "Anniversary" && dt < t0) {
      [50, 100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000].forEach(n => { const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n); if (d >= t0) out.push({label: n + " days together", kind: "Anniversary", name, date: d}); });
      for (let y = 1; y <= 40; y++) { const d = new Date(dt.getFullYear() + y, dt.getMonth(), dt.getDate()); if (d >= t0) out.push({label: y + (y === 1 ? " year" : " years") + " together", kind: "Anniversary", name, date: d}); }
    } else out.push({label: x.t || "Special day", kind: x.t || "Other", name, date: yearly(dt)}); });
  out.sort((a, b) => a.date - b.date); const seen = {};
  return out.filter(m => { const k = m.label + m.date.getTime() + m.name; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, max || 6).map(m => ({...m, daysAway: Math.round((m.date - t0) / DAY)}));
}
function momentIdeas(cat, S, kind, max) {
  const kw = kind === "Birthday" ? ["birthday"] : kind === "Anniversary" ? ["anniversary"] : ["surprise", "just because", "everyday"];
  const live = cat.filter(p => p.available !== false), hit = live.filter(p => kw.some(k => finderText(p, S).includes(k)));
  return (hit.length ? hit : live.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.price - b.price)).slice(0, max || 2);
}

/* Order-confirmation prompt: save a birthday/anniversary on THIS device; optional email reminder ONLY if the customer ticks the (unticked-by-default) consent box. */
function occRead() { try { const a = JSON.parse(localStorage.getItem("sr_occ") || "[]"); return Array.isArray(a) ? a.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.d)).slice(0, 12) : []; } catch { return []; } }
async function momentPrompt(host) {
  if (!host || host.querySelector("#mp")) return; let cfg = {}; try { cfg = await loadConfig(); } catch {}
  host.insertAdjacentHTML("beforeend", `<div class="card" id="mp" style="margin-top:16px"><p class="eyebrow">Never miss a moment 💗</p><h3 style="margin:6px 0">Save their special date</h3><p class="muted" style="margin-bottom:10px">A birthday or an anniversary. We'll show you gift ideas on your Saved page${cfg.v3 ? ", and can email you a reminder only if you ask below" : ""}.</p>
   <div class="row"><div class="field"><label for="mp_t">Occasion</label><select id="mp_t"><option>Birthday</option><option>Anniversary</option><option>Other</option></select></div><div class="field"><label for="mp_n">Whose? (optional)</label><input id="mp_n" maxlength="40"></div><div class="field"><label for="mp_d">Date (anniversary: the day you got together)</label><input id="mp_d" type="date"></div></div>
   <button class="btn ghost sm" id="mp_s" type="button">Save this date</button><p class="muted" id="mp_m" role="status" style="margin-top:8px"></p>
   ${cfg.v3 ? `<div id="mp_r" hidden style="margin-top:12px"><div class="field"><label for="mp_e">Email for the reminder</label><input id="mp_e" type="email" autocomplete="email"></div><label class="consent"><input type="checkbox" id="mp_c"> Yes, email me a reminder about the dates I saved, about a week before. I can unsubscribe any time on the Saved page.</label><button class="btn sm" id="mp_g" type="button" style="margin-top:8px">Email me reminders</button></div>` : ""}</div>`);
  const $ = i => document.getElementById(i);
  $("mp_s").onclick = () => { const d = $("mp_d").value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast("Please choose a date.", 1); return; }
    const a = occRead(); a.push({t: $("mp_t").value, n: $("mp_n").value.trim().slice(0, 40), d}); try { localStorage.setItem("sr_occ", JSON.stringify(a.slice(0, 12))); } catch {}
    $("mp_m").innerHTML = `Saved on this device. See your upcoming moments on the <a href="wishlist.html">Saved page</a>.`; $("mp_d").value = ""; $("mp_n").value = "";
    if ($("mp_r")) { $("mp_r").hidden = false; const em = document.getElementById("email"); if (em && em.value && !$("mp_e").value) $("mp_e").value = em.value; } };
  if ($("mp_g")) $("mp_g").onclick = async () => { const email = $("mp_e").value.trim();
    if (!$("mp_c").checked) { toast("Please tick the box if you want reminder emails.", 1); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Enter a valid email.", 1); return; }
    $("mp_g").disabled = true; try { await api("public.preferences", {email, consent: true, consent_text: $("mp_c").parentElement.textContent.trim().slice(0, 300), dates: occRead().map(x => ({t: x.t, n: x.n, d: x.d}))}); $("mp_r").innerHTML = "<p>You're signed up. You can unsubscribe any time on the Saved page.</p>"; } catch (err) { toast(err.message, 1); $("mp_g").disabled = false; } };
}
