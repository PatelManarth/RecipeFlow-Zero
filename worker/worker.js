const MAX_BYTES=2_000_000;
export default{
 async fetch(req){
  const u=new URL(req.url);
  if(req.method==="OPTIONS")return new Response("",{headers:cors()});
  if(u.pathname==="/health")return json({ok:true,name:"RecipeFlow importer"});
  if(u.pathname!=="/import")return json({ok:true,name:"RecipeFlow importer"});
  const target=u.searchParams.get("url");
  if(!target)return json({error:"Valid url required"},400);
  try{
   const final=await safeFetch(target,0);
   const html=await limitedText(final);
   const recipe=findRecipe(extractLdJson(html));
   if(!recipe)return json({error:"No public Recipe JSON-LD found. Use screenshot/caption fallback."},404);
   return json({title:recipe.name||"",ingredients:Array.isArray(recipe.recipeIngredient)?recipe.recipeIngredient:[],instructions:steps(recipe.recipeInstructions),servings:recipe.recipeYield||"",image:imageOf(recipe.image),nutrition:recipe.nutrition||{},sourceUrl:final.url||target});
  }catch(e){return json({error:e.message||"Import failed"},502)}
 }
};
async function safeFetch(raw,hops){
 if(hops>3)throw Error("Too many redirects");
 let u;try{u=new URL(raw)}catch{throw Error("Invalid URL")}
 if(!/^https?:$/.test(u.protocol))throw Error("Only http/https URLs are allowed");
 if(blockedHost(u.hostname))throw Error("Private/local addresses are blocked");
 const r=await fetch(u.toString(),{redirect:"manual",headers:{"User-Agent":"Mozilla/5.0 RecipeFlow/0.5","Accept":"text/html,application/xhtml+xml"}});
 if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get("location");if(!loc)throw Error("Redirect missing location");return safeFetch(new URL(loc,u).toString(),hops+1)}
 if(!r.ok)throw Error("Source returned "+r.status);
 const type=(r.headers.get("content-type")||"").toLowerCase();if(type&&!type.includes("text/html")&&!type.includes("application/xhtml+xml"))throw Error("Source is not an HTML page");
 const len=Number(r.headers.get("content-length")||0);if(len>MAX_BYTES)throw Error("Source page is too large");
 return r;
}
async function limitedText(r){const text=await r.text();if(text.length>MAX_BYTES)throw Error("Source page is too large");return text}
function blockedHost(h){
 h=String(h||"").toLowerCase().replace(/\.$/,"");
 if(!h||h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h==="::1"||h==="0.0.0.0")return true;
 const m=h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if(m){const a=+m[1],b=+m[2];if(a===10||a===127||a===0||a===169&&b===254||a===192&&b===168||a===172&&b>=16&&b<=31)return true}
 return false;
}
function extractLdJson(html){const out=[],re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;while((m=re.exec(html))){try{out.push(JSON.parse(m[1]))}catch{}}return out}
function findRecipe(nodes){
 const stack=[...nodes];
 while(stack.length){
  const x=stack.shift();if(!x)continue;if(Array.isArray(x)){stack.push(...x);continue}if(typeof x!=="object")continue;
  const t=x["@type"];if(t==="Recipe"||Array.isArray(t)&&t.includes("Recipe"))return x;
  if(x["@graph"])stack.push(x["@graph"]);Object.keys(x).forEach(k=>{if(k!=="@graph"&&x[k]&&typeof x[k]==="object")stack.push(x[k])});
 }
 return null;
}
function steps(x){if(!x)return[];if(typeof x==="string")return[x];if(!Array.isArray(x))x=[x];return x.flatMap(v=>v&&v.itemListElement?steps(v.itemListElement):v&&v.text?[v.text]:typeof v==="string"?[v]:[])}
function imageOf(x){if(Array.isArray(x))x=x[0];if(x&&typeof x==="object")return x.url||x.contentUrl||"";return typeof x==="string"?x:""}
function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store"}}
function json(x,status=200){return new Response(JSON.stringify(x),{status,headers:{...cors(),"content-type":"application/json; charset=utf-8"}})}