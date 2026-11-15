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
  { id: "derek-rakit", label: "Derek gantri di game rakit" },
  { id: "praktik-baterai", label: "Meja praktik baterai" },
  { id: "pendingin-baterai", label: "Stasiun pendingin baterai" },
  { id: "uji-boros", label: "Area uji boros (parkir & SPBU)" },
  { id: "rem-regeneratif", label: "Diagram rem regeneratif" },
  { id: "eaxle-8in1", label: "Diagram e-Axle 8-in-1" },
];
export const illustrationUrl = (id: string) => `/lab/ilustrasi/${id}.webp`;
export type TeachingModule = {
  id: string;
  title: string;
  color: string;
  slides: Slide[];
};

const KEY = "ev_modules_v1";
export const MODULE_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#eab308",
];

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
        body: '1. Pakai APD lengkap\n2. Matikan kendaraan dan simpan kunci jauh dari mobil\n3. Lepas service plug / MSD\n4. Tunggu ±10 menit sampai kapasitor kosong\n5. Ukur dengan multimeter dan pastikan 0 V\n6. Pasang tanda "SEDANG DIKERJAKAN"',
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
  {
    id: "baterai",
    title: "Baterai Traksi: Sel, Rangkaian, dan kWh",
    color: MODULE_COLORS[0],
    slides: [
      {
        title: "Dari sel menjadi paket",
        body: "Paket baterai traksi tersusun bertingkat.\n- Sel: satuan terkecil, ±3,2 V (LFP) atau ±3,7 V (NMC)\n- Modul: beberapa sel dirangkai dan dijepit jadi satu\n- Paket: gabungan modul + BMS + pendingin + pelindung\nPaket 400 V berisi sekitar 100 sel seri.",
        image: "baterai",
        caption: "Paket baterai traksi di lab",
      },
      {
        title: "Rangkaian seri dan paralel",
        body: "Cara merangkai menentukan tegangan dan kapasitas.\n- SERI: tegangan dijumlah, kapasitas (Ah) tetap\n- PARALEL: kapasitas dijumlah, tegangan tetap\n- 4S2P = 4 kelompok seri, tiap kelompok 2 sel paralel\nContoh sel 3,7 V 3 Ah dirangkai 4S2P: 14,8 V dan 6 Ah.",
        image: "praktik-baterai",
        caption: "Meja praktik baterai: ukur, ganti, rangkai, las",
      },
      {
        title: "Menghitung energi (kWh)",
        body: "Energi = tegangan x kapasitas.\n- Wh = V x Ah, lalu kWh = Wh : 1000\n- Contoh 4S2P: 14,8 V x 6 Ah = 88,8 Wh\n- Paket mobil 350 V x 150 Ah = 52,5 kWh\nJarak tempuh kira-kira = kWh paket : konsumsi (kWh per km).",
      },
      {
        title: "BMS dan penyeimbangan sel",
        body: "Battery Management System menjaga tiap sel tetap aman.\n- Memantau tegangan, arus, dan suhu tiap sel\n- Memutus arus bila terlalu penuh, terlalu kosong, atau terlalu panas\n- Balancing: menyamakan tegangan antarsel agar kapasitas paket terpakai penuh\nSel yang tegangannya jauh berbeda atau hambatan dalamnya tinggi harus diganti.",
      },
      {
        title: "Menyambung sel: las titik",
        body: "Sel tidak disolder langsung karena panasnya merusak sel.\n- Busbar nikel dilas titik ke kutub sel\n- Pulsa arus besar sangat singkat, sel tidak sempat panas\n- Sebelum paralel, tegangan sel disamakan dulu\nCoba urutannya di meja praktik baterai.",
        image: "praktik-baterai",
        caption: "Praktik: ukur → ganti → seimbangkan → rangkai → las",
      },
    ],
  },
  {
    id: "termal",
    title: "Pendinginan Baterai",
    color: MODULE_COLORS[1],
    slides: [
      {
        title: "Mengapa suhu penting",
        body: "Baterai lithium bekerja paling baik pada 20–40 °C.\n- Terlalu panas: sel cepat menua, risiko thermal runaway\n- Terlalu dingin: daya turun dan pengisian harus diperlambat\n- Beda suhu antarsel sebaiknya di bawah ±5 °C",
        image: "pendingin-baterai",
        caption: "Stasiun pendingin baterai di lab",
      },
      {
        title: "Pendingin cair dan pelat dingin",
        body: "Kebanyakan EV modern memakai pendingin cair.\n- Cairan mengalir di pelat dingin di bawah sel\n- Pompa listrik mengedarkan cairan\n- Radiator dan kipas membuang panas ke udara\n- Sel blade tersusun rapat sehingga pelat dingin menyentuh semua sel",
        image: "pendingin-baterai",
        caption: "Sel blade di atas pelat dingin, modul termal, radiator",
      },
      {
        title: "Chiller dan pemanas PTC",
        body: "Saat radiator tidak cukup, sistem AC ikut membantu.\n- Chiller: penukar panas ke rangkaian AC, dipakai saat fast charging atau cuaca panas\n- Pemanas PTC: menghangatkan baterai saat dingin\n- Katup mengatur jalur: radiator, chiller, atau pemanas",
      },
      {
        title: "Empat keadaan kerja",
        body: "Cobakan di stasiun pendingin baterai.\n- Santai: panas kecil, pompa pelan\n- Ngebut: arus besar, radiator dan kipas bekerja\n- Fast charging: panas paling besar, chiller menyala\n- Cuaca dingin: pemanas menaikkan suhu sebelum mengisi",
      },
    ],
  },
  {
    id: "penggerak",
    title: "Motor, Inverter & e-Axle 8-in-1",
    color: MODULE_COLORS[2],
    slides: [
      {
        title: "Bagian motor listrik",
        body: "Motor listrik EV sederhana: hanya satu bagian yang berputar.\n- Stator: bagian diam berisi lilitan tembaga\n- Rotor: bagian berputar, bermagnet permanen (PMSM) atau sangkar (induksi)\n- Sensor posisi (resolver) memberi tahu inverter posisi rotor",
        image: "motor-listrik",
        caption: "Motor listrik / e-axle di lab",
      },
      {
        title: "Medan putar 3 fasa",
        body: "Tiga arus bolak-balik yang berbeda fasa 120° menghasilkan medan magnet berputar di stator.\n- Rotor ikut terseret medan putar\n- Frekuensi arus menentukan kecepatan putar\n- Besar arus menentukan torsi\nTorsi besar tersedia sejak 0 rpm, sehingga EV tidak butuh gigi percepatan.",
      },
      {
        title: "Inverter",
        body: "Inverter mengubah DC baterai menjadi AC 3 fasa.\n- Enam saklar daya (IGBT atau SiC MOSFET) membuka-tutup ribuan kali per detik\n- Lebar pulsa (PWM) diatur agar arus motor berbentuk sinus\n- Kapasitor besar di dalamnya masih bermuatan setelah mobil dimatikan",
        image: "inverter",
        caption: "Inverter & elektronika daya",
      },
      {
        title: "Gigi reduksi dan e-axle",
        body: "Motor berputar sangat cepat (sampai ±16.000 rpm).\n- Gigi reduksi satu tingkat menurunkan putaran dan menaikkan torsi ke roda\n- Diferensial membagi putaran roda kiri dan kanan\n- Motor + inverter + gigi dalam satu rumah disebut e-axle",
        image: "sasis-ev",
        caption: "Rangka EV: unit penggerak di poros roda",
      },
      {"title": "PDU: pembagi listrik tegangan tinggi", "body": "Power Distribution Unit adalah \"panel listrik\" tegangan tinggi di mobil.\n- Relai utama (kontaktor) menyambung / memutus baterai\n- Rangkaian pra-isi mengisi kapasitor inverter pelan-pelan agar relai tidak meletik\n- Sekring melindungi tiap cabang\n- Membagi arus ke inverter, OBC, DC-DC, kompresor AC, dan pemanas", "image": "eaxle-8in1", "caption": "PDU di tengah aliran energi"},
      {"title": "VCU: otak kendaraan", "body": "Vehicle Control Unit memutuskan apa yang dilakukan mobil.\n- Membaca pedal gas, pedal rem, posisi gigi (D/N/R), dan kecepatan\n- Bertanya ke BMS: berapa daya yang boleh diambil / dimasukkan\n- Memerintah inverter: torsi maju, atau torsi negatif untuk rem regeneratif\n- Berkomunikasi lewat jaringan CAN dengan semua modul", "image": "eaxle-8in1", "caption": "VCU memerintah lewat sinyal, bukan arus besar"},
      {"title": "e-Axle 8-in-1", "body": "Platform EV terbaru menyatukan delapan modul dalam satu rumah di poros roda.\n- Penggerak: Motor, Inverter, Reducer\n- Daya: OBC, DC-DC, PDU\n- Kendali: VCU, BMS\nContoh: BYD e-Platform 3.0. Sebelumnya modul-modul ini terpisah dan dihubungkan banyak kabel oranye.", "image": "eaxle-8in1", "caption": "Delapan modul dalam satu e-Axle"},
      {"title": "Untung-rugi integrasi", "body": "Kelebihan:\n- Lebih ringan dan ringkas (±15–20 %), kabel tegangan tinggi lebih pendek\n- Efisiensi sistem naik, satu rangkaian pendingin untuk semua\n- Perakitan di pabrik lebih cepat\nKekurangan:\n- Satu modul rusak bisa berarti mengganti satu unit besar\n- Diagnosis butuh alat pindai khusus pabrikan", "image": "motor-listrik", "caption": "Unit penggerak di lab"},
    ],
  },
  {
    id: "regen",
    title: "Rem Regeneratif",
    color: MODULE_COLORS[3],
    slides: [
      {
        title: "Apa itu rem regeneratif",
        body: "Saat pedal gas dilepas atau rem diinjak, motor listrik berubah menjadi generator.\n- Roda memutar motor, bukan sebaliknya\n- Energi gerak diubah menjadi listrik dan disimpan ke baterai\n- Mobil melambat tanpa menggesek kampas rem",
        image: "rem-regeneratif",
        caption: "Alur energi saat melaju dan saat mengerem",
      },
      {
        title: "Cara kerjanya langkah demi langkah",
        body: "1. Pengemudi melepas gas / menginjak rem\n2. Pengendali meminta torsi negatif dari motor\n3. Inverter mengatur arus sehingga medan stator tertinggal dari rotor\n4. Motor menghasilkan listrik AC 3 fasa\n5. Inverter menyearahkannya menjadi DC\n6. BMS mengizinkan arus masuk dan baterai terisi",
        image: "rem-regeneratif",
        caption: "Motor → inverter → baterai",
      },
      {
        title: "Peran inverter dan BMS",
        body: "Inverter bekerja dua arah.\n- Melaju: DC baterai → AC motor\n- Mengerem: AC motor → DC baterai\nBMS membatasi arus regeneratif.\n- Baterai hampir penuh atau sangat dingin: regeneratif dikurangi\n- Kekurangannya ditutup rem cakram secara otomatis",
        image: "inverter",
        caption: "Inverter: jalan dua arah bagi energi",
      },
      {
        title: "Rem gabungan (blended braking)",
        body: "Rem cakram tetap ada.\n- Pengereman ringan sampai sedang: sebagian besar regeneratif\n- Pengereman keras atau darurat: rem cakram ikut bekerja penuh\n- Di kecepatan sangat rendah regeneratif melemah, rem cakram menghentikan mobil\nKarena itu kampas rem EV jauh lebih awet.",
        image: "rem",
        caption: "Rem cakram & kaliper tetap dipakai",
      },
      {
        title: "Berapa energi yang kembali",
        body: "Tidak semua energi kembali.\n- Efisiensi roda → baterai sekitar 60–70 %\n- Di dalam kota bisa menambah jarak tempuh ±10–25 %\n- Di jalan tol manfaatnya kecil karena jarang mengerem\nAmati mobil di lintasan uji: lampu rem menyala dan status berubah menjadi REGEN saat melambat.",
        image: "rem-regeneratif",
        caption: "Lihat rambu REM REGENERATIF di lintasan uji",
      },
    ],
  },
  {
    id: "biaya",
    title: "Biaya Energi & Emisi",
    color: MODULE_COLORS[4],
    slides: [
      {
        title: "Menghitung biaya per km",
        body: "Bandingkan dengan satuan yang sama: rupiah per km.\n- Bensin: (liter per 100 km : 100) x harga per liter\n- Listrik: (kWh per 100 km : 100) x tarif per kWh\nContoh di lab: bensin 8 L/100 km x Rp 10.000 = Rp 800/km; listrik 15 kWh/100 km x Rp 2.466 = ±Rp 370/km.",
        image: "uji-boros",
        caption: "Area uji boros: bensin vs listrik",
      },
      {
        title: "Waktu isi dan kapasitas",
        body: "Tangki dan baterai diisi dengan cara berbeda.\n- Bensin 40 L: penuh dalam ±5 menit\n- Baterai 50 kWh di AC 7 kW: ±7 jam; di DC cepat: ±30–40 menit sampai 80 %\n- EV biasa diisi saat parkir (malam hari), bukan menunggu kosong",
        image: "uji-boros",
        caption: "SPBU dan tiang cas di area parkir",
      },
      {
        title: "Efisiensi energi",
        body: "Dari energi yang dibeli, berapa yang menjadi gerak?\n- Mesin bensin: ±25–30 %, sisanya panas\n- Motor listrik + inverter: ±85–90 %\n- Rem regeneratif mengembalikan sebagian energi saat melambat",
      },
      {
        title: "Emisi",
        body: "Mobil bensin mengeluarkan ±2,3 kg CO2 per liter bensin.\n- EV tidak punya knalpot, tetapi listriknya bisa berasal dari pembangkit berbahan bakar fosil\n- Emisi EV turun bila listriknya dari surya, air, atau angin\n- Mengisi dari panel surya lab adalah contoh energi bersih",
        image: "stasiun-surya",
        caption: "Stasiun pengisian tenaga surya",
      },
    ],
  },
  {
    id: "perawatan",
    title: "Perakitan, Perawatan & Diagnosis EV",
    color: MODULE_COLORS[5],
    slides: [
      {
        title: "Urutan perakitan",
        body: "Komponen dipasang dari dasar ke atas (12 langkah, lengkap e-Axle 8-in-1).\n1. Rangka & roda → 2. Baterai → 3. BMS\n4. Reducer → 5. Motor → 6. Inverter\n7. PDU → 8. OBC → 9. DC-DC → 10. VCU\n11. Kabel tegangan tinggi (oranye)\n12. Bodi diturunkan paling akhir dengan derek gantri",
        image: "derek-rakit",
        caption: "Derek gantri di game rakit mobil listrik",
      },
      {
        title: "Perawatan berkala EV",
        body: "Lebih sedikit daripada mobil bensin, tetapi tetap ada.\n- Cairan pendingin baterai dan inverter\n- Minyak rem dan kampas (jarang aus)\n- Ban, suspensi, dan filter kabin\n- Oli gigi reduksi sesuai jadwal pabrik\nTidak ada: oli mesin, busi, filter udara mesin, knalpot.",
      },
      {
        title: "Diagnosis dasar",
        body: "Mulai dari yang aman dan mudah.\n- Baca kode gangguan (DTC) dengan alat pindai\n- Periksa aki 12 V: banyak gangguan EV berawal dari sini\n- Lihat data BMS: tegangan dan suhu tiap sel\n- Uji tahanan isolasi sebelum menyentuh sistem tegangan tinggi",
      },
      {
        title: "Selalu ingat K3",
        body: 'Sebelum membuka komponen tegangan tinggi.\n- Pakai APD: sarung tangan isolasi, pelindung wajah\n- Lepas service plug dan tunggu ±10 menit\n- Ukur dan pastikan tegangan sudah nol\n- Pasang tanda "sedang dikerjakan"',
        image: "apd",
        caption: "Lemari APD tegangan tinggi",
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
        m.slides.every(
          (s: any) =>
            s && typeof s.title === "string" && typeof s.body === "string",
        ),
    )
  );
}

function withColors(mods: TeachingModule[]): TeachingModule[] {
  return mods.map((m, i) => ({
    ...m,
    color: m.color || MODULE_COLORS[i % MODULE_COLORS.length],
  }));
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
        if (isValid(local) && local.length)
          return (current = withColors(local));
      } catch {}
      try {
        const res = await fetch("/lab/modul.json", { cache: "no-cache" });
        if (
          res.ok &&
          (res.headers.get("content-type") || "").includes("json")
        ) {
          const bundled = await res.json();
          if (isValid(bundled) && bundled.length)
            return (current = withColors(bundled));
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

export function subscribeModules(
  listener: (mods: TeachingModule[]) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
