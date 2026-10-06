const CACHE="recipeflow-v050";
const CORE=[
  "./",
  "./index.html",
  "./styles.css?v=0.5.0",
  "./config.js?v=0.5.0",
  "./app.js?v=0.5.0",
  "./cloud.js?v=0.5.0",
  "./ai.js?v=0.5.0",
  "./manifest.webmanifest?v=0.5.0"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request,{cache:"no-store"}).then(resp=>{
      const copy=resp.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy)).catch(()=>{});return resp;
    }).catch(()=>caches.match("./index.html").then(r=>r||caches.match("./"))));
    return;
  }
  const isAppAsset=/\.(?:js|css|webmanifest)$/.test(url.pathname);
  if(isAppAsset){
    event.respondWith(fetch(event.request,{cache:"no-store"}).then(resp=>{
      if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{})}
      return resp;
    }).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});