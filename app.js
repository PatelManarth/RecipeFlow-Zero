(function(){
"use strict";
var VERSION="0.5.1";
var SCHEMA=5;
var scope="guest";
var cloudStatus={mode:"local",email:"",message:"Local mode",lastSync:""};
var state=null;
var DEFAULTS={
  version:SCHEMA,
  meta:{updatedAt:0},
  recipes:[],
  plan:{},
  pantry:["salt","pepper","olive oil"],
  groceries:[],
  checks:{},
  prices:{},
  profile:{age:25,sex:"male",heightCm:170,weightKg:70,goalWeightKg:65,activity:"light",goal:"lose",weeklyChangeKg:0.4},
  prefs:{dietary:["vegetarian"],allergies:[],dislikes:[],likes:[],cuisines:["Indian","Mediterranean","Italian"],mealsPerDay:3,maxCookMinutes:40,leftovers:true,mealPrep:true},
  settings:{calories:2000,protein:120,carbs:220,fat:70,currency:"CAD",weeklyBudget:80}
};
function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function clone(x){return JSON.parse(JSON.stringify(x))}
function merge(base,value){
  if(Array.isArray(base))return Array.isArray(value)?value.slice():base.slice();
  if(base&&typeof base==="object"){
    var out={};Object.keys(base).forEach(function(k){out[k]=merge(base[k],value&&value[k])});
    if(value&&typeof value==="object")Object.keys(value).forEach(function(k){if(!(k in out))out[k]=clone(value[k])});
    return out;
  }
  return value===undefined||value===null?base:value;
}
function cleanState(x){x=merge(DEFAULTS,x||{});if(x.settings){delete x.settings.supabaseUrl;delete x.settings.supabaseKey;delete x.settings.workerUrl;delete x.settings.email}return x}
function fresh(){return clone(DEFAULTS)}
function keyFor(s){return "rfz-v5:"+s}
function meaningful(x){
  return !!(x&&((x.recipes&&x.recipes.length)||(x.groceries&&x.groceries.length)||(x.plan&&Object.keys(x.plan).length)||(x.meta&&x.meta.updatedAt>0)));
}
function loadKey(k){
  try{var raw=localStorage.getItem(k);return raw?cleanState(JSON.parse(raw)):null}catch(e){return null}
}
function migrateLegacy(){
  try{
    var old=localStorage.getItem("rfz-v4");
    if(!old)return null;
    var x=cleanState(JSON.parse(old));
    if(meaningful(x)&&!x.meta.updatedAt)x.meta.updatedAt=Date.now();
    return x;
  }catch(e){return null}
}
function persist(noEvent){
  try{localStorage.setItem(keyFor(scope),JSON.stringify(state))}catch(e){showRuntime("Local save failed: "+e.message)}
  if(!noEvent)window.dispatchEvent(new CustomEvent("recipeflow:statechanged",{detail:{scope:scope,updatedAt:state.meta.updatedAt}}));
}
function markChanged(){state.meta.updatedAt=Date.now();state.version=SCHEMA;persist(false)}
function replaceState(next,opts){
  state=cleanState(next||{});
  state.version=SCHEMA;
  if(opts&&opts.scope)scope=opts.scope;
  persist(true);
  render(currentPage());
}
function activateUser(userId){
  var target=userId?"user:"+userId:"guest";
  if(target===scope)return {hadCache:true,migrated:false};
  var cached=loadKey(keyFor(target)),migrated=false;
  if(!cached&&userId){
    var guest=loadKey(keyFor("guest"));
    if(meaningful(guest)){cached=guest;migrated=true}
  }
  scope=target;state=cached||fresh();persist(true);render(currentPage());
  return {hadCache:!!cached,migrated:migrated};
}
function esc(s){return String(s===undefined||s===null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function uid(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():"rfz-"+Date.now()+"-"+Math.random().toString(36).slice(2)}
function csv(v){return String(v||"").split(",").map(function(x){return x.trim()}).filter(Boolean)}
function money(n){try{return new Intl.NumberFormat(undefined,{style:"currency",currency:state.settings.currency||"CAD"}).format(Number(n)||0)}catch(e){return "$"+(Number(n)||0).toFixed(2)}}
function currentPage(){var h=(location.hash||"#home").slice(1).split("?")[0];return["home","recipes","plan","groceries","ai","settings"].indexOf(h)>=0?h:"home"}
function go(name){if(location.hash!=="#"+name)location.hash=name;else render(name)}
function showRuntime(msg){var e=q("#runtime-error");if(e){e.hidden=false;e.textContent=msg}}
function toast(msg){var t=q("#toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2600)}
function setCloudStatus(next){cloudStatus=Object.assign({},cloudStatus,next||{});renderAccountPill();if(currentPage()==="settings")render("settings")}
function renderAccountPill(){var p=q("#account-pill");if(!p)return;p.textContent=cloudStatus.email?cloudStatus.email:(cloudStatus.mode==="cloud"?"Cloud":"Local");p.title=cloudStatus.message||""}
function getSiteConfig(){return window.RECIPEFLOW_CONFIG||{}}
function getLocalConnection(){try{return JSON.parse(localStorage.getItem("rfz-connection")||"{}")}catch(e){return{}}}
function getConnectionConfig(){var s=getSiteConfig(),l=getLocalConnection();return{supabaseUrl:l.supabaseUrl||s.supabaseUrl||"",supabaseKey:l.supabaseKey||s.supabaseKey||"",workerUrl:l.workerUrl||s.workerUrl||"",aiModelF16:s.aiModelF16,aiModelF32:s.aiModelF32}}
function forbiddenKey(k){
  if(!k)return false;
  if(/^sb_secret_/i.test(k)||/service_role/i.test(k))return true;
  if(/^eyJ/.test(k)){
    try{
      var part=k.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
      while(part.length%4)part+="=";
      var payload=JSON.parse(atob(part));
      if(payload.role==="service_role")return true;
    }catch(e){}
  }
  return false;
}
function saveConnectionConfig(c){
  if(forbiddenKey(c.supabaseKey))throw new Error("Secret/service-role Supabase keys are blocked. Use a publishable key.");
  localStorage.setItem("rfz-connection",JSON.stringify({supabaseUrl:c.supabaseUrl||"",supabaseKey:c.supabaseKey||"",workerUrl:c.workerUrl||""}));
  window.dispatchEvent(new CustomEvent("recipeflow:configchanged"));
}
function targets(){
  var p=state.profile,w=Number(p.weightKg),h=Number(p.heightCm),a=Number(p.age);
  if(!w||!h||!a)return null;
  var add=p.sex==="female"?-161:p.sex==="male"?5:-78;
  var bmr=10*w+6.25*h-5*a+add;
  var mult={sedentary:1.2,light:1.375,moderate:1.55,very:1.725,extra:1.9}[p.activity]||1.375;
  var maintenance=Math.round(bmr*mult),delta=0;
  if(p.goal==="lose")delta=-Math.min(750,Math.max(150,(Number(p.weeklyChangeKg)||0.4)*1100));
  if(p.goal==="gain")delta=Math.min(500,Math.max(100,(Number(p.weeklyChangeKg)||0.25)*1100));
  var calories=Math.round(maintenance+delta);
  if(p.goal==="lose")calories=Math.max(p.sex==="female"?1200:1500,calories);
  var protein=Math.round(w*(p.goal==="lose"?1.6:1.4));
  var fat=Math.round(Math.max(w*0.7,calories*0.25/9));
  var carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
  return{bmr:Math.round(bmr),maintenance:maintenance,calories:calories,protein:protein,fat:fat,carbs:carbs};
}
function parseIng(line){
  var s=String(line||"").trim(),m=s.match(/^([\d.\/]+)?\s*([a-zA-Z]+)?\s*(.*)$/),qty=0;
  if(m&&m[1]){if(m[1].indexOf("/")>0){var z=m[1].split("/");qty=Number(z[0])/Number(z[1])}else qty=Number(m[1])||0}
  return{qty:qty,unit:m&&m[2]?m[2]:"",name:m&&m[3]?m[3]:s};
}
function recipeCal(r){return Number(r&&r.nutrition&&r.nutrition.calories)||0}
function allowed(r){
  var hay=[r.title].concat(r.tags||[]).concat((r.ingredients||[]).map(function(i){return i.name||i})).join(" ").toLowerCase();
  return !state.prefs.allergies.some(function(x){return hay.indexOf(String(x).toLowerCase())>=0})&&!state.prefs.dislikes.some(function(x){return hay.indexOf(String(x).toLowerCase())>=0});
}
function monday(){
  var d=new Date(),day=d.getDay(),diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);d.setHours(12,0,0,0);return d
}
function iso(d){return d.toISOString().slice(0,10)}
function generatePlan(){
  var rs=state.recipes.filter(allowed);
  if(!rs.length){toast("Add at least one recipe that matches your restrictions.");return}
  var shares=[0.28,0.34,0.38],base=monday(),plan={};
  for(var i=0;i<7;i++){
    var d=new Date(base);d.setDate(base.getDate()+i);var k=iso(d);plan[k]=[];
    for(var m=0;m<Math.min(3,state.prefs.mealsPerDay||3);m++){
      var target=state.settings.calories*shares[m],rank=rs.slice().sort(function(a,b){
        var ac=recipeCal(a)||target,bc=recipeCal(b)||target;
        return Math.abs(ac-target)-Math.abs(bc-target);
      });
      plan[k].push(rank[(i+m)%rank.length].id);
    }
  }
  state.plan=plan;markChanged();toast("Week generated.");
}
function groceryFromPlan(){
  var map={};
  Object.keys(state.plan||{}).forEach(function(k){
    (state.plan[k]||[]).forEach(function(id){
      var r=state.recipes.find(function(x){return x.id===id});
      (r&&r.ingredients||[]).forEach(function(i){
        var obj=typeof i==="string"?parseIng(i):i,name=String(obj.name||"").trim();
        if(!name)return;
        if(state.pantry.some(function(p){return name.toLowerCase().indexOf(String(p).toLowerCase())>=0}))return;
        var mk=name.toLowerCase()+"|"+(obj.unit||"");
        if(!map[mk])map[mk]={name:name,qty:0,unit:obj.unit||""};
        map[mk].qty+=Number(obj.qty)||0;
      });
    });
  });
  return Object.keys(map).map(function(k){return map[k]});
}
function home(){
  var t=targets();
  return '<div class="page-head"><div><div class="eyebrow">RecipeFlow Zero · v'+VERSION+'</div><h1>Your food, synced and planned.</h1></div></div>'+
  '<section class="hero"><div class="hero-card"><h2>Local-first on iPhone. Cloud-synced when you sign in.</h2><p>Recipes, goals, preferences, plans, groceries, pantry and settings remain usable even if AI or cloud services are unavailable.</p><div class="row wrap"><button class="btn primary" data-action="generate">Generate week</button><button class="btn" data-nav="recipes">Add/import recipe</button></div></div></section>'+
  '<div class="grid"><div class="card"><h3>Daily target</h3><h2>'+state.settings.calories+' kcal</h2><p>'+state.settings.protein+'g protein · '+state.settings.carbs+'g carbs · '+state.settings.fat+'g fat</p></div>'+
  '<div class="card"><h3>Recipes</h3><h2>'+state.recipes.length+'</h2><p>saved recipes</p></div>'+
  '<div class="card"><h3>Sync</h3><h2>'+esc(cloudStatus.mode==="cloud"?"Cloud ready":"Local ready")+'</h2><p>'+esc(cloudStatus.message)+'</p></div></div>'+
  (t?'<section class="card section"><h3>Profile estimate</h3><p>Estimated maintenance: <b>'+t.maintenance+' kcal/day</b>. Suggested target: <b>'+t.calories+' kcal/day</b>.</p><button class="btn accent" data-action="apply-targets">Apply suggested targets</button></section>':'');
}
function recipes(){
  var cards=state.recipes.map(function(r){
    return '<article class="card"><h3>'+esc(r.title)+'</h3><p>'+(recipeCal(r)||"?")+' kcal · '+(Number(r.nutrition&&r.nutrition.protein)||"?")+'g protein</p><p class="muted">'+esc((r.tags||[]).join(" · "))+'</p><button class="btn small" data-delete-recipe="'+esc(r.id)+'">Delete</button></article>';
  }).join("");
  return '<div class="page-head"><h1>Recipes</h1></div><div class="row wrap"><button class="btn primary" data-action="add-recipe">＋ Add recipe</button><button class="btn accent" data-action="smart-import">✦ Smart import</button></div><div class="recipe-grid section">'+(cards||'<div class="empty card">Add recipes to unlock automatic planning and groceries.</div>')+'</div>';
}
function plan(){
  var base=monday(),html="";
  for(var i=0;i<7;i++){
    var d=new Date(base);d.setDate(base.getDate()+i);var ids=state.plan[iso(d)]||[];
    html+='<section class="day"><h3>'+d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})+'</h3>';
    ids.forEach(function(id){var r=state.recipes.find(function(x){return x.id===id});html+='<div class="meal-slot"><b>'+esc(r?r.title:"Missing recipe")+'</b></div>'});
    if(!ids.length)html+='<div class="meal-slot muted">Not planned</div>';
    html+='</section>';
  }
  return '<div class="page-head"><h1>Meal Plan</h1></div><div class="row wrap"><button class="btn accent" data-action="generate">✦ Generate my week</button><button class="btn" data-action="clear-plan">Clear</button></div><div class="week section">'+html+'</div>';
}
function groceries(){
  var auto=groceryFromPlan(),manual=state.groceries||[],items=auto.concat(manual);
  var rows=items.map(function(x,i){
    var obj=typeof x==="string"?{name:x,qty:0,unit:""}:x,key=(obj.name||"")+"|"+i;
    return '<li><label><input type="checkbox" data-grocery-check="'+esc(key)+'" '+(state.checks[key]?"checked":"")+'> '+(obj.qty?Math.round(obj.qty*100)/100+" "+esc(obj.unit)+" ":"")+esc(obj.name)+'</label></li>';
  }).join("");
  return '<div class="page-head"><h1>Groceries</h1></div><div class="grid two"><section class="card"><div class="row"><input id="grocery-name" class="input" placeholder="Add grocery item"><button class="btn" data-action="add-grocery">Add</button></div><ul class="clean-list">'+(rows||'<li class="muted">Generate a meal plan or add an item.</li>')+'</ul></section><aside class="card"><h3>Weekly budget</h3><h2>'+money(state.settings.weeklyBudget)+'</h2><p>Pantry items are excluded from the auto-generated list.</p></aside></div>';
}
function ai(){
  var available=!!navigator.gpu;
  return '<div class="page-head"><h1>AI Kitchen</h1></div><div class="card"><h2>Optional on-device AI</h2><p>WebGPU: <b>'+(available?"available":"not detected")+'</b>. AI loads only when you ask for it; navigation, planning and sync never depend on it.</p><div class="row wrap"><button class="btn accent" data-action="test-ai">Test WebGPU + WebLLM</button><button class="btn" data-action="ai-idea">Generate meal idea</button></div><p id="ai-status" class="muted"></p><pre id="ai-output" class="ai-output"></pre></div>';
}
function settings(){
  var p=state.profile,f=state.prefs,s=state.settings,c=getConnectionConfig(),signed=!!cloudStatus.email;
  return '<div class="page-head"><h1>Settings</h1></div><div class="settings-grid">'+
  '<section class="card wide"><h2>Account & automatic sync</h2><p>'+esc(signed?"Signed in as "+cloudStatus.email:"Not signed in. Your data is currently local to this device.")+'</p><div class="form-grid"><label class="field">Email<input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com"></label><div class="field"><span>Cloud status</span><div class="status-box">'+esc(cloudStatus.message)+(cloudStatus.lastSync?" · "+esc(cloudStatus.lastSync):"")+'</div></div></div><div class="row wrap section"><button class="btn accent" data-action="send-link">Send magic link</button><button class="btn" data-action="sync-now">Sync now</button><button class="btn" data-action="sign-out">Sign out</button></div></section>'+
  '<section class="card wide"><h2>Physical profile</h2><div class="form-grid">'+
  field("Age","age",p.age,"number")+selectSex(p.sex)+field("Height cm","height",p.heightCm,"number")+field("Weight kg","weight",p.weightKg,"number","0.1")+field("Goal weight kg","goalw",p.goalWeightKg,"number","0.1")+selectActivity(p.activity)+selectGoal(p.goal)+field("Weekly change kg","weekly",p.weeklyChangeKg,"number","0.1")+'</div></section>'+
  '<section class="card wide"><h2>Food preferences</h2><div class="form-grid">'+
  field("Dietary patterns","diet",f.dietary.join(", "))+field("Allergies / never include","allergy",f.allergies.join(", "))+field("Dislikes","dislike",f.dislikes.join(", "))+field("Foods you like","likes",f.likes.join(", "))+field("Cuisines","cuisines",f.cuisines.join(", "))+field("Pantry basics","pantry",state.pantry.join(", "))+field("Meals/day","meals",f.mealsPerDay,"number")+'</div></section>'+
  '<section class="card wide"><h2>Nutrition & budget targets</h2><div class="form-grid">'+field("Calories","cal",s.calories,"number")+field("Protein g","protein",s.protein,"number")+field("Carbs g","carbs",s.carbs,"number")+field("Fat g","fat",s.fat,"number")+field("Weekly grocery budget","budget",s.weeklyBudget,"number")+'</div></section>'+
  '<section class="card wide"><h2>Backend</h2><p><b>Supabase:</b> connected globally for RecipeFlow.</p><p class="muted">Your recipes, plans, groceries, pantry, goals and preferences are bound to your authenticated user ID. Signed-in users also get the authenticated recipe importer automatically.</p></section>'+
  '<section class="card wide"><h2>App Health</h2><p>Version: <b>'+VERSION+'</b><br>Scope: <b>'+esc(scope)+'</b><br>Online: <b>'+navigator.onLine+'</b><br>WebGPU: <b>'+(navigator.gpu?"available":"not detected")+'</b><br>Service Worker: <b>'+("serviceWorker" in navigator?"supported":"unavailable")+'</b></p><button class="btn" data-action="repair">Check for app update</button></section>'+
  '</div><button class="btn primary section" data-action="save-settings">Save profile & preferences</button>';
}
function field(label,id,value,type,step){return '<label class="field">'+esc(label)+'<input id="'+id+'" type="'+(type||"text")+'" '+(step?'step="'+step+'" ':'')+'value="'+esc(value)+'"></label>'}
function selectSex(v){return '<label class="field">Sex used for equation<select id="sex"><option value="male" '+(v==="male"?"selected":"")+'>Male</option><option value="female" '+(v==="female"?"selected":"")+'>Female</option><option value="other" '+(v==="other"?"selected":"")+'>Other / midpoint</option></select></label>'}
function selectActivity(v){return '<label class="field">Activity<select id="activity">'+["sedentary","light","moderate","very","extra"].map(function(x){return'<option value="'+x+'" '+(v===x?"selected":"")+'>'+x+'</option>'}).join("")+'</select></label>'}
function selectGoal(v){return '<label class="field">Goal<select id="goal"><option value="lose" '+(v==="lose"?"selected":"")+'>Lose weight</option><option value="maintain" '+(v==="maintain"?"selected":"")+'>Maintain</option><option value="gain" '+(v==="gain"?"selected":"")+'>Gain weight</option></select></label>'}
function render(name){
  name=name||currentPage();var html={home:home,recipes:recipes,plan:plan,groceries:groceries,ai:ai,settings:settings}[name]();
  q("#view").innerHTML=html;qa("[data-nav]").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-nav")===name)});renderAccountPill();
}
function addRecipe(){
  var title=prompt("Recipe name");if(!title)return;
  var ing=prompt("Ingredients, one per line")||"",cal=Number(prompt("Calories per serving","500"))||0,pro=Number(prompt("Protein grams per serving","25"))||0;
  state.recipes.unshift({id:uid(),title:title,servings:1,ingredients:ing.split(/\n/).filter(Boolean).map(parseIng),steps:[],nutrition:{calories:cal,protein:pro},tags:state.prefs.dietary.slice(),createdAt:new Date().toISOString()});
  markChanged();render("recipes");
}
function openImport(prefill){
  var m=q("#modal");m.hidden=false;
  q("#modal-body").innerHTML='<div class="modal-head"><h2>Smart import</h2><button class="icon-btn" data-action="close-modal">×</button></div><p>Paste a recipe URL, Instagram/ReciMe link, caption, or recipe text. For screenshots, choose an image and RecipeFlow will try local OCR.</p><textarea id="import-text" class="input" rows="6" placeholder="Paste link, caption, or recipe text"></textarea><label class="field section">Screenshot / recipe image<input id="import-file" type="file" accept="image/*"></label><div class="row wrap section"><button class="btn accent" data-action="run-import">Import</button><span id="import-status" class="muted"></span></div>';
  if(prefill)q("#import-text").value=prefill;
}
function closeImport(){q("#modal").hidden=true;q("#modal-body").innerHTML=""}
function deterministicParse(text){
  var lines=String(text||"").split(/\n/).map(function(x){return x.trim()}).filter(Boolean);
  return{title:(lines.shift()||"Imported recipe").slice(0,120),ingredients:lines.slice(0,30).map(parseIng),steps:[],nutrition:{},tags:["imported"]};
}
async function runImport(){
  var status=q("#import-status"),text=q("#import-text").value.trim(),file=q("#import-file").files[0];
  try{
    status.textContent="Reading…";
    if(file){
      if(!window.RecipeFlowAI||!window.RecipeFlowAI.ocr)throw new Error("OCR helper did not load. Paste the screenshot text instead.");
      text=await window.RecipeFlowAI.ocr(file,function(m){status.textContent=m});
    }
    var parsed;
    if(/^https?:\/\//i.test(text)){
      var url=(text.match(/https?:\/\/\S+/)||[])[0]||text,c=getConnectionConfig(),data=null;
      if(window.RecipeFlowCloud&&window.RecipeFlowCloud.importUrl){
        try{data=await window.RecipeFlowCloud.importUrl(url)}catch(ignoreCloud){}
      }
      if(!data&&c.workerUrl){
        try{
          var res=await fetch(String(c.workerUrl).replace(/\/$/,"")+"/import?url="+encodeURIComponent(url));
          var json=await res.json();if(res.ok)data=json;
        }catch(ignore){}
      }
      if(!data){
        var jr=await fetch("https://r.jina.ai/"+url);if(!jr.ok)throw new Error("This link did not expose recipe data. Use a screenshot or paste the caption/text.");
        var raw=await jr.text();parsed=await structureWithFallback(raw,status);
      }
      if(data)parsed={title:data.title||"Imported recipe",ingredients:(data.ingredients||[]).map(parseIng),steps:data.instructions||[],servings:data.servings||1,nutrition:data.nutrition||{},image:data.image||"",sourceUrl:url,tags:["imported"]};
    }else parsed=await structureWithFallback(text,status);
    parsed.id=uid();parsed.createdAt=new Date().toISOString();state.recipes.unshift(merge({id:"",title:"Imported recipe",ingredients:[],steps:[],nutrition:{},tags:["imported"]},parsed));
    markChanged();closeImport();render("recipes");toast("Recipe imported.");
  }catch(e){
    status.textContent=e.message;
  }
}
async function structureWithFallback(text,status){
  if(window.RecipeFlowAI&&window.RecipeFlowAI.structure&&navigator.gpu){
    try{status.textContent="Structuring with on-device AI…";return await window.RecipeFlowAI.structure(text,function(m){status.textContent=m})}catch(e){}
  }
  status.textContent="Using fast local parser.";return deterministicParse(text);
}
function saveSettings(){
  try{
    state.profile.age=Number(q("#age").value)||25;state.profile.sex=q("#sex").value;state.profile.heightCm=Number(q("#height").value)||170;state.profile.weightKg=Number(q("#weight").value)||70;state.profile.goalWeightKg=Number(q("#goalw").value)||65;state.profile.activity=q("#activity").value;state.profile.goal=q("#goal").value;state.profile.weeklyChangeKg=Number(q("#weekly").value)||0.4;
    state.prefs.dietary=csv(q("#diet").value);state.prefs.allergies=csv(q("#allergy").value);state.prefs.dislikes=csv(q("#dislike").value);state.prefs.likes=csv(q("#likes").value);state.prefs.cuisines=csv(q("#cuisines").value);state.prefs.mealsPerDay=Math.max(2,Math.min(6,Number(q("#meals").value)||3));state.pantry=csv(q("#pantry").value);
    state.settings.calories=Number(q("#cal").value)||2000;state.settings.protein=Number(q("#protein").value)||120;state.settings.carbs=Number(q("#carbs").value)||220;state.settings.fat=Number(q("#fat").value)||70;state.settings.weeklyBudget=Number(q("#budget").value)||80;
    markChanged();toast("Settings saved and queued for sync.");render("settings");
  }catch(e){showRuntime("Settings save failed: "+e.message)}
}
function cloudCall(name,arg){
  if(!window.RecipeFlowCloud||typeof window.RecipeFlowCloud[name]!=="function"){toast("Cloud sync is not configured yet.");return}
  return window.RecipeFlowCloud[name](arg);
}
async function handleAction(action,el){
  if(action==="add-recipe")return addRecipe();
  if(action==="smart-import")return openImport();
  if(action==="close-modal")return closeImport();
  if(action==="run-import")return runImport();
  if(action==="generate")return generatePlan();
  if(action==="clear-plan"){state.plan={};markChanged();return render("plan")}
  if(action==="add-grocery"){var n=q("#grocery-name").value.trim();if(n){state.groceries.push({name:n,qty:0,unit:""});markChanged();render("groceries")}return}
  if(action==="apply-targets"){var t=targets();if(t){state.settings.calories=t.calories;state.settings.protein=t.protein;state.settings.carbs=t.carbs;state.settings.fat=t.fat;markChanged();render("home");toast("Suggested targets applied.")}return}
  if(action==="save-settings")return saveSettings();
  if(action==="save-connection"){try{saveConnectionConfig({supabaseUrl:q("#surl").value.trim(),supabaseKey:q("#skey").value.trim(),workerUrl:q("#workerurl").value.trim()});toast("Connection saved. Cloud module is reconnecting.");render("settings")}catch(e){toast(e.message)}return}
  if(action==="send-link"){var email=q("#auth-email").value.trim();if(!email){toast("Enter your email first.");return}return cloudCall("sendMagicLink",email)}
  if(action==="sync-now")return cloudCall("syncNow");
  if(action==="sign-out")return cloudCall("signOut");
  if(action==="repair"){if("serviceWorker" in navigator){var regs=await navigator.serviceWorker.getRegistrations();for(var i=0;i<regs.length;i++)await regs[i].update()}location.reload();return}
  if(action==="test-ai"){var o=q("#ai-status");if(!window.RecipeFlowAI){o.textContent="AI helper did not load. Core app is unaffected.";return}return window.RecipeFlowAI.test(function(m){o.textContent=m})}
  if(action==="ai-idea"){var out=q("#ai-output"),st=q("#ai-status");if(!window.RecipeFlowAI){st.textContent="AI helper did not load.";return}var prompt="Create one "+state.prefs.dietary.join(", ")+" meal around "+Math.round(state.settings.calories/3)+" kcal and "+Math.round(state.settings.protein/3)+"g protein. Avoid "+state.prefs.allergies.concat(state.prefs.dislikes).join(", ")+". Prefer "+state.prefs.cuisines.join(", ")+". Give ingredients and short steps.";try{out.textContent=await window.RecipeFlowAI.run(prompt,function(m){st.textContent=m});st.textContent="Done."}catch(e){st.textContent=e.message}return}
}
document.addEventListener("click",function(e){
  var nav=e.target.closest("[data-nav]");if(nav){e.preventDefault();go(nav.getAttribute("data-nav"));return}
  var action=e.target.closest("[data-action]");if(action){e.preventDefault();handleAction(action.getAttribute("data-action"),action).catch(function(err){showRuntime("Feature error: "+err.message)});return}
  var del=e.target.closest("[data-delete-recipe]");if(del){var id=del.getAttribute("data-delete-recipe");state.recipes=state.recipes.filter(function(r){return r.id!==id});markChanged();render("recipes")}
});
document.addEventListener("change",function(e){
  if(e.target.matches("[data-grocery-check]")){state.checks[e.target.getAttribute("data-grocery-check")]=e.target.checked;markChanged()}
});
window.addEventListener("hashchange",function(){render(currentPage())});
window.addEventListener("online",function(){setCloudStatus({message:cloudStatus.email?"Online · syncing available":"Online · local mode"})});
window.addEventListener("offline",function(){setCloudStatus({message:"Offline · local data is still available"})});
window.addEventListener("error",function(e){showRuntime("Runtime error: "+(e.message||"Unknown error"))});
window.addEventListener("unhandledrejection",function(e){showRuntime("Background feature error: "+(e.reason&&e.reason.message?e.reason.message:"Unknown error"))});
var initial=loadKey(keyFor("guest"))||migrateLegacy()||fresh();state=cleanState(initial);persist(true);
if("serviceWorker" in navigator)window.addEventListener("load",function(){navigator.serviceWorker.register("./sw.js?v=0.5.1",{updateViaCache:"none"}).catch(function(){})});
q("#quick-import").addEventListener("click",function(){go("recipes");setTimeout(openImport,0)});
render(currentPage());
var shareParams=new URLSearchParams(location.search);
if(shareParams.get("share")==="1"){
  var shared=[shareParams.get("title"),shareParams.get("text"),shareParams.get("url")].filter(Boolean).join("\n");
  go("recipes");
  setTimeout(function(){openImport(shared);history.replaceState(null,"",location.pathname+location.hash)},0);
}
window.RecipeFlow={
  version:VERSION,
  getState:function(){return clone(state)},
  replaceState:replaceState,
  activateUser:activateUser,
  getScope:function(){return scope},
  meaningful:meaningful,
  setCloudStatus:setCloudStatus,
  getConnectionConfig:getConnectionConfig,
  saveConnectionConfig:saveConnectionConfig,
  markChanged:markChanged,
  render:render,
  toast:toast
};
window.dispatchEvent(new CustomEvent("recipeflow:ready"));
})();