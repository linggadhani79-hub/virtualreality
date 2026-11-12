# Smart Vocational EV — Lab VR kendaraan listrik

Media ajar kendaraan listrik (EV) berbasis WebXR untuk Meta Quest, HP + kacamata VR, dan browser.
Pemilik proyek berbahasa Indonesia: **balas dan tulis teks antarmuka dalam bahasa Indonesia.**

Untuk pekerjaan apa pun di repo ini, baca dulu `.claude/skills/ev-lab/SKILL.md`.

## Keputusan pemilik yang wajib diikuti

- **Tanpa database.** Aplikasi berjalan lokal seperti game VR offline. Jangan menambah Firebase
  atau server lain. Firebase lama hanya tersisa sebagai mode cadangan (`VITE_LOCAL_ONLY=false`).
- **Aset ditanam di aplikasi** (`public/models`, `public/lab`), bukan diunduh dari luar. Tidak ada
  CDN: decoder, font, dan pencahayaan semuanya lokal.
- **Tidak ada fitur unggah/unduh aset** di aplikasi. Sisi admin = mengisi **Modul Ajar Digital**.
- **Tanpa pilihan mode:** aplikasi dibuka di beranda (`HomeScreen`) dengan tombol *Masuk Lab* dan
  *Kebijakan Privasi*; tidak ada layar Mode Mahasiswa / Mode Admin, login, maupun layar unduh.
- **Jangan mengubah desain/tampilan mobil.** Perbaikan pada model hanya yang diminta.
- **Mulus di Quest lebih penting** dari jumlah segitiga: pakai dua tingkat kualitas (`-hq`/`-lite`).

## Perintah

```bash
npm install
npm run dev        # http://localhost:3000 (Express + Vite)
npm run lint       # tsc --noEmit
npm run build      # build web + server
npm run build:web  # build untuk Cloudflare
```

## Alur kerja Git

`main` adalah yang di-deploy Cloudflare. Kerjakan di branch, buka PR ke `main`, merge setelah
"Web build check" hijau. PR hanya dibuat/di-merge bila pemilik memintanya.
