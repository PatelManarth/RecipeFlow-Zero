(function(){
"use strict";
var client=null,user=null,authSub=null,syncing=false,pending=false,timer=null,lastActivation=null,generation=0;
function A(){return window.RecipeFlow}
function C(){return A().getConnectionConfig()}
function usable(c){return /^https:\/\/.+\.supabase\.co\/?$/i.test(c.supabaseUrl||"")&&!!c.supabaseKey&&!/^sb_secret_/i.test(c.supabaseKey)}
function clean(x){x=JSON.parse(JSON.stringify(x||{}));if(x.settings){delete x.settings.supabaseUrl;delete x.settings.supabaseKey;delete x.settings.workerUrl;delete x.settings.email}return x}
function stat(x){A().setCloudStatus(x)}
async function build(){
 var c=C();if(!usable(c))throw Error("Supabase site connection is not configured.");
 var m=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
 return m.createClient(c.supabaseUrl.replace(/\/$/,""),c.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"recipeflow-auth-v1"}});
}
async function connect(){
 var g=++generation;
 try{
  if(authSub&&authSub.unsubscribe)authSub.unsubscribe();authSub=null;client=null;user=null;
  if(!usable(C())){A().activateUser(null);stat({mode:"local",email:"",message:"Local mode · configure Supabase once to enable account sync.",lastSync:""});return}
  stat({mode:"cloud",message:"Connecting to account sync…"});
  client=await build();if(g!==generation)return;
  var s=client.auth.onAuthStateChange(function(evt,session){setTimeout(function(){if(g===generation)apply(session,evt).catch(fail)},0)});
  authSub=s.data&&s.data.subscription;
  var r=await client.auth.getSession();if(r.error)throw r.error;if(g!==generation)return;await apply(r.data.session,"INITIAL_SESSION");
 }catch(e){stat({mode:"local",email:"",message:"Cloud unavailable · local data is safe. "+e.message,lastSync:""})}
}
function fail(e){stat({mode:"cloud",email:user&&user.email||"",message:"Sync paused · local data is safe. "+e.message})}
async function apply(session,evt){
 user=session&&session.user||null;
 if(!user){lastActivation=A().activateUser(null);stat({mode:"cloud",email:"",message:"Cloud configured · sign in to sync devices.",lastSync:""});return}
 lastActivation=A().activateUser(user.id);
 stat({mode:"cloud",email:user.email||"",message:"Signed in · reconciling this device…"});
 await syncNow({initial:true,event:evt});
}
async function remote(){
 var r=await client.from("app_state").select("data,updated_at").eq("id",user.id).maybeSingle();
 if(r.error)throw r.error;return r.data||null;
}
async function push(local){
 var r=await client.from("app_state").upsert({id:user.id,data:clean(local),updated_at:new Date().toISOString()},{onConflict:"id"});
 if(r.error)throw r.error;
 stat({mode:"cloud",email:user.email||"",message:"Synced",lastSync:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});
}
async function syncNow(opts){
 opts=opts||{};if(!client||!user)return;if(!navigator.onLine){stat({email:user.email||"",message:"Offline · changes will sync when you reconnect."});return}
 if(syncing){pending=true;return}syncing=true;
 try{
  var local=A().getState(),row=await remote();
  if(!row)await push(local);
  else{
   var rd=row.data||{},lt=Number(local.meta&&local.meta.updatedAt)||0,rt=Number(rd.meta&&rd.meta.updatedAt)||Date.parse(row.updated_at)||0;
   var first=opts.initial&&lastActivation&&!lastActivation.hadCache;
   if(first||rt>lt){A().replaceState(clean(rd),{scope:"user:"+user.id});stat({mode:"cloud",email:user.email||"",message:first?"Downloaded your account data to this device.":"Downloaded newer account data.",lastSync:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})})}
   else if(lt>rt)await push(local);
   else stat({mode:"cloud",email:user.email||"",message:"Synced",lastSync:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});
  }
 }catch(e){fail(e);throw e}finally{syncing=false;if(pending){pending=false;setTimeout(function(){syncNow().catch(function(){})},250)}}
}
function schedule(){if(!user)return;clearTimeout(timer);timer=setTimeout(function(){syncNow().catch(function(){})},1200)}
async function sendMagicLink(email){
 try{
  if(!client)client=await build();
  var r=await client.auth.signInWithOtp({email:email,options:{emailRedirectTo:location.origin+location.pathname+"#settings"}});
  if(r.error)throw r.error;stat({mode:"cloud",email:"",message:"Magic link sent to "+email+"."});A().toast("Magic link sent.");
 }catch(e){fail(e);A().toast(e.message)}
}
async function signOut(){try{if(client)await client.auth.signOut()}catch(e){}user=null;A().activateUser(null);stat({mode:"cloud",email:"",message:"Signed out · guest data is local to this device.",lastSync:""});A().toast("Signed out.")}
window.RecipeFlowCloud={sendMagicLink:sendMagicLink,syncNow:function(){return syncNow({manual:true})},signOut:signOut,reconnect:connect};
window.addEventListener("recipeflow:statechanged",schedule);
window.addEventListener("recipeflow:configchanged",connect);
window.addEventListener("online",function(){syncNow().catch(function(){})});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")syncNow().catch(function(){})});
setInterval(function(){if(document.visibilityState==="visible")syncNow().catch(function(){})},30000);
if(window.RecipeFlow)connect();else window.addEventListener("recipeflow:ready",connect,{once:true});
})();