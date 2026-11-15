import { useEffect, useState } from "react";
import {
  ACTIVITIES,
  COURSE,
  CPL,
  CPMK,
  addStudent,
  evaluate,
  nextActivity,
  removeStudent,
  resetStudent,
  setActiveStudent,
  useObe,
  type Student,
} from "../lib/obe";

/**
 * Panel "Capaian Pembelajaran" (OBE): CPL & CPMK, urutan/alur belajar, hasil evaluasi siswa aktif,
 * dan rekap semua siswa di perangkat ini. Dibuka dari mana saja dengan `openObePanel()`.
 * Tanpa login dan tanpa database: nama siswa hanya label untuk catatan di perangkat ini.
 */

export const openObePanel = () => window.dispatchEvent(new Event("obe-open"));

type Tab = "alur" | "cpl" | "hasil" | "siswa";
const TABS: [Tab, string][] = [
  ["alur", "Alur Belajar"],
  ["cpl", "CPL & CPMK"],
  ["hasil", "Hasil Evaluasi"],
  ["siswa", "Siswa & Rekap"],
];

const tone = (pass: boolean, started = true) => (!started ? "text-slate-500" : pass ? "text-emerald-300" : "text-amber-300");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Lembar hasil untuk dicetak / disimpan sebagai PDF lewat dialog cetak peramban. */
function printReport(students: Student[]) {
  const w = window.open("", "_blank");
  if (!w) return;
  const pages = students
    .map((s) => {
      const r = evaluate(s);
      return `<section><h1>Laporan Capaian Pembelajaran (OBE)</h1>
<p><b>${esc(COURSE.name)}</b> · Lab Virtual Kendaraan Listrik</p>
<table class="id"><tr><td>Nama</td><td>${esc(s.name)}</td><td>NIM/NIS</td><td>${esc(s.nim || "-")}</td><td>Kelas</td><td>${esc(s.kelas || "-")}</td></tr></table>
<h2>Ketercapaian CPL</h2><table><tr><th>CPL</th><th>Rumusan</th><th>Nilai</th><th>Status</th></tr>
${CPL.map((c, i) => `<tr><td>${c.id}</td><td>${esc(c.text)}</td><td>${r.cpl[i].score}</td><td>${r.cpl[i].pass ? "Tercapai" : "Belum"}</td></tr>`).join("")}</table>
<h2>Ketercapaian CPMK</h2><table><tr><th>CPMK</th><th>Rumusan</th><th>Kuis</th><th>Kegiatan</th><th>Nilai</th><th>Status</th></tr>
${CPMK.map((c, i) => `<tr><td>${c.id}<br><small>${c.cpl}</small></td><td>${esc(c.text)}</td><td>${r.cpmk[i].quiz === null ? "-" : Math.round(r.cpmk[i].quiz!)}</td><td>${r.cpmk[i].activity === null ? "-" : Math.round(r.cpmk[i].activity!)}</td><td>${r.cpmk[i].score}</td><td>${r.cpmk[i].pass ? "Tuntas" : "Belum"}</td></tr>`).join("")}</table>
<h2>Urutan kegiatan belajar</h2><table><tr><th>#</th><th>Kegiatan</th><th>Jenis</th><th>CPMK</th><th>Nilai</th><th>Percobaan</th></tr>
${ACTIVITIES.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.title)}</td><td>${a.kind}</td><td>${a.cpmk.length > 3 ? "Semua" : a.cpmk.join(", ")}</td><td>${s.acts[a.id]?.done ? s.acts[a.id].score : "-"}</td><td>${s.acts[a.id]?.attempts ?? 0}</td></tr>`).join("")}</table>
<p class="sum">Nilai akhir: <b>${r.total}</b> · ${r.pass ? "Semua CPL tercapai" : "Belum semua CPL tercapai"} (batas tuntas ${COURSE.pass}). Nilai CPMK = ${COURSE.weight.quiz * 100}% kuis + ${COURSE.weight.activity * 100}% kegiatan.</p></section>`;
    })
    .join("");
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan OBE</title><style>
body{font:13px system-ui,sans-serif;color:#111;margin:24px}h1{font-size:19px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}
.id td{border:none;padding:2px 10px 2px 0}.sum{margin-top:12px}section{page-break-after:always}small{color:#555}</style></head><body>${pages}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function ObePanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("alur");
  const [form, setForm] = useState({ name: "", nim: "", kelas: "" });
  const { data, student } = useObe();
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("obe-open", on);
    return () => window.removeEventListener("obe-open", on);
  }, []);
  if (!open) return null;

  const res = evaluate(student);
  const next = nextActivity(student);
  const students = (Object.values(data.students) as Student[]).sort((a, b) => a.created - b.created);
  const cell = "px-2 py-1.5 border-b border-white/10 align-top";

  return (
    <div id="obe-panel" className="fixed inset-0 z-[9500] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 pointer-events-auto text-white" onClick={() => setOpen(false)}>
      <div className="w-full max-w-4xl h-[92vh] bg-[#0b1220] border border-white/15 rounded-3xl overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-white/10">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.2em] text-cyan-300 uppercase">Capaian Pembelajaran · OBE</p>
            <p className="font-extrabold text-sm sm:text-base truncate">
              {COURSE.name} — {student.name}
              {student.kelas ? ` (${student.kelas})` : ""}
            </p>
          </div>
          <button id="btn-obe-close" onClick={() => setOpen(false)} className="shrink-0 text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full cursor-pointer">
            Tutup
          </button>
        </div>
        <div className="flex gap-1.5 px-3 sm:px-5 py-2 border-b border-white/10 overflow-x-auto">
          {TABS.map(([id, label]) => (
            <button key={id} id={`obe-tab-${id}`} onClick={() => setTab(id)} className={`shrink-0 text-xs font-bold px-3.5 py-2 rounded-full cursor-pointer ${tab === id ? "bg-cyan-400 text-slate-950" : "bg-white/5 hover:bg-white/10 text-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 text-[13px] leading-snug">
          {tab === "alur" && (
            <div>
              <p className="text-slate-300 mb-3">
                Kerjakan berurutan: materi → praktik → evaluasi. Selesai <b>{res.doneCount}</b> dari {ACTIVITIES.length} kegiatan.
                {next ? (
                  <>
                    {" "}
                    Berikutnya: <b className="text-cyan-300">{next.title}</b>.
                  </>
                ) : (
                  " Semua kegiatan sudah dikerjakan."
                )}
              </p>
              <ol className="space-y-2">
                {ACTIVITIES.map((a, i) => {
                  const rec = student.acts[a.id];
                  const isNext = next?.id === a.id;
                  return (
                    <li key={a.id} className={`flex gap-3 rounded-2xl border p-3 ${isNext ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]"}`}>
                      <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-black text-sm ${rec?.done ? "bg-emerald-500 text-white" : isNext ? "bg-cyan-500 text-slate-950" : "bg-slate-700 text-slate-300"}`}>{rec?.done ? "✓" : i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold">{a.title}</p>
                        <p className="text-slate-400 text-xs">
                          {a.kind} · {a.cpmk.length > 3 ? "semua CPMK" : a.cpmk.join(", ")} · Lokasi: {a.where}
                        </p>
                        <p className="text-slate-500 text-xs">Bukti: {a.evidence}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-black text-base ${rec?.done ? "text-emerald-300" : "text-slate-600"}`}>{rec?.done ? rec.score : "—"}</p>
                        {rec?.done && <p className="text-[10px] text-slate-500">{rec.attempts}× dicoba</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {tab === "cpl" && (
            <div className="space-y-4">
              {CPL.map((c) => (
                <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase">
                    {c.id} · {c.domain}
                  </p>
                  <p className="font-bold mt-0.5">{c.text}</p>
                  <ul className="mt-2 space-y-2">
                    {CPMK.filter((m) => m.cpl === c.id).map((m) => (
                      <li key={m.id} className="border-l-2 border-emerald-400/60 pl-3">
                        <p>
                          <b className="text-emerald-300">{m.id}</b> {m.text}
                        </p>
                        <p className="text-xs text-slate-400">Indikator: {m.indicator}</p>
                        <p className="text-xs text-slate-500">
                          Kegiatan:{" "}
                          {ACTIVITIES.filter((a) => a.cpmk.includes(m.id))
                            .map((a) => a.title)
                            .join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-slate-400">
                Penilaian: nilai CPMK = {COURSE.weight.quiz * 100}% kuis (soal bertanda CPMK itu) + {COURSE.weight.activity * 100}% kegiatan. Nilai CPL = rata-rata CPMK-nya. Batas tuntas {COURSE.pass}.
              </p>
            </div>
          )}

          {tab === "hasil" && (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {res.cpl.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
                    <p className="text-[10px] font-bold tracking-widest text-slate-400">{r.id}</p>
                    <p className={`text-3xl font-black ${tone(r.pass)}`}>{r.score}</p>
                    <p className={`text-[11px] font-bold ${tone(r.pass)}`}>{r.pass ? "Tercapai" : "Belum tercapai"}</p>
                  </div>
                ))}
              </div>
              <table className="w-full text-left text-xs sm:text-[13px]">
                <thead>
                  <tr className="text-slate-400">
                    <th className={cell}>CPMK</th>
                    <th className={cell}>Kuis</th>
                    <th className={cell}>Kegiatan</th>
                    <th className={cell}>Nilai</th>
                    <th className={cell}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {res.cpmk.map((r, i) => (
                    <tr key={r.id}>
                      <td className={cell}>
                        <b>{r.id}</b> <span className="text-slate-500">→ {CPMK[i].cpl}</span>
                        <p className="text-slate-400 hidden sm:block">{CPMK[i].text}</p>
                      </td>
                      <td className={cell}>
                        {r.quiz === null ? "—" : Math.round(r.quiz)}
                        <p className="text-[10px] text-slate-500">
                          {r.answered}/{r.total} soal
                        </p>
                      </td>
                      <td className={cell}>{r.activity === null ? "—" : Math.round(r.activity)}</td>
                      <td className={`${cell} font-black ${tone(r.pass, r.started)}`}>{r.score}</td>
                      <td className={`${cell} font-bold ${tone(r.pass, r.started)}`}>{!r.started ? "Belum mulai" : r.pass ? "Tuntas" : "Perlu remedial"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-slate-300">
                Nilai akhir <b className={tone(res.pass)}>{res.total}</b> · kuis dikerjakan {student.quizRounds} ronde.{" "}
                {res.cpmk.some((r) => r.started && !r.pass) && <>Saran: ulangi kegiatan dan kuis untuk {res.cpmk.filter((r) => !r.pass).map((r) => r.id).join(", ")}.</>}
              </p>
              <button id="btn-obe-print" onClick={() => printReport([student])} className="mt-3 text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-4 py-2.5 rounded-full cursor-pointer">
                Cetak laporan siswa ini
              </button>
            </div>
          )}

          {tab === "siswa" && (
            <div>
              <p className="text-slate-300 mb-2">Catatan disimpan di perangkat ini (tanpa akun, tanpa internet). Pilih siswa sebelum mulai belajar supaya hasilnya tercatat atas namanya.</p>
              <form
                className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.name.trim()) return;
                  addStudent(form.name, form.nim, form.kelas);
                  setForm({ name: "", nim: "", kelas: "" });
                }}
              >
                <input id="obe-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama siswa" className="col-span-2 sm:col-span-1 bg-white/10 border border-white/15 rounded-xl px-3 py-2 outline-none focus:border-cyan-400" />
                <input id="obe-nim" value={form.nim} onChange={(e) => setForm({ ...form, nim: e.target.value })} placeholder="NIM / NIS" className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 outline-none focus:border-cyan-400" />
                <input id="obe-kelas" value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} placeholder="Kelas" className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 outline-none focus:border-cyan-400" />
                <button id="btn-obe-add" type="submit" className="col-span-2 sm:col-span-1 text-xs font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 px-4 py-2 rounded-xl cursor-pointer">
                  Tambah & pakai
                </button>
              </form>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-[13px] min-w-[560px]">
                  <thead>
                    <tr className="text-slate-400">
                      <th className={cell}>Siswa</th>
                      <th className={cell}>Kegiatan</th>
                      {CPL.map((c) => (
                        <th key={c.id} className={cell}>
                          {c.id}
                        </th>
                      ))}
                      <th className={cell}>Akhir</th>
                      <th className={cell}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const r = evaluate(s);
                      const active = s.id === student.id;
                      return (
                        <tr key={s.id} className={active ? "bg-cyan-400/10" : ""}>
                          <td className={cell}>
                            <b>{s.name}</b>
                            <p className="text-[10px] text-slate-500">{[s.nim, s.kelas].filter(Boolean).join(" · ") || (s.id === "tamu" ? "tanpa nama" : "")}</p>
                          </td>
                          <td className={cell}>
                            {r.doneCount}/{ACTIVITIES.length}
                          </td>
                          {r.cpl.map((c) => (
                            <td key={c.id} className={`${cell} font-bold ${tone(c.pass)}`}>
                              {c.score}
                            </td>
                          ))}
                          <td className={`${cell} font-black ${tone(r.pass)}`}>{r.total}</td>
                          <td className={`${cell} whitespace-nowrap text-right`}>
                            {active ? (
                              <span className="text-[10px] font-bold text-cyan-300 mr-2">AKTIF</span>
                            ) : (
                              <button onClick={() => setActiveStudent(s.id)} className="text-[11px] font-bold bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full cursor-pointer mr-1">
                                Pakai
                              </button>
                            )}
                            <button onClick={() => confirm(`Ulangi catatan ${s.name} dari nol?`) && resetStudent(s.id)} className="text-[11px] font-bold bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-full cursor-pointer mr-1">
                              Ulang
                            </button>
                            {s.id !== "tamu" && (
                              <button onClick={() => confirm(`Hapus ${s.name} beserta nilainya?`) && removeStudent(s.id)} className="text-[11px] font-bold bg-red-500/20 hover:bg-red-500/40 text-red-200 px-2.5 py-1 rounded-full cursor-pointer">
                                Hapus
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button id="btn-obe-print-all" onClick={() => printReport(students)} className="mt-3 text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-4 py-2.5 rounded-full cursor-pointer">
                Cetak rekap semua siswa
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
