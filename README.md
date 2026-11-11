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

## Isi lab

- **Mobil listrik** di lintasan uji dengan panel tombol 3D: Komponen (bodi tembus pandang, sasis asli
  dengan titik sorot komponen yang bisa dipilih), Jalankan (roda ikut berputar), Putar, Reset.
- **Zona EV**: etalase paket baterai traksi, motor listrik (dinamo), inverter, rangka & roda EV
  tanpa bodi (sasis yang sama dengan di dalam mobil), dan sepeda motor listrik.
- **Area pengisian**: charger DC cepat, stasiun AC, dan konektor CCS2.
- **Bengkel non-EV (pembanding)**: sasis tangga di atas lift (tombol NAIK / TURUN), rangka bermesin
  bensin, mesin 4 silinder, mesin V8, piston, dan rem cakram, plus poster "Mobil Listrik vs Mobil
  Bensin" di dinding belakang.
- **Peralatan & gedung**: lemari APD, bengkel perkakas berisolasi, troli diagnostik, APAR; gedung
  beratap lengkung dengan halaman paving, taman, dan pepohonan.
- **Tanya jawab**: kios kuis 10 soal pilihan ganda dengan penjelasan dan skor (tanpa internet).
- **Pojok baca**: buku-buku modul ajar di meja; buku yang dipilih berdiri di penyangganya dan
  isinya tampil sebagai slideshow di layar besar.
- **Tangan VR**: di Quest yang tampil hanya tangan (tanpa gambar controller); posisinya mengikuti
  controller dan jarinya menekuk mengikuti trigger, grip, serta tombol/stik jempol.
- **Modul Ajar Digital (admin)**: tombol di panel kanan untuk menulis modul dan slide. Tersimpan di
  perangkat; agar berlaku di semua perangkat, tekan *Salin JSON* dan simpan sebagai
  `public/lab/modul.json`, lalu build ulang.
- **Kualitas Aset**: *Tinggi* (bawaan di PC) atau *Ringan* (bawaan di Quest/HP agar mulus). Bisa
  diganti lewat tombol di panel kanan.

## Mode lokal — tanpa database, bisa offline

Secara bawaan aplikasi berjalan **tanpa database dan tanpa server** (seperti game VR offline):

- Tidak ada Firebase. Modul Firebase diganti penyimpanan di perangkat (`src/lib/local/`), sehingga
  aplikasi tidak menghubungi server mana pun dan ukurannya lebih kecil.
- Semua berkas aplikasi — kode, lingkungan Ruang Uji, model mobil — ikut di dalam aplikasi dan
  disimpan di perangkat saat **pertama kali dibuka** (perlu internet sekali, ±16 MB). Setelah itu
  aplikasi bisa dipakai tanpa internet, termasuk dari APK di Quest.
- Tidak ada fitur unggah/unduh aset di aplikasi; aset baru ditanam lewat `public/models` (lihat
  `.claude/skills/ev-lab/SKILL.md`).
- Agar map/aset tersedia di **semua** perangkat, masukkan ke aplikasi lewat folder
  [`public/lab/`](public/lab/README.txt) (`workspaces_global.json`, `workspaces_library.json`,
  `assets/<bufferId>`), lalu build ulang.
- Kuis Google Form tetap butuh internet.

Untuk memakai Firebase lagi (map bersama lewat cloud, login Google), build dengan
`VITE_LOCAL_ONLY=false`.

## Mode uji coba tanpa login

Di [`src/lib/appConfig.ts`](src/lib/appConfig.ts), `TRIAL_NO_AUTH = true` membuat **Mode Admin** dan
**Mode Mahasiswa** langsung terbuka tanpa kode akses atau login Google. Ubah menjadi `false` untuk
mengembalikan kode akses mahasiswa dan login admin sebelum aplikasi dipakai umum. Penyimpanan ke
cloud tetap mengikuti aturan keamanan Firebase.

## 1. Menjalankan di komputer / Google AI Studio

```bash
npm install
```

```bash
npm run dev
```

Buka `http://localhost:3000`. Struktur proyek AI Studio (`server.ts`, `vite.config.ts`, `metadata.json`)
tidak diubah, jadi tetap bisa diimpor dan dijalankan di AI Studio.

## 2. Hosting di Cloudflare (Workers)

1. Cloudflare Dashboard → **Workers & Pages → Create → Import a repository** → pilih repo ini
   (branch `main`).
2. Isi:
   - **Build command**: `npm run build:web`
   - **Deploy command**: `npx wrangler deploy`
3. Nama proyek di Cloudflare harus sama dengan `name` di [`wrangler.toml`](wrangler.toml)
   (sekarang `virtualreality`). Bila berbeda, ubah `name` di berkas itu.
4. Deploy. Anda mendapat alamat seperti `https://virtualreality.<akun>.workers.dev`.
5. Hanya bila memakai Firebase (`VITE_LOCAL_ONLY=false`): Firebase Console → Authentication →
   Settings → **Authorized domains** → tambahkan domain tersebut.

`worker/index.ts` menyediakan `/api/proxy-asset` di Cloudflare (pengganti server Express); berkas
lain disajikan langsung dari folder `dist`. Kompresi Draco otomatis saat admin mengunggah model
(`/api/optimize-model`) hanya ada di server Node (AI Studio / `npm start`); di Cloudflare model
diunggah apa adanya.

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
- `src/components/SampleEVCar.tsx` — stasiun contoh mobil listrik (model `public/models/mobil-{hq,lite}.glb`, tombol 3D Komponen / Jalankan / Putar / Reset)
- `src/components/GuardianBoundary.tsx` — penanda batas ruang
- `src/components/WebXRControllerManager.tsx` — tangan, laser, controller kiri/kanan
- `src/components/PhoneVR.tsx`, `src/lib/phoneVR.ts` — mode VR HP
- `scripts/build-car-model.mjs` — menyiapkan model mobil (haluskan bodi, bersihkan tekstur, pisahkan roda, kompres)
- `android/` — proyek APK · `worker/` — Cloudflare Worker (`/api/proxy-asset`) · `public/` — manifest PWA, ikon
