(function(){
"use strict";
var engine=null,modelId="",lib=null;
function cfg(){return window.RECIPEFLOW_CONFIG||{}}
function say(cb,msg){if(cb)cb(msg)}
async function webllm(){if(lib)return lib;lib=await import("https://esm.run/@mlc-ai/web-llm");return lib}
async function chooseModel(){
 if(!navigator.gpu)throw Error("WebGPU is unavailable on this browser.");
 var adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
 if(!adapter)throw Error("No WebGPU adapter is available.");
 var f16=adapter.features&&adapter.features.has&&adapter.features.has("shader-f16");
 return f16?(cfg().aiModelF16||"SmolLM2-360M-Instruct-q4f16_1-MLC"):(cfg().aiModelF32||"SmolLM2-360M-Instruct-q4f32_1-MLC");
}
async function getEngine(cb){
 if(engine)return engine;
 modelId=await chooseModel();
 var m=await webllm();
 say(cb,"Downloading/loading "+modelId+"… first use can take a while.");
 engine=await m.CreateMLCEngine(modelId,{initProgressCallback:function(p){say(cb,p.text||("AI model "+Math.round((p.progress||0)*100)+"%"))}});
 return engine;
}
async function test(cb){
 try{
  if(!navigator.gpu){say(cb,"WebGPU not detected. RecipeFlow will use non-AI fallbacks.");return false}
  var a=await navigator.gpu.requestAdapter();if(!a)throw Error("WebGPU adapter unavailable.");
  await webllm();
  say(cb,"WebGPU + WebLLM library are available. The model downloads only when you use an AI action.");
  return true;
 }catch(e){say(cb,"AI unavailable: "+e.message+". Core RecipeFlow still works.");return false}
}
async function run(prompt,cb){
 var e=await getEngine(cb);
 var r=await e.chat.completions.create({messages:[{role:"system",content:"You are RecipeFlow, a concise cooking assistant. Respect stated dietary restrictions. Never claim a recipe is allergy-safe unless ingredients were explicitly verified."},{role:"user",content:String(prompt)}],temperature:0.3,max_tokens:650});
 return r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content||"";
}
function parseIngredient(s){
 var m=String(s||"").trim().match(/^([\d.\/]+)?\s*([a-zA-Z]+)?\s*(.*)$/),q=0;
 if(m&&m[1]){if(m[1].indexOf("/")>0){var z=m[1].split("/");q=Number(z[0])/Number(z[1])}else q=Number(m[1])||0}
 return{qty:q,unit:m&&m[2]||"",name:m&&m[3]||String(s||"")};
}
async function structure(text,cb){
 var answer=await run("Return ONLY JSON with keys title, ingredients (array of strings), steps (array of strings), servings, nutrition. Do not invent missing quantities or nutrition. Input recipe:\n"+String(text).slice(0,10000),cb);
 var m=answer.match(/\{[\s\S]*\}/);if(!m)throw Error("AI did not return structured JSON.");
 var x=JSON.parse(m[0]);
 return{title:x.title||"Imported recipe",ingredients:(x.ingredients||[]).map(function(v){return typeof v==="string"?parseIngredient(v):v}),steps:x.steps||x.instructions||[],servings:x.servings||1,nutrition:x.nutrition||{},tags:["imported","AI structured"]};
}
async function ocr(file,cb){
 say(cb,"Loading on-device OCR…");
 var mod=await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm"),T=mod.default||mod;
 var r=await T.recognize(file,"eng",{logger:function(m){if(m.status)say(cb,m.status+(m.progress?" "+Math.round(m.progress*100)+"%":""))}});
 return r&&r.data&&r.data.text||"";
}
window.RecipeFlowAI={test:test,run:run,structure:structure,ocr:ocr,getModel:function(){return modelId}};
})();