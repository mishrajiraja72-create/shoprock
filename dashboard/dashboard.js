/* SHOPROCK dashboard. UI only: every permission is enforced by the backend. */
const API_URL = "https://script.google.com/macros/s/AKfycbyZylsb_FYFTlIvz9QyHKRPKqkxhCP1gcYXvfvMPJBLIRChGmyer7LAIUHYQkGI4h1p/exec";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const inr = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(n)||0);
let S = null; // {token,user}; kept in memory + sessionStorage (cleared when tab closes)
try { S = JSON.parse(sessionStorage.getItem("sr_sess") || "null"); } catch {}

async function api(action, body = {}) {
  if (API_URL.startsWith("PASTE")) throw new Error("Set API_URL in dashboard.js first.");
  const r = await fetch(API_URL, {method:"POST", headers:{"Content-Type":"text/plain"}, body: JSON.stringify({action, token: S && S.token, ...body})});
  const j = await r.json();
  if (!j.ok) { if (j.code === 401) { logout(); } throw new Error(j.error); }
  return j.data;
}
function toast(m, bad) { const d = document.createElement("div"); d.textContent = m; if (bad) d.className = "bad"; $("toast").appendChild(d); setTimeout(() => d.remove(), 4000); }
const wrap = h => `<div class="tablewrap">${h}</div>`;
const empty = m => `<div class="empty">${m}</div>`;
const table = (cols, rows) => rows.length ? wrap(`<table><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`) : "";
function csvDownload(name, text) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type:"text/csv"})); a.download = name; a.click(); }
function modal(html) { $("modal").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`; }
function closeModal() { $("modal").innerHTML = ""; }

const MENU = [
  ["products","Products"],["overview","Overview"],["research","Product research"],["approvals","Approvals"],["catalogue","Catalogue"],["suppliers","Suppliers"],
  ["orders","Orders"],["refunds","Payments & refunds"],["tasks","Tasks"],["team","Team"],["reports","Reports"],["activity","Activity log"],["settings","Settings"],["pricing","Pricing calculator"],["reviews","Reviews"],["coupons","Coupons"],["content","Website content"],["studio","Website Studio"],["gifts","Gifts & Add-ons"]
];
const ROLE_MENU = { // convenience only; server is the authority
  OWNER: MENU.map(m=>m[0]), RESEARCHER:["research","suppliers","tasks","pricing"], REVIEWER:["research","approvals","catalogue","suppliers","tasks","activity","pricing","reviews"],
  ORDER_OPS:["orders","suppliers","tasks"], SUPPORT:["orders","tasks"], FINANCE:["overview","orders","refunds","reports","activity","pricing","coupons"],
  MANAGER:["overview","research","approvals","catalogue","suppliers","orders","tasks","reports","activity","pricing","reviews"]
};

["MANAGER","REVIEWER","RESEARCHER"].forEach(r => ROLE_MENU[r].unshift("products"));
function logout() { S = null; try { sessionStorage.removeItem("sr_sess"); } catch {} $("app").style.display = "none"; $("login").style.display = "block"; }
$("out").onclick = logout; $("menu").onclick = () => $("side").classList.toggle("open");
$("lf").onsubmit = async e => { e.preventDefault(); $("lerr").textContent = "";
  try { S = await api("auth.login", {email:$("le").value, password:$("lp").value}); S.token = S.token; try { sessionStorage.setItem("sr_sess", JSON.stringify(S)); } catch {} start(); }
  catch (err) { $("lerr").textContent = err.message; } };

function start() {
  $("login").style.display = "none"; $("app").style.display = "block"; $("who").textContent = `${S.user.name} · ${S.user.role}`;
  const allowed = ROLE_MENU[S.user.role] || ["tasks"];
  $("nav").innerHTML = MENU.filter(m => allowed.includes(m[0])).map(m => `<a data-v="${m[0]}">${m[1]}</a>`).join("");
  $("nav").onclick = e => { const v = e.target.dataset && e.target.dataset.v; if (v) { go(v); $("side").classList.remove("open"); } };
  go(allowed[0]);
}
async function go(v) {
  [...$("nav").children].forEach(a => a.classList.toggle("on", a.dataset.v === v));
  $("title").textContent = (MENU.find(m=>m[0]===v)||[])[1] || "";
  $("view").innerHTML = '<div class="loading">Loading</div>';
  try { await VIEWS[v](); } catch (e) { $("view").innerHTML = `<div class="errorbox">${esc(e.message)}</div>`; }
}

const badge = s => `<span class="badge ${/PAID|DELIVERED|PUBLISHED|APPROVED|TRUE/.test(s)?"ok":/REJECT|FAIL|CANCEL|REFUND/.test(s)?"bad":""}">${esc(s)}</span>`;
let RESEARCH = [];

const VIEWS = {
  async overview() {
    const r = await api("reports.summary", {});
    const k = (l, v) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`;
    $("view").innerHTML = (r.orders ? "" : empty("No orders yet. Add products on the research board, approve and publish them, then orders will appear here.")) +
      `<div class="kpis">${k("Researched today", r.products.researched_today)}${k("Awaiting review", r.products.awaiting_review)}${k("Approved", r.products.approved)}${k("Published", r.products.published)}
      ${k("Orders (live)", r.orders)}${k("Verified paid sales", inr(r.verified_paid_sales))}${k("Refunds", inr(r.refunds))}${k("Net revenue", inr(r.net_revenue))}
      ${k("Product cost", inr(r.product_cost))}${k("Packaging", inr(r.packaging_cost))}${k("Shipping", inr(r.shipping_cost))}${k("Payment fees", inr(r.payment_fees))}
      ${k("Contribution", inr(r.contribution))}${k("Contribution margin", r.contribution_margin_pct === null ? "—" : r.contribution_margin_pct + "%")}</div>
      ${r.incomplete ? `<div class="notice">${esc(r.incomplete_note)}</div>` : ""}
      <p class="muted" style="margin-top:12px">Gross order value (incl. unpaid, not revenue): ${inr(r.gross_order_value_not_revenue)}. Demo orders are excluded.</p>
      <h3 style="margin:24px 0 8px">Orders by status</h3>${Object.keys(r.orders_by_status).length ? Object.entries(r.orders_by_status).map(([s,n])=>`${badge(s)} ${n} `).join("") : '<span class="muted">None</span>'}`;
  },

  async products() {
    RESEARCH = await api("research.list"); const cp = canPub();
    const l = RESEARCH.filter(r => !["REJECTED","ARCHIVED"].includes(r.status)).sort((a,b) => String(b.created_at).localeCompare(a.created_at));
    $("view").innerHTML = `<div class="bar"><button class="btn" onclick="productWizard()">+ Add new product</button></div>` + (l.length ? `<div class="pgrid">${l.map(r => {
      const live = r.status === "PUBLISHED";
      return `<div class="pc"><div class="pi">${r.image_url ? `<img src="${esc(r.image_url)}" alt="">` : "<span class='muted'>No photo</span>"}</div><div class="pb"><b>${esc(r.name)}</b><div>${inr(r.selling_price)} ${badge(live ? "PUBLISHED" : r.status)}</div><div class="muted" style="font-size:.78rem">Margin ${r.pricing.margin_pct}%</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" onclick="editProduct('${esc(r.product_id)}')">Edit</button>${cp ? (live ? `<button class="btn ghost sm" onclick="hideProduct('${esc(r.product_id)}')">Hide</button>` : `<button class="btn sm" onclick="goLive('${esc(r.product_id)}')">Publish</button>`) : ""}${live ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="../site/product.html?id=${encodeURIComponent(r.product_id)}">View</a>` : ""}</div></div></div>`; }).join("")}</div>` : empty("Abhi koi product nahi. '+ Add new product' dabao."));
  },
  async research() {
    RESEARCH = await api("research.list");
    const draw = () => {
      const q = ($("rq")?.value || "").toLowerCase(), st = $("rs")?.value || "", so = $("rso")?.value || "date";
      let l = RESEARCH.filter(r => (!q || (r.name + r.category + r.source_type).toLowerCase().includes(q)) && (!st || r.status === st));
      if (so === "score") l.sort((a,b)=>b.score_total-a.score_total); else if (so === "margin") l.sort((a,b)=>b.pricing.margin_pct-a.pricing.margin_pct); else l.sort((a,b)=>String(b.created_at).localeCompare(a.created_at));
      const today = new Date().toISOString().slice(0,10), n = RESEARCH.filter(r=>r.research_date===today).length;
      $("rtable").innerHTML = (l.length ? table([["ID",r=>esc(r.product_id)],["Name",r=>esc(r.name)],["Category",r=>esc(r.category)],["Source",r=>esc(r.source_type)],["Price",r=>inr(r.selling_price)],["Margin (est.)",r=>r.pricing.margin_pct+"%"],["Score",r=>r.score_total],["Status",r=>badge(r.status)],["",r=>`<button class="btn ghost sm" onclick="openRecord('${esc(r.product_id)}')">Open</button>`]], l) : empty(RESEARCH.length ? "No records match the filters." : "No products yet. Use “Quick add” to record today’s first candidate.")) + `<p class="muted" style="margin-top:8px">Submitted today: ${n} / ~10</p>`;
    };
    $("view").innerHTML = `<div class="bar"><button class="btn sm" onclick="quickAdd()">Quick add</button><div class="field"><input id="rq" placeholder="Search"></div>
      <div class="field"><select id="rs"><option value="">All statuses</option>${["NEW","RESEARCHING","SUPPLIER_CHECK","COSTING","REVIEW","APPROVED","PUBLISHED","REJECTED","ON_HOLD","OUT_OF_STOCK","ARCHIVED"].map(s=>`<option>${s}</option>`).join("")}</select></div>
      <div class="field"><select id="rso"><option value="date">Newest</option><option value="score">Score</option><option value="margin">Margin</option></select></div>
      <button class="btn ghost sm" onclick="exportSheet('ProductResearch')">Export CSV</button></div><div id="rtable"></div>`;
    ["rq","rs","rso"].forEach(i => $(i).oninput = draw); draw();
  },
  async approvals() { RESEARCH = await api("research.list"); const l = RESEARCH.filter(r=>r.status==="REVIEW");
    $("view").innerHTML = l.length ? table([["ID",r=>esc(r.product_id)],["Name",r=>esc(r.name)],["Margin (est.)",r=>r.pricing.margin_pct+"%"],["Score",r=>r.score_total],["",r=>`<button class="btn sm" onclick="openRecord('${esc(r.product_id)}')">Review</button>`]], l) : empty("Review queue is empty."); },
  async catalogue() { RESEARCH = await api("research.list"); const l = RESEARCH.filter(r=>["APPROVED","PUBLISHED","OUT_OF_STOCK"].includes(r.status));
    $("view").innerHTML = l.length ? table([["Photo",r=>r.image_url?`<img src="${esc(r.image_url)}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:8px">`:"—"],["Name",r=>esc(r.name)],["Price",r=>inr(r.selling_price)],["Status",r=>badge(r.status)],["",r=>`<button class="btn sm" onclick="openRecord('${esc(r.product_id)}');listingForm('${esc(r.product_id)}')">Photos, video &amp; page</button> <button class="btn ghost sm" onclick="openRecord('${esc(r.product_id)}')">Details</button>`]], l) : empty("No approved or published products yet."); },

  async suppliers() { const l = await api("suppliers.list");
    $("view").innerHTML = `<div class="bar"><button class="btn sm" onclick="supplierForm()">Add supplier</button></div>` + (l.length ? table([["ID",r=>esc(r.supplier_id)],["Name",r=>esc(r.name)],["Fulfilment",r=>esc(r.fulfilment_method)],["Delivery",r=>esc(r.delivery_estimate)],["Quality",r=>esc(r.quality_status)],["Verified",r=>esc(String(r.last_verified).slice(0,10))]], l) : empty("No suppliers yet.")); },

  async orders() { let l; try { l = await api("orders.list"); } catch { l = await api("orders.listLimited"); }
    $("view").innerHTML = (l.length ? table([["Order",r=>esc(r.order_id)],["Date",r=>esc(String(r.created_at).slice(0,10))],["Customer",r=>esc(r.customer_name)],["Gift / packing",r=>giftCell(r)],["City",r=>esc(r.city)],["Total",r=>r.total===undefined?"—":inr(r.total)],["Payment",r=>r.payment_status?badge(r.payment_status):"—"],["Status",r=>badge(r.order_status)],["Tracking",r=>esc(r.tracking_number||"")],["Demo",r=>String(r.is_test)==="true"?"TEST":""],["",r=>orderActions(r)]], l) : empty("No orders yet.")) +
      `<div class="bar" style="margin-top:12px"><button class="btn ghost sm" onclick="exportSheet('Orders')">Export CSV</button></div>`; },
  async refunds() { $("view").innerHTML = `<p class="muted" style="margin-bottom:12px">Refunds are recorded here as a tracked manual process. Issue the actual payment-gateway refund in the gateway dashboard, then record it.</p><button class="btn sm" onclick="refundForm()">Record refund</button> <button class="btn ghost sm" onclick="exportSheet('Refunds')">Export CSV</button>`; },

  async tasks() { const l = await api("tasks.list"), now = new Date().toISOString().slice(0,10);
    $("view").innerHTML = (S.user.role==="OWNER" ? `<button class="btn sm" onclick="taskForm()" style="margin-bottom:12px">New task</button>` : "") + (l.length ? table([["Title",r=>esc(r.title)],["Priority",r=>esc(r.priority)],["Due",r=>esc(String(r.due_date).slice(0,10))+(r.due_date&&String(r.due_date).slice(0,10)<now&&r.status!=="COMPLETED"?" "+badge("OVERDUE"):"")],["Status",r=>`<select onchange="setTask('${esc(r.task_id)}',this.value)">${["TODO","IN_PROGRESS","REVIEW","COMPLETED","BLOCKED"].map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}</select>`]], l) : empty("No tasks assigned.")); },
  async team() { const l = await api("users.list");
    $("view").innerHTML = `<button class="btn sm" onclick="userForm()" style="margin-bottom:12px">Add member</button>` + table([["Name",r=>esc(r.name)],["Email",r=>esc(r.email)],["Role",r=>`<select onchange="setUser('${esc(r.user_id)}',{role:this.value})">${["OWNER","MANAGER","RESEARCHER","REVIEWER","ORDER_OPS","SUPPORT","FINANCE"].map(s=>`<option ${s===r.role?"selected":""}>${s}</option>`).join("")}</select>`],["Password",r=>`<button class="btn ghost sm" onclick="resetPw('${esc(r.user_id)}')">Reset</button>`],["Active",r=>`<button class="btn ghost sm" onclick="setUser('${esc(r.user_id)}',{active:${String(r.active)!=="true"}})">${String(r.active)==="true"?"Deactivate":"Activate"}</button>`]], l); },
  async reports() { $("view").innerHTML = `<div class="bar"><div class="field"><label>From</label><input type="date" id="rf"></div><div class="field"><label>To</label><input type="date" id="rt"></div><button class="btn sm" id="rr">Run</button></div><div id="rout"></div>`;
    $("rr").onclick = async () => { const r = await api("reports.summary", {from:$("rf").value||null, to:$("rt").value?$("rt").value+"T23:59:59":null});
      $("rout").innerHTML = `<pre style="white-space:pre-wrap" class="card">${esc(JSON.stringify(r, null, 2))}</pre><p class="muted">Figures are actuals from recorded paid orders; items with no unit cost make profit incomplete. Product-level estimates live on the research board.</p>`; }; },
  async activity() { const l = await api("activity.list"); $("view").innerHTML = l.length ? table([["Time",r=>esc(String(r.ts).replace("T"," ").slice(0,16))],["Actor",r=>esc(r.actor_id)],["Action",r=>esc(r.action)],["Record",r=>esc(r.record_ref)],["Change",r=>esc(String(r.before_after).slice(0,80))]], l) : empty("No activity yet."); },
  async settings() {
    const s = await api("settings.get"); let sec = {}; try { sec = await api("secrets.status"); } catch {}
    const inp = (k,l,ph="",type="text") => `<div class="field"><label>${l}</label><input data-s="${k}" type="${type}" value="${esc(s[k]||"")}" placeholder="${esc(ph)}"></div>`;
    const img = (k,l) => `<div class="field"><label>${l}</label><div style="display:flex;gap:8px;align-items:center"><input data-s="${k}" id="im_${k}" value="${esc(s[k]||"")}" placeholder="Upload karo ya link paste karo"><label class="btn ghost sm" style="margin:0;cursor:pointer;white-space:nowrap">Upload<input type="file" accept="image/*" hidden onchange="upSet('${k}',this)"></label></div><img id="pv_${k}" src="${esc(s[k]||"")}" alt="" style="max-height:90px;margin-top:8px;border-radius:8px;${s[k]?"":"display:none"}"></div>`;
    const sk = (n,l) => `<div class="field"><label>${l} <span class="badge ${sec[n]?"ok":""}" id="sb_${n}">${sec[n]?"saved":"not set"}</span></label><div style="display:flex;gap:8px"><input type="password" autocomplete="off" id="sk_${n}" placeholder="${sec[n]?"Saved - type to replace":"Paste here"}"><button class="btn ghost sm" onclick="saveSecret('${n}')">Save</button></div></div>`;
    const box = (id,t,body,note="") => `<div class="card" style="margin-bottom:18px"><h3>${t}</h3>${note?`<p class="muted" style="margin:6px 0 12px">${note}</p>`:""}<div id="${id}"><div class="row">${body}</div></div><button class="btn sm" style="margin-top:8px" onclick="saveSection('${id}',this)">Save ${t}</button></div>`;
    const mode = s.checkout_mode || "DEMO";
    $("view").innerHTML = `<p class="muted" style="margin-bottom:14px">Har section ke neeche <b>Save</b> button hai. Page apne aap reload nahi hoga.</p>
    ${box("sec_brand","Brand",inp("store_name","Store name")+inp("tagline","Tagline")+inp("announcement","Top announcement bar","e.g. Free gift wrap this week"))}
    ${box("sec_look","Website images",img("hero_image","Home page big image (optional)")+img("logo_url","Logo (optional)"),"Bina code ke website ki images yahin se badlo. Khali chhodoge to 3D gift box dikhega.")}
    ${box("sec_thx","Thank-you code after delivery",inp("thanks_percent","Percent off for the next order (0 = off, max 30). Given once per delivered order, not tied to any review.","0")+inp("thanks_days","Valid for (days, 7 to 90)","30"))}${box("sec_wa","WhatsApp and contact",inp("whatsapp_number","WhatsApp number (country code ke saath)","919876543210")+inp("wa_greeting","WhatsApp greeting message","Hi! I need help choosing a gift.")+inp("site_url","Website link for reminder emails (https://.../site/)","https://yourname.github.io/shoprock/site/")+inp("support_email","Support email")+inp("instagram_url","Instagram link")+inp("support_contact","Contact line (footer)")+inp("notify_email","Email for new-order alerts")+inp("ga_id","Google Analytics ID (optional)","G-XXXXXXXXXX"))}
    <div class="card" style="margin-bottom:18px"><h3>Payments</h3><div class="field" style="max-width:460px;margin-top:10px"><label>Checkout mode</label><select id="cmode" onchange="saveMode(this)">${[["DEMO","DEMO - test only, no real orders"],["MANUAL","MANUAL - customer UPI se pay kare, aap confirm karo"],["LIVE","LIVE - payment gateway (keys chahiye)"]].map(([v,t])=>`<option value="${v}" ${v===mode?"selected":""}>${t}</option>`).join("")}</select></div>
    <div id="sec_pay"><div class="row">${inp("upi_id","Your UPI ID","name@bank")}${inp("upi_payee_name","Name shown to customer")}${inp("shipping_flat","Flat shipping (INR)","0","number")}${inp("free_shipping_above","Free shipping above (INR, 0 = off)","0","number")}</div><div class="field"><label>Payment instructions shown to customer</label><textarea data-s="payment_instructions" rows="3">${esc(s.payment_instructions||"")}</textarea></div></div><button class="btn sm" onclick="saveSection('sec_pay',this)">Save payment details</button>
    <h3 style="margin:22px 0 6px">Gateway keys (Razorpay / Cashfree)</h3><p class="muted" style="margin-bottom:10px">Private save hote hain, dobara dikhte nahi. Auto-verification verified gateway account ke baad chalu hoga.</p><div class="row">${sk("GATEWAY_KEY_ID","Key ID")}${sk("GATEWAY_KEY_SECRET","Key secret")}${sk("WEBHOOK_TOKEN","Webhook token")}</div></div>
    ${box("sec_rules","Business rules",inp("target_margin_pct","Target margin %","30","number")+inp("default_payment_fee_pct","Default payment fee %","2.4","number")+inp("default_return_allowance_pct","Default return allowance %","3","number"))}`;
  },
  async studio() {
    const s = await api("settings.get"); let d = {}; try { d = JSON.parse(s.site_json || "{}"); } catch {}
    const sh = d.show || {}, bn = d.banner || {}, acc = d.accent || "#C8A76A";
    const tg = (k,l) => `<label style="text-transform:none;letter-spacing:0;display:flex;gap:10px;align-items:center;margin-bottom:8px"><input type="checkbox" style="width:auto" data-sh="${k}" ${sh[k]===false?"":"checked"}> ${l}</label>`;
    const cols = [["Gold","#C8A76A"],["Rose","#D98A9A"],["Emerald","#5FB38A"],["Sapphire","#6FA3E0"],["Violet","#A98BE0"]];
    $("view").innerHTML = `<p class="muted" style="margin-bottom:14px">Yahan se poori website ka look aur content badlo. Neeche ek <b>Save Studio</b> dabao, website turant update.</p>
    <div class="card" style="margin-bottom:18px"><h3>Colour theme</h3><div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">${cols.map(c=>`<button class="btn ghost sm" onclick="$('st_acc').value='${c[1]}'" style="border-color:${c[1]}">${c[0]}</button>`).join("")}<input id="st_acc" type="color" value="${esc(acc)}" style="width:60px;padding:2px"></div></div>
    <div class="card" style="margin-bottom:18px"><h3>Sections dikhao / chhupao</h3><div style="margin-top:10px">${tg("trust","Trust bar (checked, tracking...)")}${tg("occasions","Occasions")}${tg("featured","Featured products")}${tg("story","Why us")}${tg("steps","How it works")}${tg("reviews","Customer reviews")}${tg("banner","Promo banner")}${tg("faq","FAQ")}</div></div>
    <div class="card" style="margin-bottom:18px"><h3>Trust bar</h3><p class="muted" style="margin:6px 0">Ek line mein ek point (max 4)</p><textarea id="st_trust" rows="4">${esc((d.trust||[]).join("\n"))}</textarea></div>
    <div class="card" style="margin-bottom:18px"><h3>Promo banner</h3><div class="row"><div class="field"><label>Title</label><input id="st_bt" value="${esc(bn.title||"")}"></div><div class="field"><label>Button text</label><input id="st_bb" value="${esc(bn.btn||"")}"></div><div class="field"><label>Button link</label><input id="st_bl" value="${esc(bn.link||"shop.html")}"></div></div><div class="field"><label>Text</label><textarea id="st_bx" rows="2">${esc(bn.text||"")}</textarea></div>
    <div class="field"><label>Banner image</label><div style="display:flex;gap:8px"><input id="im_banner_img" value="${esc(bn.img||"")}" placeholder="Upload ya link"><label class="btn ghost sm" style="margin:0;cursor:pointer">Upload<input type="file" accept="image/*" hidden onchange="upSet('banner_img',this)"></label></div><img id="pv_banner_img" src="${esc(bn.img||"")}" alt="" style="max-height:80px;margin-top:8px;border-radius:8px;${bn.img?"":"display:none"}"></div></div>
    <div class="card" style="margin-bottom:18px"><h3>Customer reviews (genuine hi daalna)</h3><p class="muted" style="margin:6px 0">Ek line: Naam | Review</p><textarea id="st_rv" rows="5">${esc((d.reviews||[]).map(r=>r.n+" | "+r.t).join("\n"))}</textarea></div>
    <button class="btn" id="st_save">Save Studio</button>`;
    $("st_save").onclick = () => guarded(async () => {
      const show = {}; document.querySelectorAll("[data-sh]").forEach(e => show[e.dataset.sh] = e.checked);
      const o = {accent:$("st_acc").value, show, trust:$("st_trust").value.split("\n").map(x=>x.trim()).filter(Boolean).slice(0,4),
        banner:{title:$("st_bt").value.trim(), text:$("st_bx").value.trim(), btn:$("st_bb").value.trim(), link:$("st_bl").value.trim(), img:$("im_banner_img").value.trim()},
        reviews:$("st_rv").value.split("\n").map(x=>{const i=x.indexOf("|");return i<0?null:{n:x.slice(0,i).trim(),t:x.slice(i+1).trim()};}).filter(r=>r&&r.n&&r.t).slice(0,6)};
      await api("settings.set", {key:"site_json", value:JSON.stringify({...d, ...o})}); try { sessionStorage.removeItem("sr_cfg"); } catch {} toast("Website update ho gayi ✓"); });
  },
  async gifts() {
    const [st, pr] = await Promise.all([api("settings.get"), api("research.list")]); let d = {}; try { d = JSON.parse(st.site_json || "{}"); } catch {}
    const g = d.gift || {}, rc = d.rec || {}, ad = d.addons || {};
    PL = pr.filter(r => r.status === "PUBLISHED").map(r => ({id:r.product_id, name:r.name, price:r.selling_price, cat:r.category || ""}));
    ST = {g:{enabled:g.enabled !== false, custom:g.custom !== false, show:g.show !== false, max:g.max || 200, list:(g.list && g.list.length ? g.list : DN).map(x => ({...x}))}, rec:{max:rc.max || 3, map:JSON.parse(JSON.stringify(rc.map || {}))}, addons:{max:ad.max || 2, items:(ad.items || []).map(x => ({...x}))}, after:(d.after || []).map(x => ({...x})), cur:PL[0] ? PL[0].id : ""};
    DIRTY = false; window.onbeforeunload = () => DIRTY ? "Unsaved changes" : undefined; drawGifts();
  },
  async reviews() { const l = await api("reviews.list");
    $("view").innerHTML = `<div class="bar"><button class="btn sm" onclick="reviewForm()">Add genuine feedback you received</button></div><p class="muted" style="margin-bottom:12px">Customers write reviews from the product page using their order reference. New reviews wait here until you approve them.</p>` +
      (l.length ? table([["Product",r=>esc(r.product_name)],["Rating",r=>"&#9733;".repeat(Number(r.rating))+"&#9734;".repeat(5-Number(r.rating))],["Review",r=>`<b>${esc(r.title||"")}</b><br>${esc(r.body)}`],["By",r=>esc(r.name)+(String(r.verified)==="true"?" (verified buyer)":"")],["Status",r=>badge(r.status)],["",r=>`<button class="btn sm" onclick="revSet('${esc(r.review_id)}','APPROVED')">Approve</button> <button class="btn ghost sm" onclick="revSet('${esc(r.review_id)}','REJECTED')">Reject</button>`]], l) : empty("No reviews yet.")); },
  async coupons() { COUPONS = await api("coupons.list");
    $("view").innerHTML = `<div class="bar"><button class="btn sm" onclick="couponForm()">New coupon</button></div>` + (COUPONS.length ? table([["Code",r=>esc(r.code)],["Discount",r=>r.type==="PERCENT"?esc(r.value)+"%":inr(r.value)],["Min order",r=>inr(r.min_order||0)],["Used",r=>esc(r.used||0)+(Number(r.max_uses)?" / "+esc(r.max_uses):"")],["Expires",r=>esc(String(r.expires||"").slice(0,10)||"never")],["Active",r=>badge(String(r.active).toUpperCase())],["",r=>`<button class="btn ghost sm" onclick="couponToggle('${esc(r.code)}')">${String(r.active)==="true"?"Disable":"Enable"}</button>`]], COUPONS) : empty("No coupons yet. Create one like WELCOME10.")); },
  async content() { const s = await api("settings.get"); let faq = []; try { faq = JSON.parse(s.faq_json || "[]"); } catch {}
    const t = (k,l,rows) => `<div class="field"><label>${l}</label><textarea rows="${rows}" onchange="saveSetting('${k}',this.value)">${esc(s[k]||"")}</textarea></div>`;
    const i = (k,l) => `<div class="field"><label>${l}</label><input value="${esc(s[k]||"")}" onchange="saveSetting('${k}',this.value)"></div>`;
    $("view").innerHTML = `<p class="muted" style="margin-bottom:12px">Everything here appears on your website. A box saves automatically when you click outside it.</p>
    <h3>Home page</h3>${i("hero_title","Main headline")}${t("hero_text","Text under the headline",2)}${i("story_title","'Why us' heading")}${t("story_text","'Why us' paragraph",3)}${i("occasions","Gift occasions (separate with commas)")}
    <h3 style="margin-top:20px">FAQ</h3><p class="muted">One per line, written as: Question | Answer</p><div class="field"><textarea id="faqbox" rows="7">${esc(faq.map(f => f.q + " | " + f.a).join("\n"))}</textarea></div><button class="btn sm" onclick="saveFaq()">Save FAQ</button>
    <h3 style="margin-top:20px">Policy pages</h3><p class="muted">Leave a blank line between paragraphs. Start a line with ## for a sub-heading. Read these carefully and have a professional check the legal wording before you launch.</p>
    ${t("policy_shipping","Shipping &amp; delivery",6)}${t("policy_returns","Returns, cancellations &amp; refunds",6)}${t("policy_privacy","Privacy policy",6)}${t("policy_terms","Terms &amp; conditions",6)}`; },
  async pricing() { $("view").innerHTML = `<div class="row">${[["selling_price","Selling price"],["supplier_price","Supplier price"],["sourcing_markup_pct","Sourcing markup %"],["packaging_cost","Packaging"],["shipping_cost","Shipping paid"],["payment_fee_pct","Payment fee %"],["return_allowance_pct","Returns allowance %"],["marketing_cost","Marketing per order"],["other_cost","Other"],["target_margin_pct","Target margin %"]].map(([k,l])=>`<div class="field"><label>${l}</label><input type="number" min="0" step="any" data-p="${k}"></div>`).join("")}</div><button class="btn sm" id="pc">Calculate</button><div id="pout" style="margin-top:16px"></div>`;
    $("pc").onclick = async () => { const i = {}; document.querySelectorAll("[data-p]").forEach(e => i[e.dataset.p] = e.value); const r = await api("pricing.calc", {input:i});
      $("pout").innerHTML = `<div class="kpis">${[["Landed cost",inr(r.landed_cost)],["Total variable cost",inr(r.total_variable_cost)],["Contribution",inr(r.contribution)],["Margin",r.margin_pct+"%"],["Break-even price",r.break_even_price===null?"n/a":inr(r.break_even_price)],["Suggested price",r.suggested_price===null?"n/a":inr(r.suggested_price)],["Price − supplier",inr(r.price_minus_supplier)]].map(([l,v])=>`<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join("")}</div><p class="muted">Estimate based on the inputs above.</p>`; }; }
};

/* ---- forms / actions (all validated again server-side) ---- */
const F = (id, label, type = "text") => `<div class="field"><label>${label}</label><input id="${id}" type="${type}"></div>`;
async function guarded(fn) { try { await fn(); } catch (e) { toast(e.message, true); } }
function quickAdd() { modal(`<h3>Quick add</h3>${F("n_name","Product name")}${F("n_cat","Category")}${F("n_src","Source type (Instagram, Pinterest, supplier…)")}${F("n_url","Source URL")}${F("n_img","Image URL (licensed/actual)")}${F("n_price","Potential selling price","number")}${F("n_sp","Supplier price","number")}${F("n_trend","Trend evidence")}<button class="btn" id="n_go">Save</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("n_go").onclick = () => guarded(async () => { const r = await api("research.create", {record:{name:$("n_name").value,category:$("n_cat").value,source_type:$("n_src").value,source_url:$("n_url").value,image_url:$("n_img").value,selling_price:$("n_price").value,supplier_price:$("n_sp").value,trend_evidence:$("n_trend").value}});
    if (r.duplicate_warning) toast("Warning: " + r.duplicate_warning, true); else toast("Saved"); closeModal(); go("research"); }); }
const STAT = ["NEW","RESEARCHING","SUPPLIER_CHECK","COSTING","REVIEW","APPROVED","PUBLISHED","REJECTED","ON_HOLD","OUT_OF_STOCK","ARCHIVED"];
const CHECK = ["supplier_checked","price_confirmed","availability_confirmed","photos_licensed","claims_verified","delivery_terms_recorded","packaging_assessed","margin_calculated","returns_risk_reviewed","copy_checked"];
function openRecord(id) { const r = RESEARCH.find(x => x.product_id === id); if (!r) return; let cl = {}; try { cl = JSON.parse(r.checklist_json || "{}"); } catch {}
  modal(`<h3>${esc(r.name)}</h3><p class="muted">${esc(r.product_id)} · ${badge(r.status)} · est. margin ${r.pricing.margin_pct}% · score ${r.score_total}</p>
  <p style="margin:10px 0"><button class="btn sm" onclick="listingForm('${esc(r.product_id)}')">Photos, video &amp; product page</button></p><div class="row">${[["supplier_id","Supplier ID"],["supplier_price","Supplier price"],["selling_price","Selling price"],["packaging_cost","Packaging"],["shipping_cost","Shipping"],["payment_fee_pct","Fee %"],["return_allowance_pct","Returns %"],["marketing_cost","Marketing"],["image_url","Image URL"],["delivery_estimate","Delivery estimate"],["stock_confirmed","Stock confirmed (true/false)"],["quality_verified","Quality (passed/failed/pending)"],["public_description","Customer-facing description"],["risk_notes","Risk notes"],["ip_concerns","IP concerns"],["reviewer_notes","Reviewer notes"]].map(([k,l])=>`<div class="field"><label>${l}</label><input data-f="${k}" value="${esc(r[k])}"></div>`).join("")}</div>
  <h3 style="margin:12px 0">Scores (0–5)</h3><div class="row">${["relevance","trend","supplier","margin","giftability","fulfilment"].map(k=>`<div class="field"><label>${k}</label><input type="number" min="0" max="5" data-f="score_${k}" value="${esc(r["score_"+k])}"></div>`).join("")}</div>
  <button class="btn sm" id="sv">Save changes</button>
  <h3 style="margin:16px 0 8px">Approval checklist (reviewers)</h3>${CHECK.map(k=>`<label style="text-transform:none;letter-spacing:0"><input type="checkbox" style="width:auto" data-c="${k}" ${cl[k]?"checked":""}> ${k.replace(/_/g," ")}</label>`).join("")}<button class="btn ghost sm" id="sc" style="margin-top:8px">Save checklist</button>
  <h3 style="margin:16px 0 8px">Move to status</h3><select id="ns">${STAT.map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}</select> <button class="btn sm" id="ss">Apply</button> <button class="btn ghost sm" onclick="closeModal()">Close</button>`);
  $("sv").onclick = () => guarded(async () => { const p = {}; document.querySelectorAll("[data-f]").forEach(e => p[e.dataset.f] = e.value); await api("research.update", {product_id:id, patch:p}); toast("Saved"); closeModal(); go("research"); });
  $("sc").onclick = () => guarded(async () => { const c = {}; document.querySelectorAll("[data-c]").forEach(e => c[e.dataset.c] = e.checked); const x = await api("research.checklist", {product_id:id, checklist:c}); toast(x.missing.length ? "Missing: " + x.missing.join(", ") : "Checklist complete"); });
  $("ss").onclick = () => guarded(async () => { await api("research.setStatus", {product_id:id, status:$("ns").value, reviewer_notes:document.querySelector('[data-f="reviewer_notes"]').value}); toast("Status updated"); closeModal(); go("research"); }); }
function supplierForm() { modal(`<h3>Add supplier</h3>${F("s_n","Name")}${F("s_w","Website")}${F("s_c","Contact")}${F("s_f","Fulfilment method")}${F("s_d","Delivery estimate")}${F("s_r","Return/replacement terms")}<button class="btn" id="s_go">Save</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("s_go").onclick = () => guarded(async () => { await api("suppliers.save", {record:{name:$("s_n").value,website:$("s_w").value,contact:$("s_c").value,fulfilment_method:$("s_f").value,delivery_estimate:$("s_d").value,return_terms:$("s_r").value,last_verified:new Date().toISOString().slice(0,10)}}); closeModal(); go("suppliers"); }); }
function orderForm(id) { modal(`<h3>${esc(id)}</h3><p class="muted">Paid status can only be set by verified gateway events, never from here.</p><div class="field"><label>Next status</label><select id="o_s">${["SUPPLIER_CONFIRMATION","FULFILMENT_PENDING","SHIPPED","DELIVERED","CANCELLATION_REQUESTED","CANCELLED"].map(s=>`<option>${s}</option>`).join("")}</select></div>${F("o_t","Tracking number")}${F("o_sr","Supplier reference")}${F("o_r","Cancellation reason")}<button class="btn" id="o_go">Update</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("o_go").onclick = () => guarded(async () => { await api("orders.setStatus", {order_id:id,status:$("o_s").value,tracking_number:$("o_t").value,supplier_ref:$("o_sr").value,reason:$("o_r").value}); closeModal(); go("orders"); }); }
function refundForm() { modal(`<h3>Record refund</h3>${F("r_o","Order ID")}${F("r_a","Amount (₹)","number")}${F("r_r","Reason")}${F("r_m","Method (gateway / manual)")}<button class="btn" id="r_go">Record</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("r_go").onclick = () => guarded(async () => { await api("refunds.create", {order_id:$("r_o").value,amount:$("r_a").value,reason:$("r_r").value,method:$("r_m").value}); toast("Refund recorded"); closeModal(); }); }
function taskForm() { modal(`<h3>New task</h3>${F("t_t","Title")}${F("t_d","Description")}${F("t_a","Assignee user ID")}${F("t_due","Due date","date")}<button class="btn" id="t_go">Create</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("t_go").onclick = () => guarded(async () => { await api("tasks.save", {record:{title:$("t_t").value,description:$("t_d").value,assignee_id:$("t_a").value||undefined,due_date:$("t_due").value}}); closeModal(); go("tasks"); }); }
const setTask = (id, status) => guarded(async () => { await api("tasks.save", {record:{task_id:id,status}}); toast("Updated"); });
function userForm() { modal(`<h3>Add team member</h3>${F("u_n","Name")}${F("u_e","Email","email")}<div class="field"><label>Role</label><select id="u_r">${["MANAGER","RESEARCHER","REVIEWER","ORDER_OPS","SUPPORT","FINANCE","OWNER"].map(s=>`<option>${s}</option>`).join("")}</select></div><button class="btn" id="u_go">Create</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("u_go").onclick = () => guarded(async () => { const r = await api("users.create", {name:$("u_n").value,email:$("u_e").value,role:$("u_r").value}); modal(`<h3>Member created</h3><p>Temporary password (shown once — share privately):</p><pre class="card">${esc(r.temp_password)}</pre><button class="btn" onclick="closeModal();go('team')">Done</button>`); }); }
const setUser = (id, patch) => guarded(async () => { await api("users.update", {user_id:id, ...patch}); toast("Updated"); go("team"); });
const saveSetting = (key, value) => guarded(async () => { await api("settings.set", {key, value}); toast("Saved"); });
const exportSheet = sheet => guarded(async () => { csvDownload(sheet + ".csv", await api("export.csv", {sheet})); });


/* ===== v3 sections: product details/variants, bundles, analytics, reminders =====
   details + bundles save into site_json (existing persistence path -> live storefront). analytics + reminders need BACKEND-PATCH-v3.gs. */
MENU.push(["cats","Home categories"],["details","Product details & variants"],["bundles","Bundles"],["analytics","Analytics"],["reminders","Reminders & consent"]);
ROLE_MENU.OWNER = MENU.map(m => m[0]);
async function readSite() { const st = await api("settings.get"); let d = {}; try { d = JSON.parse(st.site_json || "{}"); } catch {} return d; }
async function writeSite(fn) { const d = await readSite(); fn(d); await api("settings.set", {key:"site_json", value:JSON.stringify(d)}); try { sessionStorage.removeItem("sr_cfg"); } catch {} }
const slug = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
const pubProducts = async () => (await api("research.list")).filter(r => r.status === "PUBLISHED").map(r => ({id:r.product_id, name:r.name, price:Number(r.selling_price) || 0}));
let DETP = [], DETD = {};
VIEWS.details = async () => {
  [DETP, DETD] = await Promise.all([pubProducts(), readSite()]);
  const meta = DETD.meta || {};
  $("view").innerHTML = `<p class="muted" style="margin-bottom:12px">Story, occasion and variant fields for each published product. Saving updates the live product page.</p><div class="notice" style="margin-bottom:14px">Variant <b>prices</b> only apply at checkout after BACKEND-PATCH-v3 is deployed. Until then every variant sells at the product price, and the storefront shows variants as options only.</div>` +
    (DETP.length ? DETP.map(p => { const m = meta[p.id] || {}; return `<details class="card" style="margin-bottom:12px" data-pid="${esc(p.id)}"><summary><b>${esc(p.name)}</b> <span class="muted">${inr(p.price)}</span></summary>
      <div class="row">${[["occasion","Occasion (e.g. Anniversary)"],["recipient","Perfect for (e.g. Partner)"],["gift_suitability","Gift suitability line"],["tags","Tags (comma separated)"]].map(([k,l]) => `<div class="field"><label>${l}</label><input data-m="${k}" value="${esc(k === "tags" ? (m.tags || []).join(", ") : (m[k] || ""))}"></div>`).join("")}</div>
      <div class="field"><label>Product story (shown on the product page)</label><textarea data-m="story" rows="3">${esc(m.story || "")}</textarea></div>
      <div class="field"><label>Variants, one per line: Label | price (optional) | available (yes/no)</label><textarea data-m="variants" rows="3" placeholder="Warm white&#10;Pink glow | 1499 | yes">${esc((m.variants || []).map(v => [v.label, v.price || "", v.available === false ? "no" : "yes"].join(" | ")).join("\n"))}</textarea></div>
      <button class="btn sm" data-save-meta="${esc(p.id)}">Save ${esc(p.name)}</button></details>`; }).join("") : empty("No published products yet."));
  $("view").onclick = e => { const b = e.target.closest("[data-save-meta]"); if (!b) return; guarded(async () => { const pid = b.dataset.saveMeta, box = b.closest("details"), g = k => box.querySelector(`[data-m="${k}"]`).value.trim();
    const variants = g("variants").split("\n").map(l => l.split("|").map(x => x.trim())).filter(a => a[0]).map(a => { const v = {id:slug(a[0]), label:a[0].slice(0, 40), on:true}; if (a[1] !== undefined && a[1] !== "") { if (!(Number(a[1]) > 0)) throw new Error("Variant price must be a positive number: " + a[0]); v.price = Number(a[1]); } if (/^(no|n|false|0)$/i.test(a[2] || "")) v.available = false; return v; });
    if (new Set(variants.map(v => v.id)).size !== variants.length) throw new Error("Two variants have the same name.");
    const m = {occasion:g("occasion").slice(0, 60), recipient:g("recipient").slice(0, 60), gift_suitability:g("gift_suitability").slice(0, 120), story:g("story").slice(0, 1200), tags:g("tags").split(",").map(x => x.trim()).filter(Boolean).slice(0, 10), variants};
    await writeSite(d => { d.meta = d.meta || {}; d.meta[pid] = m; }); toast("Saved. Live on the product page."); }); };
};
VIEWS.bundles = async () => {
  const [P, d] = await Promise.all([pubProducts(), readSite()]); const list = d.bundles || [];
  const reg = ids => ids.reduce((a, id) => a + ((P.find(p => p.id === id) || {}).price || 0), 0);
  $("view").innerHTML = `<div class="notice" style="margin-bottom:14px">A bundle price is shown to customers (and a saving claimed) only when BACKEND-PATCH-v3 is deployed and the price is lower than the items' total. Otherwise customers see the bundle at regular prices, with no saving.</div>
   ${list.length ? table([["Bundle",r => esc(r.name) + (r.kind === "week" ? " <span class=\"muted\">(Surprise Week)</span>" : "")],["Items",r => esc((r.items || []).map(id => (P.find(p => p.id === id) || {name:id + " (unpublished)"}).name).join(" + "))],["Regular",r => inr(reg(r.items || []))],["Bundle price",r => r.price ? inr(r.price) : "—"],["Saving",r => r.price && r.price < reg(r.items || []) ? inr(reg(r.items) - r.price) : "—"],["On",r => badge(r.on !== false ? "TRUE" : "OFF")],["",r => `<button class="btn ghost sm" data-bt="${esc(r.id)}">Toggle</button> <button class="btn ghost sm" data-bd="${esc(r.id)}">Delete</button>`]], list) : empty("No bundles yet.")}
   <h3 style="margin:20px 0 8px">New bundle</h3><div class="card"><div class="field"><label>Bundle name</label><input id="b_n" maxlength="50"></div><div class="field"><label>Pick 2 or more products</label>${P.map(p => `<label style="text-transform:none;letter-spacing:0"><input type="checkbox" style="width:auto" data-bp="${esc(p.id)}"> ${esc(p.name)} (${inr(p.price)})</label>`).join("") || "<span class='muted'>No published products.</span>"}</div><label style="text-transform:none;letter-spacing:0;display:block;margin:8px 0"><input type="checkbox" style="width:auto" id="b_w"> Surprise Week: exactly 3 products, to open one per day (customers also get a 3-day message planner)</label><div class="field"><label>Bundle price (optional, must be lower than the total)</label><input id="b_p" type="number" min="0"></div><p class="muted" id="b_t">Total: ₹0</p><button class="btn sm" id="b_go">Save bundle</button></div>`;
  const upd = () => { const ids = [...document.querySelectorAll("[data-bp]:checked")].map(x => x.dataset.bp); $("b_t").textContent = "Total: " + inr(reg(ids)); }; document.querySelectorAll("[data-bp]").forEach(x => x.onchange = upd);
  $("view").onclick = e => { const t = e.target.closest("[data-bt],[data-bd]"); if (!t) return; guarded(async () => { await writeSite(d2 => { d2.bundles = (d2.bundles || []).map(b => b.id === t.dataset.bt ? {...b, on:b.on === false} : b).filter(b => b.id !== t.dataset.bd); }); toast("Saved"); VIEWS.bundles(); }); };
  $("b_go").onclick = () => guarded(async () => { const ids = [...document.querySelectorAll("[data-bp]:checked")].map(x => x.dataset.bp), name = $("b_n").value.trim(), price = Number($("b_p").value) || 0;
    if (!name) throw new Error("Give the bundle a name."); if (ids.length < 2) throw new Error("Pick at least 2 products."); const week = $("b_w").checked; if (week && ids.length !== 3) throw new Error("A Surprise Week needs exactly 3 products."); if (price && price >= reg(ids)) throw new Error("Bundle price must be lower than the total (" + inr(reg(ids)) + ") or left empty.");
    await writeSite(d2 => { d2.bundles = (d2.bundles || []).concat({id:"b" + Date.now().toString(36), name, items:ids, price:price || 0, on:true, ...(week ? {kind:"week"} : {})}); }); toast("Bundle saved. Live on the product pages."); VIEWS.bundles(); });
};
VIEWS.cats = async () => {
  const [P, d] = await Promise.all([pubProducts(), readSite()]); const list = d.categories || [];
  const boxes = (sel) => P.map(p => `<label style="text-transform:none;letter-spacing:0;display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" style="width:auto" data-cp="${esc(p.id)}" ${(sel || []).includes(p.id) ? "checked" : ""}> ${esc(p.name)} (${inr(p.price)})</label>`).join("") || "<span class='muted'>No published products yet.</span>";
  const form = (c, i) => `<div class="field"><label>Category name (short, max 24 letters)</label><input data-f="name" maxlength="24" value="${esc(c.name || "")}"></div><div class="field"><label>Round icon photo link (https, optional). Empty = first product's photo</label><input data-f="img" value="${esc(c.img || "")}" placeholder="https://..."></div><div class="field"><label>Products in this category</label>${boxes(c.items)}</div>`;
  $("view").innerHTML = `<div class="notice" style="margin-bottom:14px">These are the round category shortcuts on the home page and the filter on the Shop page. Only categories with at least one available product are shown to customers. Order here = order on the site.</div>
   ${list.length ? list.map((c, i) => `<details class="card" style="margin-bottom:12px" data-ci="${i}"><summary><b>${esc(c.name)}</b> <span class="muted">${(c.items || []).length} products${c.on === false ? " · hidden" : ""}</span></summary>${form(c, i)}<p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" data-save="${i}">Save</button><button class="btn ghost sm" data-up="${i}">Move up</button><button class="btn ghost sm" data-down="${i}">Move down</button><button class="btn ghost sm" data-tog="${i}">${c.on === false ? "Show" : "Hide"}</button><button class="btn ghost sm" data-del="${i}">Delete</button></p></details>`).join("") : empty("No categories yet, so the home page shows no category circles. Add one below.")}
   <h3 style="margin:20px 0 8px">New category</h3><div class="card" id="nc">${form({}, -1)}<button class="btn sm" id="nc_go">Add category</button></div>`;
  const read = box => { const g = k => box.querySelector(`[data-f="${k}"]`).value.trim(), name = g("name").slice(0, 24), img = g("img"); if (!name) throw new Error("Give the category a name."); if (img && !/^https:\/\//.test(img)) throw new Error("Icon link must start with https://"); return {name, img, items:[...box.querySelectorAll("[data-cp]:checked")].map(x => x.dataset.cp)}; };
  const dup = (arr, name, skip) => arr.some((c, i) => i !== skip && String(c.name).toLowerCase() === name.toLowerCase());
  $("nc_go").onclick = () => guarded(async () => { const c = read($("nc")); if (dup(list, c.name, -1)) throw new Error("A category with this name already exists."); await writeSite(d2 => { d2.categories = (d2.categories || []).concat({id:"c" + Date.now().toString(36), ...c, on:true}); }); toast("Category added. Live on the home page."); VIEWS.cats(); });
  $("view").onclick = e => { const b = e.target.closest("[data-save],[data-up],[data-down],[data-tog],[data-del]"); if (!b) return; const D = b.dataset, i = +(D.save ?? D.up ?? D.down ?? D.tog ?? D.del); guarded(async () => {
    let c; if (D.save !== undefined) { c = read(b.closest("details")); if (dup(list, c.name, i)) throw new Error("A category with this name already exists."); }
    await writeSite(d2 => { const a = d2.categories = d2.categories || []; if (!a[i]) return;
      if (D.save !== undefined) a[i] = {...a[i], ...c}; else if (D.tog !== undefined) a[i].on = a[i].on === false; else if (D.del !== undefined) a.splice(i, 1);
      else { const j = D.up !== undefined ? i - 1 : i + 1; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; } });
    toast("Saved. Live on the site."); VIEWS.cats(); }); };
};
VIEWS.analytics = async () => {
  let r; try { r = await api("analytics.report", {}); } catch (e) { $("view").innerHTML = `<div class="notice">Analytics needs BACKEND-PATCH-v3 deployed in Apps Script, so no numbers can be shown yet. (${esc(e.message)})</div>`; return; }
  const k = (l, v) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`, n = x => x === null || x === undefined ? "—" : x;
  $("view").innerHTML = `<p class="muted" style="margin-bottom:12px">Real recorded events and orders only. Anonymous: no names, phones or emails are stored with events. Since ${esc(r.since || "first event")}.</p><div class="kpis">${k("Product views", n(r.product_view))}${k("Add to cart", n(r.add_to_cart))}${k("Checkout starts", n(r.checkout_start))}${k("Orders placed (excl. demo)", n(r.orders))+k("Paid orders", n(r.paid_orders))}${k("Avg order value (paid orders)", r.aov === null ? "—" : inr(r.aov))}${k("Add-on conversion (browser events)", r.addon_conversion_pct === null ? "—" : r.addon_conversion_pct + "%")}${k("Recommendation clicks", n(r.rec_click))}${k("Wishlist adds", n(r.wishlist_add))}${k("WhatsApp clicks", n(r.wa_click))}${k("Repeat purchase rate", r.repeat_pct === null ? "—" : r.repeat_pct + "%")}</div><p class="muted">Repeat rate = customers with 2+ orders (matched by hashed phone) ÷ customers. Shows "—" when there is not enough data.</p>`;
};
VIEWS.reminders = async () => {
  let r; try { r = await api("prefs.list", {}); } catch (e) { $("view").innerHTML = `<div class="notice">Reminder sign-ups need BACKEND-PATCH-v3 deployed. Nothing is being collected or sent until then. (${esc(e.message)})</div>`; return; }
  $("view").innerHTML = `<div class="notice" style="margin-bottom:14px">Sending: ${esc(r.sending || "Reminders are only sent if you ran installReminderTrigger in Apps Script. Check Apps Script → Triggers.")}</div>` + (r.rows.length ? table([["Email",x => esc(x.email)],["Consent given",x => esc(String(x.consent_at || "").slice(0, 10))],["Dates",x => esc((x.dates || []).map(d => d.t + " " + d.d).join("; "))],["Status",x => badge(x.opted_out ? "OPTED OUT" : "SUBSCRIBED")]], r.rows) : empty("No sign-ups yet."));
};


/* ===== v3: gifting options (secret gift, premium packaging) + staff-visible gift/packing column ===== */
function giftCell(r) { let g = {}; try { g = JSON.parse(r.gift_json || "{}"); } catch {} const t = [];
  if (g.secret) t.push(badge("SECRET")); if (g.packaging) t.push(`<span class="badge">${esc(g.packaging.name)}</span>`); if (g.recipient) t.push("To: " + esc(g.recipient.name) + (g.recipient.phone ? " " + esc(g.recipient.phone) : ""));
  if (r.gift_message) t.push(`<em>“${esc(r.gift_message)}”</em>`); return t.join("<br>") || "—"; }
MENU.push(["gifting", "Gifting options"]); ROLE_MENU.OWNER = MENU.map(m => m[0]);
VIEWS.gifting = async () => {
  const [d, st] = await Promise.all([readSite(), api("settings.get")]), g = d.gifting || {}, p = g.packaging || {}, s = g.secret || {};
  $("view").innerHTML = `<div class="notice" style="margin-bottom:14px">Customers see these options as promises. Switch on only what your team can really do for <b>every</b> order. Prices are charged by the server at checkout, and each order shows these choices in the Orders page ("Gift / packing" column).</div>
  <div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:8px">Premium packaging</h3><label style="text-transform:none;letter-spacing:0;display:block;margin-bottom:10px"><input type="checkbox" style="width:auto" id="gp_on" ${p.on ? "checked" : ""}> Offer premium packaging at checkout</label>
   <div class="row"><div class="field"><label>Name customers see</label><input id="gp_name" maxlength="60" value="${esc(p.name || "Premium gift box")}"></div><div class="field"><label>Price (₹, 0 = free)</label><input id="gp_price" type="number" min="0" value="${esc(p.price ?? 99)}"></div><div class="field"><label>Your cost (₹, private, for profit reports)</label><input id="gp_cost" type="number" min="0" value="${esc(st.packaging_cost || 0)}"></div></div>
   <div class="field"><label>What is included (be exact)</label><textarea id="gp_desc" rows="2" maxlength="200">${esc(p.desc || "")}</textarea></div></div>
  <div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:8px">Secret gift</h3><label style="text-transform:none;letter-spacing:0;display:block;margin-bottom:10px"><input type="checkbox" style="width:auto" id="gs_on" ${s.on ? "checked" : ""}> Offer "send it as a secret" at checkout</label>
   <div class="row"><div class="field"><label>Name customers see</label><input id="gs_label" maxlength="60" value="${esc(s.label || "Send it as a secret")}"></div><div class="field"><label>Price (₹, 0 = free)</label><input id="gs_price" type="number" min="0" value="${esc(s.price ?? 0)}"></div></div>
   <div class="field"><label>What exactly you do (shown to customers)</label><textarea id="gs_note" rows="2" maxlength="240">${esc(s.note || "")}</textarea></div></div>
  <button class="btn" id="g_save">Save gifting options</button>`;
  $("g_save").onclick = () => guarded(async () => { const n = id => Number($(id).value), pOn = $("gp_on").checked, sOn = $("gs_on").checked;
    if (pOn && !$("gp_name").value.trim()) throw new Error("Give the packaging a name."); if (sOn && !$("gs_label").value.trim()) throw new Error("Give the secret-gift option a name.");
    if (!(n("gp_price") >= 0) || !(n("gs_price") >= 0) || !(n("gp_cost") >= 0)) throw new Error("Prices must be 0 or more.");
    if (pOn && !$("gp_desc").value.trim()) throw new Error("Describe exactly what the packaging includes.");
    if (sOn && !$("gs_note").value.trim()) throw new Error("Say exactly what you do for a secret gift.");
    await writeSite(x => { x.gifting = {packaging: {on: pOn, name: $("gp_name").value.trim(), price: Math.round(n("gp_price")), desc: $("gp_desc").value.trim()}, secret: {on: sOn, label: $("gs_label").value.trim(), price: Math.round(n("gs_price")), note: $("gs_note").value.trim()}}; });
    await api("settings.set", {key: "packaging_cost", value: String(Math.round(n("gp_cost")))}); toast("Saved. Live at checkout."); });
};

if (S && S.token) start();


// ---- password change (own) and reset (owner -> member) ----
function pwForm() {
  modal(`<h3>Change password</h3>${F("pw_c","Current password","password")}${F("pw_n","New password (min 10 characters)","password")}${F("pw_n2","Repeat new password","password")}<button class="btn" id="pw_go">Change</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("pw_go").onclick = () => guarded(async () => {
    if ($("pw_n").value !== $("pw_n2").value) throw new Error("New passwords do not match");
    await api("auth.updatePassword", {current_password:$("pw_c").value, new_password:$("pw_n").value});
    closeModal(); toast("Password changed. Please sign in again."); setTimeout(logout, 1200);
  });
}
const resetPw = id => { if (!confirm("Reset this member's password? They will be signed out.")) return; guarded(async () => { const r = await api("users.resetPassword", {user_id:id}); modal(`<h3>Password reset</h3><p>New temporary password (shown once -- share privately):</p><pre class="card">${esc(r.temp_password)}</pre><button class="btn" onclick="closeModal()">Done</button>`); }); };
$("pw").onclick = pwForm;


/* ---- WhatsApp + payment confirmation on orders ---- */
function waLink(phone, text) { const x = String(phone||"").replace(/\D/g,"").slice(-10); return x.length === 10 ? `https://wa.me/91${x}?text=${encodeURIComponent(text)}` : ""; }
function waText(r) { const n = r.customer_name || "there", id = r.order_id;
  if (r.payment_status !== "PAID" && String(r.is_test) !== "true") return `Hi ${n}, thank you for your order ${id} (${inr(r.total)}). Please complete the UPI payment and send the screenshot / UTR here so we can confirm it.`;
  if (r.order_status === "SHIPPED") return `Hi ${n}, your order ${id} has been shipped.${r.tracking_number ? " Tracking: " + r.tracking_number + "." : ""}`;
  if (r.order_status === "DELIVERED") return `Hi ${n}, your order ${id} was delivered. We hope you love it! Could you share a photo or a review with us?`;
  return `Hi ${n}, update on your order ${id}: payment received and we are preparing it.`; }
function orderActions(r) { const u = waLink(r.phone, waText(r));
  return `<button class="btn ghost sm" onclick="orderForm('${esc(r.order_id)}')">Update</button> ` + (u ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${u}">WhatsApp</a> ` : "") +
    (r.payment_status !== "PAID" && String(r.is_test) !== "true" ? `<button class="btn sm" onclick="payForm('${esc(r.order_id)}',${Number(r.total)||0})">Confirm payment</button>` : ""); }
function payForm(id, total) { modal(`<h3>Confirm payment</h3><p class="muted">Order ${esc(id)} - amount ${inr(total)}. Check that the money is in your bank/UPI app first.</p>${F("pf_ref","UPI reference / UTR number")}<button class="btn" id="pf_go">Mark as paid</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("pf_go").onclick = () => guarded(async () => { await api("orders.recordPayment", {order_id:id, reference:$("pf_ref").value}); toast("Payment confirmed"); closeModal(); go("orders"); }); }

/* ---- settings helpers ---- */

/* ---- listing studio: photos, video, product page text ---- */
let LST = null;
function shrink(file) { if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error("Sirf JPG, PNG ya WebP photo chalegi: " + file.name)); if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error("Photo 12 MB se badi hai: " + file.name)); return new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file);
  im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width*k); c.height = Math.round(im.height*k);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(im,0,0,c.width,c.height); URL.revokeObjectURL(u);
    c.toBlob(b => { const f = new FileReader(); f.onload = () => res(f.result.split(",")[1]); f.onerror = rej; f.readAsDataURL(b); }, "image/jpeg", .86); };
  im.onerror = () => rej(new Error("Could not read that image")); im.src = u; }); }
function drawGal() { $("ls_g").innerHTML = LST.g.length ? LST.g.map((u,i) => `<div class="gi"><img src="${esc(u)}" alt=""><div>${i===0?'<span class="badge ok">Cover</span>':`<button class="btn ghost sm" onclick="galCover(${i})">Make cover</button>`} <button class="btn ghost sm" onclick="galDel(${i})">Remove</button></div></div>`).join("") : '<p class="muted">No photos yet.</p>'; }
const galCover = i => { LST.g.unshift(LST.g.splice(i,1)[0]); drawGal(); };
const galDel = i => { LST.g.splice(i,1); drawGal(); };
function listingForm(id) {
  const r = RESEARCH.find(x => x.product_id === id); if (!r) return;
  let g = []; try { g = JSON.parse(r.gallery_json || "[]"); } catch {} if (!Array.isArray(g)) g = []; if (!g.length && r.image_url) g = [r.image_url];
  LST = {id, g}; const nl = t => String(t||"").split("\u00b6").join("\n");
  modal(`<h3>Product page: ${esc(r.name)}</h3><p class="muted">The first photo is the cover. Use bright, clear photos (JPG/PNG/WebP). They are saved to your Google Drive automatically.</p>
  <div id="ls_g" class="gal"></div>
  <div class="bar"><label class="btn sm" style="cursor:pointer;margin:0">Upload photos<input id="ls_f" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><div class="field"><input id="ls_u" placeholder="or paste an image link"></div><button class="btn ghost sm" id="ls_add">Add link</button></div>
  <div class="field"><label>Video link (YouTube or Google Drive share link)</label><input id="ls_v" value="${esc(r.video_url||"")}"></div>
  <div class="field"><label>Badge (optional)</label><input id="ls_b" value="${esc(r.badge||"")}" placeholder="Bestseller / New / Limited"></div>
  <label style="text-transform:none;letter-spacing:0;display:flex;gap:10px;align-items:center;margin-bottom:12px"><input type="checkbox" id="ls_ft" style="width:auto" ${String(r.featured)==="true"?"checked":""}> Show this product on the home page (featured)</label>
  <div class="field"><label>Short description (shown on cards)</label><textarea id="ls_d" rows="2">${esc(r.public_description||"")}</textarea></div>
  <div class="field"><label>Highlights (one per line)</label><textarea id="ls_h" rows="4">${esc(nl(r.highlights))}</textarea></div>
  <div class="field"><label>Full details (one paragraph per line)</label><textarea id="ls_l" rows="5">${esc(nl(r.long_description))}</textarea></div>
  <button class="btn" id="ls_s">Save product page</button> <a class="btn ghost" target="_blank" rel="noopener" href="../site/product.html?id=${encodeURIComponent(id)}">Preview</a> <button class="btn ghost" onclick="closeModal()">Close</button>`);
  drawGal();
  $("ls_add").onclick = () => { const u = $("ls_u").value.trim(); if (!/^https:\/\//.test(u)) return toast("Link must start with https://", true); if (LST.g.length >= 8) return toast("Maximum 8 photos", true); LST.g.push(u); $("ls_u").value = ""; drawGal(); };
  $("ls_f").onchange = e => guarded(async () => { for (const f of [...e.target.files]) { if (LST.g.length >= 8) { toast("Maximum 8 photos", true); break; } toast("Uploading " + f.name + " ..."); const data = await shrink(f); const x = await api("media.create", {mime:"image/jpeg", data}); LST.g.push(x.url); drawGal(); } e.target.value = ""; toast("Upload done"); });
  $("ls_s").onclick = () => guarded(async () => { const pl = t => t.split(/\r?\n/).map(x => x.trim()).filter(Boolean).join("\u00b6");
    const patch = {gallery_json:JSON.stringify(LST.g), image_url:LST.g[0]||"", video_url:$("ls_v").value.trim(), badge:$("ls_b").value.trim(), featured:$("ls_ft").checked?"true":"false", public_description:$("ls_d").value, highlights:pl($("ls_h").value), long_description:pl($("ls_l").value)};
    await api("research.update", {product_id:id, patch}); Object.assign(r, patch); toast("Product page saved"); });
}
document.head.insertAdjacentHTML("beforeend", "<style>.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin:10px 0}.gi img{width:100%;aspect-ratio:1;object-fit:cover;border:1px solid var(--line);margin-bottom:6px}.gi{font-size:.7rem}</style>");


/* ---- reviews, coupons, content helpers ---- */
let COUPONS = [];
const revSet = (id, st) => guarded(async () => { await api("reviews.setStatus", {review_id:id, status:st}); toast("Updated"); go("reviews"); });
async function reviewForm() { const l = (await api("research.list")).filter(r => r.status === "PUBLISHED");
  modal(`<h3>Add feedback you received</h3><p class="muted">Only add genuine feedback that a real customer gave you (for example on WhatsApp). Do not invent reviews.</p>
  <div class="field"><label>Product</label><select id="rv_p">${l.map(r => `<option value="${esc(r.product_id)}">${esc(r.name)}</option>`).join("")}</select></div>
  ${F("rv_n","Customer name")}<div class="field"><label>Rating</label><select id="rv_r">${[5,4,3,2,1].map(n => `<option>${n}</option>`).join("")}</select></div>${F("rv_t","Title (optional)")}<div class="field"><label>Review text</label><textarea id="rv_b" rows="4"></textarea></div>
  <button class="btn" id="rv_go">Add review</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("rv_go").onclick = () => guarded(async () => { await api("reviews.create", {product_id:$("rv_p").value, name:$("rv_n").value, rating:$("rv_r").value, title:$("rv_t").value, body:$("rv_b").value}); toast("Review added"); closeModal(); go("reviews"); }); }
function couponForm() { modal(`<h3>New coupon</h3>${F("c_code","Code (letters/numbers, e.g. WELCOME10)")}<div class="field"><label>Type</label><select id="c_type"><option value="PERCENT">Percent off</option><option value="FLAT">Flat amount off (INR)</option></select></div>
  ${F("c_val","Discount value","number")}${F("c_min","Minimum order (INR, optional)","number")}${F("c_max","Max total uses (0 = unlimited)","number")}${F("c_exp","Expiry date (optional)","date")}
  <button class="btn" id="c_go">Save coupon</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("c_go").onclick = () => guarded(async () => { await api("coupons.update", {record:{code:$("c_code").value, type:$("c_type").value, value:$("c_val").value, min_order:$("c_min").value, max_uses:$("c_max").value, expires:$("c_exp").value, active:true}}); toast("Coupon saved"); closeModal(); go("coupons"); }); }
const couponToggle = code => guarded(async () => { const c = COUPONS.find(x => x.code === code); if (!c) return; await api("coupons.update", {record:{...c, active:String(c.active) !== "true"}}); toast("Updated"); go("coupons"); });
const saveFaq = () => { const l = $("faqbox").value.split("\n").map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf("|"); return i < 0 ? null : {q:x.slice(0,i).trim(), a:x.slice(i+1).trim()}; }).filter(f => f && f.q && f.a); saveSetting("faq_json", JSON.stringify(l)); };


/* ---- settings helpers (no page reload) ---- */
const saveSection = (id, btn) => guarded(async () => { const els = [...document.querySelectorAll("#" + id + " [data-s]")]; btn.disabled = true;
  try { for (const e of els) await api("settings.set", {key:e.dataset.s, value:e.value}); toast("Saved ✓"); } finally { btn.disabled = false; } });
const saveMode = el => guarded(async () => { try { await api("settings.set", {key:"checkout_mode", value:el.value}); toast("Checkout mode saved ✓"); } catch (e) { const s = await api("settings.get"); el.value = s.checkout_mode || "DEMO"; throw e; } });
const saveSecret = n => guarded(async () => { const el = $("sk_" + n); await api("secrets.set", {name:n, value:el.value}); el.value = ""; el.placeholder = "Saved - type to replace"; const b = $("sb_" + n); b.textContent = "saved"; b.className = "badge ok"; toast("Saved securely ✓"); });
const upSet = (k, inpEl) => guarded(async () => { const f = inpEl.files[0]; if (!f) return; toast("Uploading..."); const x = await api("media.create", {mime:"image/jpeg", data: await shrink(f)}); $("im_" + k).value = x.url; const p = $("pv_" + k); p.src = x.url; p.style.display = ""; toast("Uploaded. Ab Save dabao."); });


/* ---- simple product flow: add + publish in one screen ---- */
const canPub = () => ["OWNER","MANAGER","REVIEWER"].includes(S.user.role);
const FLOW = ["NEW","RESEARCHING","SUPPLIER_CHECK","COSTING","REVIEW","APPROVED","PUBLISHED"];
async function publishFlow(id) {
  const r = (await api("research.list")).find(x => x.product_id === id); if (!r) throw new Error("Product not found");
  if (r.status === "PUBLISHED") return;
  const fix = {}; if (!r.supplier_id) fix.supplier_id = "OWN"; if (String(r.stock_confirmed).toLowerCase() !== "true") fix.stock_confirmed = "true"; if (String(r.quality_verified).toLowerCase() !== "passed") fix.quality_verified = "passed";
  if (Object.keys(fix).length) await api("research.update", {product_id:id, patch:fix});
  const cl = {}; CHECK.forEach(k => cl[k] = true); await api("research.checklist", {product_id:id, checklist:cl});
  const path = r.status === "OUT_OF_STOCK" ? ["PUBLISHED"] : r.status === "ON_HOLD" ? ["REVIEW","APPROVED","PUBLISHED"] : FLOW.slice(FLOW.indexOf(r.status) + 1);
  for (const st of path) await api("research.setStatus", {product_id:id, status:st});
}
const goLive = id => { if (!confirm("Ye product website par live ho jayega. Photo, price aur description check kar liye?")) return; guarded(async () => { await publishFlow(id); toast("Product live ho gaya ✓"); go("products"); }); };
const hideProduct = id => guarded(async () => { await api("research.setStatus", {product_id:id, status:"ON_HOLD"}); toast("Website se hata diya"); go("products"); });
const editProduct = id => { openRecord(id); listingForm(id); };
let WZ = {g:[]};
function wzDraw() { $("wz_g").innerHTML = WZ.g.length ? WZ.g.map((u,i) => `<div class="gi"><img src="${esc(u)}" alt=""><div>${i===0?'<span class="badge ok">Cover</span>':`<button class="btn ghost sm" onclick="WZ.g.unshift(WZ.g.splice(${i},1)[0]);wzDraw()">Cover</button>`} <button class="btn ghost sm" onclick="WZ.g.splice(${i},1);wzDraw()">X</button></div></div>`).join("") : '<p class="muted">Abhi photo nahi. Neeche Upload dabao.</p>'; }
function wzMargin() { const p = Number($("wz_p").value) || 0, c = (Number($("wz_c").value) || 0) + (Number($("wz_k").value) || 0); $("wz_m").innerHTML = p ? (p - c > 0 ? `<span style="color:var(--ok)">Profit approx ${inr(p - c)} per order (${Math.round((p - c) / p * 100)}%)</span>` : `<span style="color:var(--danger)">Cost price se kam hai, loss hoga</span>`) : ""; }
function productWizard() {
  WZ = {g:[]}; const t = (id, l, r = 2, ph = "") => `<div class="field"><label>${l}</label><textarea id="${id}" rows="${r}" placeholder="${ph}"></textarea></div>`;
  modal(`<h3>Add new product</h3><p class="muted" style="margin-bottom:10px">Ek hi screen. Photos, video, price, details bharo aur Publish dabao.</p>
  <h3 style="font-size:1.1rem">1. Photos</h3><div id="wz_g" class="gal"></div><div class="bar"><label class="btn sm" style="cursor:pointer;margin:0">Upload photos<input id="wz_f" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><div class="field"><input id="wz_u" placeholder="ya image link paste karo (https://)"></div><button class="btn ghost sm" id="wz_a">Add link</button></div>
  ${F("wz_v","Video link (YouTube ya Google Drive, optional)")}
  <h3 style="font-size:1.1rem;margin-top:8px">2. Basic details</h3><div class="row">${F("wz_n","Product name")}${F("wz_cat","Category (e.g. Frames, Lamps)")}${F("wz_occ","Occasion (e.g. Anniversary, Birthday)")}${F("wz_dl","Delivery time (e.g. 5-7 days)")}</div>
  <h3 style="font-size:1.1rem;margin-top:8px">3. Price</h3><div class="row">${F("wz_p","Selling price (₹)","number")}${F("wz_c","Your cost price (₹)","number")}${F("wz_k","Packaging + shipping cost (₹)","number")}</div><p id="wz_m" style="margin:-4px 0 12px"></p>
  <h3 style="font-size:1.1rem">4. Page text</h3>${t("wz_d","Short description (cards par dikhega)",2)}${t("wz_h","Highlights (ek line mein ek point)",4)}${t("wz_l","Full details (ek line = ek paragraph)",4)}
  <div class="row">${F("wz_b","Badge (Bestseller / New / Limited, optional)")}</div><label style="text-transform:none;letter-spacing:0;display:flex;gap:10px;align-items:center;margin:6px 0 14px"><input type="checkbox" id="wz_ft" style="width:auto"> Home page par featured dikhao</label>
  ${canPub() ? '<button class="btn" id="wz_pub">Save &amp; publish live</button> ' : ""}<button class="btn ghost" id="wz_dr">Save as draft</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  wzDraw(); ["wz_p","wz_c","wz_k"].forEach(i => $(i).oninput = wzMargin);
  $("wz_a").onclick = () => { const u = $("wz_u").value.trim(); if (!/^https:\/\//.test(u)) return toast("Link https:// se shuru hona chahiye", true); if (WZ.g.length >= 8) return toast("Maximum 8 photos", true); WZ.g.push(u); $("wz_u").value = ""; wzDraw(); };
  $("wz_f").onchange = e => guarded(async () => { for (const f of [...e.target.files]) { if (WZ.g.length >= 8) { toast("Maximum 8 photos", true); break; } toast("Uploading " + f.name + " ..."); const x = await api("media.create", {mime:"image/jpeg", data: await shrink(f)}); WZ.g.push(x.url); wzDraw(); } e.target.value = ""; toast("Upload ho gaya ✓"); });
  const save = pub => guarded(async () => {
    const v = id => $(id).value.trim(), pl = x => x.split(/\r?\n/).map(y => y.trim()).filter(Boolean).join("\u00b6");
    if (!v("wz_n")) throw new Error("Product name likho"); if (!(Number(v("wz_p")) > 0)) throw new Error("Selling price likho");
    if (pub && !WZ.g.length) throw new Error("Publish ke liye kam se kam 1 photo chahiye"); if (pub && !v("wz_d")) throw new Error("Publish ke liye short description likho");
    const rec = {name:v("wz_n"), category:v("wz_cat"), occasion:v("wz_occ"), delivery_estimate:v("wz_dl"), source_type:"Own listing", selling_price:v("wz_p"), supplier_price:v("wz_c"), packaging_cost:v("wz_k"), public_description:v("wz_d"), highlights:pl($("wz_h").value), long_description:pl($("wz_l").value), gallery_json:JSON.stringify(WZ.g), image_url:WZ.g[0] || "", video_url:v("wz_v"), badge:v("wz_b"), featured:$("wz_ft").checked ? "true" : "false", supplier_id:"OWN", stock_confirmed:"true", quality_verified:"passed"};
    const r = await api("research.create", {record:rec}); if (pub) await publishFlow(r.product_id);
    toast(pub ? "Product website par live ✓" : "Draft save ho gaya ✓"); closeModal(); go("products"); });
  if ($("wz_pub")) $("wz_pub").onclick = () => save(true); $("wz_dr").onclick = () => save(false); }
document.head.insertAdjacentHTML("beforeend", "<style>.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}.pc{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--charcoal)}.pi{aspect-ratio:1;background:var(--charcoal-2);display:grid;place-items:center}.pi img{width:100%;height:100%;object-fit:cover}.pb{padding:12px}</style>");


/* ---- Gifts & Add-ons manager ---- */
const DN = [["Romantic Love Note","Romantic","You make my ordinary days feel extraordinary. I am lucky to have you."],["Cute & Flirty","Cute & Playful","A little surprise for my favourite human. Keep smiling, my love!"],["Deep & Emotional","Emotional","No matter where life takes us, you will always have a special place in my heart."],["Birthday / Anniversary","Birthday / Anniversary","Another beautiful memory with you. Here is to more laughter, love, and adventures together."]].map((a, i) => ({id:"n" + (i + 1), name:a[0], cat:a[1], text:a[2], on:true}));
let ST = null, DIRTY = false, PL = [];
const gP = p => p.split(".").reduce((o, k) => o && o[k], ST);
const setP = (p, v) => { const k = p.split("."); let o = ST; k.slice(0, -1).forEach(x => o = o[x]); o[k[k.length - 1]] = v; DIRTY = true; };
const mvP = (p, i, dir) => { const a = gP(p), j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; DIRTY = true; drawGifts(); };
const delP = (p, i, what) => { if (!confirm(what + " delete karna hai?")) return; gP(p).splice(i, 1); DIRTY = true; drawGifts(); };
const prod = id => PL.find(x => x.id === id);
function drawGifts() {
  const ck = (p, l) => `<label style="text-transform:none;letter-spacing:0;display:flex;gap:10px;align-items:center;margin-bottom:8px"><input type="checkbox" style="width:auto" ${gP(p) ? "checked" : ""} onchange="setP('${p}',this.checked)"> ${l}</label>`;
  const num = (p, l, a, b) => `<div class="field" style="max-width:200px"><label>${l}</label><input type="number" min="${a}" max="${b}" value="${esc(gP(p))}" oninput="setP('${p}',this.value)"></div>`;
  const btns = (p, i, w) => `<button class="btn ghost sm" onclick="mvP('${p}',${i},-1)">&#9650;</button> <button class="btn ghost sm" onclick="mvP('${p}',${i},1)">&#9660;</button> <button class="btn ghost sm" onclick="delP('${p}',${i},'${w}')">Delete</button>`;
  const addSel = (ex, fn) => `<select onchange="${fn}(this.value)"><option value="">+ Product chuno...</option>${PL.filter(p => !ex.includes(p.id)).map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${inr(p.price)}</option>`).join("")}</select>`;
  const label = id => { const p = prod(id); return p ? `${esc(p.name)} <span class="muted">${inr(p.price)}</span>` : `<i>${esc(id)} (live nahi hai)</i>`; };
  const cats = [...new Set(PL.map(p => p.cat).filter(Boolean))], R = ST.rec.map[ST.cur] || (ST.rec.map[ST.cur] = []), A = ST.addons.items;
  const pv = l => l.filter(x => x.on !== false && prod(x.id)).slice(0, 6).map(x => `<span class="badge" style="margin:2px">${esc(prod(x.id).name)} · ${inr(prod(x.id).price)}</span>`).join("") || '<span class="muted">Kuch select nahi (recommendations ke liye same category se auto fallback chalega)</span>';
  $("view").innerHTML = `<p class="muted" style="margin-bottom:14px">Yahan se gift notes, recommendations aur checkout add-ons chalte hain. Sirf <b>live (published)</b> products dikhte hain. Neeche <b>Save</b> dabao.</p>
  <div class="card" style="margin-bottom:18px"><h3>Gift Personalization Settings</h3><div style="margin-top:10px">${ck("g.enabled","Gift note option on karo")}${ck("g.custom","Customer apna message likh sake")}${ck("g.show","Ready templates dikhao")}</div>${num("g.max","Max message length (20 se 300)",20,300)}<p class="muted">Note order ke saath save hota hai. Physical printed card tabhi mention karo jab aap sach mein dete ho; uske liye alag product banao.</p></div>
  <div class="card" style="margin-bottom:18px"><h3>Gift Notes (templates)</h3>${ST.g.list.map((t, i) => `<div class="card" style="margin:10px 0;padding:12px"><div class="row"><div class="field"><label>Name</label><input value="${esc(t.name)}" oninput="setP('g.list.${i}.name',this.value)"></div><div class="field"><label>Category</label><input value="${esc(t.cat || "")}" oninput="setP('g.list.${i}.cat',this.value)"></div></div><div class="field"><label>Message</label><textarea rows="2" oninput="setP('g.list.${i}.text',this.value);document.getElementById('pv${i}').textContent=this.value">${esc(t.text)}</textarea></div><div class="giftcard" id="pv${i}" style="font-size:1rem">${esc(t.text)}</div><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><label style="text-transform:none;letter-spacing:0;display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto" ${t.on !== false ? "checked" : ""} onchange="setP('g.list.${i}.on',this.checked)"> Active</label>${btns("g.list", i, "Ye template")}</div></div>`).join("")}<button class="btn ghost sm" onclick="ST.g.list.push({id:'n'+Date.now(),name:'New template',cat:'',text:'',on:true});DIRTY=true;drawGifts()">+ New template</button></div>
  <div class="card" style="margin-bottom:18px"><h3>Product Recommendations</h3><div class="field" style="max-width:480px"><label>Main product</label><select onchange="ST.cur=this.value;drawGifts()">${PL.map(p => `<option value="${esc(p.id)}" ${p.id === ST.cur ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
  ${R.map((x, i) => `<div class="sl" style="align-items:center;margin:6px 0"><span>${label(x.id)}</span><span style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto" ${x.on !== false ? "checked" : ""} onchange="setP('rec.map.${ST.cur}.${i}.on',this.checked)">${btns("rec.map." + ST.cur, i, "Ye recommendation")}</span></div>`).join("")}
  <div class="field" style="max-width:480px;margin-top:8px">${addSel(R.map(x => x.id).concat(ST.cur), "addRec")}</div>${num("rec.max","Max recommendations dikhao (1 se 6)",1,6)}<p class="muted">Preview:</p><div>${pv(R)}</div></div>
  <div class="card" style="margin-bottom:18px"><h3>Checkout Add-ons</h3><p class="muted" style="margin:6px 0 10px">Customer ko checkout par optional extras dikhte hain. Price hamesha product ki asli price se aata hai. Kuch bhi apne aap add nahi hota.</p>
  ${A.map((x, i) => `<div class="card" style="margin:8px 0;padding:12px"><div class="sl" style="align-items:center"><b>${label(x.id)}</b><span style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto" ${x.on !== false ? "checked" : ""} onchange="setP('addons.items.${i}.on',this.checked)">${btns("addons.items", i, "Ye add-on")}</span></div><div class="field" style="margin-top:8px"><label>Kin products / categories ke saath dikhana hai (khali = sab ke saath)</label><select multiple size="4" onchange="setP('addons.items.${i}.for',[...this.selectedOptions].map(o=>o.value))">${cats.map(c => `<option value="${esc(c)}" ${(x.for || []).includes(c) ? "selected" : ""}>Category: ${esc(c)}</option>`).join("")}${PL.filter(p => p.id !== x.id).map(p => `<option value="${esc(p.id)}" ${(x.for || []).includes(p.id) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div></div>`).join("")}
  <div class="field" style="max-width:480px">${addSel(A.map(x => x.id), "addAddon")}</div>${num("addons.max","Ek baar mein max add-ons (1 se 4)",1,4)}<p class="muted">Preview (checkout par aise dikhenge):</p><div>${pv(A)}</div></div>
  <div class="card" style="margin-bottom:18px"><h3>After-order &amp; Tracking Recommendations</h3><p class="muted" style="margin:6px 0 10px">Order confirmation ("Your Next Special Moment") aur tracking page ("While Your Gift Is On Its Way") par ye products dikhte hain. Khali chhodoge to catalogue ke 3 products apne aap dikhenge. Jo product customer ne abhi khareeda wo nahi dikhta.</p>
  ${ST.after.map((x, i) => `<div class="sl" style="align-items:center;margin:6px 0"><span>${label(x.id)}</span><span style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:auto" ${x.on !== false ? "checked" : ""} onchange="setP('after.${i}.on',this.checked)">${btns("after", i, "Ye product")}</span></div>`).join("")}<div class="field" style="max-width:480px">${addSel(ST.after.map(x => x.id), "addAfter")}</div><p class="muted">Preview:</p><div>${pv(ST.after)}</div></div>
  <button class="btn" onclick="saveGifts()">Save</button> <button class="btn ghost" onclick="DIRTY=false;go('gifts')">Cancel</button>`;
}
const addRec = id => { if (!id) return; (ST.rec.map[ST.cur] = ST.rec.map[ST.cur] || []).push({id, on:true}); DIRTY = true; drawGifts(); };
const addAfter = id => { if (!id) return; ST.after.push({id, on:true}); DIRTY = true; drawGifts(); };
const addAddon = id => { if (!id) return; ST.addons.items.push({id, on:true, for:[]}); DIRTY = true; drawGifts(); };
const saveGifts = () => guarded(async () => {
  const g = ST.g, cl = (v, a, b, f) => Math.max(a, Math.min(b, Math.floor(+v) || f));
  g.max = cl(g.max, 20, 300, 200); ST.rec.max = cl(ST.rec.max, 1, 6, 3); ST.addons.max = cl(ST.addons.max, 1, 4, 2);
  if (g.list.some(t => !String(t.name).trim() || !String(t.text).trim())) throw new Error("Har template ka naam aur message bharo ya use delete karo.");
  g.list.forEach((t, i) => { t.id = t.id || "n" + Date.now() + i; t.text = String(t.text).trim().slice(0, 300); });
  const cur = await api("settings.get"); let d = {}; try { d = JSON.parse(cur.site_json || "{}"); } catch {}
  d.gift = g; d.rec = ST.rec; d.addons = ST.addons; d.after = ST.after;
  await api("settings.set", {key:"site_json", value:JSON.stringify(d)}); try { sessionStorage.removeItem("sr_cfg"); } catch {}
  DIRTY = false; toast("Saved ✓ Website par live ho gaya");
});
