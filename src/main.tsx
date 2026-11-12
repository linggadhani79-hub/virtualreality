import { qualityTier } from "./lib/quality";
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('THREE.Clock: This module has been deprecated.')) {
    return;
  }
  originalWarn.apply(console, args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: simpan semua berkas aplikasi untuk pemakaian offline (hanya di build produksi dan bukan di
// dalam iframe pratinjau AI Studio)
if (import.meta.env.PROD && "serviceWorker" in navigator && window.self === window.top) {
  window.addEventListener("load", () => {
    // Tingkat kualitas ikut di alamat: bila pengguna mengganti "Kualitas Aset", service worker baru
    // terpasang dan menyimpan model tingkat itu untuk dipakai offline.
    const sw = navigator.serviceWorker;
    // Versi baru mengambil alih saat halaman versi lama masih terbuka → muat ulang sekali,
    // supaya pengguna tidak perlu menyegarkan sendiri untuk melihat pembaruan.
    const hadController = !!sw.controller;
    let reloaded = false;
    sw.addEventListener("controllerchange", () => {
      // hanya sesaat setelah dibuka: jangan memotong pemakaian (mis. sedang di dalam VR)
      if (!hadController || reloaded || performance.now() > 90_000) return;
      // Sudah masuk lab: jangan memuat ulang di tengah pemakaian (aset sedang dimuat, pengguna
      // sedang melihat-lihat). Versi baru dipakai pada pembukaan berikutnya.
      try {
        if (sessionStorage.getItem("evlab_in_lab") === "1") return;
      } catch {}
      reloaded = true;
      window.location.reload();
    });
    sw.register(`/sw.js?tier=${qualityTier}`).catch(() => {});
    // Setelah halaman tampil, minta service worker menyimpan model 3D untuk pemakaian offline
    sw.ready.then((reg) => reg.active?.postMessage({ type: "precache" })).catch(() => {});
    // Minta browser tidak menghapus simpanan offline saat ruang penyimpanan menipis
    navigator.storage?.persist?.().catch(() => {});
  });
}
