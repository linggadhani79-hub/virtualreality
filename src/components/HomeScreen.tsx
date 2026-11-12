import { useState } from "react";

/**
 * Beranda aplikasi (mode lokal): satu tombol untuk masuk lab + tombol Kebijakan Privasi.
 * Menggantikan layar pilih "Mode Mahasiswa / Mode Admin". Ikon digambar SVG (bukan emoji)
 * supaya tampil sama di Quest, HP, dan PC.
 */

const FEATURES: { title: string; desc: string; path: string }[] = [
  { title: "Lab Mobil Listrik", desc: "Mobil, sasis, baterai, motor, inverter, dan pengisian daya", path: "M3 13l2-5a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 5v4h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3v-4zm3-1h12l-1.2-3.2a1 1 0 0 0-1-.8H8.2a1 1 0 0 0-1 .8L6 12z" },
  { title: "Game Rakit Mobil EV", desc: "Susun komponen sesuai urutan perakitan", path: "M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.1-.6-.6-2.1 2.3-2.9z" },
  { title: "Bengkel Pembanding", desc: "Mesin bensin, piston, dan rem untuk dibandingkan dengan EV", path: "M4 9h3l2-3h6l2 3h3v8h-3l-2 2H9l-2-2H4V9zm8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" },
  { title: "Tanya Jawab & Modul", desc: "Kuis interaktif dan modul ajar digital", path: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm3 4v2h8V8H8zm0 4v2h6v-2H8z" },
];

export function HomeScreen({ onStart }: { onStart: () => void }) {
  const [privacy, setPrivacy] = useState(false);

  return (
    <div className="fixed inset-0 z-[9000] overflow-y-auto pointer-events-auto text-white" style={{ background: "radial-gradient(1200px 700px at 20% -10%, #12305c 0%, #0b1220 55%, #060a14 100%)" }}>
      {/* garis aksen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-indigo-500" />

      <div className="min-h-full max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12 flex flex-col">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-cyan-400/15 border border-cyan-300/40 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#22d3ee" aria-hidden="true">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
            </svg>
          </span>
          <span className="text-[11px] sm:text-xs font-bold tracking-[0.25em] text-cyan-300 uppercase">Smart Vocational</span>
        </div>

        <div className="flex-1 flex flex-col justify-center py-8 sm:py-12">
          <h1 className="text-4xl sm:text-6xl font-black leading-[1.05] tracking-tight">
            Lab Virtual
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-emerald-300">Kendaraan Listrik</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm sm:text-base text-slate-300 leading-relaxed">
            Pelajari komponen mobil listrik, rakit sendiri mobilnya, dan bandingkan dengan mesin bensin. Bisa dipakai di Meta Quest, HP dengan kacamata VR, maupun layar biasa.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              id="btn-home-start"
              onClick={onStart}
              className="group inline-flex items-center gap-3 bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-slate-950 font-extrabold text-base sm:text-lg px-7 py-4 rounded-2xl shadow-xl shadow-cyan-500/25 transition-all cursor-pointer"
            >
              Masuk Lab
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <button
              id="btn-home-privacy"
              onClick={() => setPrivacy(true)}
              className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/15 text-slate-200 font-bold text-sm px-5 py-4 rounded-2xl transition-all cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Kebijakan Privasi
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">Tanpa login · tanpa internet setelah dibuka pertama kali</p>

          <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <span className="w-9 h-9 rounded-xl bg-emerald-400/15 border border-emerald-300/30 flex items-center justify-center mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#6ee7b7" aria-hidden="true">
                    <path d={f.path} />
                  </svg>
                </span>
                <p className="font-extrabold text-sm">{f.title}</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">Smart Vocational untuk Electric Vehicle · media ajar kendaraan listrik</p>
      </div>

      {privacy && (
        <div className="fixed inset-0 z-[9100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={() => setPrivacy(false)}>
          <div className="w-full max-w-2xl h-[86vh] bg-[#0b1220] border border-white/15 rounded-3xl overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <span className="font-extrabold text-sm">Kebijakan Privasi</span>
              <button id="btn-privacy-close" onClick={() => setPrivacy(false)} className="text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full cursor-pointer">
                Tutup
              </button>
            </div>
            {/* satu sumber teks: halaman /privasi.html (ikut tersimpan untuk offline) */}
            <iframe title="Kebijakan Privasi" src="/privasi.html" className="flex-1 w-full bg-[#0b1220]" />
          </div>
        </div>
      )}
    </div>
  );
}
