// Runs BACKEND-PATCH-v3.gs against an IN-MEMORY stub of Sheets/Cache/Mail, together with VERBATIM copies of
// the helper functions from the owner's Code.gs. It proves the new logic; it does NOT touch the live sheet.
const vm=require("vm"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const SCHEMA_SRC=`
var SCHEMA={
 ProductResearch:['product_id','name','category','source_type','source_url','image_url','research_date','researcher_id','trend_evidence','target_customer','occasion','selling_price','original_retail_price','supplier_id','supplier_price','moq','stock_confirmed','shipping_cost','packaging_cost','payment_fee_pct','return_allowance_pct','marketing_cost','delivery_estimate','delivery_evidence','ip_concerns','quality_verified','risk_notes','score_relevance','score_trend','score_supplier','score_margin','score_giftability','score_fulfilment','score_total','status','reviewer_notes','checklist_json','published','public_description','created_at','updated_at','gallery_json','video_url','highlights','long_description','badge','featured'],
 Orders:['order_id','created_at','customer_name','phone','email','address','city','state','pin','gift_message','subtotal','discount','shipping','total','payment_status','fulfilment_status','order_status','supplier_ref','tracking_number','delivery_estimate','delivered_at','cancel_reason','refund_total','internal_notes','assigned_to','idempotency_key','is_test','updated_at','coupon_code'],
 OrderItems:['item_id','order_id','product_id','name','qty','unit_price','unit_cost','packaging_cost','shipping_cost','payment_fee'],
 FulfilmentEvents:['event_id','order_id','status','note','actor_id','created_at'],
 ActivityLog:['log_id','ts','actor_id','action','record_ref','before_after'],
 BusinessSettings:['key','value'],
 Reviews:['review_id','product_id','order_id','name','rating','title','body','verified','status','created_at','updated_at'],
 Coupons:['code','type','value','min_order','max_uses','used','expires','active','created_at','updated_at']};
var DEFAULT_SETTINGS={checkout_mode:'DEMO',shipping_flat:'0',store_name:'SHOPROCK',free_shipping_above:'0',upi_id:'',upi_payee_name:'',whatsapp_number:'',site_json:'{}',payment_instructions:'Pay with any UPI app.'};
var PUBLIC_ACTIONS={'public.products':1};
var PERMISSIONS={OWNER:['*'],SUPPORT:['orders.list_limited'],FINANCE:['reports.read']};
// ---- verbatim from Code.gs ----
function newId_(p){return p+'-'+Utilities.getUuid().slice(0,8).toUpperCase();}
function sheet_(n){var sh=SpreadsheetApp.getActive().getSheetByName(n); if(!sh) throw new Error('Run initializeDatabase()'); return sh;}
function readAll_(n){
  var sh=sheet_(n), v=sh.getDataRange().getValues(); if(v.length<2) return [];
  var h=v[0]; return v.slice(1).map(function(r){var o={};h.forEach(function(k,i){o[k]=r[i] instanceof Date?r[i].toISOString():r[i];});return o;});
}
function appendRow_(n,obj){var cols=SCHEMA[n];sheet_(n).appendRow(cols.map(function(c){return obj[c]===undefined?'':obj[c];}));}
function updateRow_(n,keyCol,keyVal,patch){
  var sh=sheet_(n), v=sh.getDataRange().getValues(), h=v[0], ki=h.indexOf(keyCol);
  for (var i=1;i<v.length;i++) if (String(v[i][ki])===String(keyVal)) {
    Object.keys(patch).forEach(function(k){var ci=h.indexOf(k); if(ci>=0) sh.getRange(i+1,ci+1).setValue(patch[k]);});
    var ui=h.indexOf('updated_at'); if(ui>=0&&patch.updated_at===undefined) sh.getRange(i+1,ui+1).setValue(new Date().toISOString());
    return;
  }
  throw new Error('Row not found');
}
function log_(s,action,ref,change){ appendRow_('ActivityLog',{log_id:newId_('LOG'),ts:new Date().toISOString(),actor_id:s?s.user_id:'SYSTEM',action:action,record_ref:ref,before_after:JSON.stringify(change||{}).slice(0,1000)}); }
function logError_(a,e){ console.error('['+a+'] '+(e&&e.message)); }
function fail_(m){var e=new Error(m);e.userMessage=m;throw e;}
function clean_(v){ return typeof v==='string' ? v.replace(/[\\u0000-\\u001f]/g,' ').slice(0,2000) : v; }
function parseJson_(t,d){try{var v=JSON.parse(t);return v===null||v===undefined?d:v;}catch(e){return d;}}
function getSetting_(k){var r=readAll_('BusinessSettings').filter(function(x){return x.key===k;})[0];return r?String(r.value):(DEFAULT_SETTINGS[k]||'');}
function bytesToHex_(bytes){return bytes.map(function(b){return ('0'+((b<0?b+256:b).toString(16))).slice(-2);}).join('');}
function sha_(s){return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s));}
function can_(s, perm){var p=PERMISSIONS[s.role]||[];return p.indexOf('*')>=0||p.indexOf(perm)>=0;}
function need_(s, perm){ if(!can_(s,perm)) fail_('Forbidden'); }
function ratingMap_(){return {};}
function publicProducts_(){
  var RS=ratingMap_();
  return readAll_('ProductResearch').filter(function(r){return r.status==='PUBLISHED' && String(r.published)==='true' && Number(r.selling_price)>0;})
   .map(function(r){return {product_id:r.product_id,name:r.name,category:r.category,price:Number(r.selling_price),image_url:r.image_url,description:r.public_description,occasion:r.occasion,delivery_estimate:r.delivery_estimate,available:true};});
}
function couponFind_(code){ code=String(code||'').trim().toUpperCase(); return readAll_('Coupons').filter(function(c){return String(c.code).toUpperCase()===code;})[0]; }
function couponCheck_(code, subtotal){
  var c=couponFind_(code); if (!c || String(c.active)!=='true') fail_('That coupon code is not valid');
  var mx=Number(c.max_uses)||0; if (mx>0 && (Number(c.used)||0)>=mx) fail_('This coupon has been fully used');
  if (subtotal<(Number(c.min_order)||0)) fail_('Add items worth at least Rs '+c.min_order+' to use this coupon');
  var v=Number(c.value)||0, d=(c.type==='PERCENT')?Math.round(subtotal*Math.min(v,90)/100):v;
  return {code:String(c.code).toUpperCase(), discount:Math.max(0,Math.min(d,subtotal))};
}
function notifyNewOrder_(){}
`;
// ---- in-memory Google stubs ----
const sheets={}; 
const mkSheet=(name)=>{const rows=[];return {name,rows,appendRow(r){rows.push(r.slice())},getDataRange(){return {getValues:()=>rows.map(r=>r.slice())}},setFrozenRows(){},
  getRange(r,c,nr=1,nc=1){return {setValue(v){rows[r-1][c-1]=v},setValues(vs){vs.forEach((row,i)=>row.forEach((v,j)=>{(rows[r-1+i]=rows[r-1+i]||[])[c-1+j]=v}))},getValues:()=>[]}}}};
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=mkSheet(n)};
const cache=new Map(),mails=[];
const sandbox={console,Date,JSON,Math,Number,String,Object,Array,RegExp,Error,isFinite,parseInt,
 SpreadsheetApp:{getActive:()=>ss},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 CacheService:{getScriptCache:()=>({get:k=>cache.has(k)?cache.get(k):null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 MailApp:{sendEmail:m=>mails.push(m)},ScriptApp:{getProjectTriggers:()=>[]},
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:"s"},computeDigest:(a,s)=>[...crypto.createHash("sha256").update(String(s)).digest()].map(b=>b>127?b-256:b)}};
vm.createContext(sandbox);
vm.runInContext(SCHEMA_SRC+fs.readFileSync(path.join(__dirname,"..","BACKEND-PATCH-v3.gs"),"utf8"),sandbox);
const run=c=>vm.runInContext(c,sandbox); sandbox.__t=null;
const sheetWith=(n)=>{sheets[n]=mkSheet(n);sheets[n].appendRow(run("SCHEMA."+n));};
["ProductResearch","Orders","OrderItems","FulfilmentEvents","ActivityLog","BusinessSettings","Reviews","Coupons"].forEach(sheetWith);
const addRow=(n,o)=>run(`appendRow_(${JSON.stringify(n)},${JSON.stringify(o)})`);
const setSet=(k,v)=>{const rs=sheets.BusinessSettings.rows;const i=rs.findIndex(r=>r[0]===k);i>0?rs[i][1]=v:rs.push([k,v]);};
[["P1","Couple Lamp",1299],["P2","Love Box",499],["P3","Roses",799]].forEach(([id,n,p])=>addRow("ProductResearch",{product_id:id,name:n,category:"G",selling_price:p,status:"PUBLISHED",published:true,supplier_price:200,packaging_cost:10,shipping_cost:20,payment_fee_pct:2}));
const site={meta:{P1:{variants:[{id:"warm",label:"Warm white",on:true},{id:"pink",label:"Pink glow",price:1499,on:true},{id:"blue",label:"Blue",available:false,on:true}]}},
 bundles:[{id:"B1",name:"Night in",items:["P1","P2"],price:1599,on:true},{id:"B2",name:"Bad",items:["P1","P3"],price:5000,on:true},{id:"B3",name:"Off",items:["P2","P3"],price:900,on:false}]};
setSet("site_json",JSON.stringify(site)); setSet("checkout_mode","MANUAL"); setSet("upi_id","shop@upi");
addRow("Coupons",{code:"TEN",type:"PERCENT",value:10,min_order:0,max_uses:0,used:0,active:true});
let n=0,f=0;const t=(name,ok,info)=>{ok?n++:f++;console.log((ok?"PASS ":"FAIL ")+name+(!ok&&info!==undefined?" -- "+JSON.stringify(info):""))};
let k=0;const base=()=>({customer_name:"Asha Rao",phone:"9876543210",address:"12 Rose Street Sector 5",city:"Delhi",state:"Delhi",pin:"110001",accepted_policies:true,idempotency_key:"key-"+(++k)+"-abcdefgh"});
const place=(items,extra={})=>sandbox.createOrder_(Object.assign(base(),{items},extra));
const err=fn=>{try{fn();return null}catch(e){return e.userMessage||e.message}};
const lastOrder=()=>{const o=run("readAll_('Orders')");return o[o.length-1]};
let r=place([{product_id:"P1",qty:1,variant:"pink",price:1}]);
t("variant price charged by SERVER (1499), client 'price:1' ignored",r.total===1499,r);
t("order item stores variant label + server unit price",run("readAll_('OrderItems')").pop().name==="Couple Lamp (Pink glow)"&&run("readAll_('OrderItems')").pop().unit_price===1499);
t("variant without own price uses product price",place([{product_id:"P1",qty:2,variant:"warm"}]).total===2598);
t("sold-out variant rejected",/no longer available/.test(err(()=>place([{product_id:"P1",qty:1,variant:"blue"}]))));
t("unknown variant rejected",/no longer available/.test(err(()=>place([{product_id:"P1",qty:1,variant:"zzz"}]))));
r=place([{product_id:"P1",qty:1,bundle:"B1"},{product_id:"P2",qty:1,bundle:"B1"}]);
t("bundle: saving 199 applied when both items tagged (total 1599)",r.total===1599&&lastOrder().discount===199,[r,lastOrder().discount]);
t("bundle: NO saving if one item untagged",place([{product_id:"P1",qty:1,bundle:"B1"},{product_id:"P2",qty:1}]).total===1798);
t("bundle: NO saving if an item is missing",place([{product_id:"P1",qty:1,bundle:"B1"}]).total===1299);
t("bundle: price not below total => no saving",place([{product_id:"P1",qty:1,bundle:"B2"},{product_id:"P3",qty:1,bundle:"B2"}]).total===2098);
t("bundle: switched-off bundle => no saving",place([{product_id:"P2",qty:1,bundle:"B3"},{product_id:"P3",qty:1,bundle:"B3"}]).total===1298);
t("bundle: invented bundle id => no saving",place([{product_id:"P1",qty:1,bundle:"HACK"},{product_id:"P2",qty:1,bundle:"HACK"}]).total===1798);
t("bundle + pink variant: saving uses variant price (1499+499-1599=399)",place([{product_id:"P1",qty:1,variant:"pink",bundle:"B1"},{product_id:"P2",qty:1,bundle:"B1"}]).total===1599);
r=place([{product_id:"P1",qty:1,bundle:"B1"},{product_id:"P2",qty:1,bundle:"B1"}],{coupon_code:"TEN"});
t("coupon applies AFTER bundle saving (1599-160=1439)",r.total===1439,r.total);
t("duplicate product lines rejected",/only once/.test(err(()=>place([{product_id:"P1",qty:1},{product_id:"P1",qty:1}]))));
t("qty 11 rejected",/Invalid quantity/.test(err(()=>place([{product_id:"P1",qty:11}]))));
const before=run("readAll_('Orders')").length, b1=Object.assign(base(),{items:[{product_id:"P2",qty:1}],gift_message:"Happy anniversary my love"});
const a=sandbox.createOrder_(b1),a2=sandbox.createOrder_(b1);
t("idempotency: same key => ONE order",run("readAll_('Orders')").length===before+1);
t("idempotency: repeat returns full payment details (upi, total, duplicate flag)",a2.duplicate===true&&a2.upi_id==="shop@upi"&&a2.total===499&&a2.order_id===a.order_id,a2);
t("gift note saved in Orders.gift_message",lastOrder().gift_message==="Happy anniversary my love");
setSet("checkout_mode","DEMO"); r=place([{product_id:"P2",qty:1}]); t("DEMO mode marks order is_test and mode DEMO",r.mode==="DEMO"&&String(lastOrder().is_test)==="true"); setSet("checkout_mode","MANUAL");
// tracking
const oid=a.order_id; addRow("FulfilmentEvents",{event_id:"E1",order_id:oid,status:"SHIPPED",note:"INTERNAL SECRET",actor_id:"USR-1",created_at:"2026-10-25T10:00:00Z"});
addRow("FulfilmentEvents",{event_id:"E2",order_id:oid,status:"PAID",note:"x",actor_id:"USR-1",created_at:"2026-10-25T09:00:00Z"});
const tr=sandbox.trackOrder_({order_id:oid,phone_last4:"3210"});
t("track: real updates (placed + shipped), unmapped statuses hidden",tr.updates.length===2&&tr.updates[1].status==="Shipped",tr.updates);
t("track: no internal notes / actor ids leaked",!JSON.stringify(tr).includes("INTERNAL")&&!JSON.stringify(tr).includes("USR-1"));
t("track: wrong last4 rejected",err(()=>sandbox.trackOrder_({order_id:oid,phone_last4:"0000"}))==="Order not found");
let blocked=null;for(let i=0;i<12&&!blocked;i++){const e=err(()=>sandbox.trackOrder_({order_id:oid,phone_last4:"1111"}));if(/Too many/.test(e||""))blocked=i}
t("track: brute force gets rate-limited",blocked!==null&&blocked<=10,blocked);
// events
const A=crypto.randomUUID();
t("event: valid recorded (no PII columns)",(sandbox.v3Event_({event:"add_to_cart",anon:A,page:"product.html",product_id:"P1"}),sheets.Events.rows.length===2&&!sheets.Events.rows[0].join().match(/phone|email/)));
t("event: unknown name rejected",err(()=>sandbox.v3Event_({event:"hack",anon:A}))==="Unknown event");
t("event: bad anon id rejected",err(()=>sandbox.v3Event_({event:"wa_click",anon:"x"}))==="Bad id");
// prefs
const P=d=>sandbox.v3Prefs_(d);
t("prefs: consent=false rejected",/Consent is required/.test(err(()=>P({email:"a@b.co",consent:false,dates:[{t:"Birthday",d:"2027-02-14"}]}))));
t("prefs: string 'true' is NOT consent",/Consent is required/.test(err(()=>P({email:"a@b.co",consent:"true",dates:[{t:"Birthday",d:"2027-02-14"}]}))));
t("prefs: bad date rejected",/not valid/.test(err(()=>P({email:"a@b.co",consent:true,dates:[{t:"B",d:"nope"}]}))));
P({email:"A@B.co",consent:true,consent_text:"I agree",dates:[{t:"Birthday",n:"Sam",d:"2027-02-14"}]}); P({email:"a@b.co",consent:true,dates:[{t:"Birthday",d:"2027-02-15"}]});
t("prefs: stored once per email (upsert), consent timestamp set",sheets.Preferences.rows.length===2&&sheets.Preferences.rows[1][1] instanceof Date);
t("optout: flags subscription",(sandbox.v3OptOut_({email:"a@b.co"}),String(sheets.Preferences.rows[1][4])==="true"));
t("optout: unknown email gives same answer (no enumeration)",JSON.stringify(sandbox.v3OptOut_({email:"nobody@x.co"}))==="{}");
// admin
t("report: SUPPORT role forbidden",err(()=>sandbox.v3Route_("analytics.report",{},{role:"SUPPORT"}))==="Forbidden");
t("prefs.list: FINANCE forbidden, only OWNER ok",err(()=>sandbox.v3Route_("prefs.list",{},{role:"FINANCE"}))==="Forbidden"&&sandbox.v3Route_("prefs.list",{},{role:"OWNER"}).rows.length===1);
// report
const orders=sheets.Orders.rows,H=orders[0],pi=H.indexOf("payment_status");
const paidIdx=orders.findIndex((r,i)=>i>0&&String(r[H.indexOf("is_test")])!=="true"); orders[paidIdx][pi]="PAID";
const rep=sandbox.v3Route_("analytics.report",{},{role:"FINANCE"});
const real=orders.slice(1).filter(r=>String(r[H.indexOf("is_test")])!=="true");
t("report: counts real events, excludes DEMO orders",rep.add_to_cart===1&&rep.orders===real.length&&rep.paid_orders===1,rep);
t("report: AOV = average of PAID real orders only",rep.aov===Math.round(Number(orders[paidIdx][H.indexOf("total")])),rep.aov);
t("report: repeat rate null with <10 customers (no fake number)",rep.repeat_pct===null);
// reminders
const d=new Date();d.setDate(d.getDate()+7);const ds=`2027-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
P({email:"c@d.co",consent:true,dates:[{t:"Anniversary",n:"Sam",d:ds}]});P({email:"e@f.co",consent:true,dates:[{t:"Birthday",d:ds}]});sandbox.v3OptOut_({email:"e@f.co"});
sandbox.sendReminders_(); t("reminders: nothing sent without site_url",mails.length===0);
setSet("site_url","https://x.github.io/shoprock/site"); sandbox.sendReminders_();
t("reminders: exactly 1 email, to consenting non-opted-out address, with unsubscribe info",mails.length===1&&mails[0].to==="c@d.co"&&/Unsubscribe/.test(mails[0].body)&&/site\/shop\.html/.test(mails[0].body),mails.map(m=>m.to));
sandbox.sendReminders_(); t("reminders: not sent twice",mails.length===1);
t("router: v3Handles_ only for new actions",run("v3Handles_('public.event')&&v3Handles_('prefs.list')&&!v3Handles_('orders.list')")&&run("PUBLIC_ACTIONS['public.event']===1&&PUBLIC_ACTIONS['prefs.list']===undefined"));

// ---- post-delivery thank-you code ----
cache.clear();
const setO=(oid,patch)=>{const H=sheets.Orders.rows[0],row=sheets.Orders.rows.find(r=>r[0]===oid);Object.keys(patch).forEach(k=>row[H.indexOf(k)]=patch[k])};
const tid=a.order_id, th=()=>sandbox.v3Route_("public.thanksCoupon",{order_id:tid,phone_last4:"3210"},null);
t("thanks: off by default (thanks_percent 0)",/not available/.test(err(th)));
setSet("thanks_percent","10"); setSet("thanks_days","30");
t("thanks: not before delivery",/unlocks once your order is delivered/.test(err(th)));
setO(tid,{order_status:"DELIVERED",payment_status:"PAID"});
const c1=th(); const c2=th();
t("thanks: delivered+paid order gets ONE code (10%, 30 days)",/^THX-[0-9A-F]{8}$/.test(c1.code)&&c1.percent===10&&c1.expires>new Date().toISOString().slice(0,10),c1);
t("thanks: repeat call returns the SAME code (no extra coupons)",c2.code===c1.code&&run("readAll_('Coupons')").filter(c=>String(c.code).startsWith("THX-")).length===1);
t("thanks: wrong last4 rejected",err(()=>sandbox.v3Route_("public.thanksCoupon",{order_id:tid,phone_last4:"9999"},null))==="Order not found");
t("thanks: track shows thanks=true only when eligible",sandbox.trackOrder_({order_id:tid,phone_last4:"3210"}).thanks===true&&sandbox.trackOrder_({order_id:tid,phone_last4:"3210"}).delivered===true);
const demoO=run("readAll_('Orders')").find(o=>String(o.is_test)==='true');setO(demoO.order_id,{order_status:"DELIVERED",payment_status:"PAID"});
t("thanks: demo orders never get a code",/Demo orders/.test(err(()=>sandbox.v3Route_("public.thanksCoupon",{order_id:demoO.order_id,phone_last4:String(demoO.phone).slice(-4)},null))));
const withCode=sandbox.createOrder_(Object.assign(base(),{items:[{product_id:"P2",qty:1}],coupon_code:c1.code}));
t("thanks: code works at checkout (499 - 10% = 449)",withCode.total===449,withCode.total);
t("thanks: code is single-use",/fully used/.test(err(()=>sandbox.createOrder_(Object.assign(base(),{items:[{product_id:"P2",qty:1}],coupon_code:c1.code})))));
setSet("thanks_percent","90"); const o3=place([{product_id:"P2",qty:1}]);setO(o3.order_id,{order_status:"DELIVERED",payment_status:"PAID"});
t("thanks: percent is capped at 30%",sandbox.v3Route_("public.thanksCoupon",{order_id:o3.order_id,phone_last4:"3210"},null).percent===30);
t("thanks: action is public + routed",run("v3Handles_('public.thanksCoupon')&&PUBLIC_ACTIONS['public.thanksCoupon']===1"));
console.log(`\n${n} passed, ${f} failed`);process.exit(f?1:0);
