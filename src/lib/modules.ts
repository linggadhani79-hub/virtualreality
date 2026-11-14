import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";

/**
 * Modul ajar digital: kumpulan slide (teks + ilustrasi) yang dibaca mahasiswa di layar besar dalam
 * lab VR. Ilustrasi diambil dari model 3D asli di lab dan foto dari dalam lab
 * (public/lab/ilustrasi/*.webp, ikut tersimpan untuk offline).
 *
 * Urutan sumber data:
 *   1. yang disimpan admin di perangkat ini (IndexedDB),
 *   2. /lab/modul.json — ikut terpasang bersama aplikasi, berlaku di semua perangkat,
 *   3. modul bawaan di bawah ini.
 */
export type Slide = {
  title: string;
  body: string;
  /** nama berkas di public/lab/ilustrasi tanpa .webp (opsional) */
  image?: string;
  /** keterangan di bawah gambar */
  caption?: string;
};

/** Ilustrasi yang tersedia (dipakai juga oleh editor modul). */
export const ILLUSTRATIONS: { id: string; label: string }[] = [
  { id: "mobil", label: "Mobil listrik (BEV)" },
  { id: "mobil-konsep", label: "Mobil listrik konsep" },
  { id: "motor-ev", label: "Sepeda motor listrik" },
  { id: "sasis-ev", label: "Rangka & roda EV (platform skateboard)" },
  { id: "baterai", label: "Paket baterai traksi" },
  { id: "motor-listrik", label: "Motor listrik / e-axle" },
  { id: "inverter", label: "Inverter" },
  { id: "konektor", label: "Konektor CCS2" },
  { id: "charger-dc", label: "Charger DC cepat" },
  { id: "charger-ac", label: "Stasiun pengisian AC" },
  { id: "stasiun-surya", label: "Stasiun pengisian tenaga surya" },
  { id: "energi-surya", label: "Sudut energi surya di lab" },
  { id: "area-pengisian", label: "Area pengisian di lab" },
  { id: "mesin-bensin", label: "Mesin bensin 4 silinder" },
  { id: "piston", label: "Piston & batang torak" },
  { id: "rem", label: "Rem cakram & kaliper" },
  { id: "sasis-bensin", label: "Rangka mobil bermesin bensin" },
  { id: "bengkel-non-ev", label: "Bengkel pembanding non-EV" },
  { id: "apd", label: "Lemari APD tegangan tinggi" },
  { id: "game-rakit", label: "Game rakit mobil listrik" },
];
export const illustrationUrl = (id: string) => `/lab/ilustrasi/${id}.webp`;
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
        body: "Kendaraan listrik (EV) digerakkan motor listrik yang mendapat energi dari baterai, bukan dari mesin yang membakar bensin.\n- BEV: sepenuhnya baterai, tanpa mesin bensin\n- HEV: hibrida, baterai kecil diisi mesin dan pengereman\n- PHEV: hibrida yang bisa diisi dari stopkontak\n- FCEV: listrik dari sel bahan bakar hidrogen",
        image: "mobil",
        caption: "Mobil listrik baterai (BEV) di lintasan uji lab",
      },
      {
        title: "Mengapa beralih ke EV?",
        body: "- Tidak ada emisi gas buang dari knalpot\n- Efisiensi motor listrik di atas 85 %, mesin bensin hanya ±30 %\n- Torsi penuh sejak putaran nol: akselerasi halus dan senyap\n- Komponen bergerak lebih sedikit, perawatan lebih ringan\n- Bisa diisi dari listrik terbarukan, misalnya panel surya",
        image: "mobil-konsep",
        caption: "Mobil listrik yang berkeliling di lintasan luar",
      },
      {
        title: "Kendaraan listrik roda dua",
        body: "Prinsip sepeda motor listrik sama dengan mobil listrik: baterai, pengendali (controller), dan motor.\n- Baterai di tengah rangka, sebagian bisa dilepas dan ditukar\n- Motor memutar roda belakang lewat rantai atau langsung di roda (hub motor)\n- Tanpa kopling dan tanpa ganti gigi",
        image: "motor-ev",
        caption: "Sepeda motor listrik — etalase dekat pojok baca",
      },
      {
        title: "Tantangan EV",
        body: "- Jarak tempuh bergantung kapasitas baterai dan gaya mengemudi\n- Pengisian lebih lama dari mengisi bensin (AC: jam, DC cepat: ±30 menit)\n- Harga baterai masih tinggi, walau terus turun\n- Teknisi wajib memahami K3 tegangan tinggi",
        image: "area-pengisian",
        caption: "Area pengisian di dalam lab",
      },
    ],
  },
  {
    id: "komponen",
    title: "Komponen Utama BEV",
    color: MODULE_COLORS[1],
    slides: [
      {
        title: "Platform skateboard",
        body: "Hampir semua mobil listrik dibangun di atas rangka datar seperti papan skateboard.\n- Baterai rata di lantai: titik berat rendah, mobil stabil\n- Motor menyatu dengan poros roda (e-axle)\n- Tanpa mesin, tangki, knalpot, dan poros kopel: kabin lebih lega",
        image: "sasis-ev",
        caption: "Rangka & roda EV tanpa bodi",
      },
      {
        title: "Baterai traksi & BMS",
        body: "Baterai traksi menyimpan energi tegangan tinggi (±400–800 V) dalam ratusan sel lithium-ion yang dirangkai menjadi modul.\n- BMS memantau tegangan, arus, dan suhu setiap sel\n- BMS menyeimbangkan sel dan memutus arus bila tidak aman\n- Pendingin cairan menjaga suhu sel ±20–40 °C",
        image: "baterai",
        caption: "Paket baterai traksi: modul sel dan rangka pelindung",
      },
      {
        title: "Motor listrik",
        body: "Motor mengubah energi listrik menjadi gerak putar roda.\n- Stator berlilitan tembaga menghasilkan medan magnet berputar\n- Rotor (magnet permanen / induksi) ikut berputar\n- Gigi reduksi tunggal: tidak perlu ganti gigi\n- Saat mengerem, motor menjadi generator dan mengisi baterai",
        image: "motor-listrik",
        caption: "Unit penggerak listrik (e-axle)",
      },
      {
        title: "Inverter",
        body: "Baterai memberi arus searah (DC), sedangkan motor butuh arus bolak-balik (AC) 3 fasa.\n- Inverter mengubah DC menjadi AC 3 fasa\n- Mengatur kecepatan dan torsi motor ribuan kali per detik\n- Saat pengereman regeneratif, mengubah AC dari motor kembali menjadi DC",
        image: "inverter",
        caption: "Inverter dengan rumah bersirip pendingin",
      },
      {
        title: "OBC, DC-DC, dan alur energi",
        body: "- On-Board Charger (OBC): AC dari PLN menjadi DC untuk baterai\n- DC-DC converter: tegangan tinggi menjadi 12 V untuk lampu dan aksesori\n\nCharger → OBC → Baterai → Inverter → Motor → Roda\nRem regeneratif: Roda → Motor → Inverter → Baterai",
        image: "game-rakit",
        caption: "Coba susun sendiri di Game Rakit Mobil EV",
      },
    ],
  },
  {
    id: "pengisian",
    title: "Pengisian Daya EV",
    color: MODULE_COLORS[2],
    slides: [
      {
        title: "Pengisian AC",
        body: "Pengisian AC memakai listrik bolak-balik dari PLN, diubah menjadi DC oleh OBC di dalam mobil.\n- Daya 3,7–22 kW, cocok untuk di rumah atau kantor\n- Mengisi penuh butuh beberapa jam\n- Lebih ramah untuk umur baterai",
        image: "charger-ac",
        caption: "Stasiun pengisian AC",
      },
      {
        title: "Pengisian DC cepat",
        body: "Charger DC mengubah AC menjadi DC di dalam charger, lalu langsung mengisi baterai tanpa melewati OBC.\n- Daya 50–350 kW\n- 20–80 % dalam ±30 menit\n- Pengisian melambat setelah ±80 % untuk melindungi sel",
        image: "charger-dc",
        caption: "Charger DC cepat di area pengisian lab",
      },
      {
        title: "Konektor CCS2",
        body: "CCS2 adalah standar konektor yang umum dipakai di Indonesia.\n- Bagian atas (Type 2): pengisian AC\n- Dua pin besar di bawah: pengisian DC cepat\n- Pin kecil: komunikasi mobil ↔ charger\n- Konektor terkunci selama pengisian, arus mengalir setelah mobil memberi izin",
        image: "konektor",
        caption: "Konektor CCS2",
      },
      {
        title: "Mengisi dari tenaga surya",
        body: "Stasiun pengisian dapat memakai panel surya di atapnya.\n- Siang hari panel menghasilkan listrik DC\n- Baterai stasiun menyimpan kelebihan energi\n- Mobil tetap bisa diisi saat berawan atau malam hari\n- Emisi dari sumber listriknya ikut berkurang",
        image: "stasiun-surya",
        caption: "Stasiun pengisian tenaga surya di lintasan luar",
      },
    ],
  },
  {
    id: "perbandingan",
    title: "EV vs Mobil Bensin",
    color: MODULE_COLORS[5],
    slides: [
      {
        title: "Mesin bensin",
        body: "Mesin bensin membakar campuran bensin dan udara di dalam silinder (siklus 4 langkah: hisap, kompresi, usaha, buang).\n- Ribuan komponen bergerak\n- Butuh oli, busi, filter, radiator, dan knalpot\n- Efisiensi hanya ±25–35 %: sebagian besar energi terbuang sebagai panas",
        image: "mesin-bensin",
        caption: "Mesin bensin 4 silinder di bengkel non-EV",
      },
      {
        title: "Piston & batang torak",
        body: "Ledakan pembakaran mendorong piston naik-turun.\n- Batang torak mengubah gerak naik-turun menjadi putaran poros engkol\n- Gerak bolak-balik menimbulkan getaran dan gesekan\n- Motor listrik langsung berputar, jadi tidak punya piston",
        image: "piston",
        caption: "Piston dan batang torak",
      },
      {
        title: "Rangka: bensin vs listrik",
        body: "- Bensin: mesin di depan, transmisi, poros kopel, gardan, tangki, dan knalpot memenuhi kolong\n- Listrik: lantai rata berisi baterai, motor di poros roda\n- Ruang mesin EV bisa menjadi bagasi tambahan",
        image: "sasis-bensin",
        caption: "Rangka mobil bermesin bensin",
      },
      {
        title: "Rem: gesek vs regeneratif",
        body: "Mobil bensin mengerem hanya dengan gesekan: kampas menjepit cakram dan energi gerak terbuang menjadi panas.\n- EV mengerem dulu dengan motor (regeneratif) dan mengisi baterai\n- Rem cakram tetap ada untuk pengereman keras dan darurat\n- Hasilnya kampas rem EV lebih awet",
        image: "rem",
        caption: "Rem cakram & kaliper",
      },
    ],
  },
  {
    id: "surya",
    title: "Energi Surya & Penyimpanan",
    color: MODULE_COLORS[3],
    slides: [
      {
        title: "Listrik dari matahari",
        body: "Panel surya mengubah cahaya matahari menjadi listrik DC melalui sel silikon.\n- Satu panel ±400–550 W pada terik penuh\n- Daya turun saat berawan dan nol di malam hari\n- Atap lab ini dipenuhi panel surya untuk menyalakan lampu",
        image: "energi-surya",
        caption: "Sudut energi surya di dalam lab",
      },
      {
        title: "Cara kerja sel surya",
        body: "Sel surya terbuat dari dua lapis silikon yang berbeda muatan (tipe-n dan tipe-p).\n- Foton cahaya mengenai sel dan melepaskan elektron\n- Medan listrik di sambungan p-n mendorong elektron ke satu arah\n- Elektron mengalir lewat kabel sebagai arus DC (efek fotovoltaik)\n- Banyak sel dirangkai seri-paralel menjadi satu panel",
        image: "stasiun-surya",
        caption: "Panel surya terdiri dari puluhan sel silikon",
      },
      {
        title: "MPPT: mengambil daya maksimum",
        body: "Daya panel = tegangan × arus, dan titik terbaiknya berubah sesuai cahaya dan suhu.\n- Pengendali MPPT terus menggeser tegangan kerja panel\n- Mencari titik yang memberi daya terbesar\n- Tanpa MPPT, daya yang hilang bisa 10–30 %",
        image: "energi-surya",
        caption: "Inverter surya di lab sudah dilengkapi MPPT",
      },
      {
        title: "Inverter & baterai penyimpanan",
        body: "- Inverter surya mengubah DC dari panel menjadi AC untuk lampu dan alat\n- Siang hari kelebihan daya mengisi baterai penyimpanan\n- Malam hari baterai menyuplai lampu lab\n- Prinsipnya sama dengan mobil listrik: energi disimpan baterai, diubah inverter",
        image: "stasiun-surya",
        caption: "Panel surya, inverter, dan baterai bekerja bersama",
      },
      {
        title: "On-grid, off-grid, dan hibrida",
        body: "- On-grid: tersambung PLN, tanpa baterai; kelebihan daya dialirkan ke jaringan\n- Off-grid: berdiri sendiri, wajib baterai\n- Hibrida: tersambung PLN dan punya baterai — seperti lab ini\n- Panel surya juga bisa mengisi mobil listrik di stasiun pengisian",
        image: "stasiun-surya",
        caption: "Stasiun pengisian tenaga surya di lintasan luar",
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
        body: "Sistem EV bekerja pada 400–800 V DC. Arus sekecil 50 mA yang melewati tubuh dapat mematikan.\n- Kabel ORANYE = tegangan tinggi\n- Kapasitor inverter masih bermuatan setelah mobil dimatikan\n- Baterai tetap bertegangan walau mobil mati",
        image: "inverter",
        caption: "Label oranye menandai komponen tegangan tinggi",
      },
      {
        title: "Alat Pelindung Diri (APD)",
        body: "- Sarung tangan isolasi kelas 0 (1000 V), diperiksa bocor sebelum dipakai\n- Kacamata / pelindung wajah dari percikan busur listrik\n- Sepatu isolasi dan matras karet\n- Perkakas berisolasi 1000 V\n- Lepas jam tangan, cincin, dan benda logam",
        image: "apd",
        caption: "Lemari APD tegangan tinggi di lab",
      },
      {
        title: "Prosedur sebelum bekerja",
        body: "1. Pakai APD lengkap\n2. Matikan kendaraan dan simpan kunci jauh dari mobil\n3. Lepas service plug / MSD\n4. Tunggu ±10 menit sampai kapasitor kosong\n5. Ukur dengan multimeter dan pastikan 0 V\n6. Pasang tanda \"SEDANG DIKERJAKAN\"",
        image: "baterai",
        caption: "Baterai traksi tetap bertegangan walau mobil mati",
      },
      {
        title: "Keadaan darurat",
        body: "- Jangan sentuh korban yang masih terhubung listrik\n- Putuskan sumber listrik, gunakan tongkat isolasi\n- Kebakaran baterai: APAR yang sesuai dan air dalam jumlah besar, jauhi asap beracun\n- Hubungi petugas dan laporkan kejadian",
        image: "apd",
        caption: "Kenali letak APD dan APAR sebelum bekerja",
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
