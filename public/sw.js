const CACHE = 'shanhe-public-mobile-20260927-adventures-v6'
const CORE = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/images/hero.jpg', '/images/shimao.jpg', '/images/lake.jpg', '/images/grass.jpg']
self.addEventListener('install', event => { event.waitUntil((async()=>{
  const cache=await caches.open(CACHE)
  const response=await fetch('/index.html',{cache:'reload'})
  if(!response.ok)throw new Error('Application shell unavailable')
  const html=await response.text()
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match=>match[1])
  await cache.addAll([...CORE,...new Set(assets)])
})()); self.skipWaiting() })
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('shanhe-public-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/migration') return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => { if (response.ok && response.headers.get('content-type')?.includes('text/html')) { const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(cache=>cache.put('/index.html',copy))) } return response }).catch(()=>caches.match('/index.html')))
    return
  }
  if (!(url.pathname.startsWith('/assets/') || CORE.includes(url.pathname)) || url.search) return
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { if (response.ok && response.type === 'basic') { const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy))) } return response })))
})
