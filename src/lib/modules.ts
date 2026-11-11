import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";

/**
 * Modul ajar digital: kumpulan slide teks yang dibaca mahasiswa di layar besar dalam lab VR.
 *
 * Urutan sumber data:
 *   1. yang disimpan admin di perangkat ini (IndexedDB),
 *   2. /lab/modul.json — ikut terpasang bersama aplikasi, berlaku di semua perangkat,
 *   3. modul bawaan di bawah ini.
 */
export type Slide = { title: string; body: string };
export type TeachingModule = { id: string; title: string; color: string; slides: Slide[] };

const KEY = "ev_modules_v1";
export const MODULE_COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#eab308"];

export const DEFAULT_MODULES: TeachingModule[] = [
  {
    id: "pengenalan",
    title: "Pengenalan Kendaraan Listrik",
    color: MODULE_COLORS[0],
    slides: [
      {
        title: "Apa itu kendaraan listrik?",
        body: "Kendaraan listrik (EV) digerakkan oleh motor listrik, bukan mesin bakar.\n- BEV: sepenuhnya baterai, tanpa mesin bensin\n- HEV: hibrida, baterai kecil diisi mesin dan pengereman\n- PHEV: hibrida yang bisa diisi dari stopkontak\n- FCEV: listrik dari sel bahan bakar hidrogen",
      },
      {
        title: "Mengapa beralih ke EV?",
        body: "- Tidak ada emisi gas buang dari knalpot\n- Efisiensi energi motor listrik di atas 85%, mesin bensin sekitar 30%\n- Torsi tersedia sejak putaran nol, akselerasi halus\n- Komponen bergerak lebih sedikit, perawatan lebih ringan",
      },
      {
        title: "Tantangan EV",
        body: "- Jarak tempuh bergantung kapasitas baterai\n- Waktu pengisian lebih lama dari mengisi bensin\n- Harga baterai masih tinggi\n- Teknisi wajib memahami K3 tegangan tinggi",
      },
    ],
  },
  {
    id: "komponen",
    title: "Komponen Utama BEV",
    color: MODULE_COLORS[1],
    slides: [
      {
        title: "Baterai traksi & BMS",
        body: "Baterai traksi menyimpan energi tegangan tinggi (±400–800 V) dalam ratusan sel lithium-ion dan dipasang di lantai kendaraan.\n- BMS memantau tegangan, arus, dan suhu setiap sel\n- BMS menyeimbangkan sel dan memutus arus bila tidak aman",
      },
      {
        title: "Inverter & motor listrik",
        body: "- Inverter mengubah DC baterai menjadi AC 3 fasa\n- Inverter mengatur kecepatan dan torsi motor\n- Motor mengubah energi listrik menjadi gerak putar roda\n- Saat mengerem, motor menjadi generator (regeneratif)",
      },
      {
        title: "OBC, DC-DC, dan port pengisian",
        body: "- On-Board Charger (OBC): AC dari PLN menjadi DC untuk baterai\n- DC-DC converter: tegangan tinggi menjadi 12 V untuk aksesori\n- Port pengisian: Type 2 untuk AC, CCS2 untuk DC cepat",
      },
      {
        title: "Alur energi",
        body: "Charger → OBC → Baterai → Inverter → Motor → Roda\n\nSaat pengereman regeneratif alurnya berbalik:\nRoda → Motor (generator) → Inverter → Baterai",
      },
    ],
  },
  {
    id: "k3",
    title: "K3 Tegangan Tinggi",
    color: MODULE_COLORS[4],
    slides: [
      {
        title: "Bahaya tegangan tinggi",
        body: "Sistem EV bekerja pada 400–800 V DC. Arus sekecil 50 mA yang melewati tubuh dapat mematikan.\n- Kabel ORANYE = tegangan tinggi\n- Kapasitor inverter masih bermuatan setelah mobil dimatikan",
      },
      {
        title: "Prosedur sebelum bekerja",
        body: "1. Pakai APD: sarung tangan isolasi, kacamata, sepatu isolasi\n2. Matikan kendaraan dan cabut kunci kontak\n3. Lepas service plug / MSD\n4. Tunggu ±10 menit sampai kapasitor kosong\n5. Ukur dan pastikan 0 V",
      },
      {
        title: "Keadaan darurat",
        body: "- Jangan sentuh korban yang masih terhubung listrik\n- Putuskan sumber, gunakan tongkat isolasi\n- Kebakaran baterai: gunakan APAR yang sesuai dan air dalam jumlah besar, jauhi asap\n- Hubungi petugas dan laporkan",
      },
    ],
  },
];

function isValid(data: unknown): data is TeachingModule[] {
  return (
    Array.isArray(data) &&
    data.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        typeof m.title === "string" &&
        Array.isArray(m.slides) &&
        m.slides.every((s: any) => s && typeof s.title === "string" && typeof s.body === "string"),
    )
  );
}

function withColors(mods: TeachingModule[]): TeachingModule[] {
  return mods.map((m, i) => ({ ...m, color: m.color || MODULE_COLORS[i % MODULE_COLORS.length] }));
}

let current: TeachingModule[] = DEFAULT_MODULES;
let loaded: Promise<TeachingModule[]> | null = null;
const listeners = new Set<(mods: TeachingModule[]) => void>();

export function getModules(): TeachingModule[] {
  return current;
}

export function loadModules(): Promise<TeachingModule[]> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const local = await idbGet(KEY);
        if (isValid(local) && local.length) return (current = withColors(local));
      } catch {}
      try {
        const res = await fetch("/lab/modul.json", { cache: "no-cache" });
        if (res.ok && (res.headers.get("content-type") || "").includes("json")) {
          const bundled = await res.json();
          if (isValid(bundled) && bundled.length) return (current = withColors(bundled));
        }
      } catch {}
      return (current = DEFAULT_MODULES);
    })().then((mods) => {
      listeners.forEach((l) => l(mods));
      return mods;
    });
  }
  return loaded;
}

export async function saveModules(mods: TeachingModule[]) {
  current = withColors(mods);
  await idbSet(KEY, current);
  listeners.forEach((l) => l(current));
}

/** Buang perubahan di perangkat ini dan kembali ke modul bawaan aplikasi. */
export async function resetModules() {
  await idbDel(KEY);
  loaded = null;
  current = DEFAULT_MODULES;
  await loadModules();
}

export function subscribeModules(listener: (mods: TeachingModule[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
