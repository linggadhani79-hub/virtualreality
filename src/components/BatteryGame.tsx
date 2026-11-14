import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { roundedRectShape, wrapText } from "../lib/glb";
import { playVRClickSound, playVRHoverSound } from "../lib/vrAudio";

/**
 * Game "Restorasi Baterai".
 *
 * Sebuah modul baterai berisi 8 sel ada di meja kerja. Dua di antaranya rusak (tegangan drop atau
 * hambatan dalam tinggi). Langkah:
 *   1. UKUR  — pilih mode multimeter (V / mΩ), tempel probe merah ke kutub (+) lalu probe hitam ke
 *              kutub (−) sel yang sama. Probe terbalik → nilai minus.
 *   2. TANDAI & GANTI — tandai sel rusak, lalu ganti dengan sel cadangan.
 *   3. SAMAKAN — sel baru disamakan tegangannya dengan sel lama sebelum dirangkai paralel.
 *   4. RANGKAI — pilih seri/paralel (8S1P, 4S2P, 2S4P) sesuai target tegangan & kapasitas.
 * Semua bisa dipilih dengan mouse, laser Quest, atau tatapan VR HP.
 *
 * Arah lokal: meja memanjang di sumbu X, pemain berdiri di sisi +Z.
 */

const noRaycast = () => null;
type Vec3 = [number, number, number];

const N = 8;
const CELL_NOM = 3.7; // V
const CELL_AH = 3; // Ah
const SPACING = 0.15;
const TOP = 0.93; // tinggi permukaan meja
const CELL_H = 0.2;
const cellX = (i: number) => (i - (N - 1) / 2) * SPACING;
const TERM_Z = 0.035; // + di depan (+Z), − di belakang

type Cell = { v: number; r: number; broken: "" | "volt" | "ir"; flagged: boolean; replaced: boolean; mv?: number; mr?: number };
type Step = "measure" | "replace" | "balance" | "wire" | "done";
const CONFIGS = [
  { id: "8S1P", s: 8, p: 1 },
  { id: "4S2P", s: 4, p: 2 },
  { id: "2S4P", s: 2, p: 4 },
] as const;
type ConfigId = (typeof CONFIGS)[number]["id"];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function newPack(): { cells: Cell[]; target: ConfigId } {
  const cells: Cell[] = Array.from({ length: N }, () => ({ v: +rnd(3.68, 3.74).toFixed(2), r: Math.round(rnd(22, 32)), broken: "", flagged: false, replaced: false }));
  const idx = [...Array(N).keys()].sort(() => Math.random() - 0.5);
  cells[idx[0]] = { ...cells[idx[0]], v: +rnd(2.35, 2.9).toFixed(2), broken: "volt" };
  cells[idx[1]] = { ...cells[idx[1]], r: Math.round(rnd(115, 180)), broken: "ir" };
  const target = CONFIGS[Math.floor(Math.random() * CONFIGS.length)].id;
  return { cells, target };
}
const healthy = (c: Cell) => c.v >= 3.5 && c.r <= 60;

/* ------------------------------ tombol ------------------------------ */

const btnGeometry = new THREE.ExtrudeGeometry(roundedRectShape(0.36, 0.15, 0.04), {
  depth: 0.025,
  bevelEnabled: true,
  bevelThickness: 0.008,
  bevelSize: 0.008,
  bevelSegments: 3,
  curveSegments: 8,
});

function Btn({ name, label, color, position, active, disabled, onPress }: { name: string; label: string; color: string; position: Vec3; active?: boolean; disabled?: boolean; onPress: () => void }) {
  const [hot, setHot] = useState(false);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 384;
    c.height = 160;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 64;
    do {
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      size -= 4;
    } while (ctx.measureText(label).width > 350 && size > 24);
    ctx.fillText(label, 192, 84);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  const c = disabled ? "#334155" : color;
  const press = (e?: any) => {
    e?.stopPropagation?.();
    if (!disabled) onPress();
  };
  return (
    <group position={position}>
      <mesh
        name={`Baterai_btn_${name}`}
        geometry={btnGeometry}
        position={[0, 0, active ? -0.012 : 0]}
        scale={hot && !disabled ? 1.05 : 1}
        userData={{ isVRButton: true, isInteractableMesh: true, onClick: press }}
        onClick={press}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
        }}
        onPointerOut={() => setHot(false)}
      >
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={active ? 0.8 : hot ? 0.45 : 0.12} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.036 - (active ? 0.012 : 0)]} raycast={noRaycast}>
        <planeGeometry args={[0.34, 0.142]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} opacity={disabled ? 0.45 : 1} />
      </mesh>
    </group>
  );
}

/* ------------------------------ papan & layar ------------------------------ */

function useLiveCanvas(w: number, h: number) {
  const v = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!; // kanvas biasa: lihat SolarPower.tsx
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    return { c, ctx, t };
  }, [w, h]);
  useEffect(() => () => v.t.dispose(), [v]);
  return v;
}

const STEP_LABELS: [Step, string][] = [
  ["measure", "Ukur tegangan (V) & hambatan dalam (mΩ) tiap sel"],
  ["replace", "Tandai sel rusak, lalu ganti dengan sel cadangan"],
  ["balance", "Samakan tegangan sel baru dengan sel lama"],
  ["wire", "Rangkai seri / paralel sesuai target"],
];
const STEP_ORDER: Step[] = ["measure", "replace", "balance", "wire", "done"];

function drawBoard(ctx: CanvasRenderingContext2D, cells: Cell[], step: Step, target: ConfigId, msg: { text: string; tone: "info" | "good" | "bad" }, mistakes: number) {
  const W = 1600;
  const H = 900;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#4ade80";
  ctx.font = "900 56px system-ui, sans-serif";
  ctx.fillText("GAME · RESTORASI BATERAI", 48, 34);
  const t = CONFIGS.find((c) => c.id === target)!;
  ctx.textAlign = "right";
  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 38px system-ui, sans-serif";
  ctx.fillText(`Target: ${(t.s * CELL_NOM).toFixed(1).replace(".", ",")} V · ${t.p * CELL_AH} Ah`, W - 48, 44);
  ctx.textAlign = "left";

  // langkah
  const si = STEP_ORDER.indexOf(step);
  STEP_LABELS.forEach(([, label], i) => {
    const y = 118 + i * 52;
    const state = i < si ? "done" : i === si ? "now" : "todo";
    ctx.fillStyle = state === "done" ? "#16a34a" : state === "now" ? "#2563eb" : "#1e293b";
    ctx.beginPath();
    ctx.arc(70, y + 20, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "900 24px system-ui, sans-serif";
    ctx.fillText(String(i + 1), 70, y + 8);
    ctx.textAlign = "left";
    ctx.font = `${state === "todo" ? 600 : 800} 32px system-ui, sans-serif`;
    ctx.fillStyle = state === "todo" ? "#64748b" : "#e2e8f0";
    ctx.fillText(label, 104, y + 2);
  });

  // tabel sel
  const tx = 48;
  const ty = 345;
  const cw = (W - 96) / N;
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Sel", tx, ty);
  ctx.fillText("Tegangan", tx, ty + 56);
  ctx.fillText("Hambatan", tx, ty + 104);
  ctx.fillText("Status", tx, ty + 152);
  for (let i = 0; i < N; i++) {
    const c = cells[i];
    const x = tx + 150 + i * ((W - 96 - 150) / N);
    const w = (W - 96 - 150) / N - 10;
    ctx.fillStyle = c.flagged ? "rgba(220,38,38,0.25)" : c.replaced ? "rgba(34,197,94,0.18)" : "#111c33";
    ctx.fillRect(x, ty - 8, w, 200);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "900 32px system-ui, sans-serif";
    ctx.fillText(`#${i + 1}`, x + w / 2, ty - 2);
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillStyle = c.mv === undefined ? "#475569" : c.mv < 3.5 ? "#f87171" : "#e2e8f0";
    ctx.fillText(c.mv === undefined ? "—" : `${c.mv.toFixed(2).replace(".", ",")} V`, x + w / 2, ty + 54);
    ctx.fillStyle = c.mr === undefined ? "#475569" : c.mr > 60 ? "#f87171" : "#e2e8f0";
    ctx.fillText(c.mr === undefined ? "—" : `${c.mr} mΩ`, x + w / 2, ty + 102);
    ctx.font = "800 24px system-ui, sans-serif";
    const st = c.replaced ? "BARU" : c.flagged ? "RUSAK" : c.mv !== undefined && c.mr !== undefined ? "OK?" : "";
    ctx.fillStyle = c.replaced ? "#4ade80" : c.flagged ? "#f87171" : "#94a3b8";
    ctx.fillText(st, x + w / 2, ty + 152);
    ctx.textAlign = "left";
  }
  void cw;

  // patokan
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillText("Sel sehat: 3,6–3,8 V dan hambatan dalam < 60 mΩ.  Seri = tegangan dijumlah · Paralel = kapasitas dijumlah.", 48, 572, W - 96);

  // pesan
  ctx.fillStyle = msg.tone === "good" ? "rgba(22,101,52,0.55)" : msg.tone === "bad" ? "rgba(153,27,27,0.6)" : "rgba(30,41,59,0.85)";
  ctx.fillRect(48, 630, W - 96, 210);
  ctx.fillStyle = msg.tone === "good" ? "#bbf7d0" : msg.tone === "bad" ? "#fecaca" : "#e2e8f0";
  ctx.font = "700 36px system-ui, sans-serif";
  wrapText(ctx, msg.text, W - 160)
    .slice(0, 4)
    .forEach((l, i) => ctx.fillText(l, 80, 656 + i * 46));
  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText(`Salah: ${mistakes}`, W - 64, 802);
  ctx.textAlign = "left";
}

function drawMeter(ctx: CanvasRenderingContext2D, mode: "V" | "R", reading: string, hint: string) {
  const W = 512;
  const H = 300;
  ctx.fillStyle = "#facc15";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(28, 26, W - 56, 150);
  ctx.fillStyle = "#86efac";
  ctx.font = "900 92px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(reading, W - 50, 104);
  ctx.textAlign = "left";
  ctx.font = "800 30px system-ui, sans-serif";
  ctx.fillStyle = "#1f2937";
  ctx.fillText(mode === "V" ? "MODE: TEGANGAN DC (V)" : "MODE: HAMBATAN DALAM (mΩ)", 30, 210);
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.fillText(hint, 30, 256, W - 60);
}

/* ------------------------------ geometri ------------------------------ */

const benchTop = new RoundedBoxGeometry(2.7, 0.06, 0.95, 5, 0.025);
const cellGeometry = new RoundedBoxGeometry(0.11, CELL_H, 0.12, 4, 0.012);
const termGeometry = new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16);
const trayGeometry = new RoundedBoxGeometry(1.3, 0.03, 0.22, 4, 0.012);
const meterGeometry = new RoundedBoxGeometry(0.26, 0.04, 0.36, 4, 0.016);

export function BatteryGame({ position, facing = 0 }: { position: Vec3; facing?: number }) {
  const [{ cells, target }, setPack] = useState(newPack);
  const [step, setStep] = useState<Step>("measure");
  const [mode, setMode] = useState<"V" | "R">("V");
  const [red, setRed] = useState<{ i: number; t: "p" | "n" } | null>(null);
  const [reading, setReading] = useState({ text: "----", hint: "Tempel probe merah lalu hitam" });
  const [selected, setSelected] = useState<number | null>(null);
  const selRef = useRef<number | null>(null);
  const [config, setConfig] = useState<ConfigId | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState<{ text: string; tone: "info" | "good" | "bad" }>({
    text: "Pilih mode V, lalu tempel probe: klik kutub (+) merah sebuah sel, kemudian kutub (−) hitam sel yang sama.",
    tone: "info",
  });

  const board = useLiveCanvas(1600, 900);
  const meter = useLiveCanvas(512, 300);
  useEffect(() => {
    drawBoard(board.ctx, cells, step, target, msg, mistakes);
    board.t.needsUpdate = true;
  }, [board, cells, step, target, msg, mistakes]);
  useEffect(() => {
    drawMeter(meter.ctx, mode, reading.text, reading.hint);
    meter.t.needsUpdate = true;
  }, [meter, mode, reading]);

  const update = (fn: (c: Cell[]) => void) => {
    const next = live.current.cells.map((c) => ({ ...c }));
    fn(next);
    live.current.cells = next;
    setPack((pk) => ({ ...pk, cells: next }));
  };

  // Keadaan terbaru disimpan di ref: dua klik cepat (probe merah lalu hitam) tidak boleh membaca
  // keadaan render sebelumnya
  const live = useRef({ cells, step, mode, red });
  live.current.cells = cells;
  live.current.step = step;
  live.current.mode = mode;
  // hanya saat pengembangan: keadaan game untuk pengujian otomatis
  if (import.meta.env.DEV) (window as any).__batteryGame = live.current;

  /* ---- probe ---- */
  const touch = (i: number, t: "p" | "n") => {
    const { step, mode, red, cells } = live.current;
    if (step !== "measure" && step !== "replace") return;
    playVRClickSound();
    if (!red) {
      live.current.red = { i, t };
      setRed({ i, t });
      setReading({ text: "----", hint: `Probe merah di sel #${i + 1} (${t === "p" ? "+" : "−"}). Tempel probe hitam.` });
      return;
    }
    const first = red;
    live.current.red = null;
    setRed(null);
    if (first.i !== i || first.t === t) {
      setReading({ text: "OL", hint: "Probe harus di kutub (+) dan (−) sel yang SAMA" });
      setMsg({ text: "Pengukuran tidak valid: kedua probe harus menempel di dua kutub berbeda pada sel yang sama.", tone: "bad" });
      return;
    }
    const c = cells[i];
    setSelected(i);
    selRef.current = i;
    const reversed = first.t === "n";
    if (mode === "V") {
      const v = reversed ? -c.v : c.v;
      setReading({ text: v.toFixed(2).replace(".", ","), hint: reversed ? "Nilai minus: probe terbalik!" : `Sel #${i + 1} terukur` });
      if (reversed) {
        setMsg({ text: "Tanda minus berarti probe terbalik. Probe MERAH ke kutub (+), probe HITAM ke kutub (−). Ulangi pengukuran.", tone: "bad" });
        return;
      }
      update((cs) => void (cs[i].mv = c.v));
    } else {
      setReading({ text: String(c.r), hint: `Hambatan dalam sel #${i + 1}` });
      update((cs) => void (cs[i].mr = c.r));
    }
    const all = live.current.cells.every((x) => x.mv !== undefined && x.mr !== undefined);
    if (all && step === "measure") {
      live.current.step = "replace";
      setStep("replace");
      setMsg({ text: "Semua sel sudah diukur. Pilih sel yang nilainya di luar patokan (ukur lagi bila perlu), tekan TANDAI RUSAK, lalu GANTI SEL.", tone: "info" });
    } else if (mode === "V" && c.v < 3.5 && !reversed) {
      setMsg({ text: `Sel #${i + 1} hanya ${c.v.toFixed(2).replace(".", ",")} V — jauh di bawah 3,6 V. Sel ini kemungkinan rusak (terlalu dalam terkuras atau bocor).`, tone: "bad" });
    } else if (mode === "R" && c.r > 60) {
      setMsg({ text: `Hambatan dalam sel #${i + 1} ${c.r} mΩ — terlalu tinggi. Sel menua: cepat panas dan tidak kuat memberi arus besar.`, tone: "bad" });
    } else {
      setMsg({ text: `Sel #${i + 1} terukur. Lanjutkan ke sel lain; ukur tegangan DAN hambatan dalam setiap sel (ganti mode di multimeter).`, tone: "info" });
    }
  };

  /* ---- tandai, ganti, samakan, rangkai ---- */
  const flag = () => {
    const selected = selRef.current;
    if (selected === null) return setMsg({ text: "Pilih sel dulu dengan mengukurnya.", tone: "info" });
    playVRClickSound();
    update((cs) => void (cs[selected].flagged = !cs[selected].flagged));
  };
  const replace = () => {
    playVRClickSound();
    const cells = live.current.cells;
    const flagged = cells.filter((c) => c.flagged && !c.replaced);
    if (!flagged.length) return setMsg({ text: "Belum ada sel yang ditandai rusak.", tone: "info" });
    const wrong = cells.filter((c) => c.flagged && !c.replaced && healthy(c)).length;
    const missed = cells.filter((c) => !c.flagged && !c.replaced && !healthy(c)).length;
    if (wrong) {
      setMistakes((m) => m + wrong);
      update((cs) => cs.forEach((c) => c.flagged && healthy(c) && !c.replaced && (c.flagged = false)));
      return setMsg({ text: "Ada sel SEHAT yang ikut ditandai. Bandingkan lagi dengan patokan: 3,6–3,8 V dan < 60 mΩ.", tone: "bad" });
    }
    if (missed) {
      setMistakes((m) => m + 1);
      return setMsg({ text: "Masih ada sel rusak yang belum ditandai. Periksa lagi tegangan DAN hambatan dalam setiap sel.", tone: "bad" });
    }
    playVRHoverSound();
    update((cs) =>
      cs.forEach((c) => {
        if (c.flagged) {
          // sel cadangan sehat, tetapi tegangannya belum sama dengan sel lama
          Object.assign(c, { v: 3.52, r: 24, broken: "", flagged: false, replaced: true, mv: 3.52, mr: 24 });
        }
      }),
    );
    live.current.step = "balance";
    setStep("balance");
    setMsg({ text: "Sel baru terpasang (3,52 V), sel lama ±3,71 V. Selisih tegangan membuat arus besar mengalir antar-sel saat diparalel — tekan SAMAKAN TEGANGAN dulu.", tone: "info" });
  };
  const balance = () => {
    playVRClickSound();
    const cells = live.current.cells;
    const avg = cells.filter((c) => !c.replaced).reduce((s, c) => s + c.v, 0) / cells.filter((c) => !c.replaced).length;
    update((cs) => cs.forEach((c) => c.replaced && Object.assign(c, { v: +avg.toFixed(2), mv: +avg.toFixed(2) })));
    live.current.step = "wire";
    setStep("wire");
    setMsg({ text: `Sel baru diisi pelan sampai ${avg.toFixed(2).replace(".", ",")} V, sama dengan sel lain (selisih < 0,05 V). Sekarang pilih rangkaian yang menghasilkan target.`, tone: "good" });
  };
  const wire = (id: ConfigId) => {
    playVRClickSound();
    setConfig(id);
    const cfg = CONFIGS.find((c) => c.id === id)!;
    const v = (cfg.s * CELL_NOM).toFixed(1).replace(".", ",");
    const ah = cfg.p * CELL_AH;
    if (id === target) {
      setStep("done");
      setMsg({ text: `Tepat! ${cfg.s} kelompok SERI (tegangan ${cfg.s} × 3,7 = ${v} V) dan ${cfg.p} sel PARALEL per kelompok (kapasitas ${cfg.p} × 3 = ${ah} Ah). Baterai pulih. Tekan ULANGI untuk paket baru.`, tone: "good" });
      setReading({ text: v, hint: `Tegangan paket ${id}` });
    } else {
      setMistakes((m) => m + 1);
      setMsg({ text: `${id} menghasilkan ${v} V · ${ah} Ah — belum sesuai target. Ingat: SERI menambah tegangan, PARALEL menambah kapasitas.`, tone: "bad" });
    }
  };
  const reset = () => {
    playVRClickSound();
    const pk = newPack();
    live.current.cells = pk.cells;
    setPack(pk);
    setStep("measure");
    setRed(null);
    setSelected(null);
    selRef.current = null;
    live.current.red = null;
    live.current.step = "measure";
    setConfig(null);
    setMistakes(0);
    setReading({ text: "----", hint: "Tempel probe merah lalu hitam" });
    setMsg({ text: "Paket baterai baru. Pilih mode V, lalu tempel probe ke kutub (+) dan (−) tiap sel.", tone: "info" });
  };

  /* ---- penanda sel terpilih ---- */
  const marker = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!marker.current) return;
    marker.current.visible = selected !== null;
    if (selected !== null) marker.current.position.set(cellX(selected), TOP + CELL_H + 0.09 + Math.sin(state.clock.elapsedTime * 4) * 0.01, 0);
  });

  /* ---- busbar sesuai rangkaian ---- */
  const bars = useMemo(() => {
    if (!config) return [] as { a: Vec3; b: Vec3 }[];
    const cfg = CONFIGS.find((c) => c.id === config)!;
    const out: { a: Vec3; b: Vec3 }[] = [];
    const y = TOP + CELL_H + 0.016;
    for (let g = 0; g < cfg.s; g++) {
      const i0 = g * cfg.p;
      const i1 = i0 + cfg.p - 1;
      if (cfg.p > 1) {
        out.push({ a: [cellX(i0), y, TERM_Z], b: [cellX(i1), y, TERM_Z] }); // + paralel
        out.push({ a: [cellX(i0), y, -TERM_Z], b: [cellX(i1), y, -TERM_Z] }); // − paralel
      }
      if (g < cfg.s - 1) out.push({ a: [cellX(i1), y + 0.008, -TERM_Z], b: [cellX(i1 + 1), y + 0.008, TERM_Z] }); // seri: − ke + berikutnya
    }
    return out;
  }, [config]);

  return (
    <group position={position} rotation={[0, facing, 0]} name="BatteryGame">
      {/* ---- meja kerja ---- */}
      <mesh geometry={benchTop} position={[0, TOP - 0.03, 0]}>
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* alas karet isolasi */}
      <mesh position={[0, TOP + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[1.5, 0.5]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.9} />
      </mesh>
      {[-1.25, 1.25].map((x) =>
        [-0.4, 0.4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, (TOP - 0.06) / 2, z]} raycast={noRaycast}>
            <cylinderGeometry args={[0.03, 0.03, TOP - 0.06, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
          </mesh>
        )),
      )}

      {/* ---- 8 sel ---- */}
      {cells.map((c, i) => (
        <group key={i} position={[cellX(i), TOP, 0]}>
          <mesh geometry={cellGeometry} position={[0, CELL_H / 2, 0]} raycast={noRaycast}>
            <meshStandardMaterial color={c.replaced ? "#16a34a" : c.flagged ? "#b91c1c" : "#1d4ed8"} roughness={0.45} metalness={0.2} />
          </mesh>
          {(["p", "n"] as const).map((t) => (
            <group key={t} position={[0, CELL_H, t === "p" ? TERM_Z : -TERM_Z]}>
              <mesh geometry={termGeometry} position={[0, 0.01, 0]} raycast={noRaycast}>
                <meshStandardMaterial color={t === "p" ? "#dc2626" : "#111827"} metalness={0.6} roughness={0.3} />
              </mesh>
              {/* kotak pilih kutub (lebih besar dari kutubnya, supaya mudah dibidik laser) */}
              <mesh
                name={`Baterai_term_${i}_${t}`}
                position={[0, 0.03, 0]}
                userData={{ isInteractableMesh: true, isVRButton: true, onClick: () => touch(i, t) }}
                onClick={(e) => {
                  e.stopPropagation();
                  touch(i, t);
                }}
              >
                <boxGeometry args={[0.1, 0.06, 0.06]} />
                <meshBasicMaterial colorWrite={false} depthWrite={false} />
              </mesh>
              {/* probe yang sedang menempel */}
              {red && red.i === i && red.t === t && (
                <mesh position={[0, 0.07, 0]} raycast={noRaycast}>
                  <coneGeometry args={[0.012, 0.1, 12]} />
                  <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.6} />
                </mesh>
              )}
            </group>
          ))}
        </group>
      ))}
      {/* busbar tembaga */}
      {bars.map((b, k) => {
        const a = new THREE.Vector3(...b.a);
        const bb = new THREE.Vector3(...b.b);
        const len = a.distanceTo(bb) + 0.03;
        const mid = a.clone().add(bb).multiplyScalar(0.5);
        const ang = Math.atan2(bb.z - a.z, bb.x - a.x);
        return (
          <mesh key={k} position={mid.toArray()} rotation={[0, -ang, 0]} raycast={noRaycast}>
            <boxGeometry args={[len, 0.008, 0.022]} />
            <meshStandardMaterial color="#d97706" metalness={0.9} roughness={0.25} />
          </mesh>
        );
      })}
      {/* penanda sel terpilih */}
      <mesh ref={marker} rotation={[Math.PI, 0, 0]} visible={false} raycast={noRaycast}>
        <coneGeometry args={[0.03, 0.06, 16]} />
        <meshBasicMaterial color="#facc15" toneMapped={false} />
      </mesh>

      {/* ---- rak sel cadangan ---- */}
      <mesh geometry={trayGeometry} position={[-0.45, TOP + 0.015, -0.34]} raycast={noRaycast}>
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} geometry={cellGeometry} position={[-0.9 + k * 0.14, TOP + 0.03 + CELL_H * 0.4, -0.34]} scale={[1, 0.8, 1]} raycast={noRaycast}>
          <meshStandardMaterial color="#16a34a" roughness={0.45} />
        </mesh>
      ))}

      {/* ---- multimeter ---- */}
      <group position={[0.95, TOP, -0.12]} rotation={[0, -0.25, 0]}>
        <mesh geometry={meterGeometry} position={[0, 0.02, 0]} raycast={noRaycast}>
          <meshStandardMaterial color="#facc15" roughness={0.5} />
        </mesh>
        <group position={[0, 0.16, -0.12]} rotation={[-0.35, 0, 0]}>
          <mesh position={[0, 0, -0.012]} raycast={noRaycast}>
            <boxGeometry args={[0.3, 0.19, 0.02]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.5} />
          </mesh>
          <mesh raycast={noRaycast}>
            <planeGeometry args={[0.29, 0.17]} />
            <meshBasicMaterial map={meter.t} toneMapped={false} />
          </mesh>
        </group>
        {/* kabel probe merah & hitam */}
        {[
          ["#dc2626", -0.05],
          ["#111827", 0.05],
        ].map(([col, dx]) => (
          <mesh key={col as string} position={[(dx as number), 0.05, 0.16]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <torusGeometry args={[0.05, 0.007, 8, 24]} />
            <meshStandardMaterial color={col as string} roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* ---- konsol tombol (tepi depan meja, miring ke pemain) ---- */}
      <group position={[0, TOP + 0.04, 0.4]} rotation={[-0.75, 0, 0]}>
        <Btn name="V" label="MODE V" color="#0369a1" position={[-1.0, 0.09, 0]} active={mode === "V"} onPress={() => (playVRClickSound(), (live.current.mode = "V"), setMode("V"))} />
        <Btn name="R" label="MODE mΩ" color="#0369a1" position={[-1.0, -0.09, 0]} active={mode === "R"} onPress={() => (playVRClickSound(), (live.current.mode = "R"), setMode("R"))} />
        <Btn name="tandai" label="TANDAI RUSAK" color="#b91c1c" position={[-0.6, 0.09, 0]} disabled={step !== "replace" && step !== "measure"} onPress={flag} />
        <Btn name="ganti" label="GANTI SEL" color="#16a34a" position={[-0.6, -0.09, 0]} disabled={step !== "replace"} onPress={replace} />
        <Btn name="samakan" label="SAMAKAN TEGANGAN" color="#7c3aed" position={[-0.2, 0, 0]} disabled={step !== "balance"} onPress={balance} />
        {CONFIGS.map((c, k) => (
          <Btn key={c.id} name={c.id} label={c.id} color="#d97706" position={[0.22 + k * 0.4, 0, 0]} active={config === c.id} disabled={step !== "wire" && step !== "done"} onPress={() => wire(c.id)} />
        ))}
        <Btn name="ulangi" label="ULANGI" color="#475569" position={[1.0, -0.17, 0]} onPress={reset} />
      </group>

      {/* ---- papan informasi di belakang meja ---- */}
      <group position={[0, 2.25, -0.55]}>
        <mesh position={[0, 0, -0.03]} raycast={noRaycast}>
          <boxGeometry args={[2.72, 1.56, 0.05]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh raycast={noRaycast}>
          <planeGeometry args={[2.64, 1.485]} />
          <meshBasicMaterial map={board.t} toneMapped={false} />
        </mesh>
        {[-1.2, 1.2].map((x) => (
          <mesh key={x} position={[x, -2.25 + 0.735, -0.03]} raycast={noRaycast}>
            <cylinderGeometry args={[0.035, 0.04, 1.47, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
