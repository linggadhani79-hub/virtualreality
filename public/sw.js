// Service worker: menyimpan SEMUA berkas aplikasi (kode, ikon, model 3D) saat pertama dibuka,
// sehingga setelah itu aplikasi bisa dijalankan tanpa internet (offline).
//
// Hemat kuota: simpanan berkas TIDAK dibuang setiap ada versi baru. precache-manifest.json memuat
// sidik isi (hash) tiap berkas; saat pembaruan hanya berkas yang isinya berubah yang diunduh ulang.
// Dulu nama simpanan ikut versi build, sehingga setiap pembaruan mengunduh ulang semua model 3D
// (puluhan MB) — boros kuota bagi yang membuka versi web sesekali.
const BUILD_ID = "__BUILD_ID__"; // berubah tiap build → browser memasang service worker baru
const DATA = "evlab-data"; // simpanan tetap lintas versi
const HASH_HEADER = "x-evlab-hash";

let manifestPromise = null;
function manifest() {
  manifestPromise ??= fetch("/precache-manifest.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { files: [], hashes: {} }))
    .catch(() => {
      manifestPromise = null;
      return { files: [], hashes: {} };
    });
  return manifestPromise;
}

// Model 3D punya dua tingkat kualitas; simpan hanya yang dipakai perangkat ini
// (Quest / HP: "-lite", PC: "-hq"). Tingkat lain tetap diambil (dan disimpan) saat diminta.
// Halaman memberi tahu tingkatnya lewat alamat pendaftaran (/sw.js?tier=lite).
function forTier(files) {
  const asked = new URL(self.location.href).searchParams.get("tier");
  const lite = asked ? asked === "lite" : /OculusBrowser|Quest|Pico|Android|iPhone|iPad|iPod/i.test(self.navigator.userAgent);
  const skip = lite ? /-hq\.glb$/ : /-(lite|far)\.glb$/; // "-far" = model jarak jauh tingkat ringan
  return files.filter((f) => !skip.test(f));
}

async function digest(buf) {
  const h = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Salin jawaban menjadi jawaban biasa (bukan hasil pengalihan) dan beri tanda sidik isinya. */
async function stamp(res, hash) {
  const buf = await res.arrayBuffer();
  const headers = new Headers(res.headers);
  headers.set(HASH_HEADER, hash || (await digest(buf)));
  return new Response(buf, { status: 200, statusText: "OK", headers });
}

const fresh = (hit, hash) => !!hit && (!hash || hit.headers.get(HASH_HEADER) === hash);

async function report(done, total) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "offline-progress", done, total }));
}

/** Simpan berkas yang belum ada / berubah. Satu per satu supaya satu gagal tidak membatalkan semua. */
async function store(files, hashes, notify) {
  const cache = await caches.open(DATA);
  let done = 0;
  for (const url of files) {
    try {
      const hit = await cache.match(url);
      if (!fresh(hit, hashes[url])) {
        const r = await fetch(url, { cache: "no-cache" });
        if (r.ok) await cache.put(url, await stamp(r, hashes[url]));
      }
    } catch {}
    done++;
    if (notify && (done % 5 === 0 || done === files.length)) await report(done, files.length);
  }
}

/** Pindahkan isi simpanan lama (nama ikut versi) yang isinya masih sama, supaya tidak diunduh ulang. */
async function migrate(hashes) {
  const old = (await caches.keys()).filter((k) => k.startsWith("evlab-") && k !== DATA);
  if (!old.length) return;
  const data = await caches.open(DATA);
  for (const name of old) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      const want = hashes[path];
      if (!want || (await data.match(path))) continue;
      try {
        const res = await cache.match(req);
        const buf = await res.arrayBuffer();
        if ((await digest(buf)) === want) {
          const headers = new Headers(res.headers);
          headers.set(HASH_HEADER, want);
          await data.put(path, new Response(buf, { status: 200, headers }));
        }
      } catch {}
    }
    await caches.delete(name);
  }
}

/** Buang berkas yang sudah tidak dipakai versi ini (mis. kode build lama). */
async function prune(files) {
  const keep = new Set(files);
  const cache = await caches.open(DATA);
  for (const req of await cache.keys()) {
    if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
  }
}

const isShell = (f) => f === "/" || f.startsWith("/assets/");

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Hanya kerangka (halaman + kode, ± 2–3 MB, kebanyakan sudah tersimpan) yang ditunggu
  event.waitUntil(
    manifest()
      .then(async ({ files, hashes }) => {
        await migrate(hashes);
        await store(forTier(files).filter(isShell), hashes, false);
      })
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    manifest()
      .then(({ files }) => (files.length ? prune(files) : null))
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

// Model 3D dan berkas lain disimpan belakangan, setelah halaman tampil dan memintanya.
let storingAll = null;
self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache") return;
  storingAll ??= manifest()
    .then(({ files, hashes }) => store(forTier(files), hashes, true))
    .catch(() => {})
    .finally(() => {
      storingAll = null;
    });
  event.waitUntil(storingAll);
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return;
  if (url.pathname === "/precache-manifest.json" || url.pathname === "/sw.js") return;

  // Halaman utama: coba versi terbaru dulu (beberapa KB), pakai salinan tersimpan bila offline.
  // Hanya untuk "/": navigasi lain (mis. /privasi.html di iframe) tidak boleh menimpa salinan ini.
  if (req.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok) {
            const copy = await stamp(res.clone());
            caches.open(DATA).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/", { cacheName: DATA }).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Berkas lain: salinan tersimpan dulu (cepat & offline); kalau belum ada / sudah berubah,
  // ambil dari internet lalu simpan.
  event.respondWith(
    (async () => {
      const cache = await caches.open(DATA);
      const hit = await cache.match(req);
      const { hashes } = await manifest();
      const want = hashes?.[url.pathname];
      if (hit && (fresh(hit, want) || !navigator.onLine)) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.status === 200) {
          const copy = await stamp(res.clone(), want);
          cache.put(req, copy);
        }
        return res;
      } catch {
        // Offline: pakai salinan lama bila ada, atau kosong untuk berkas opsional
        return hit || new Response("", { status: 504, statusText: "Offline" });
      }
    })(),
  );
});
