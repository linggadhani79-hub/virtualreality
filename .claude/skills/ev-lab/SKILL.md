---
name: ev-lab
description: Panduan bekerja di repo Smart Vocational EV (lab VR kendaraan listrik berbasis WebXR untuk Meta Quest, HP, dan browser). Pakai saat menambah atau mengolah aset 3D, mengubah lingkungan lab, stasiun belajar, modul ajar, kuis, kontrol VR, mode offline, APK, atau deploy Cloudflare di proyek ini.
---

# Smart Vocational EV — panduan kerja

Balas pemilik dalam **bahasa Indonesia**. Baca `CLAUDE.md` untuk keputusan pemilik yang tidak boleh
dilanggar (tanpa database, aset ditanam, tanpa unggah/unduh, langsung pakai, desain mobil tetap).

## Arsitektur singkat

- React 19 + react-three-fiber + `@react-three/xr`, Vite, Tailwind. Server dev: `server.ts` (Express).
- **Mode lokal** (bawaan): `vite.config.ts` meng-alias `firebase/*` ke `src/lib/local/*` (IndexedDB).
  Saklar di `src/lib/appConfig.ts`: `LOCAL_ONLY`, `TRIAL_NO_AUTH`.
- **Offline**: plugin `offlinePrecache` di `vite.config.ts` menulis `dist/precache-manifest.json`;
  `public/sw.js` menyimpan semua berkas saat pertama dibuka (hanya tingkat kualitas perangkat itu).
- **APK** (`android/`) adalah Trusted Web Activity: pembungkus yang membuka alamat web. WebXR tidak
  jalan di WebView, jadi aset tidak bisa benar-benar berada di dalam APK; offline dicapai lewat
  service worker (butuh internet sekali saat pertama dibuka).
- **Cloudflare Workers**: `wrangler.toml` + `worker/index.ts`. Batas 25 MiB per berkas di `dist`.

## Peta berkas

| Berkas | Isi |
|---|---|
| `src/App.tsx` | Aplikasi utama, `Player` (gerak, kamera), UI 2D, dok tombol |
| `src/components/TestLabEnvironment.tsx` | Hanggar, aspal, marka, peralatan, penempatan stasiun |
| `src/components/SampleEVCar.tsx` | Mobil, mode Komponen (sasis asli + titik sorot), panel tombol 3D |
| `src/components/LabStations.tsx` | `ExhibitStand` (etalase), `QuizStation` (tanya jawab + bank soal) |
| `src/components/ReadingCorner.tsx` | Meja buku + layar slideshow modul ajar |
| `src/components/ModuleEditor.tsx`, `src/lib/modules.ts` | Editor admin & data modul ajar |
| `src/components/WebXRControllerManager.tsx` | Tangan, laser, pemilihan dengan controller |
| `src/components/GuardianBoundary.tsx` | Penanda batas ruang VR |
| `src/components/PhoneVR.tsx`, `src/lib/phoneVR.ts` | VR HP (layar ganda, giroskop, tatapan) |
| `src/lib/glb.ts` | `loadGlb` (cache + Meshopt), `fitModel`, bantuan kanvas |
| `src/lib/quality.ts` | Tingkat kualitas `hq`/`lite`, `modelUrl(nama)` |
| `src/lib/worldBounds.ts` | Dinding yang menahan pemain |
| `scripts/build-car-model.mjs` | Mengolah model mobil (pisah roda per komponen mesh, kompres) |

## Aturan membuat objek 3D yang bisa dipilih

Satu objek harus bisa dipilih dengan mouse, laser Quest, dan tatapan VR HP. Selalu pasang keduanya:

```tsx
<mesh userData={{ isInteractableMesh: true, isVRButton: true, onClick: fn }} onClick={fn} />
```

- Mesh padat hasil unduhan: `disableRaycast(root)` lalu beri kotak proxy tak terlihat
  (`<meshBasicMaterial colorWrite={false} depthWrite={false} />`) agar laser tetap ringan.
- Dekorasi: `raycast={() => null}`.
- Teks 3D digambar ke `CanvasTexture` (jangan pakai `<Text>` drei: font-nya diambil dari CDN).
- Ikon digambar vektor di kanvas, bukan emoji (tampil beda di Quest).
- Benda yang harus ikut pemain di VR (tangan, batas ruang) berada di dalam `XROrigin`.

## Menambah aset 3D

1. Berkas mentah dari pemilik (Google Drive / folder `aset-mentah/`). Unduhan Drive:
   `https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t`.
2. Buat dua tingkat dan simpan ke `public/models/<nama>-hq.glb` dan `<nama>-lite.glb`
   (gltf-transform: `simplify` + `textureCompress` WebP + `meshopt`; butuh `meshoptimizer`, `sharp`).
   Patokan: lite ±100–250 rb segitiga & tekstur 1K; hq ±300–750 rb & 2K. Di VR tiap benda digambar
   dua kali. Model mobil memakai `scripts/build-car-model.mjs` (roda = komponen mesh terpisah;
   jangan dipotong dengan silinder).
3. Muat dengan `loadGlb(modelUrl("nama"))` + `fitModel(root, meter)`; tempatkan lewat
   `ExhibitStand` atau komponen baru di `TestLabEnvironment.tsx`.
4. Tata letak hanggar: X −14..14, Z −14..6, kolom tiap 4 m di Z = −12, −8, −4, 0, 4 (lebar bebas
   antar kolom 3,6 m — poster dinding samping jangan lebih lebar dari itu). Pemain mulai di (0,0,0)
   menghadap −Z; lintasan mobil di Z = −6.

## Menguji

- `npm run lint` dan `npm run build` wajib lolos.
- Uji tampilan dengan Playwright (Chromium sudah terpasang; pakai
  `--use-gl=swiftshader --enable-unsafe-swiftshader`). Saat `npm run dev`, `window.__evlab`
  berisi `{ scene, gl, camera }`: cari objek dengan `scene.traverse` dan panggil
  `userData.onClick({})` untuk menekan tombol 3D.
- Emulasi Quest: bundel `iwer` (`new XRDevice(metaQuest3).installRuntime()`) lewat `addInitScript`.
  Emulator bawaan `@react-three/xr` dimatikan karena bentrok versi three.js.
- Uji offline pada build produksi (`NODE_ENV=production node dist/server.cjs`), lalu
  `context.setOffline(true)`.
- Headset Quest fisik belum pernah diuji dari sesi Claude: katakan terus terang di laporan.

## Yang belum ada / diketahui kurang

- Tabrakan dengan peralatan (hanya dinding hanggar yang menahan pemain).
- Slide modul hanya teks (belum gambar/video).
- Modul buatan admin tersimpan di perangkat itu; agar berlaku di semua perangkat, simpan JSON-nya
  sebagai `public/lab/modul.json` lalu build ulang.
- Skor kuis tidak disimpan/dikirim ke mana pun.
- `android/app-config.properties` harus berisi alamat hosting asli sebelum APK dipakai.
