/**
 * OBE (Outcome-Based Education): CPL → CPMK → urutan kegiatan belajar → bukti & nilai per siswa.
 *
 * Tanpa database: semua catatan disimpan di perangkat (localStorage), satu catatan per siswa.
 * Kegiatan di lab memanggil `recordActivity` / `recordQuiz`; panel "Capaian" (ObePanel) dan papan
 * alur di lab membaca hasilnya lewat `useObe`.
 */
import { useSyncExternalStore } from "react";

export type Cpl = { id: string; domain: string; text: string };
export type Cpmk = { id: string; cpl: string; text: string; indicator: string };
export type Activity = {
  id: string;
  title: string;
  where: string;
  kind: "Materi" | "Praktik" | "Evaluasi";
  cpmk: string[];
  /** apa yang dicatat sebagai bukti */
  evidence: string;
};

export const COURSE = {
  name: "Teknologi Kendaraan Listrik",
  /** batas tuntas (0–100) */
  pass: 70,
  /** bobot nilai CPMK */
  weight: { quiz: 0.6, activity: 0.4 },
};

export const CPL: Cpl[] = [
  { id: "CPL-1", domain: "Sikap", text: "Menerapkan budaya keselamatan kerja (K3) dan prosedur kerja aman pada sistem tegangan tinggi kendaraan listrik." },
  { id: "CPL-2", domain: "Pengetahuan", text: "Menguasai konsep dan prinsip kerja komponen utama kendaraan listrik serta perbedaannya dengan kendaraan bermesin bakar." },
  { id: "CPL-3", domain: "Keterampilan khusus", text: "Mampu memeriksa, merangkai, dan merakit komponen baterai dan sistem penggerak kendaraan listrik sesuai prosedur." },
  { id: "CPL-4", domain: "Keterampilan umum", text: "Mampu menganalisis pengisian daya, biaya energi, dan emisi berdasarkan data untuk mengambil keputusan yang tepat." },
];

export const CPMK: Cpmk[] = [
  { id: "CPMK-1", cpl: "CPL-1", text: "Menjelaskan bahaya tegangan tinggi dan menerapkan APD serta urutan kerja aman.", indicator: "Menyebutkan APD, langkah pemutusan tegangan, dan tindakan darurat dengan benar." },
  { id: "CPMK-2", cpl: "CPL-2", text: "Menjelaskan fungsi baterai traksi, motor listrik, inverter, DC-DC converter, dan alur energinya.", indicator: "Mengidentifikasi komponen dan arah aliran energi saat melaju dan saat mengerem." },
  { id: "CPMK-3", cpl: "CPL-2", text: "Membandingkan konstruksi dan efisiensi kendaraan listrik dengan kendaraan bermesin bensin.", indicator: "Menjelaskan perbedaan komponen, perawatan, dan efisiensi kedua jenis kendaraan." },
  { id: "CPMK-4", cpl: "CPL-3", text: "Memeriksa sel baterai, menghitung rangkaian seri/paralel, menyeimbangkan sel, dan menjelaskan pendinginannya.", indicator: "Mengukur tegangan sel, mengganti sel rusak, merangkai sesuai target, dan memilih mode pendinginan." },
  { id: "CPMK-5", cpl: "CPL-3", text: "Merakit komponen kendaraan listrik sesuai urutan perakitan yang benar.", indicator: "Menyusun rangka, baterai, motor, inverter, kabel, dan bodi dengan urutan tepat." },
  { id: "CPMK-6", cpl: "CPL-4", text: "Menganalisis jenis pengisian daya serta membandingkan biaya energi dan emisi.", indicator: "Membedakan pengisian AC/DC dan menghitung biaya per km bensin dibanding listrik." },
];

/** Urutan pembelajaran (alur) — dari pengenalan, materi, praktik, sampai evaluasi. */
export const ACTIVITIES: Activity[] = [
  { id: "k3", title: "Orientasi K3 & APD", where: "Lemari APD dan poster K3 di dalam lab", kind: "Materi", cpmk: ["CPMK-1"], evidence: "Mengunjungi pos K3" },
  { id: "modul", title: "Membaca Modul Ajar", where: "Pojok baca (meja buku + layar)", kind: "Materi", cpmk: ["CPMK-1", "CPMK-2"], evidence: "Membaca satu modul sampai slide terakhir" },
  { id: "komponen", title: "Mengamati komponen EV", where: "Zona komponen: baterai, motor listrik, inverter", kind: "Materi", cpmk: ["CPMK-2"], evidence: "Mengunjungi zona komponen" },
  { id: "pembanding", title: "Membandingkan dengan mesin bensin", where: "Bengkel pembanding (mesin, piston, rem)", kind: "Materi", cpmk: ["CPMK-3"], evidence: "Mengunjungi bengkel pembanding" },
  { id: "baterai", title: "Praktik baterai: ukur, ganti, seimbangkan, rangkai, las", where: "Meja praktik baterai", kind: "Praktik", cpmk: ["CPMK-4"], evidence: "Menyelesaikan praktik; nilai turun tiap salah langkah" },
  { id: "pendingin", title: "Simulasi pendingin baterai", where: "Stasiun pendingin baterai", kind: "Praktik", cpmk: ["CPMK-4"], evidence: "Mencoba keempat skenario pendinginan" },
  { id: "pengisian", title: "Pengisian daya & uji boros energi", where: "Zona pengisian dan area parkir / SPBU di luar", kind: "Materi", cpmk: ["CPMK-6"], evidence: "Mengunjungi zona pengisian dan area uji boros" },
  { id: "rakit", title: "Game rakit mobil listrik", where: "Sayap kanan lab (derek gantri)", kind: "Praktik", cpmk: ["CPMK-5"], evidence: "Menyelesaikan perakitan; nilai turun tiap salah pilih" },
  { id: "kuis", title: "Evaluasi: kuis tanya-jawab", where: "Kios kuis di depan kiri", kind: "Evaluasi", cpmk: CPMK.map((c) => c.id), evidence: "Jawaban tiap soal dicatat per CPMK" },
];

/**
 * Rencana 16 pertemuan (RPS). `modules` = modul ajar yang dibaca (id di lib/modules.ts),
 * `acts` = kegiatan lab (id di ACTIVITIES), `quizRounds` = jumlah ronde kuis minimal (UTS/UAS).
 */
export type Meeting = { no: number; topic: string; cpmk: string[]; modules: string[]; acts: string[]; quizRounds?: number; method: string };
export const MEETINGS: Meeting[] = [
  { no: 1, topic: "Kontrak belajar, CPL, dan pengenalan kendaraan listrik", cpmk: ["CPMK-2"], modules: ["pengenalan"], acts: [], method: "Baca modul, jelajah lab" },
  { no: 2, topic: "K3 tegangan tinggi dan APD", cpmk: ["CPMK-1"], modules: ["k3"], acts: ["k3"], method: "Baca modul, kunjungi pos K3" },
  { no: 3, topic: "Arsitektur dan komponen utama BEV", cpmk: ["CPMK-2"], modules: ["komponen"], acts: ["komponen"], method: "Baca modul, amati komponen" },
  { no: 4, topic: "Baterai traksi: sel, seri/paralel, dan perhitungan kWh", cpmk: ["CPMK-4"], modules: ["baterai"], acts: [], method: "Baca modul, latihan hitung di papan baterai" },
  { no: 5, topic: "BMS, penyeimbangan sel, dan praktik baterai", cpmk: ["CPMK-4"], modules: [], acts: ["baterai"], method: "Praktik di meja baterai" },
  { no: 6, topic: "Manajemen termal: pendinginan baterai", cpmk: ["CPMK-4"], modules: ["termal"], acts: ["pendingin"], method: "Baca modul, simulasi 4 skenario" },
  { no: 7, topic: "Motor listrik, inverter, dan gigi reduksi", cpmk: ["CPMK-2"], modules: ["penggerak"], acts: [], method: "Baca modul, amati motor & inverter" },
  { no: 8, topic: "Ujian Tengah Semester (UTS)", cpmk: ["CPMK-1", "CPMK-2", "CPMK-4"], modules: [], acts: [], quizRounds: 1, method: "Kuis di kios (1 ronde)" },
  { no: 9, topic: "Rem regeneratif: cara kerja dan alur energi", cpmk: ["CPMK-2"], modules: ["regen"], acts: [], method: "Baca modul, amati mobil di lintasan uji" },
  { no: 10, topic: "Perbandingan EV dengan kendaraan bermesin bensin", cpmk: ["CPMK-3"], modules: ["perbandingan"], acts: ["pembanding"], method: "Baca modul, kunjungi bengkel pembanding" },
  { no: 11, topic: "Pengisian daya AC/DC dan konektor", cpmk: ["CPMK-6"], modules: ["pengisian"], acts: ["pengisian"], method: "Baca modul, kunjungi zona pengisian" },
  { no: 12, topic: "Energi surya dan penyimpanan energi", cpmk: ["CPMK-6"], modules: ["surya"], acts: [], method: "Baca modul, amati sudut energi surya" },
  { no: 13, topic: "Analisis biaya energi dan emisi", cpmk: ["CPMK-6"], modules: ["biaya"], acts: ["pengisian"], method: "Baca modul, amati papan \"Boros mana?\"" },
  { no: 14, topic: "Perakitan kendaraan listrik", cpmk: ["CPMK-5"], modules: [], acts: ["rakit"], method: "Game rakit mobil listrik" },
  { no: 15, topic: "Perawatan dan diagnosis dasar EV", cpmk: ["CPMK-3", "CPMK-5"], modules: ["perawatan"], acts: [], method: "Baca modul, diskusi kasus" },
  { no: 16, topic: "Ujian Akhir Semester (UAS)", cpmk: CPMK.map((c) => c.id), modules: [], acts: ["kuis"], quizRounds: 2, method: "Kuis di kios (ronde ke-2 atau lebih)" },
];
/** Judul modul untuk tampilan (id → judul singkat). */
export const MODULE_TITLES: Record<string, string> = {
  pengenalan: "Pengenalan Kendaraan Listrik",
  k3: "K3 Tegangan Tinggi",
  komponen: "Komponen Utama BEV",
  baterai: "Baterai Traksi",
  termal: "Pendinginan Baterai",
  penggerak: "Motor Listrik & Inverter",
  regen: "Rem Regeneratif",
  perbandingan: "EV vs Mobil Bensin",
  pengisian: "Pengisian Daya EV",
  surya: "Energi Surya & Penyimpanan",
  biaya: "Biaya Energi & Emisi",
  perawatan: "Perakitan, Perawatan & Diagnosis",
};

/** Status satu pertemuan untuk seorang siswa: butir yang sudah / belum dikerjakan. */
export function meetingStatus(s: Student, m: Meeting) {
  const items = [
    ...m.modules.map((id) => ({ label: `Modul: ${MODULE_TITLES[id] ?? id}`, done: !!s.acts[`modul:${id}`]?.done })),
    ...m.acts.map((id) => ({ label: ACTIVITIES.find((a) => a.id === id)?.title ?? id, done: !!s.acts[id]?.done })),
    ...(m.quizRounds ? [{ label: `Kuis ${m.quizRounds} ronde`, done: s.quizRounds >= m.quizRounds }] : []),
  ];
  const n = items.filter((i) => i.done).length;
  return { items, done: items.length > 0 && n === items.length, started: n > 0 };
}

/** CPMK tiap soal di bank soal kios kuis (urutan sama dengan `QUESTIONS` di LabStations.tsx). */
export const QUIZ_CPMK: number[] = [
  2, 2, 1, 2, 6, 4, 2, 1, 5, 6, // 0–9 soal dasar
  4, 3, 2, 5, 2, 5, 2, 4, // 10–17 komponen
  6, 6, 6, 6, 6, // 18–22 pengisian
  3, 3, 3, 3, 3, // 23–27 pembanding
  6, 6, 6, 6, 6, // 28–32 tenaga surya
  4, 4, 4, 4, 4, 4, // 33–38 baterai
  1, 1, 1, 1, // 39–42 K3
  2, 2, 4, 6, 5, 5, // 43–48 materi tambahan
];
export const quizCpmk = (q: number) => `CPMK-${QUIZ_CPMK[q] ?? 2}`;

/* ---------------- catatan per siswa ---------------- */

export type ActRecord = { done: boolean; score: number; attempts: number; at: number };
export type Student = {
  id: string;
  name: string;
  nim: string;
  kelas: string;
  created: number;
  acts: Record<string, ActRecord>;
  /** nomor soal → 1 benar / 0 salah (jawaban terakhir) */
  quiz: Record<string, 0 | 1>;
  quizRounds: number;
};
type Data = { active: string; students: Record<string, Student> };

const KEY = "evlab_obe_v1";
const GUEST = "tamu";
const blank = (id: string, name: string, nim = "", kelas = ""): Student => ({ id, name, nim, kelas, created: Date.now(), acts: {}, quiz: {}, quizRounds: 0 });

function load(): Data {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null") as Data | null;
    if (d && d.students && d.students[d.active]) return d;
  } catch {}
  return { active: GUEST, students: { [GUEST]: blank(GUEST, "Tamu") } };
}

let data: Data = load();
const listeners = new Set<() => void>();
function commit(next: Data) {
  data = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useObe() {
  const d = useSyncExternalStore(subscribe, () => data);
  return { data: d, student: d.students[d.active] };
}
export const activeStudent = () => data.students[data.active];

function patchActive(fn: (s: Student) => Student) {
  const s = data.students[data.active];
  commit({ ...data, students: { ...data.students, [s.id]: fn(s) } });
}

/** Catat satu kegiatan. Nilai terbaik yang disimpan; kunjungan cukup dicatat sekali. */
export function recordActivity(id: string, score = 100) {
  const cur = activeStudent().acts[id];
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (cur?.done && score === 100 && cur.score === 100 && Date.now() - cur.at < 60_000) return; // hindari tulis berulang
  patchActive((st) => ({
    ...st,
    acts: { ...st.acts, [id]: { done: true, score: Math.max(cur?.score ?? 0, s), attempts: (cur?.attempts ?? 0) + 1, at: Date.now() } },
  }));
}
/** Modul ajar dibaca sampai slide terakhir: dicatat per modul + kegiatan umum "modul". */
export function recordModule(moduleId: string) {
  if (!activeStudent().acts[`modul:${moduleId}`]?.done) recordActivity(`modul:${moduleId}`, 100);
  recordVisit("modul");
}
/** Kunjungan zona: hanya dicatat pertama kali. */
export function recordVisit(id: string) {
  if (!activeStudent().acts[id]?.done) recordActivity(id, 100);
}
export function recordQuiz(question: number, correct: boolean) {
  patchActive((st) => ({ ...st, quiz: { ...st.quiz, [question]: correct ? 1 : 0 } }));
}
export function recordQuizRound(scorePct: number) {
  patchActive((st) => ({ ...st, quizRounds: st.quizRounds + 1 }));
  recordActivity("kuis", scorePct);
}

export function addStudent(name: string, nim: string, kelas: string) {
  const id = `s${Date.now().toString(36)}`;
  commit({ active: id, students: { ...data.students, [id]: blank(id, name.trim() || "Tanpa nama", nim.trim(), kelas.trim()) } });
}
export function setActiveStudent(id: string) {
  if (data.students[id]) commit({ ...data, active: id });
}
export function resetStudent(id: string) {
  const s = data.students[id];
  if (s) commit({ ...data, students: { ...data.students, [id]: { ...blank(s.id, s.name, s.nim, s.kelas), created: s.created } } });
}
export function removeStudent(id: string) {
  if (id === GUEST || !data.students[id]) return;
  const students = { ...data.students };
  delete students[id];
  commit({ active: data.active === id ? GUEST : data.active, students });
}

/* ---------------- penilaian ---------------- */

export type CpmkResult = { id: string; quiz: number | null; answered: number; total: number; activity: number | null; score: number; pass: boolean; started: boolean };

export function evaluate(s: Student) {
  const cpmk: CpmkResult[] = CPMK.map((c) => {
    const qs = QUIZ_CPMK.map((n, i) => (`CPMK-${n}` === c.id ? i : -1)).filter((i) => i >= 0);
    const ans = qs.filter((i) => s.quiz[i] !== undefined);
    const quiz = ans.length ? (ans.filter((i) => s.quiz[i] === 1).length / ans.length) * 100 : null;
    const acts = ACTIVITIES.filter((a) => a.id !== "kuis" && a.cpmk.includes(c.id));
    const activity = acts.length ? acts.reduce((sum, a) => sum + (s.acts[a.id]?.done ? s.acts[a.id].score : 0), 0) / acts.length : null;
    const started = quiz !== null || acts.some((a) => s.acts[a.id]?.done);
    const score = Math.round((quiz ?? 0) * COURSE.weight.quiz + (activity ?? 0) * COURSE.weight.activity);
    return { id: c.id, quiz, answered: ans.length, total: qs.length, activity, score, pass: score >= COURSE.pass, started };
  });
  const cpl = CPL.map((l) => {
    const mine = cpmk.filter((r) => CPMK.find((c) => c.id === r.id)!.cpl === l.id);
    const score = Math.round(mine.reduce((a, r) => a + r.score, 0) / mine.length);
    return { id: l.id, score, pass: score >= COURSE.pass };
  });
  const doneCount = ACTIVITIES.filter((a) => s.acts[a.id]?.done).length;
  const total = Math.round(cpl.reduce((a, r) => a + r.score, 0) / cpl.length);
  return { cpmk, cpl, doneCount, total, pass: cpl.every((r) => r.pass) };
}

/** Kegiatan berikutnya yang belum dikerjakan (untuk petunjuk "lanjut ke…"). */
export const nextActivity = (s: Student) => ACTIVITIES.find((a) => !s.acts[a.id]?.done) ?? null;
