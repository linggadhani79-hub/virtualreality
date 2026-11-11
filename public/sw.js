// Service worker: menyimpan SEMUA berkas aplikasi (kode, ikon, model 3D) saat pertama dibuka,
// sehingga setelah itu aplikasi bisa dijalankan tanpa internet (offline).
const BUILD_ID = "__BUILD_ID__";
const CACHE = "evlab-" + BUILD_ID;

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch("/precache-manifest.json", { cache: "no-store" });
  if (!res.ok) return;
  let { files } = await res.json();
  // Model 3D punya dua tingkat kualitas; simpan hanya yang dipakai perangkat ini
  // (Quest / HP: "-lite", PC: "-hq"). Tingkat lain tetap diambil saat diminta.
  // Halaman memberi tahu tingkat yang dipakainya lewat alamat pendaftaran (/sw.js?tier=lite),
  // supaya selalu sama dengan pilihan "Kualitas Aset" pengguna; tebakan dari jenis perangkat
  // hanya cadangan.
  const asked = new URL(self.location.href).searchParams.get("tier");
  const lite = asked ? asked === "lite" : /OculusBrowser|Quest|Pico|Android|iPhone|iPad|iPod/i.test(self.navigator.userAgent);
  const skip = lite ? /-hq\.glb$/ : /-lite\.glb$/;
  files = files.filter((f) => !skip.test(f));
  // Satu per satu supaya satu berkas gagal tidak membatalkan semuanya
  let done = 0;
  for (const url of files) {
    try {
      if (!(await cache.match(url))) {
        const r = await fetch(url, { cache: "no-cache" });
        if (r.ok) await cache.put(url, r);
      }
    } catch {}
    done++;
    if (done % 5 === 0 || done === files.length) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: "offline-progress", done, total: files.length }));
    }
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precache().catch(() => {}));
});

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

  // Halaman: coba versi terbaru dulu, pakai salinan tersimpan bila offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((cache) => cache.put("/", res.clone()));
          return res.clone();
        })
        .catch(() => caches.match("/", { cacheName: CACHE }).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Berkas lain: salinan tersimpan dulu (cepat & offline), kalau belum ada ambil lalu simpan
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: false });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.status === 200) cache.put(req, res.clone());
        return res;
      } catch {
        // Offline dan berkas memang tidak ada di aplikasi (mis. data /lab opsional)
        return new Response("", { status: 504, statusText: "Offline" });
      }
    }),
  );
});
