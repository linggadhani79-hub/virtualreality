# Smart Vocational untuk Electric Vehicle — Lab VR

Media ajar kendaraan listrik (EV) berbasis **WebXR**. Satu kode sumber, bisa dijalankan sebagai:

| Mode | Perangkat | Cara masuk |
|---|---|---|
| **APK Meta Quest / Oculus** | Quest 2 / 3 / 3S / Pro | Pasang APK → buka aplikasi → **Masuk VR 360°** |
| **Web di Quest** | Meta Quest Browser | Buka alamat web → **Masuk VR 360°** |
| **VR HP + kacamata VR** | HP Android / iPhone + Cardboard / VR Box | Buka alamat web (atau APK) → **VR HP (Cardboard)** |
| **Web biasa (2D)** | Laptop / HP | Buka alamat web → **Mode Browser (2D)** |

## Fitur VR

- **Penanda batas ruang** (seperti Guardian Oculus): garis di lantai selalu terlihat, dinding grid muncul
  saat kepala/tangan mendekati batas dan berubah **merah** bila terlewati. Memakai batas ruang asli dari
  headset bila tersedia; jika tidak, lingkaran aman radius 1 m.
- **Tangan kiri & kanan sesuai controller**: kiri beraksen **biru**, kanan **oranye**; telunjuk mengikuti
  *trigger*, jari lain mengikuti *grip*. Tangan ikut bergerak saat berjalan/berputar dengan joystick.
- **Joystick**: stik kiri = jalan, stik kanan = putar, trigger = pilih objek (laser).
- **VR HP**: layar ganda + giroskop. Tatap objek 1,6 detik = pilih, ketuk layar = pilih cepat,
  tahan layar = jalan maju. Gamepad Bluetooth juga bisa dipakai.
- **Ringan**: panel admin dimuat terpisah, pencahayaan dibuat lokal (tanpa unduh HDR dari luar),
  berkas aplikasi di-cache (PWA) agar kunjungan berikutnya cepat.

## 1. Menjalankan di komputer / Google AI Studio

```bash
npm install
```

```bash
npm run dev
```

Buka `http://localhost:3000`. Struktur proyek AI Studio (`server.ts`, `vite.config.ts`, `metadata.json`)
tidak diubah, jadi tetap bisa diimpor dan dijalankan di AI Studio.

## 2. Hosting di Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pilih repo ini.
2. Isi:
   - **Build command**: `npm run build:web`
   - **Build output directory**: `dist`
3. Deploy. Anda mendapat alamat seperti `https://nama-proyek.pages.dev`.
4. Firebase Console → Authentication → Settings → **Authorized domains** → tambahkan domain
   `nama-proyek.pages.dev` (agar login admin Google berfungsi).

Folder `functions/` otomatis menjadi endpoint `/api/proxy-asset` di Cloudflare (pengganti server Express).
Kompresi Draco otomatis saat admin mengunggah model (`/api/optimize-model`) hanya ada di server Node
(AI Studio / `npm start`); di Cloudflare model diunggah apa adanya.

## 3. Membuat APK untuk Meta Quest / HP Android

APK ini adalah *Trusted Web Activity*: aplikasi kecil (±1 MB) yang membuka alamat web Anda dalam layar
penuh. Di Quest ia terbuka di mesin Meta Quest Browser sehingga WebXR (VR penuh) berfungsi.
**Butuh internet** saat dipakai.

1. Ubah `APP_URL` di [`android/app-config.properties`](android/app-config.properties) menjadi alamat
   Cloudflare Anda, lalu commit & push.
2. GitHub → tab **Actions** → **Build APK (Meta Quest & Android)** → jalankan / tunggu selesai →
   unduh artifact **smart-vocational-ev-apk**.
   (Atau di komputer dengan Android SDK: `npm run build:apk`.)
3. Pasang ke Quest (mode pengembang aktif, kabel USB):

```bash
adb install -r smart-vocational-ev.apk
```

   Bisa juga lewat SideQuest atau Meta Quest Developer Hub. Aplikasi muncul di
   **Library → Unknown Sources**.
4. Di HP Android: salin APK ke HP lalu pasang (izinkan "sumber tidak dikenal").

### Catatan kunci tanda tangan

`android/sideload.keystore` adalah kunci **khusus sideload** yang sengaja disimpan di repo supaya setiap
build bisa menimpa versi lama dan cocok dengan `public/.well-known/assetlinks.json`.
Jangan dipakai untuk rilis ke Play Store / Meta Store — untuk itu buat kunci sendiri dan isi variabel
`EVLAB_KEYSTORE_FILE`, `EVLAB_KEYSTORE_PASSWORD`, `EVLAB_KEY_ALIAS`, `EVLAB_KEY_PASSWORD`,
lalu ganti sidik jari di `assetlinks.json`.

## Struktur penting

- `src/components/TestLabEnvironment.tsx` — lingkungan Ruang Uji Kendaraan (aspal, lintasan, hanggar, charger, poster)
- `src/components/SampleEVCar.tsx` — stasiun contoh mobil listrik (model `public/models/contoh-mobil-listrik.glb`, tombol 3D Komponen / Jalankan / Putar / Reset)
- `src/components/GuardianBoundary.tsx` — penanda batas ruang
- `src/components/WebXRControllerManager.tsx` — tangan, laser, controller kiri/kanan
- `src/components/PhoneVR.tsx`, `src/lib/phoneVR.ts` — mode VR HP
- `android/` — proyek APK · `functions/` — Cloudflare Pages Functions · `public/` — manifest PWA, ikon
