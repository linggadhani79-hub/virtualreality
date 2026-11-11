// Service worker ringan: menyimpan berkas aplikasi agar kunjungan berikutnya terbuka cepat
// di Quest / HP, dan tetap bisa dibuka saat koneksi lambat.
const CACHE = "evlab-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return;

  // Berkas ber-hash (tidak pernah berubah): ambil dari cache dulu
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Halaman: selalu coba versi terbaru, pakai cache hanya bila offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((cache) => cache.put("/", res.clone()));
          return res.clone();
        })
        .catch(() => caches.match("/").then((hit) => hit || Response.error())),
    );
  }
});
