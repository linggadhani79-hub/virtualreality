import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {defineConfig, type Plugin} from 'vite';

// Daftar semua berkas aplikasi (termasuk model 3D) untuk disimpan service worker saat pertama
// dibuka, supaya setelah itu aplikasi bisa dipakai tanpa internet.
function offlinePrecache(): Plugin {
  // Berkas yang tidak pernah dimuat pengguna (emulator pengembangan, server, konfigurasi hosting)
  const skip = /(^|\/)(server\.cjs(\.map)?|_headers|\.assetsignore|sw\.js|precache-manifest\.json)$|\/(emulate|office_small|office_large|meeting_room|living_room|music_room)-[^/]+\.js$|^\.well-known\//;
  return {
    name: 'offline-precache',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(dist)) return;
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          if (fs.statSync(full).isDirectory()) walk(full);
          else files.push(path.relative(dist, full).split(path.sep).join('/'));
        }
      };
      walk(dist);
      const list = files.filter((f) => !skip.test(f)).map((f) => (f === 'index.html' ? '/' : '/' + f)).sort();
      const hash = crypto.createHash('sha1');
      for (const f of list) hash.update(f + fs.statSync(path.join(dist, f === '/' ? 'index.html' : f.slice(1))).size);
      const version = hash.digest('hex').slice(0, 12);
      fs.writeFileSync(path.join(dist, 'precache-manifest.json'), JSON.stringify({version, files: list}));
      // Versi ditulis ke sw.js agar browser memasang service worker baru setiap ada build baru
      const swPath = path.join(dist, 'sw.js');
      if (fs.existsSync(swPath)) {
        fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('__BUILD_ID__', version));
      }
    },
  };
}

export default defineConfig(() => {
  const localOnly = process.env.VITE_LOCAL_ONLY !== 'false';
  return {
    plugins: [react(), tailwindcss(), offlinePrecache()],
    resolve: {
      alias: [
        {find: '@', replacement: path.resolve(__dirname, '.')},
        // Mode lokal (bawaan): modul Firebase diganti penyimpanan di perangkat, jadi tidak ada
        // database / server yang dihubungi dan SDK Firebase tidak ikut dimuat.
        // Jalankan dengan VITE_LOCAL_ONLY=false untuk memakai Firebase lagi.
        ...(localOnly
          ? ['app', 'firestore', 'storage', 'auth'].map((m) => ({
              find: new RegExp(`^firebase/${m}$`),
              replacement: path.resolve(__dirname, `src/lib/local/firebase-${m}.ts`),
            }))
          : []),
      ],
    },
    define: {
      'import.meta.env.VITE_LOCAL_ONLY': JSON.stringify(localOnly ? 'true' : 'false'),
    },
    optimizeDeps: {
      include: [
        'use-sync-external-store/shim/with-selector',
        '@react-three/xr',
      ],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
