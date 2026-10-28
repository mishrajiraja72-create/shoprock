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
function randomToken_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
`;
// ---- in-memory Google stubs ----
const sheets={}; 
const mkSheet=(name)=>{const rows=[];return {name,rows,appendRow(r){rows.push(r.slice())},getDataRange(){return {getValues:()=>rows.map(r=>r.slice())}},setFrozenRows(){},
  deleteRow(i){rows.splice(i-1,1)},getLastColumn(){return Math.max(0,...rows.map(r=>r.length))},
  getRange(r,c,nr=1,nc=1){return {getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(rows[r-1+i]||[])[c-1+j]===undefined?'':rows[r-1+i][c-1+j])),setValue(v){(rows[r-1]=rows[r-1]||[])[c-1]=v},setValues(vs){vs.forEach((row,i)=>row.forEach((v,j)=>{(rows[r-1+i]=rows[r-1+i]||[])[c-1+j]=v}))}}}}};
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=mkSheet(n)};
const cache=new Map(),mails=[];
const props={};let gfetch=null,gcalls=0;
const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]===undefined?null:props[k]})},UrlFetchApp:{fetch:(u,o)=>{gcalls++;return gfetch(u,o)}},console,Date,JSON,Math,Number,String,Object,Array,RegExp,Error,isFinite,parseInt,
 SpreadsheetApp:{getActive:()=>ss},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 CacheService:{getScriptCache:()=>({get:k=>cache.has(k)?cache.get(k):null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 MailApp:{sendEmail:(a,b2,c)=>mails.push(typeof a==="string"?{to:a,subject:b2,body:c}:a)},ScriptApp:{getProjectTriggers:()=>[]},
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:"s"},computeDigest:(a,s)=>[...crypto.createHash("sha256").update(String(s)).digest()].map(b=>b>127?b-256:b)}};
vm.createContext(sandbox);
vm.runInContext(SCHEMA_SRC+fs.readFileSync(path.join(__dirname,"..","BACKEND-PATCH-v3.gs"),"utf8")+"\n"+fs.readFileSync(path.join(__dirname,"..","BACKEND-PATCH-v4.gs"),"utf8"),sandbox);
const run=c=>vm.runInContext(c,sandbox); sandbox.__t=null;
const sheetWith=(n)=>{sheets[n]=mkSheet(n);sheets[n].appendRow(run("SCHEMA."+n));};
["ProductResearch","Orders","OrderItems","FulfilmentEvents","ActivityLog","BusinessSettings","Reviews","Coupons"].forEach(sheetWith);
sheets.Orders.rows[0].pop();
const addRow=(n,o)=>run(`appendRow_(${JSON.stringify(n)},${JSON.stringify(o)})`);
const setSet=(k,v)=>{const rs=sheets.BusinessSettings.rows;const i=rs.findIndex(r=>r[0]===k);i>0?rs[i][1]=v:rs.push([k,v]);};
[["P1","Couple Lamp",1299],["P2","Love Box",499],["P3","Roses",799]].forEach(([id,n,p])=>addRow("ProductResearch",{product_id:id,name:n,category:"G",selling_price:p,status:"PUBLISHED",published:true,supplier_price:200,packaging_cost:10,shipping_cost:20,payment_fee_pct:2}));
const site={meta:{P1:{variants:[{id:"warm",label:"Warm white",on:true},{id:"pink",label:"Pink glow",price:1499,on:true},{id:"blue",label:"Blue",available:false,on:true}]}},
 bundles:[{id:"B1",name:"Night in",items:["P1","P2"],price:1599,on:true},{id:"B2",name:"Bad",items:["P1","P3"],price:5000,on:true},{id:"B3",name:"Off",items:["P2","P3"],price:900,on:false}]};
setSet("site_json",JSON.stringify(site)); setSet("checkout_mode","MANUAL"); setSet("upi_id","shop@upi");
addRow("Coupons",{code:"TEN",type:"PERCENT",value:10,min_order:0,max_uses:0,used:0,active:true});
let n=0,f=0;const t=(name,ok,info)=>{ok?n++:f++;console.log((ok?"PASS ":"FAIL ")+name+(!ok&&info!==undefined?" -- "+JSON.stringify(info):""))};
const err=fn=>{try{fn();return null}catch(e){return e.userMessage||e.message}};
const R=(a,b)=>sandbox.v3Route_(a,b,null);
const codeFrom=()=>{const m=mails[mails.length-1];return (m.body.match(/\b(\d{6})\b/)||[])[1]};
const CID="1234567890-abcdefghijklmnop.apps.googleusercontent.com";
const FAKE_JWT="a".repeat(40)+"."+"b".repeat(40)+"."+"c".repeat(40);
const gok=(over={})=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(Object.assign({iss:"https://accounts.google.com",aud:CID,email:"Gina@Gmail.com",email_verified:"true",name:"Gina Rao",exp:String(Math.floor(Date.now()/1000)+3600)},over))});

// ---- config ----
t("config: no GOOGLE_CLIENT_ID => google_client_id empty (button stays hidden)",run("publicConfig_()").google_client_id===""&&run("publicConfig_()").v4===true);
props.GOOGLE_CLIENT_ID="not a client id"; t("config: malformed client id is ignored",run("v4ClientId_()")==="");
props.GOOGLE_CLIENT_ID=CID; t("config: valid client id is published (it is public, not a secret)",run("publicConfig_()").google_client_id===CID);
t("config: v3 fields still present (nothing dropped)",["store_name","whatsapp_number","checkout_mode","site","shipping_flat","v3_pricing","faq"].every(k=>k in run("publicConfig_()")));
t("routing: all new actions are public and handled; old ones still are",["acctGoogle","acctRegisterStart","acctRegisterVerify","acctLogin","acctSetPassword","acctMe","acctSend","acctVerify","acctOrders","acctClaim","acctLogout"].every(a=>run(`v3Handles_('public.${a}')&&PUBLIC_ACTIONS['public.${a}']===1`)));
t("routing: v3 actions still routed after v4 (thanksCoupon, event, preferences)",["thanksCoupon","event","preferences","optout"].every(a=>run(`v3Handles_('public.${a}')`)));

// ---- Google ----
delete props.GOOGLE_CLIENT_ID; t("google: refuses when not configured, never calls Google",err(()=>R("public.acctGoogle",{credential:FAKE_JWT}))==="Google sign-in is not switched on yet."&&gcalls===0);
props.GOOGLE_CLIENT_ID=CID;
t("google: garbage credential rejected before any network call",err(()=>R("public.acctGoogle",{credential:"x"}))&&err(()=>R("public.acctGoogle",{credential:"<script>"+"a".repeat(200)}))&&gcalls===0);
gfetch=u=>{ if(!u.startsWith("https://oauth2.googleapis.com/tokeninfo?id_token=")) throw new Error("wrong url"); return gok(); };
const g1=R("public.acctGoogle",{credential:FAKE_JWT});
t("google: valid token => session for the lower-cased VERIFIED email, name kept",/^[0-9a-f]{64}$/.test(g1.token)&&g1.email==="gina@gmail.com"&&g1.name==="Gina Rao",g1);
t("google: account row created with provider 'google'; session stored only as hash",sheets.CustAccounts.rows.length===2&&sheets.CustAccounts.rows[1][4]==="google"&&!JSON.stringify(sheets.CustSessions.rows).includes(g1.token));
t("google: credential is never stored",!JSON.stringify(sheets).includes(FAKE_JWT.slice(0,30)));
const g2=R("public.acctGoogle",{credential:FAKE_JWT});
t("google: signing in again does NOT create a duplicate account",sheets.CustAccounts.rows.length===2&&g2.token!==g1.token);
const bads=[["wrong audience (token made for another app)",{aud:"999-zzz.apps.googleusercontent.com"}],["wrong issuer",{iss:"evil.example.com"}],["email not verified",{email_verified:"false"}],["expired",{exp:String(Math.floor(Date.now()/1000)-10)}],["no email",{email:""}]];
bads.forEach(([nm,o])=>{gfetch=()=>gok(o);t("google: rejects "+nm,err(()=>R("public.acctGoogle",{credential:FAKE_JWT}))==="Google sign-in could not be verified. Please try again.");});
gfetch=()=>({getResponseCode:()=>400,getContentText:()=>'{"error":"invalid_token"}'}); t("google: Google says invalid => rejected",err(()=>R("public.acctGoogle",{credential:FAKE_JWT}))==="Google sign-in could not be verified. Please try again.");
gfetch=()=>{throw new Error("network")}; t("google: network failure => friendly message",err(()=>R("public.acctGoogle",{credential:FAKE_JWT}))==="Could not reach Google right now. Please try again.");
// Google user sees ONLY their own orders (matched on verified email)
const ord=(email,pid)=>sandbox.createOrder_({customer_name:"Gina Rao",phone:"9876543210",email,address:"12 Rose Street Sector 5",city:"Delhi",state:"Delhi",pin:"110001",accepted_policies:true,idempotency_key:"k-"+Math.random().toString(36).slice(2)+"-abcdefgh",items:[{product_id:pid,qty:1}]});
const gOrder=ord("gina@gmail.com","P2").order_id, otherOrder=ord("someone@else.com","P3").order_id;
gfetch=()=>gok(); const gs=R("public.acctGoogle",{credential:FAKE_JWT}); const gl=R("public.acctOrders",{token:gs.token});
t("google: account page lists my order, never another customer's",gl.some(o=>o.order_id===gOrder)&&!gl.some(o=>o.order_id===otherOrder),gl.map(o=>o.order_id));
const me=R("public.acctMe",{token:gs.token}); t("acctMe: details for a Google account",me.email==="gina@gmail.com"&&me.name==="Gina Rao"&&me.providers.includes("google")&&me.has_password===false,me);
t("acctMe: bad token refused",err(()=>R("public.acctMe",{token:"x".repeat(64)}))==="Please sign in again.");

// ---- email + password ----
cache.clear();
t("register: short password rejected",err(()=>R("public.acctRegisterStart",{email:"pat@x.co",password:"short"}))==="Password must be at least 8 characters.");
t("register: bad email rejected",/valid email/.test(err(()=>R("public.acctRegisterStart",{email:"nope",password:"longenough1"}))||""));
const m0=mails.length; R("public.acctRegisterStart",{email:"Pat@X.co",password:"correct horse 9"});
const rc=codeFrom();
t("register: confirmation code emailed to the (lower-cased) address",mails.length===m0+1&&mails[m0].to==="pat@x.co"&&/^\d{6}$/.test(rc));
t("register: NO account exists until the code is confirmed",sheets.CustAccounts.rows.every(r=>r[0]!=="pat@x.co"));
t("register: neither the password nor the code is stored in plain text",!JSON.stringify(sheets.CustPending.rows).includes("correct horse 9")&&!JSON.stringify(sheets.CustPending.rows).includes(rc));
t("register: wrong code rejected, still no account",/not valid or has expired/.test(err(()=>R("public.acctRegisterVerify",{email:"pat@x.co",code:"000000"}))||"")&&sheets.CustAccounts.rows.every(r=>r[0]!=="pat@x.co"));
const rv=R("public.acctRegisterVerify",{email:"pat@x.co",code:rc});
t("register: right code creates the account and signs in",/^[0-9a-f]{64}$/.test(rv.token)&&rv.email==="pat@x.co"&&sheets.CustAccounts.rows.some(r=>r[0]==="pat@x.co"&&r[4]==="password"));
t("register: stored hash is not the password",!JSON.stringify(sheets.CustAccounts.rows).includes("correct horse 9"));
t("register: a code works ONCE",/not valid or has expired/.test(err(()=>R("public.acctRegisterVerify",{email:"pat@x.co",code:rc}))||""));
cache.clear(); const m1=mails.length; const dup=R("public.acctRegisterStart",{email:"pat@x.co",password:"another pass 9"});
t("register: existing email gets the SAME answer, no email sent, password NOT changed (no takeover)",dup.sent===true&&mails.length===m1&&!!R("public.acctLogin",{email:"pat@x.co",password:"correct horse 9"}).token);
// 5 wrong code guesses kill the pending registration
cache.clear(); R("public.acctRegisterStart",{email:"quinn@x.co",password:"quinn pass 99"}); const qc=codeFrom(); for(let i=0;i<5;i++) err(()=>R("public.acctRegisterVerify",{email:"quinn@x.co",code:"111111"}));
t("register: 5 wrong guesses kill the code (right one then fails)",/not valid or has expired/.test(err(()=>R("public.acctRegisterVerify",{email:"quinn@x.co",code:qc}))||""));
cache.clear(); R("public.acctRegisterStart",{email:"ria@x.co",password:"ria pass 999"}); const ric=codeFrom(); sheets.CustPending.rows[sheets.CustPending.rows.findIndex(r=>r[0]==="ria@x.co")][4]=new Date(Date.now()-1000).toISOString();
t("register: expired code rejected",/not valid or has expired/.test(err(()=>R("public.acctRegisterVerify",{email:"ria@x.co",code:ric}))||""));
t("register: start is rate limited (3/hour/email)",(()=>{cache.clear();let hit=null;for(let i=0;i<5&&hit===null;i++){const e=err(()=>R("public.acctRegisterStart",{email:"spam@x.co",password:"spammer pass1"}));if(/Too many/.test(e||""))hit=i}return hit===3})());

cache.clear();
const li=R("public.acctLogin",{email:"PAT@x.co",password:"correct horse 9"});
t("login: right password (any email casing) => session",/^[0-9a-f]{64}$/.test(li.token)&&li.email==="pat@x.co");
const E1=err(()=>R("public.acctLogin",{email:"pat@x.co",password:"wrong password"})), E2=err(()=>R("public.acctLogin",{email:"nobody@x.co",password:"wrong password"}));
t("login: wrong password and unknown email give the SAME message (no account enumeration)",E1==="Email or password is incorrect."&&E1===E2,[E1,E2]);
t("login: Google-only account (no password) cannot be entered with a guessed password",(()=>{cache.clear();return err(()=>R("public.acctLogin",{email:"gina@gmail.com",password:"guess guess 1"}))==="Email or password is incorrect."})());
cache.clear(); let lk=null; for(let i=0;i<12&&lk===null;i++){const e=err(()=>R("public.acctLogin",{email:"pat@x.co",password:"bad guess "+i}));if(/Too many/.test(e||""))lk=i}
t("login: brute force is rate limited (8 tries / 15 min)",lk===8,lk);
cache.clear(); const li2=R("public.acctLogin",{email:"pat@x.co",password:"correct horse 9"});
t("login: session works for acctOrders and acctMe; has_password true",Array.isArray(R("public.acctOrders",{token:li2.token}))&&R("public.acctMe",{token:li2.token}).has_password===true);
R("public.acctLogout",{token:li2.token}); t("logout: token dies",err(()=>R("public.acctOrders",{token:li2.token}))==="Please sign in again.");

// ---- forgot password: code to an account email (no order needed), then set a new password ----
cache.clear(); const m2=mails.length; R("public.acctSend",{email:"pat@x.co"});
t("forgot: account email (no orders) now receives a sign-in code",mails.length===m2+1&&/^\d{6}$/.test(codeFrom()));
const fv=R("public.acctVerify",{email:"pat@x.co",code:codeFrom()});
t("forgot: weak new password refused",err(()=>R("public.acctSetPassword",{token:fv.token,password:"abc"}))==="Password must be at least 8 characters.");
R("public.acctSetPassword",{token:fv.token,password:"brand new pass 7"});
cache.clear();
t("forgot: old password stops working, new one works",err(()=>R("public.acctLogin",{email:"pat@x.co",password:"correct horse 9"}))==="Email or password is incorrect."&&!!R("public.acctLogin",{email:"pat@x.co",password:"brand new pass 7"}).token);
t("setPassword: needs a valid session",err(()=>R("public.acctSetPassword",{token:"x".repeat(64),password:"whatever pass 1"}))==="Please sign in again.");
cache.clear(); const m3=mails.length; R("public.acctSend",{email:"stranger@nowhere.co"});
t("forgot: unknown email: same answer, nothing sent",mails.length===m3);
// Google user can add a password later (so email+password also works for them)
gfetch=()=>gok(); const gs2=R("public.acctGoogle",{credential:FAKE_JWT}); R("public.acctSetPassword",{token:gs2.token,password:"gina own pass 5"}); cache.clear();
t("Google user can add a password and log in with it; name kept",R("public.acctLogin",{email:"gina@gmail.com",password:"gina own pass 5"}).name==="Gina Rao"&&R("public.acctMe",{token:gs2.token}).providers.sort().join()==="google,password");
t("patch is safe to paste twice: still routes after re-running v4",(()=>{vm.runInContext(require("fs").readFileSync(require("path").join(__dirname,"..","BACKEND-PATCH-v4.gs"),"utf8"),sandbox);return run("v3Handles_('public.acctLogin')")})());
console.log(`\n${n} passed, ${f} failed`);process.exit(f?1:0);
