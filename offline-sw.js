// Cache only this app and its public astronomy assets. Image inputs and solve results stay in memory.
const CACHE_NAME = 'instaslice-offline-v35';
const previousCacheNames = ['instaslice-offline-v34', 'instaslice-offline-v33', 'instaslice-offline-v32', 'instaslice-offline-v31', 'instaslice-offline-v30', 'instaslice-offline-v29', 'instaslice-offline-v28', 'instaslice-offline-v27', 'instaslice-offline-v26', 'instaslice-offline-v25', 'instaslice-offline-v24', 'instaslice-offline-v23', 'instaslice-offline-v22', 'instaslice-offline-v21', 'instaslice-offline-v20', 'instaslice-offline-v19', 'instaslice-offline-v18', 'instaslice-offline-v17', 'instaslice-offline-v16', 'instaslice-offline-v15', 'instaslice-offline-v14', 'instaslice-offline-v13', 'instaslice-offline-v12', 'instaslice-offline-v11', 'instaslice-offline-v10', 'instaslice-offline-v9', 'instaslice-offline-v8', 'instaslice-offline-v7', 'instaslice-offline-v6', 'instaslice-offline-v5', 'instaslice-offline-v4', 'instaslice-offline-v3', 'instaslice-offline-v2', 'instaslice-offline-v1'];
const appUrl = self.registration.scope;
const assetUrls = [
  "assets/fonts.css",
  "assets/styles.css?v=17",
  "assets/app.js?v=32",
  "assets/full-moon-disc.png",
  "assets/fonts/bebas-neue-400.woff",
  "assets/fonts/bodoni-moda-500-800.woff",
  "assets/fonts/chakra-petch-300.woff",
  "assets/fonts/chakra-petch-400.woff",
  "assets/fonts/chakra-petch-500.woff",
  "assets/fonts/chakra-petch-600.woff",
  "assets/fonts/chakra-petch-700.woff",
  "assets/fonts/cinzel-400-800.woff",
  "assets/fonts/cormorant-garamond-300-700.woff",
  "assets/fonts/dm-sans-300-700.woff",
  "assets/fonts/ibm-plex-sans-300-700.woff",
  "assets/fonts/inter-300.woff",
  "assets/fonts/inter-400.woff",
  "assets/fonts/inter-500.woff",
  "assets/fonts/inter-600.woff",
  "assets/fonts/inter-700.woff",
  "assets/fonts/inter-800.woff",
  "assets/fonts/jetbrains-mono-300-700.woff",
  "assets/fonts/marcellus-400.woff",
  "assets/fonts/michroma-400.woff",
  "assets/fonts/montserrat-300-800.woff",
  "assets/fonts/orbitron-400-800.woff",
  "assets/fonts/oswald-500-700.woff",
  "assets/fonts/outfit-300-800.woff",
  "assets/fonts/playfair-display-400-800.woff",
  "assets/fonts/rajdhani-300.woff",
  "assets/fonts/rajdhani-400.woff",
  "assets/fonts/rajdhani-500.woff",
  "assets/fonts/rajdhani-600.woff",
  "assets/fonts/rajdhani-700.woff",
  "assets/fonts/share-tech-mono-400.woff",
  "assets/fonts/space-grotesk-300-700.woff",
  "assets/fonts/syne-600-800.woff",
  "plate/custom/worker.js?v=13",
  "plate/custom/solver.js?v=8",
  "plate/custom/projection.js?v=2",
  "plate/custom/panorama.js?v=4",
  "plate/custom/deep.isq.gz?v=1",
  "plate/custom/wide.isp.gz?v=1",
  "plate/custom/mid.isp.gz?v=1",
  "plate/custom/fine.isp.gz?v=1",
  "plate/custom/regions.isq.gz?v=2",
  "plate/custom/CREDITS.txt",
  "plate/privacy/scan-worker.js?v=14",
  "plate/privacy/tesseract-core-lstm.js?v=14",
  "plate/privacy/tesseract-core-lstm.wasm?v=14",
  "plate/privacy/eng.traineddata.gz?v=14",
  "plate/privacy/TESSERACT-LICENSE.txt",
  "plate/privacy/LEPTONICA-LICENSE.txt",
  "plate/privacy/OCR-CREDITS.txt",
  "plate/moon-surface-worker.js?v=13",
  "plate/moon-surface.wasm?v=13",
  "plate/moon-surface-simd.wasm?v=13",
  "plate/moon-surface-atlas.bin.gz?v=13",
  "plate/lunar-features.json?v=13",
  "plate/LUNAR-CREDITS.txt",
  "plate/VLFEAT-LICENSE.txt",
  "plate/catalogues.js?v=18",
  "plate/bright-stars.json",
  "plate/catalogue-bundle.json",
  "plate/CATALOGUE-CREDITS.txt",
  "plate/STELLARIUM-COPYING.txt",
  "plate/STELLARIUM-CREDITS.md",
  "plate/build_catalogues.py",
  "plate/DATA-CREDITS.txt",
  "plate/ANNOTATION-NOTICE.txt"
].map(path => new URL(path, self.registration.scope).href);
const offlineUrls = [appUrl, ...assetUrls];

async function previousResponse(url) {
  for (const cacheName of previousCacheNames) {
    const cached = await caches.match(url, { cacheName });
    if (cached) return cached;
  }
}

// Older caches hold superseded files, including large star indexes. They are deleted only once this version's cache is complete.
async function retirePreviousCaches() {
  try { await Promise.all(previousCacheNames.map(name => caches.delete(name))); }
  catch (_) { /* a cache that cannot be deleted now is retried on the next check */ }
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port || (event.data !== 'check' && event.data !== 'prepare')) return;

  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await Promise.all(offlineUrls.map(url => cache.match(url)));
      const missing = offlineUrls.filter((_, index) => !cached[index]);
      if (event.data === 'check' || !missing.length) {
        if (!missing.length) await retirePreviousCaches();
        port.postMessage({ ready: !missing.length });
        return;
      }
      // Batch offline downloads in small chunks so mobile Safari never throttles sockets
      const batchSize = 8;
      for (let i = 0; i < missing.length; i += batchSize) {
        const slice = missing.slice(i, i + batchSize);
        await cache.addAll(slice.map(url => new Request(url, {
          cache: 'reload', mode: 'same-origin', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer'
        })));
      }
      await retirePreviousCaches();
      port.postMessage({ ready: true });
    } catch (_) {
      port.postMessage({ ready: false });
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    const root = new URL(self.registration.scope);
    if (url.origin !== root.origin || (url.pathname !== root.pathname && url.pathname !== new URL('index.html', root).pathname)) return;
    event.respondWith(fetch(request).catch(async () => (
      (await caches.match(appUrl, { cacheName: CACHE_NAME }))
      || (await previousResponse(appUrl))
      || Response.error()
    )));
    return;
  }
  if (!assetUrls.includes(request.url)) {
    const url = new URL(request.url);
    const root = new URL(appUrl);
    const previousPath = url.pathname.slice(root.pathname.length);
    const formerApp = previousPath === 'assets/app.js' && ['?v=5', '?v=6', '?v=7', '?v=8', '?v=9', '?v=10', '?v=11', '?v=12', '?v=13', '?v=14', '?v=15', '?v=16', '?v=17', '?v=18', '?v=19', '?v=20', '?v=21', '?v=22', '?v=23', '?v=24', '?v=25', '?v=26', '?v=27', '?v=28', '?v=29', '?v=30', '?v=31'].includes(url.search);
    const formerStyles = previousPath === 'assets/styles.css' && ['?v=5', '?v=6', '?v=7', '?v=8', '?v=9', '?v=10', '?v=11', '?v=12', '?v=13', '?v=14', '?v=15', '?v=16'].includes(url.search);
    const formerSolver = false;
    const unversionedFiles = !url.search &&
      /^(?:assets\/(?:app\.js|styles\.css)$|plate\/(?:v[23]\/|catalogues\.js$))/.test(previousPath);
    if (url.origin === root.origin && url.pathname.startsWith(root.pathname) && (formerApp || formerStyles || formerSolver || unversionedFiles)) {
      event.respondWith(fetch(request).catch(async () => (await previousResponse(request.url)) || Response.error()));
    }
    return;
  }
  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request.url);
      if (cached) return cached;
    } catch (_) { /* ordinary online loads can work without local storage */ }
    const response = await fetch(request).catch(async error => {
      const previous = await previousResponse(request.url);
      if (!previous) throw error;
      return previous;
    });
    if (cache && response.ok) {
      try { await cache.put(request.url, response.clone()); }
      catch (_) { /* cache quota can be lower than the app's storage needs */ }
    }
    return response;
  })());
});
