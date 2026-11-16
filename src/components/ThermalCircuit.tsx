import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { disableRaycast, fitModel, loadGlb } from "../lib/glb";
import { modelUrl } from "../lib/quality";
import { playVRClickSound } from "../lib/vrAudio";
import { recordActivity } from "../lib/obe";
import { Btn, useLiveCanvas } from "./BatteryGame";

/**
 * "Sirkuit Uji Termal": oval datar di atas pelataran beton dengan rintangan (genangan air untuk uji
 * kedap air IP67, tanjakan beton, jalan bergelombang) + skenario macet, di utara lintasan uji. Satu mobil listrik berkeliling; simulasi menghitung daya, arus baterai, panas
 * (I²R), dan kerja sistem pendingin (pompa, radiator + kipas, chiller, AC kabin). Papan besar di
 * depan tribun menampilkan angka dan grafik suhu secara langsung.
 *
 * Pemain menonton dari tribun / sisi selatan; seluruh area sirkuit menjadi kotak tabrakan
 * (CIRCUIT_SOLIDS) karena pemain berjalan di permukaan datar (tidak bisa naik tanjakan / tikungan
 * miring).
 */

const noRaycast = () => null;
type Vec3 = [number, number, number];

/** Oval: pusat, setengah panjang (sampai ujung tikungan), jari-jari tikungan, setengah lebar jalan. */
const OVAL = { cx: 5, cz: -66, hx: 34, r: 14, hw: 6 };
const STRAIGHT = 2 * (OVAL.hx - OVAL.r); // 40 m
const TURN = Math.PI * OVAL.r;
const LEN = 2 * STRAIGHT + 2 * TURN;
/** Ruas (s dalam meter dari ujung barat lurusan selatan, searah jarum jam dilihat dari atas → ke timur dulu). */
const S_T1 = STRAIGHT;
const S_N = STRAIGHT + TURN;
const S_T2 = 2 * STRAIGHT + TURN;
const VIS = 0.35; // kecepatan tampilan = kecepatan simulasi × VIS (supaya mata bisa mengikuti)
const TS = 40; // waktu termal dipercepat 40×

export const CIRCUIT_SOLIDS = [
  { minX: OVAL.cx - OVAL.hx - OVAL.hw - 1, maxX: OVAL.cx + OVAL.hx + OVAL.hw + 1, minZ: OVAL.cz - OVAL.r - OVAL.hw - 1, maxZ: OVAL.cz + OVAL.r + OVAL.hw + 1 },
  // tribun & papan
  { minX: -12.2, maxX: 12.2, minZ: -41.8, maxZ: -36.6 },
  { minX: 21.6, maxX: 26.4, minZ: -42.6, maxZ: -41.6 },
];

/* ---------------- geometri lintasan ---------------- */

type Pose = { x: number; z: number; tx: number; tz: number; nx: number; nz: number };
/** Titik garis tengah + arah + normal ke luar oval. */
function centerAt(sRaw: number, out: Pose): Pose {
  const s = ((sRaw % LEN) + LEN) % LEN;
  const { cx, cz, hx, r } = OVAL;
  const xe = cx + hx - r; // pusat tikungan timur
  const xw = cx - hx + r; // pusat tikungan barat
  if (s < S_T1) {
    out.x = xw + s;
    out.z = cz + r;
    out.tx = 1;
    out.tz = 0;
  } else if (s < S_N) {
    const a = (s - S_T1) / r; // 0..π, mulai dari selatan berputar ke utara lewat timur
    out.x = xe + Math.sin(a) * r;
    out.z = cz + Math.cos(a) * r;
    out.tx = Math.cos(a);
    out.tz = -Math.sin(a);
  } else if (s < S_T2) {
    out.x = xe - (s - S_N);
    out.z = cz - r;
    out.tx = -1;
    out.tz = 0;
  } else {
    const a = (s - S_T2) / r;
    out.x = xw - Math.sin(a) * r;
    out.z = cz - Math.cos(a) * r;
    out.tx = -Math.cos(a);
    out.tz = Math.sin(a);
  }
  // normal ke luar: tegak lurus arah gerak, menjauhi pusat tikungan / sumbu oval
  out.nx = -out.tz;
  out.nz = out.tx;
  return out;
}

/** Pelataran: seluruh jalan & lapangan dalam setinggi BASE supaya genangan bisa lebih rendah dari jalan. */
const BASE = 0.35;
/** Rintangan (s dari ujung barat lurusan selatan). */
const WATER = { s0: 11, ramp: 3, flat: 12, depth: 0.33, level: 0.27 }; // genangan 27 cm di depan tribun
const HILL = { s0: S_N + 6, up: 10, top: 8, down: 10, h: 1.6 }; // tanjakan 16 % di lurusan utara
const BUMPS = { s0: S_T2 + 12, len: 20, amp: 0.06, wave: 1.6 }; // jalan bergelombang di tikungan barat
const WATER_END = WATER.s0 + WATER.ramp * 2 + WATER.flat;
const HILL_END = HILL.s0 + HILL.up + HILL.top + HILL.down;

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrap = (s: number) => ((s % LEN) + LEN) % LEN;
/** Ketinggian jalan relatif pelataran: tanjakan (+), genangan (−), gelombang (±). */
function elevAt(sRaw: number) {
  const s = wrap(sRaw);
  if (s >= HILL.s0 && s < HILL_END) {
    const a = s - HILL.s0;
    if (a < HILL.up) return HILL.h * smooth(a / HILL.up);
    if (a < HILL.up + HILL.top) return HILL.h;
    return HILL.h * (1 - smooth((a - HILL.up - HILL.top) / HILL.down));
  }
  if (s >= WATER.s0 && s < WATER_END) {
    const a = s - WATER.s0;
    if (a < WATER.ramp) return -WATER.depth * smooth(a / WATER.ramp);
    if (a < WATER.ramp + WATER.flat) return -WATER.depth;
    return -WATER.depth * (1 - smooth((a - WATER.ramp - WATER.flat) / WATER.ramp));
  }
  if (s >= BUMPS.s0 && s < BUMPS.s0 + BUMPS.len) {
    const a = s - BUMPS.s0;
    const fade = Math.min(1, a / 2, (BUMPS.len - a) / 2);
    return BUMPS.amp * fade * (1 - Math.cos((a / BUMPS.wave) * Math.PI * 2)) * 0.5;
  }
  return 0;
}
const gradeAt = (s: number) => (elevAt(s + 0.25) - elevAt(s - 0.25)) / 0.5;
const surfaceY = (s: number) => BASE + elevAt(s) + 0.02;
const inWater = (s: number) => {
  const w = wrap(s);
  return w > WATER.s0 + WATER.ramp * 0.6 && w < WATER_END - WATER.ramp * 0.6;
};

function drawRoad(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#2a2c30";
  ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 6000; i++) {
    const v = 34 + Math.floor(rnd() * 44);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.6)`;
    ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
  }
  // garis tepi putih + kerb merah-putih di kedua sisi, 3 lajur putus-putus
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(w * 0.04, 0, w * 0.012, h);
  ctx.fillRect(w * 0.948, 0, w * 0.012, h);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "#f8fafc" : "#dc2626";
    ctx.fillRect(0, (i * h) / 4, w * 0.03, h / 4);
    ctx.fillRect(w * 0.97, (i * h) / 4, w * 0.03, h / 4);
  }
  ctx.fillStyle = "#e2e8f0";
  for (const u of [1 / 3, 2 / 3]) ctx.fillRect(w * u - w * 0.004, 0, w * 0.008, h * 0.45);
}

function buildRoad() {
  const N = Math.ceil(LEN / 0.5);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const P: Pose = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
  const reps = Math.round(LEN / 8);
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * LEN;
    centerAt(s, P);
    for (const u of [-OVAL.hw, OVAL.hw]) {
      pos.push(P.x + P.nx * u, surfaceY(s), P.z + P.nz * u);
      uv.push(u < 0 ? 0 : 1, (i / N) * reps);
    }
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dinding sisi dari tanah sampai max(jalan, `minTop`) + `extra`; UV: u sepanjang jalan, v = tinggi. */
function buildSkirt(u: number, extra: number, minTop: number) {
  const N = Math.ceil(LEN / 0.5);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const P: Pose = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
  let k = 0;
  for (let i = 0; i < N; i++) {
    const s0 = (i / N) * LEN;
    const s1 = ((i + 1) / N) * LEN;
    const y0 = Math.max(surfaceY(s0), minTop) + extra;
    const y1 = Math.max(surfaceY(s1), minTop) + extra;
    centerAt(s0, P);
    const a = [P.x + P.nx * u, P.z + P.nz * u];
    centerAt(s1, P);
    const b = [P.x + P.nx * u, P.z + P.nz * u];
    pos.push(a[0], 0, a[1], b[0], 0, b[1], a[0], y0, a[1], b[0], y1, b[1]);
    uv.push(s0 / 4, 0, s1 / 4, 0, s0 / 4, y0, s1 / 4, y1);
    idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    k += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Permukaan air genangan selebar jalan. */
function buildWater() {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const P: Pose = { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 };
  const a0 = WATER.s0 + 0.4;
  const a1 = WATER_END - 0.4;
  const N = 24;
  const y = BASE - WATER.depth + WATER.level + 0.02;
  for (let i = 0; i <= N; i++) {
    const s = a0 + ((a1 - a0) * i) / N;
    centerAt(s, P);
    for (const u of [-OVAL.hw + 0.05, OVAL.hw - 0.05]) {
      pos.push(P.x + P.nx * u, y, P.z + P.nz * u);
      uv.push(u < 0 ? 0 : 3, s / 4);
    }
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
/** Pembatas luar: blok merah-putih seperti dinding ban; dinding dalam: beton + pita kuning-hitam. */
const drawBarrier = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 3);
};
const drawConcrete = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = "#a8a29e";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1500; i++) {
    const v = 140 + Math.floor(rnd() * 40);
    ctx.fillStyle = `rgba(${v},${v - 4},${v - 8},0.5)`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#111827" : "#facc15";
    ctx.beginPath();
    ctx.moveTo(i * 32, 0);
    ctx.lineTo(i * 32 + 32, 0);
    ctx.lineTo(i * 32 + 16, 40);
    ctx.lineTo(i * 32 - 16, 40);
    ctx.fill();
  }
};
const drawGrass = (ctx: CanvasRenderingContext2D) => {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#4d8a3f" : "#5a9a49";
    ctx.fillRect(0, i * 32, 256, 32);
  }
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(${30 + rnd() * 40},${90 + rnd() * 50},${30 + rnd() * 30},0.5)`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 1.5, 3);
  }
};
const drawRipple = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = "#1e5aa8";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(186,230,253,0.18)";
  ctx.lineWidth = 2;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + rnd() * 26, 4 + rnd() * 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
};

/** Papan rambu di lapangan dalam (menghadap tribun). */
function CircuitSign({ position, lines, bg }: { position: Vec3; lines: [string, string]; bg: string }) {
  const tex = useMemo(
    () =>
      canvasTex(
        768,
        320,
        (ctx) => {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          (ctx as any).roundRect?.(0, 0, 768, 320, 36) ?? ctx.rect(0, 0, 768, 320);
          ctx.fill();
          ctx.fillStyle = bg;
          ctx.beginPath();
          (ctx as any).roundRect?.(12, 12, 744, 296, 28) ?? ctx.rect(12, 12, 744, 296);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "900 92px system-ui, sans-serif";
          ctx.fillText(lines[0], 384, 118, 720);
          ctx.font = "700 52px system-ui, sans-serif";
          ctx.fillText(lines[1], 384, 226, 720);
        },
        false,
      ),
    [lines, bg],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={position}>
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 1.1, -0.04]} raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.06, 2.2, 10]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 2.1, 0]} raycast={noRaycast}>
        <planeGeometry args={[2.6, 1.08]} />
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ---------------- simulasi ---------------- */

type Scenario = "ngebut" | "tanjakan" | "genangan" | "macet" | "otomatis";
const SCEN: Record<Exclude<Scenario, "otomatis">, { title: string; info: string; color: string }> = {
  ngebut: { title: "NGEBUT DI OVAL", info: "130 km/jam di lurusan. Daya & arus besar → panas I²R baterai naik; chiller ikut bekerja. Rintangan tetap dilewati pelan.", color: "#ef4444" },
  tanjakan: { title: "TANJAKAN 16 % & TURUNAN", info: "Naik tanjakan butuh daya besar; turunan mengisi baterai lewat rem regeneratif.", color: "#f59e0b" },
  genangan: { title: "UJI GENANGAN AIR 27 cm", info: "Paket baterai, motor, dan konektor tegangan tinggi tersegel (IP67). Lewati genangan pelan agar tidak terbentuk gelombang.", color: "#2563eb" },
  macet: { title: "MACET (STOP & GO)", info: "Baterai hampir tidak panas, tetapi tanpa aliran udara kipas radiator bekerja keras; AC kabin tetap memakai energi.", color: "#38bdf8" },
};
const AUTO_ORDER: Exclude<Scenario, "otomatis">[] = ["ngebut", "tanjakan", "genangan", "macet"];

const CAR = { m: 1900, cda: 0.62, crr: 0.012, V: 400, R: 0.1, eta: 0.9 };
const TH = { cb: 2.5e5, cc: 3e4, hbc: 140, chill: 3000 };

type Sim = {
  s: number;
  v: number; // m/s (simulasi)
  tb: number;
  tc: number;
  pump: number;
  fan: number;
  chiller: boolean;
  P: number;
  I: number;
  qb: number;
  kwh: number;
  km: number;
  phase: number; // macet: fase stop-go
  hist: { tb: number; tc: number; v: number }[];
  histT: number;
  autoT: number;
  sector: string;
};

const tempCss = (t: number) => (t < 25 ? "#22d3ee" : t < 33 ? "#22c55e" : t < 38 ? "#eab308" : t < 45 ? "#f97316" : "#ef4444");
const f1 = (n: number) => n.toFixed(1).replace(".", ",");

function drawBoard(ctx: CanvasRenderingContext2D, sim: Sim, scen: Exclude<Scenario, "otomatis">, auto: boolean, amb: number) {
  const W = 1600;
  const H = 900;
  const S = SCEN[scen];
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = S.color;
  ctx.fillRect(0, 0, W, 12);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#67e8f9";
  ctx.font = "800 30px system-ui, sans-serif";
  ctx.fillText("SIRKUIT UJI TERMAL BATERAI", 48, 52);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 56px system-ui, sans-serif";
  ctx.fillText(S.title + (auto ? "  (otomatis)" : ""), 48, 110, 1040);
  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText(`Udara luar ${amb} °C · waktu termal ×${TS}`, W - 48, 52);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "800 34px system-ui, sans-serif";
  ctx.fillText(`Ruas: ${sim.sector}`, W - 48, 110);
  ctx.textAlign = "left";
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 27px system-ui, sans-serif";
  ctx.fillText(S.info, 48, 162, W - 96);

  // angka
  const kmh = sim.v * 3.6;
  const rows: [string, string, string][] = [
    ["Kecepatan", `${Math.round(kmh)} km/jam`, "#f8fafc"],
    ["Daya baterai", `${sim.P >= 0 ? "" : "−"}${f1(Math.abs(sim.P) / 1000)} kW${sim.P < 0 ? " (regen)" : ""}`, sim.P < 0 ? "#22d3ee" : "#f8fafc"],
    ["Arus baterai", `${Math.round(Math.abs(sim.I))} A`, "#f8fafc"],
    ["Panas sel (I²R)", `${Math.round(sim.qb)} W`, sim.qb > 800 ? "#f97316" : "#f8fafc"],
    ["Suhu baterai", `${f1(sim.tb)} °C`, tempCss(sim.tb)],
    ["Suhu cairan pendingin", `${f1(sim.tc)} °C`, tempCss(sim.tc)],
    ["Pompa", `${Math.round(sim.pump * 100)} %`, "#f8fafc"],
    ["Kipas radiator", `${Math.round(sim.fan * 100)} %`, sim.fan > 0.6 ? "#f97316" : "#f8fafc"],
    ["Chiller (AC → baterai)", sim.chiller ? "MENYALA" : "mati", sim.chiller ? "#38bdf8" : "#64748b"],
    ["Konsumsi rata-rata", sim.km > 0.05 ? `${f1((sim.kwh / sim.km) * 100)} kWh/100 km` : "—", "#f8fafc"],
  ];
  rows.forEach(([k, v, c], i) => {
    const y = 226 + i * 62;
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)";
    ctx.fillRect(40, y - 28, 640, 56);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 27px system-ui, sans-serif";
    ctx.fillText(k, 60, y);
    ctx.textAlign = "right";
    ctx.fillStyle = c;
    ctx.font = "900 31px system-ui, sans-serif";
    ctx.fillText(v, 664, y);
    ctx.textAlign = "left";
  });

  // grafik
  const gx = 730;
  const gy = 210;
  const gw = W - gx - 48;
  const gh = 560;
  ctx.fillStyle = "#111c30";
  ctx.fillRect(gx, gy, gw, gh);
  const tMin = 20;
  const tMax = 55;
  const yT = (t: number) => gy + gh - ((t - tMin) / (tMax - tMin)) * gh;
  ctx.font = "600 20px system-ui, sans-serif";
  for (let t = 20; t <= 55; t += 5) {
    ctx.strokeStyle = "rgba(148,163,184,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, yT(t));
    ctx.lineTo(gx + gw, yT(t));
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.fillText(`${t}°`, gx + 8, yT(t) - 12);
  }
  // batas chiller
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(gx, yT(36));
  ctx.lineTo(gx + gw, yT(36));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#38bdf8";
  ctx.textAlign = "right";
  ctx.fillText("chiller menyala ≥ 36 °C", gx + gw - 10, yT(36) - 14);
  ctx.textAlign = "left";
  const n = sim.hist.length;
  const xAt = (i: number) => gx + (i / 119) * gw;
  const line = (get: (h: Sim["hist"][number]) => number, color: string, w: number) => {
    if (n < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    sim.hist.forEach((h, i) => (i ? ctx.lineTo(xAt(i), get(h)) : ctx.moveTo(xAt(i), get(h))));
    ctx.stroke();
  };
  line((h) => gy + gh - (h.v * 3.6 / 180) * gh, "rgba(226,232,240,0.35)", 3);
  line((h) => yT(h.tc), "#22d3ee", 5);
  line((h) => yT(h.tb), "#ef4444", 6);
  ctx.font = "800 24px system-ui, sans-serif";
  const legend: [string, string][] = [
    ["#ef4444", "Suhu baterai"],
    ["#22d3ee", "Suhu cairan"],
    ["rgba(226,232,240,0.6)", "Kecepatan (0–180 km/jam)"],
  ];
  legend.forEach(([c, t], i) => {
    const x = gx + 10 + i * 270;
    ctx.fillStyle = c;
    ctx.fillRect(x, gy + gh + 30, 34, 8);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(t, x + 44, gy + gh + 34);
  });
  if (scen === "genangan" || sim.sector.startsWith("Genangan")) {
    const bx = gx + 20;
    const by = gy + 20;
    const bw = gw - 40;
    ctx.fillStyle = "rgba(15,40,90,0.94)";
    ctx.beginPath();
    (ctx as any).roundRect?.(bx, by, bw, 330, 20) ?? ctx.rect(bx, by, bw, 330);
    ctx.fill();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#bfdbfe";
    ctx.font = "900 30px system-ui, sans-serif";
    ctx.fillText("KEDAP AIR: STANDAR IP (IEC 60529)", bx + 24, by + 38, bw - 48);
    const lines = [
      "IP67 → angka 6: rapat debu · angka 7: tahan terendam 1 m selama 30 menit",
      "IP68 → tahan terendam lebih dalam / lebih lama (batas dari pabrik)",
      "IP6K9K (ISO 20653) → tahan semprotan air bertekanan & panas",
      "Paket baterai EV umumnya IP67–IP68; konektor & motor HV juga tersegel",
      "Batas genangan aman: ikuti buku manual mobil; lewati pelan (±10 km/jam)",
    ];
    ctx.fillStyle = "#e0f2fe";
    ctx.font = "600 23px system-ui, sans-serif";
    lines.forEach((l, i) => ctx.fillText("• " + l, bx + 24, by + 92 + i * 50, bw - 48));
  }
  ctx.fillStyle = "#64748b";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText("Panas baterai = I² × R. Arus naik dua kali → panas empat kali.", 48, H - 34);
}

/* ---------------- komponen ---------------- */

const SPLASH = 80;
const _sp = new THREE.Vector3();
const TRAFFIC = ["suv-roda", "mpv-roda", "klasik-roda", "suv-roda", "mpv-roda"];
const GAP = 7.5; // jarak antarmobil saat macet (m tampilan)

export function ThermalCircuit({ hall }: { hall: { x0: number; x1: number; z0: number; z1: number } }) {
  const root = useRef<THREE.Group>(null);
  const [scenario, setScenario] = useState<Scenario>("otomatis");
  const [active, setActive] = useState<Exclude<Scenario, "otomatis">>("ngebut");
  const [amb, setAmb] = useState(30);
  const tried = useRef(new Set<string>());
  const sim = useRef<Sim>({ s: 2, v: 0, tb: 30, tc: 30, pump: 0.25, fan: 0, chiller: false, P: 0, I: 0, qb: 0, kwh: 0, km: 0, phase: 0, hist: [], histT: 0, autoT: 0, sector: "—" });
  const board = useLiveCanvas(1600, 900);
  const tag = useLiveCanvas(512, 128);
  const lastDraw = useRef(0);

  const road = useMemo(buildRoad, []);
  const outer = useMemo(() => buildSkirt(OVAL.hw + 0.12, 0.55, BASE), []);
  const inner = useMemo(() => buildSkirt(-OVAL.hw - 0.05, 0.06, BASE), []);
  const water = useMemo(buildWater, []);
  const barrierTex = useMemo(() => canvasTex(256, 256, drawBarrier), []);
  const concreteTex = useMemo(() => canvasTex(256, 256, drawConcrete), []);
  const grassTex = useMemo(() => {
    const t = canvasTex(256, 256, drawGrass);
    t.repeat.set(6, 4);
    return t;
  }, []);
  const rippleTex = useMemo(() => canvasTex(256, 256, drawRipple), []);
  const roadTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    drawRoad(c.getContext("2d")!, 512, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(
    () => () => {
      road.dispose();
      outer.dispose();
      inner.dispose();
      water.dispose();
      roadTex.dispose();
      barrierTex.dispose();
      concreteTex.dispose();
      grassTex.dispose();
      rippleTex.dispose();
    },
    [road, outer, inner, water, roadTex, barrierTex, concreteTex, grassTex, rippleTex],
  );

  // ---- mobil uji + mobil lalu lintas ----
  const carRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const tagRef = useRef<THREE.Mesh>(null);
  const traffic = useRef<(THREE.Group | null)[]>([]);
  const wheels = useRef<{ node: THREE.Object3D; radius: number }[][]>([]);
  const [models, setModels] = useState<(THREE.Object3D | null)[]>([]);
  useEffect(() => {
    let cancelled = false;
    ["mobil", ...TRAFFIC].forEach((name, i) => {
      loadGlb(modelUrl(name))
        .then((shared) => {
          if (cancelled) return;
          const holder = new THREE.Group();
          const model = shared.clone();
          model.rotation.y = Math.PI / 2; // hidung model menghadap −X → putar ke +Z lokal
          holder.add(model);
          const scale = fitModel(holder, 4.5);
          disableRaycast(holder);
          const ws: { node: THREE.Object3D; radius: number }[] = [];
          holder.traverse((o) => {
            if (o.name.startsWith("wheel_") && !o.parent?.name.startsWith("wheel_")) ws.push({ node: o, radius: ((o.userData.radius as number) || 0.15) * scale });
          });
          wheels.current[i] = ws;
          setModels((cur) => {
            const next = [...cur];
            next[i] = holder;
            return next;
          });
        })
        .catch((err) => console.warn(`[ThermalCircuit] ${name} gagal dimuat:`, err));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const P = useMemo<Pose>(() => ({ x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 }), []);
  const splashRef = useRef<THREE.Points>(null);
  const splash = useMemo(() => Array.from({ length: SPLASH }, () => ({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), life: 0 })), []);
  const splashGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(SPLASH * 3).fill(-50), 3));
    return g;
  }, []);
  useEffect(() => () => splashGeo.dispose(), [splashGeo]);
  const cam = useMemo(() => new THREE.Vector3(), []);
  const glowColor = useMemo(() => new THREE.Color(), []);

  /** Letakkan mobil di permukaan jalan: belok, mendongak di tanjakan, miring di tikungan. */
  const poseCar = (g: THREE.Object3D, s: number, u: number) => {
    centerAt(s, P);
    g.position.set(P.x + P.nx * u, surfaceY(s), P.z + P.nz * u);
    g.rotation.order = "YXZ";
    g.rotation.y = Math.atan2(P.tx, P.tz);
    g.rotation.x = -Math.atan(gradeAt(s));
  };

  useFrame((state, rawDelta) => {
    const g = root.current;
    if (!g) return;
    const camera: THREE.Camera = (import.meta.env.DEV && (window as any).__shotCam) || state.camera;
    camera.getWorldPosition(cam);
    const inside = cam.x > hall.x0 && cam.x < hall.x1 && cam.z > hall.z0 && cam.z < hall.z1;
    const dist = Math.hypot(cam.x - OVAL.cx, cam.z - OVAL.cz);
    const far = dist > 120;
    g.visible = !inside && !far;
    if (!g.visible) return;

    const reps = import.meta.env.DEV ? Math.max(1, Math.round((window as any).__timeScale || 1)) : 1;
    const dt = Math.min(rawDelta, 0.05);
    const st = sim.current;
    for (let r = 0; r < reps; r++) {
      // skenario otomatis berganti tiap 40 detik
      let scen = active;
      if (scenario === "otomatis") {
        st.autoT += dt;
        if (st.autoT > 40) {
          st.autoT = 0;
          scen = AUTO_ORDER[(AUTO_ORDER.indexOf(active) + 1) % AUTO_ORDER.length];
          setActive(scen);
        }
      }
      const s = wrap(st.s);
      const grade = gradeAt(s);
      const inTurn = (s >= S_T1 && s < S_N) || s >= S_T2;
      // jarak ke rintangan di depan (m): mobil melambat sebelum genangan & gelombang
      const ahead = (x: number) => wrap(x - s);
      const nearWater = ahead(WATER.s0) < 10 || (s >= WATER.s0 && s < WATER_END);
      const nearBumps = ahead(BUMPS.s0) < 6 || (s >= BUMPS.s0 && s < BUMPS.s0 + BUMPS.len);
      // kecepatan sasaran (km/jam)
      let target = 0;
      if (scen === "ngebut") target = nearWater ? 15 : nearBumps ? 40 : inTurn ? 80 : 130;
      else if (scen === "tanjakan") target = nearWater ? 15 : nearBumps ? 30 : 45;
      else if (scen === "genangan") target = nearWater ? 10 : nearBumps ? 25 : 35;
      else {
        st.phase += dt;
        const cyc = st.phase % 9; // 9 detik: maju pelan 4 dt, berhenti 5 dt
        target = cyc < 4 ? 14 * Math.sin((cyc / 4) * Math.PI) : 0;
      }
      const vt = target / 3.6;
      const acc = THREE.MathUtils.clamp((vt - st.v) * 0.8, -4, 3);
      st.v = Math.max(0, st.v + acc * dt);
      // daya: hambatan udara + gulir + tanjakan + percepatan
      const Fw = 0.5 * 1.2 * CAR.cda * st.v * st.v + CAR.crr * CAR.m * 9.81 * (st.v > 0.05 ? 1 : 0) + CAR.m * 9.81 * grade + CAR.m * acc;
      const Pw = Fw * st.v;
      const ac = amb >= 30 ? 1500 + (amb - 30) * 200 : 800;
      const Pdrive = Pw >= 0 ? Pw / CAR.eta : Pw * 0.7; // regen: hanya ±70 % kembali
      st.P = Pdrive + ac + (st.chiller ? 1200 : 0);
      st.I = st.P / CAR.V;
      st.qb = st.I * st.I * CAR.R;
      const qm = Math.abs(Pw) * 0.07; // rugi motor + inverter ke cairan yang sama
      // pengendali
      st.pump = THREE.MathUtils.clamp(0.25 + (st.tb - 28) / 10, 0.25, 1);
      const lowAir = st.v < 5 ? 0.35 : 0;
      st.fan = st.tc > 31 ? THREE.MathUtils.clamp((st.tc - 31) / 6 + lowAir, 0, 1) : 0;
      if (st.tb > 36) st.chiller = true;
      else if (st.tb < 32) st.chiller = false;
      // termal (waktu dipercepat TS)
      const dth = dt * TS;
      const qbc = TH.hbc * st.pump * (st.tb - st.tc);
      const ua = 25 + 18 * st.v + st.fan * 380;
      const qr = st.tc > amb + 0.5 ? ua * (st.tc - amb) : 0;
      const qch = st.chiller ? TH.chill : 0;
      st.tb += ((st.qb - qbc + (amb - st.tb) * 4) / TH.cb) * dth;
      st.tc += ((qbc + qm - qr - qch) / TH.cc) * dth;
      st.tc = Math.max(st.tc, 12);
      // energi & jarak (dipercepat seperti waktu termal)
      st.kwh += (st.P * dth) / 3.6e6;
      st.km += (st.v * dth) / 1000;
      // gerak tampilan
      const ds = st.v * VIS * dt;
      st.s += ds;
      const sw = wrap(st.s);
      st.sector =
        scen === "macet"
          ? "Macet, stop & go"
          : inWater(sw)
            ? "Genangan air 27 cm"
            : sw >= HILL.s0 && sw < HILL_END
              ? grade > 0.01
                ? "Tanjakan 16 %"
                : grade < -0.01
                  ? "Turunan (regen)"
                  : "Puncak tanjakan"
              : sw >= BUMPS.s0 && sw < BUMPS.s0 + BUMPS.len
                ? "Jalan bergelombang"
                : inTurn
                  ? "Tikungan"
                  : "Lurus";
      for (const w of wheels.current[0] ?? []) w.node.rotation.z += ds / w.radius;
      st.histT += dt;
      if (st.histT > 0.5) {
        st.histT = 0;
        st.hist.push({ tb: st.tb, tc: st.tc, v: st.v });
        if (st.hist.length > 120) st.hist.shift();
      }
    }

    // riak air bergerak; percikan dari roda saat mobil melintasi genangan
    rippleTex.offset.y -= dt * 0.05;
    rippleTex.offset.x += dt * 0.02;
    const pts = splashRef.current;
    if (pts && carRef.current) {
      const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const wet = inWater(st.s) && st.v > 0.3;
      for (let k = 0; k < SPLASH; k++) {
        const sp = splash[k];
        if (sp.life <= 0 && wet && Math.random() < 0.25 + st.v * 0.05) {
          // muncul di salah satu dari empat roda, terlempar ke samping & ke atas (lebih tinggi bila lebih cepat)
          const wx = (k % 2 ? 1 : -1) * 0.85;
          const wz = (k % 4 < 2 ? 1 : -1) * 1.35;
          _sp.set(wx, 0.05, wz).applyEuler(carRef.current.rotation).add(carRef.current.position);
          sp.p.copy(_sp);
          sp.v.set(Math.sign(wx) * (0.6 + Math.random()), 1 + Math.random() * (0.8 + st.v * 0.12), (Math.random() - 0.5) * 0.8).applyEuler(carRef.current.rotation);
          sp.life = 0.6 + Math.random() * 0.4;
        }
        if (sp.life > 0) {
          sp.life -= dt;
          sp.v.y -= 9.8 * dt;
          sp.p.addScaledVector(sp.v, dt);
        }
        const y = sp.life > 0 ? sp.p.y : -50;
        arr[k * 3] = sp.p.x;
        arr[k * 3 + 1] = y;
        arr[k * 3 + 2] = sp.p.z;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    }

    // mobil uji & mobil lalu lintas
    const scenNow = active;
    if (carRef.current) poseCar(carRef.current, st.s, scenNow === "ngebut" ? 2.5 : 0);
    traffic.current.forEach((t, k) => {
      if (!t) return;
      // mobil lalu lintas hanya digambar saat macet dan pemain cukup dekat (hemat untuk Quest)
      t.visible = scenNow === "macet" && dist < 75;
      if (t.visible) poseCar(t, st.s + (k < 3 ? k + 1 : -(k - 2)) * GAP, 0);
    });
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshBasicMaterial;
      glowColor.set(tempCss(st.tb));
      m.color.copy(glowColor);
      m.opacity = 0.35 + THREE.MathUtils.clamp((st.tb - 30) / 20, 0, 0.5);
    }
    if (tagRef.current && carRef.current) {
      tagRef.current.position.copy(carRef.current.position).setY(carRef.current.position.y + 2.6);
      tagRef.current.quaternion.copy(state.camera.quaternion);
    }

    const now = state.clock.elapsedTime;
    if (now - lastDraw.current > 0.25) {
      lastDraw.current = now;
      drawBoard(board.ctx, st, scenNow, scenario === "otomatis", amb);
      board.t.needsUpdate = true;
      const c = tag.ctx;
      c.clearRect(0, 0, 512, 128);
      c.fillStyle = "rgba(11,18,32,0.9)";
      c.beginPath();
      (c as any).roundRect?.(4, 4, 504, 120, 40) ?? c.rect(4, 4, 504, 120);
      c.fill();
      c.strokeStyle = tempCss(st.tb);
      c.lineWidth = 8;
      c.stroke();
      c.fillStyle = "#ffffff";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = "900 46px system-ui, sans-serif";
      c.fillText(`Baterai ${Math.round(st.tb)}°C · ${Math.round(st.v * 3.6)} km/j`, 256, 66, 480);
      tag.t.needsUpdate = true;
    }
  });

  const choose = (sc: Scenario) => {
    playVRClickSound();
    setScenario(sc);
    sim.current.autoT = 0;
    if (sc !== "otomatis") {
      setActive(sc);
      tried.current.add(sc);
      // OBE: tuntas bila keempat skenario dicoba
      recordActivity("sirkuit", (tried.current.size / 4) * 100);
    }
  };
  const P0 = useMemo(() => centerAt(0, { x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 }), []);

  return (
    <group ref={root} name="ThermalCircuit">
      {/* jalan, pembatas luar merah-putih, dinding dalam beton (juga dinding tanjakan & kolam) */}
      <mesh geometry={road} raycast={noRaycast}>
        <meshStandardMaterial map={roadTex} roughness={0.9} metalness={0} />
      </mesh>
      <mesh geometry={outer} raycast={noRaycast}>
        <meshStandardMaterial map={barrierTex} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={inner} raycast={noRaycast}>
        <meshStandardMaterial map={concreteTex} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* genangan air (uji kedap air) */}
      <mesh geometry={water} raycast={noRaycast} renderOrder={2}>
        <meshStandardMaterial map={rippleTex} color="#7dd3fc" transparent opacity={0.72} roughness={0.08} metalness={0.2} depthWrite={false} />
      </mesh>
      <points ref={splashRef} geometry={splashGeo} raycast={noRaycast}>
        <pointsMaterial color="#e0f2fe" size={0.13} transparent opacity={0.85} depthWrite={false} />
      </points>
      {/* lapangan dalam berumput (rata dengan pelataran) */}
      <mesh position={[OVAL.cx, BASE + 0.005, OVAL.cz]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[2 * (OVAL.hx - OVAL.r), 2 * (OVAL.r - OVAL.hw - 0.05)]} />
        <meshStandardMaterial map={grassTex} roughness={1} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[OVAL.cx + sd * (OVAL.hx - OVAL.r), BASE + 0.005, OVAL.cz]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <circleGeometry args={[OVAL.r - OVAL.hw - 0.05, 32, sd > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI]} />
          <meshStandardMaterial map={grassTex} roughness={1} />
        </mesh>
      ))}
      {/* garis start kotak-kotak */}
      {Array.from({ length: 12 }, (_, k) => (
        <mesh key={k} position={[P0.x + 4 + (k % 2) * 0.5, BASE + 0.03, P0.z - OVAL.hw + 0.5 + k]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[0.5, 1]} />
          <meshBasicMaterial color="#f8fafc" toneMapped={false} />
        </mesh>
      ))}
      {/* rambu rintangan di lapangan dalam, menghadap tribun */}
      <CircuitSign position={[OVAL.cx - OVAL.hx + OVAL.r + WATER.s0 + 9, BASE, OVAL.cz + OVAL.r - OVAL.hw - 1.6]} lines={["GENANGAN 27 cm", "Uji kedap air IP67"]} bg="#1d4ed8" />
      <CircuitSign position={[OVAL.cx + 2, BASE, OVAL.cz - OVAL.r + OVAL.hw + 2.2]} lines={["TANJAKAN 16 %", "Tinggi 1,6 m"]} bg="#b45309" />
      <CircuitSign position={[OVAL.cx - OVAL.hx + OVAL.r - 2, BASE, OVAL.cz]} lines={["JALAN GELOMBANG", "Uji suspensi & getaran"]} bg="#475569" />
      {/* menara lampu di empat sudut luar */}
      {[
        [OVAL.cx - OVAL.hx - 9, OVAL.cz + OVAL.r + 6],
        [OVAL.cx + OVAL.hx + 9, OVAL.cz + OVAL.r + 6],
        [OVAL.cx - OVAL.hx - 9, OVAL.cz - OVAL.r - 6],
        [OVAL.cx + OVAL.hx + 9, OVAL.cz - OVAL.r - 6],
      ].map(([x, z], k) => (
        <group key={k} position={[x, 0, z]}>
          <mesh position={[0, 6, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.14, 0.22, 12, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.35} />
          </mesh>
          <mesh position={[0, 12.2, 0]} raycast={noRaycast}>
            <boxGeometry args={[2.2, 0.8, 0.25]} />
            <meshStandardMaterial color="#e2e8f0" emissive="#fef9c3" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}

      {/* mobil uji: alas berpendar sesuai suhu baterai + label suhu */}
      <group ref={carRef}>
        {models[0] && <primitive object={models[0]} />}
        <mesh ref={glowRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[1.7, 3.6]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={tagRef} raycast={noRaycast} renderOrder={20}>
        <planeGeometry args={[3.0, 0.75]} />
        <meshBasicMaterial map={tag.t} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {TRAFFIC.map((name, k) => (
        <group
          key={k}
          visible={false}
          ref={(t) => {
            traffic.current[k] = t;
          }}
        >
          {models[k + 1] && <primitive object={models[k + 1]} />}
        </group>
      ))}

      {/* tribun penonton di sisi selatan */}
      <group position={[0, 0, -39.2]}>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} position={[0, 0.22 + k * 0.44, -0.9 + k * 0.62]} raycast={noRaycast}>
            <boxGeometry args={[24, 0.44 + k * 0.88, 0.62]} />
            <meshStandardMaterial color={k === 3 ? "#1e3a8a" : k % 2 ? "#cbd5e1" : "#94a3b8"} roughness={0.8} />
          </mesh>
        ))}
        {[0, 1, 2, 3].map((k) => (
          <mesh key={`seat${k}`} position={[0, 0.48 + k * 0.88, -0.95 + k * 0.62]} raycast={noRaycast}>
            <boxGeometry args={[23.6, 0.06, 0.32]} />
            <meshStandardMaterial color={["#2563eb", "#dc2626", "#16a34a", "#f59e0b"][k]} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* papan simulasi + tombol */}
      <group position={[24, 0, -42.1]}>
        {[-2.5, 2.5].map((x) => (
          <mesh key={x} position={[x, 1.6, -0.1]} raycast={noRaycast}>
            <cylinderGeometry args={[0.08, 0.1, 3.2, 14]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 3.25, -0.05]} raycast={noRaycast}>
          <boxGeometry args={[5.5, 3.2, 0.1]} />
          <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh position={[0, 3.25, 0.004]} raycast={noRaycast}>
          <planeGeometry args={[5.33, 3.0]} />
          <meshBasicMaterial map={board.t} toneMapped={false} />
        </mesh>
        <group position={[0, 1.15, 0.05]} scale={2}>
          {(
            [
              ["ngebut", "NGEBUT", "#dc2626"],
              ["tanjakan", "TANJAKAN", "#d97706"],
              ["genangan", "GENANGAN", "#1d4ed8"],
              ["macet", "MACET", "#0891b2"],
              ["otomatis", "OTOMATIS", "#475569"],
            ] as [Scenario, string, string][]
          ).map(([id, label, color], i) => (
            <Btn key={id} name={id} label={label} color={color} prefix="Sirkuit_btn_" active={scenario === id} position={[-1.18 + i * 0.47, 0, 0]} onPress={() => choose(id)} />
          ))}
          <Btn
            name="suhu"
            label={`UDARA ${amb}°C`}
            color="#7c3aed"
            prefix="Sirkuit_btn_"
            position={[1.18, 0, 0]}
            onPress={() => {
              playVRClickSound();
              setAmb((a) => (a === 30 ? 35 : a === 35 ? 20 : 30));
            }}
          />
        </group>
      </group>
    </group>
  );
}
