// Boom Arena offline cache. It's what makes the game installable as an app, and lets single-player start
// with no internet. The game's own files come fresh from the server whenever it can be reached (so updates
// show up straight away) and from this cache when it can't. The 3D engine (pinned versions on CDNs) and the
// font never change, so those are served from the cache once saved.
const CACHE = 'boom-arena-v4';
const CORE = ['./', 'shared.js', 'textures-a.js', 'textures-b.js', 'island.js', 'br.js', 'soldier.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-64.png'];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap',
];
const LIVE = new Set(['/ws', '/status', '/health']);   // never cached
const FOREVER = /(^|\.)(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.all(LIBS.map(async u => { try { await c.put(u, await fetch(u, { mode: 'no-cors' })); } catch (er) {} }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (LIVE.has(url.pathname) || url.pathname.startsWith('/dev/')) return;
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await fetch(req);
        if (r.ok) {   // keep the saved copy current (only rewrite it when the file actually changed)
          const old = await c.match(req, { ignoreSearch: true }), tag = r.headers.get('etag');
          if (!old || !tag || old.headers.get('etag') !== tag) c.put(new Request(url.pathname), r.clone());
        }
        return r;
      } catch (er) {   // offline: the saved copy (and the game page for any page request)
        return (await c.match(new Request(url.pathname))) || (req.mode === 'navigate' && await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  if (FOREVER.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') c.put(req, r.clone());
      return r;
    })());
  }
});
