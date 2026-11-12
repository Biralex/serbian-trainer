// Офлайн-кэш. При выпуске новой версии увеличить номер в CACHE.
const PREFIX = "govori-srpski-";
const CACHE = PREFIX + "v1";
const LESSON_FILES = Array.from({ length: 25 }, (_, i) => `./data/lesson-${String(i).padStart(2, "0")}.js`);
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./data/meta.js", "./manifest.webmanifest", "./icon.svg", ...LESSON_FILES];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  // удаляем только свои старые кэши: на домене *.github.io могут быть другие приложения
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    })
  );
});
