const VERSION='tilpro-shell-v1';
const scopeUrl=new URL(self.registration.scope);
const shellUrl=new URL('./',scopeUrl).href;

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.add(shellUrl)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tilpro-')&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
  const withinScope=url.href.startsWith(scopeUrl.href);
  if(!withinScope)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(shellUrl,copy));}
      return response;
    }).catch(async()=>await caches.match(shellUrl)||Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
