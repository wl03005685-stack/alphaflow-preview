const CACHE='alphaflow-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.add(new URL('./offline.html',self.location).href))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Never cache market or holdings data: an offline response must not look current.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./offline.html',self.location).href)));});
