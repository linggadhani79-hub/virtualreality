import { useEffect, useState } from "react";
import {
  ILLUSTRATIONS,
  MODULE_COLORS,
  illustrationUrl,
  TeachingModule,
  getModules,
  loadModules,
  resetModules,
  saveModules,
} from "../lib/modules";

/**
 * Editor modul ajar digital untuk admin. Isinya tampil sebagai buku di meja Pojok Baca dan
 * slideshow layar besar di dalam lab.
 */
export function ModuleEditor({ onClose }: { onClose: () => void }) {
  const [mods, setMods] = useState<TeachingModule[]>(() => structuredClone(getModules()));
  const [mi, setMi] = useState(0);
  const [si, setSi] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    loadModules().then((m) => setMods(structuredClone(m)));
  }, []);

  const mod = mods[mi];
  const slide = mod?.slides[si];

  const update = (fn: (draft: TeachingModule[]) => void) => {
    setMods((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
    setStatus("");
  };

  const addModule = () => {
    update((d) => {
      d.push({
        id: `modul-${Date.now()}`,
        title: "Modul baru",
        color: MODULE_COLORS[d.length % MODULE_COLORS.length],
        slides: [{ title: "Judul slide", body: "Tulis materi di sini.\n- Awali baris dengan tanda - untuk butir" }],
      });
    });
    setMi(mods.length);
    setSi(0);
  };

  const save = async () => {
    const clean = mods.filter((m) => m.title.trim() && m.slides.length);
    await saveModules(clean);
    setStatus("Tersimpan di perangkat ini. Buku di lab langsung diperbarui.");
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(mods, null, 2));
      setStatus("JSON disalin. Simpan sebagai public/lab/modul.json agar berlaku di semua perangkat.");
    } catch {
      setStatus("Tidak bisa menyalin otomatis di perangkat ini.");
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const input =
    "w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 select-text";

  return (
    <div
      className="fixed inset-0 z-[10000] bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-3 pointer-events-auto"
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onKeyDown={stop}
      onKeyUp={stop}
    >
      <div className="bg-neutral-900 border border-cyan-500/30 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col text-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-cyan-400">Mode Admin</div>
            <h2 className="text-lg font-extrabold">📖 Modul Ajar Digital</h2>
          </div>
          <button id="btn-module-editor-close" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold cursor-pointer">
            Tutup ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[230px_1fr] gap-0 overflow-hidden">
          {/* Daftar modul */}
          <div className="border-b md:border-b-0 md:border-r border-white/10 p-3 overflow-y-auto max-h-40 md:max-h-none">
            <div className="text-[11px] font-bold text-neutral-400 mb-2">MODUL (buku di meja)</div>
            {mods.map((m, i) => (
              <button
                key={m.id}
                onClick={() => {
                  setMi(i);
                  setSi(0);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1.5 text-sm font-semibold cursor-pointer border ${i === mi ? "bg-cyan-600/30 border-cyan-400/60" : "bg-white/5 border-transparent hover:bg-white/10"}`}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: m.color }} />
                {m.title || "(tanpa judul)"}
                <span className="block text-[10px] text-neutral-400 font-normal ml-[18px]">{m.slides.length} slide</span>
              </button>
            ))}
            <button id="btn-module-add" onClick={addModule} className="w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold cursor-pointer">
              + Modul baru
            </button>
          </div>

          {/* Isi modul */}
          <div className="p-4 overflow-y-auto">
            {mod ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 items-end">
                  <label className="flex-1 text-[11px] font-bold text-neutral-400">
                    JUDUL MODUL
                    <input id="input-module-title" className={input + " mt-1"} value={mod.title} onChange={(e) => update((d) => void (d[mi].title = e.target.value))} />
                  </label>
                  <button
                    onClick={() => {
                      if (!confirm(`Hapus modul "${mod.title}"?`)) return;
                      update((d) => void d.splice(mi, 1));
                      setMi(Math.max(0, mi - 1));
                      setSi(0);
                    }}
                    className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-xs font-bold cursor-pointer"
                  >
                    Hapus modul
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[11px] font-bold text-neutral-400 mr-1">SLIDE</span>
                  {mod.slides.map((_, i) => (
                    <button key={i} onClick={() => setSi(i)} className={`w-8 h-8 rounded-lg text-xs font-bold cursor-pointer ${i === si ? "bg-cyan-500 text-black" : "bg-white/10 hover:bg-white/20"}`}>
                      {i + 1}
                    </button>
                  ))}
                  <button
                    id="btn-slide-add"
                    onClick={() => {
                      update((d) => void d[mi].slides.push({ title: "Judul slide", body: "" }));
                      setSi(mod.slides.length);
                    }}
                    className="px-2.5 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold cursor-pointer"
                  >
                    + Slide
                  </button>
                  {mod.slides.length > 1 && (
                    <button
                      onClick={() => {
                        update((d) => void d[mi].slides.splice(si, 1));
                        setSi(Math.max(0, si - 1));
                      }}
                      className="px-2.5 h-8 rounded-lg bg-red-600/80 hover:bg-red-500 text-xs font-bold cursor-pointer"
                    >
                      Hapus slide
                    </button>
                  )}
                </div>

                {slide && (
                  <>
                    <label className="text-[11px] font-bold text-neutral-400">
                      JUDUL SLIDE
                      <input id="input-slide-title" className={input + " mt-1"} value={slide.title} onChange={(e) => update((d) => void (d[mi].slides[si].title = e.target.value))} />
                    </label>
                    <label className="text-[11px] font-bold text-neutral-400">
                      ISI MATERI (awali baris dengan "- " untuk butir; maksimal ±9 baris agar terbaca di VR)
                      <textarea
                        id="input-slide-body"
                        className={input + " mt-1 h-56 font-mono leading-relaxed"}
                        value={slide.body}
                        onChange={(e) => update((d) => void (d[mi].slides[si].body = e.target.value))}
                      />
                    </label>
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 flex flex-col gap-3">
                        <label className="text-[11px] font-bold text-neutral-400">
                          ILUSTRASI (dari model & foto lab; tampil di sisi kanan slide)
                          <select
                            id="input-slide-image"
                            className={input + " mt-1"}
                            value={slide.image ?? ""}
                            onChange={(e) =>
                              update((d) => {
                                const sl = d[mi].slides[si];
                                if (e.target.value) sl.image = e.target.value;
                                else {
                                  delete sl.image;
                                  delete sl.caption;
                                }
                              })
                            }
                          >
                            <option value="">Tanpa gambar</option>
                            {ILLUSTRATIONS.map((il) => (
                              <option key={il.id} value={il.id}>
                                {il.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {slide.image && (
                          <label className="text-[11px] font-bold text-neutral-400">
                            KETERANGAN GAMBAR
                            <input
                              id="input-slide-caption"
                              className={input + " mt-1"}
                              value={slide.caption ?? ""}
                              onChange={(e) => update((d) => void (d[mi].slides[si].caption = e.target.value))}
                            />
                          </label>
                        )}
                      </div>
                      {slide.image && <img src={illustrationUrl(slide.image)} alt="" className="w-40 h-[120px] object-cover rounded-lg border border-white/15" />}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-neutral-400 text-sm">Belum ada modul. Tekan "+ Modul baru".</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-white/10">
          <button id="btn-module-save" onClick={save} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-extrabold cursor-pointer">
            Simpan
          </button>
          <button onClick={copyJson} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold cursor-pointer">
            Salin JSON (untuk semua perangkat)
          </button>
          <button
            onClick={async () => {
              if (!confirm("Kembalikan ke modul bawaan aplikasi? Perubahan di perangkat ini akan hilang.")) return;
              await resetModules();
              setMods(structuredClone(getModules()));
              setMi(0);
              setSi(0);
              setStatus("Dikembalikan ke modul bawaan.");
            }}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold cursor-pointer"
          >
            Kembalikan bawaan
          </button>
          <span id="module-editor-status" className="text-xs text-emerald-300 ml-1">{status}</span>
        </div>
      </div>
    </div>
  );
}
