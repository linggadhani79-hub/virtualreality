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
    navigator.serviceWorker.register(`/sw.js?tier=${qualityTier}`).catch(() => {});
    // Minta browser tidak menghapus simpanan offline saat ruang penyimpanan menipis
    navigator.storage?.persist?.().catch(() => {});
  });
}
