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
  ["overview","Overview"],["research","Product research"],["approvals","Approvals"],["catalogue","Catalogue"],["suppliers","Suppliers"],
  ["orders","Orders"],["refunds","Payments & refunds"],["tasks","Tasks"],["team","Team"],["reports","Reports"],["activity","Activity log"],["settings","Settings"],["pricing","Pricing calculator"]
];
const ROLE_MENU = { // convenience only; server is the authority
  OWNER: MENU.map(m=>m[0]), RESEARCHER:["research","suppliers","tasks","pricing"], REVIEWER:["research","approvals","catalogue","suppliers","tasks","activity","pricing"],
  ORDER_OPS:["orders","suppliers","tasks"], SUPPORT:["orders","tasks"], FINANCE:["overview","orders","refunds","reports","activity","pricing"]
};

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
    $("view").innerHTML = l.length ? table([["ID",r=>esc(r.product_id)],["Name",r=>esc(r.name)],["Price",r=>inr(r.selling_price)],["Status",r=>badge(r.status)],["",r=>`<button class="btn ghost sm" onclick="openRecord('${esc(r.product_id)}')">Open</button>`]], l) : empty("No approved or published products yet."); },

  async suppliers() { const l = await api("suppliers.list");
    $("view").innerHTML = `<div class="bar"><button class="btn sm" onclick="supplierForm()">Add supplier</button></div>` + (l.length ? table([["ID",r=>esc(r.supplier_id)],["Name",r=>esc(r.name)],["Fulfilment",r=>esc(r.fulfilment_method)],["Delivery",r=>esc(r.delivery_estimate)],["Quality",r=>esc(r.quality_status)],["Verified",r=>esc(String(r.last_verified).slice(0,10))]], l) : empty("No suppliers yet.")); },

  async orders() { let l; try { l = await api("orders.list"); } catch { l = await api("orders.listLimited"); }
    $("view").innerHTML = (l.length ? table([["Order",r=>esc(r.order_id)],["Date",r=>esc(String(r.created_at).slice(0,10))],["Customer",r=>esc(r.customer_name)],["City",r=>esc(r.city)],["Total",r=>r.total===undefined?"—":inr(r.total)],["Payment",r=>r.payment_status?badge(r.payment_status):"—"],["Status",r=>badge(r.order_status)],["Tracking",r=>esc(r.tracking_number||"")],["Demo",r=>String(r.is_test)==="true"?"TEST":""],["",r=>`<button class="btn ghost sm" onclick="orderForm('${esc(r.order_id)}')">Update</button>`]], l) : empty("No orders yet.")) +
      `<div class="bar" style="margin-top:12px"><button class="btn ghost sm" onclick="exportSheet('Orders')">Export CSV</button></div>`; },
  async refunds() { $("view").innerHTML = `<p class="muted" style="margin-bottom:12px">Refunds are recorded here as a tracked manual process. Issue the actual payment-gateway refund in the gateway dashboard, then record it.</p><button class="btn sm" onclick="refundForm()">Record refund</button> <button class="btn ghost sm" onclick="exportSheet('Refunds')">Export CSV</button>`; },

  async tasks() { const l = await api("tasks.list"), now = new Date().toISOString().slice(0,10);
    $("view").innerHTML = (S.user.role==="OWNER" ? `<button class="btn sm" onclick="taskForm()" style="margin-bottom:12px">New task</button>` : "") + (l.length ? table([["Title",r=>esc(r.title)],["Priority",r=>esc(r.priority)],["Due",r=>esc(String(r.due_date).slice(0,10))+(r.due_date&&String(r.due_date).slice(0,10)<now&&r.status!=="COMPLETED"?" "+badge("OVERDUE"):"")],["Status",r=>`<select onchange="setTask('${esc(r.task_id)}',this.value)">${["TODO","IN_PROGRESS","REVIEW","COMPLETED","BLOCKED"].map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}</select>`]], l) : empty("No tasks assigned.")); },
  async team() { const l = await api("users.list");
    $("view").innerHTML = `<button class="btn sm" onclick="userForm()" style="margin-bottom:12px">Add member</button>` + table([["Name",r=>esc(r.name)],["Email",r=>esc(r.email)],["Role",r=>`<select onchange="setUser('${esc(r.user_id)}',{role:this.value})">${["OWNER","RESEARCHER","REVIEWER","ORDER_OPS","SUPPORT","FINANCE"].map(s=>`<option ${s===r.role?"selected":""}>${s}</option>`).join("")}</select>`],["Active",r=>`<button class="btn ghost sm" onclick="setUser('${esc(r.user_id)}',{active:${String(r.active)!=="true"}})">${String(r.active)==="true"?"Deactivate":"Activate"}</button>`]], l); },
  async reports() { $("view").innerHTML = `<div class="bar"><div class="field"><label>From</label><input type="date" id="rf"></div><div class="field"><label>To</label><input type="date" id="rt"></div><button class="btn sm" id="rr">Run</button></div><div id="rout"></div>`;
    $("rr").onclick = async () => { const r = await api("reports.summary", {from:$("rf").value||null, to:$("rt").value?$("rt").value+"T23:59:59":null});
      $("rout").innerHTML = `<pre style="white-space:pre-wrap" class="card">${esc(JSON.stringify(r, null, 2))}</pre><p class="muted">Figures are actuals from recorded paid orders; items with no unit cost make profit incomplete. Product-level estimates live on the research board.</p>`; }; },
  async activity() { const l = await api("activity.list"); $("view").innerHTML = l.length ? table([["Time",r=>esc(String(r.ts).replace("T"," ").slice(0,16))],["Actor",r=>esc(r.actor_id)],["Action",r=>esc(r.action)],["Record",r=>esc(r.record_ref)],["Change",r=>esc(String(r.before_after).slice(0,80))]], l) : empty("No activity yet."); },
  async settings() { const s = await api("settings.get");
    $("view").innerHTML = table([["Setting",r=>esc(r[0])],["Value",r=>`<input value="${esc(r[1])}" style="min-width:260px" onchange="saveSetting('${esc(r[0])}',this.value)">`]], Object.entries(s)) + `<p class="muted" style="margin-top:12px">checkout_mode stays DEMO until gateway keys are in Script Properties. LIVE is refused otherwise.</p>`; },
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
  <div class="row">${[["supplier_id","Supplier ID"],["supplier_price","Supplier price"],["selling_price","Selling price"],["packaging_cost","Packaging"],["shipping_cost","Shipping"],["payment_fee_pct","Fee %"],["return_allowance_pct","Returns %"],["marketing_cost","Marketing"],["image_url","Image URL"],["delivery_estimate","Delivery estimate"],["stock_confirmed","Stock confirmed (true/false)"],["quality_verified","Quality (passed/failed/pending)"],["public_description","Customer-facing description"],["risk_notes","Risk notes"],["ip_concerns","IP concerns"],["reviewer_notes","Reviewer notes"]].map(([k,l])=>`<div class="field"><label>${l}</label><input data-f="${k}" value="${esc(r[k])}"></div>`).join("")}</div>
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
function userForm() { modal(`<h3>Add team member</h3>${F("u_n","Name")}${F("u_e","Email","email")}<div class="field"><label>Role</label><select id="u_r">${["RESEARCHER","REVIEWER","ORDER_OPS","SUPPORT","FINANCE","OWNER"].map(s=>`<option>${s}</option>`).join("")}</select></div><button class="btn" id="u_go">Create</button> <button class="btn ghost" onclick="closeModal()">Cancel</button>`);
  $("u_go").onclick = () => guarded(async () => { const r = await api("users.create", {name:$("u_n").value,email:$("u_e").value,role:$("u_r").value}); modal(`<h3>Member created</h3><p>Temporary password (shown once — share privately):</p><pre class="card">${esc(r.temp_password)}</pre><button class="btn" onclick="closeModal();go('team')">Done</button>`); }); }
const setUser = (id, patch) => guarded(async () => { await api("users.update", {user_id:id, ...patch}); toast("Updated"); go("team"); });
const saveSetting = (key, value) => guarded(async () => { await api("settings.set", {key, value}); toast("Saved"); });
const exportSheet = sheet => guarded(async () => { csvDownload(sheet + ".csv", await api("export.csv", {sheet})); });

if (S && S.token) start();
