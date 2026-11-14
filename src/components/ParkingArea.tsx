import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { disableRaycast, fitModel, loadGlb, roundedRectShape, wrapText } from "../lib/glb";
import { modelUrl } from "../lib/quality";
import { playVRClickSound } from "../lib/vrAudio";
import { InfoSign, Scenery, StaticModel } from "./LabStations";

/**
 * Area parkir & SPBU di sisi barat, di luar lintasan uji.
 *
 *  - Jalan lingkar tempat sepasang mobil (BENSIN dan LISTRIK) berjalan dengan meteran jarak,
 *    biaya, dan emisi di atasnya. Tiap dua putaran pasangan itu pulang ke petak parkir dan
 *    pasangan yang parkir berangkat menggantikan. Semua roda berputar sesuai jarak tempuh.
 *  - Papan besar "Boros mana?" yang membandingkan keduanya secara langsung.
 *  - SPBU (pengisian bensin) berukuran nyata, petak parkir, dan mobil yang diparkir.
 *
 * Angka biaya adalah PERKIRAAN untuk bahan ajar (lihat ASSUMPTIONS); 1 m di lintasan dihitung
 * sebagai 1 km perjalanan supaya isi tangki / baterai terlihat berkurang dalam satu giliran.
 *  - Mobil bensin (tangki 40 L) mampir ke SPBU sebelum parkir: isi cepat, tetapi mahal.
 *  - Mobil listrik (baterai 50 kWh) parkir di petak bertiang cas: mengisi lebih lama, lebih irit.
 */

const noRaycast = () => null;

/** Pusat area (X, Z) dan ukuran jalan lingkar (garis tengah): setengah lebar, setengah panjang, jari-jari sudut. */
export const PARKING = { cx: -47.5, cz: 5, hx: 14, hz: 15, r: 6, road: 5 };
const GROUND_W = PARKING.hx * 2 + PARKING.road; // 27 m (X)
const GROUND_D = PARKING.hz * 2 + PARKING.road; // 29 m (Z)
const X0 = PARKING.cx - GROUND_W / 2;
const Z0 = PARKING.cz - GROUND_D / 2;

const ASSUMPTIONS = {
  scale: 1000, // 1 m di lintasan = 1 km perjalanan
  bensin: { lPer100: 8, rpPerL: 10000, co2PerL: 2.3, tank: 40 },
  listrik: { kwhPer100: 15, rpPerKwh: 2466, battery: 50, chargeKw: 7 },
};
const RP_KM_BENSIN = (ASSUMPTIONS.bensin.lPer100 / 100) * ASSUMPTIONS.bensin.rpPerL; // Rp 800 / km
const RP_KM_LISTRIK = (ASSUMPTIONS.listrik.kwhPer100 / 100) * ASSUMPTIONS.listrik.rpPerKwh; // ± Rp 370 / km
const CO2_KM_BENSIN = (ASSUMPTIONS.bensin.lPer100 / 100) * ASSUMPTIONS.bensin.co2PerL; // kg / km

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Petak parkir: pusat X tiap petak (mobil menghadap utara / -Z). */
const BAY_Z = 13.2;
const BAY_W = 2.8;
const BAYS: { x: number; kind: "bensin" | "listrik" }[] = [
  { x: -51.7, kind: "bensin" },
  { x: -48.9, kind: "bensin" },
  { x: -46.1, kind: "listrik" },
  { x: -43.3, kind: "listrik" },
];

/** SPBU: ukuran nyata (kanopi ±13 m), memanjang di sumbu X. */
const STATION = { x: -47.5, z: -1.5, size: 13 };
const BOARD = { x: -58.8, z: 10.5 };

/** Kotak yang tidak bisa ditembus pemain (dipakai SOLIDS di TestLabEnvironment). SPBU sengaja
 *  tidak dimasukkan supaya pemain bisa berjalan ke bawah kanopi dan melihat pompa dari dekat. */
export const PARKING_SOLIDS = [
  // papan perbandingan
  { minX: BOARD.x - 0.4, maxX: BOARD.x + 0.4, minZ: BOARD.z - 3.3, maxZ: BOARD.z + 3.3 },
];

/* ---------------- lintasan lingkar ---------------- */

function buildLoop() {
  const { cx, cz, hx, hz, r } = PARKING;
  const pts: THREE.Vector3[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n));
  };
  const arc = (ax: number, az: number, a0: number, a1: number) => {
    const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.4);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector3(ax + Math.cos(a) * r, 0, az + Math.sin(a) * r));
    }
  };
  line(cx + hx - r, cz + hz, cx - hx + r, cz + hz);
  arc(cx - hx + r, cz + hz - r, Math.PI / 2, Math.PI);
  line(cx - hx, cz + hz - r, cx - hx, cz - hz + r);
  arc(cx - hx + r, cz - hz + r, Math.PI, Math.PI * 1.5);
  line(cx - hx + r, cz - hz, cx + hx - r, cz - hz);
  arc(cx + hx - r, cz - hz + r, -Math.PI / 2, 0);
  line(cx + hx, cz - hz + r, cx + hx, cz + hz - r);
  arc(cx + hx - r, cz + hz - r, 0, Math.PI / 2);
  const dist = [0];
  for (let i = 1; i <= pts.length; i++) dist.push(dist[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]));
  return { pts, dist, length: dist[pts.length] };
}

type LoopPath = ReturnType<typeof buildLoop>;

function samplePath(path: LoopPath, s: number, outPos: THREE.Vector3): number {
  const L = path.length;
  s = ((s % L) + L) % L;
  let lo = 0;
  let hi = path.pts.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.dist[mid] <= s) lo = mid;
    else hi = mid;
  }
  const a = path.pts[lo];
  const b = path.pts[(lo + 1) % path.pts.length];
  const seg = path.dist[lo + 1] - path.dist[lo] || 1;
  const t = (s - path.dist[lo]) / seg;
  outPos.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
  return Math.atan2(b.x - a.x, b.z - a.z); // arah hadap (rotasi Y agar +Z lokal searah gerak)
}

/* ---------------- tanah: aspal, jalan, petak parkir (satu tekstur) ---------------- */

function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const ppm = W / GROUND_W;
  const X = (x: number) => (x - X0) * ppm;
  const Z = (z: number) => (z - Z0) * ppm;
  ctx.fillStyle = "#2f3136";
  ctx.fillRect(0, 0, W, H);
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16000; i++) {
    const v = 36 + Math.floor(rnd() * 50);
    ctx.fillStyle = `rgba(${v},${v},${v + 5},0.55)`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }

  // jalan lingkar: pita lebih gelap + garis tepi putih + garis tengah putus-putus kuning
  const { cx, cz, hx, hz, r, road } = PARKING;
  const ring = (inset: number) => {
    const rr = Math.max(0.1, r - inset);
    ctx.beginPath();
    (ctx as any).roundRect(X(cx - hx + inset), Z(cz - hz + inset), (hx - inset) * 2 * ppm, (hz - inset) * 2 * ppm, rr * ppm);
  };
  ctx.lineJoin = "round";
  ring(0);
  ctx.strokeStyle = "#232529";
  ctx.lineWidth = road * ppm;
  ctx.stroke();
  for (const inset of [-road / 2 + 0.15, road / 2 - 0.15]) {
    ring(inset);
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 0.12 * ppm;
    ctx.stroke();
  }
  ring(0);
  ctx.setLineDash([1.6 * ppm, 1.6 * ppm]);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 0.12 * ppm;
  ctx.stroke();
  ctx.setLineDash([]);

  // petak parkir
  for (const bay of BAYS) {
    const x = X(bay.x - BAY_W / 2);
    const z = Z(BAY_Z - 2.3);
    if (bay.kind === "listrik") {
      ctx.fillStyle = "rgba(21,128,61,0.55)";
      ctx.fillRect(x, z, BAY_W * ppm, 4.6 * ppm);
    }
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 0.1 * ppm;
    ctx.strokeRect(x, z, BAY_W * ppm, 4.6 * ppm);
    ctx.save();
    ctx.translate(X(bay.x), Z(BAY_Z + 1.75));
    ctx.fillStyle = bay.kind === "listrik" ? "#bbf7d0" : "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${0.46 * ppm}px system-ui, sans-serif`;
    ctx.fillText(bay.kind === "listrik" ? "LISTRIK" : "BENSIN", 0, 0);
    ctx.restore();
  }
  // huruf P
  ctx.fillStyle = "#1d4ed8";
  ctx.fillRect(X(-40.6), Z(10.9), 1.4 * ppm, 1.4 * ppm);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${1.1 * ppm}px system-ui, sans-serif`;
  ctx.fillText("P", X(-39.9), Z(11.65));

  // lantai SPBU: beton terang + garis kuning
  ctx.fillStyle = "#6b7280";
  const sw = STATION.size + 1.2;
  const sd = STATION.size * 0.87 + 0.6;
  ctx.fillRect(X(STATION.x - sw / 2), Z(STATION.z - sd / 2), sw * ppm, sd * ppm);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 0.14 * ppm;
  ctx.strokeRect(X(STATION.x - sw / 2), Z(STATION.z - sd / 2), sw * ppm, sd * ppm);
}

/* ---------------- label meteran di atas mobil ---------------- */

type Meter = { title: string; color: string; lines: string[]; gauge?: { frac: number; label: string; color: string } };

function drawMeter(canvas: HTMLCanvasElement, m: Meter) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(11,18,32,0.9)";
  ctx.beginPath();
  (ctx as any).roundRect(4, 4, W - 8, H - 8, 26);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = m.color;
  ctx.stroke();
  ctx.textBaseline = "top";
  ctx.fillStyle = m.color;
  ctx.font = "900 46px system-ui, sans-serif";
  ctx.fillText(m.title, 28, 22);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 40px system-ui, sans-serif";
  m.lines.forEach((l, i) => ctx.fillText(l, 28, 84 + i * 50, W - 56));
  if (m.gauge) {
    const y = 84 + m.lines.length * 50 + 8;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(28, y, W - 56, 44);
    ctx.fillStyle = m.gauge.frac < 0.2 ? "#ef4444" : m.gauge.color;
    ctx.fillRect(28, y, (W - 56) * Math.max(0, Math.min(1, m.gauge.frac)), 44);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 32px system-ui, sans-serif";
    ctx.fillText(m.gauge.label, 40, y + 6, W - 80);
  }
}

/* ---------------- layar pompa / tiang cas ---------------- */

function drawScreen(canvas: HTMLCanvasElement, d: { title: string; color: string; big: string; sub: string; foot: string }) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillStyle = d.color;
  ctx.font = "900 38px system-ui, sans-serif";
  ctx.fillText(d.title, W / 2, 18, W - 40);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.fillText(d.big, W / 2, 64, W - 40);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText(d.sub, W / 2, 150, W - 30);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText(d.foot, W / 2, 196, W - 30);
  ctx.textAlign = "left";
}

/* ---------------- papan perbandingan ---------------- */

function drawBoard(canvas: HTMLCanvasElement, km: number) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1220");
  g.addColorStop(1, "#13233f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#facc15";
  ctx.font = "900 64px system-ui, sans-serif";
  ctx.fillText("BOROS MANA?  BENSIN vs LISTRIK", 44, 30);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 38px system-ui, sans-serif";
  ctx.fillText(`Kedua mobil sudah menempuh ${km.toFixed(1).replace(".", ",")} km`, 44, 108);

  const costB = km * RP_KM_BENSIN;
  const costL = km * RP_KM_LISTRIK;
  const maxBar = W - 88;
  const rows: [string, string, number, string, string][] = [
    ["MOBIL BENSIN", "#f97316", 1, rupiah(costB), `${((km * ASSUMPTIONS.bensin.lPer100) / 100).toFixed(1).replace(".", ",")} liter  ·  ${(km * CO2_KM_BENSIN).toFixed(1).replace(".", ",")} kg CO₂ dari knalpot`],
    ["MOBIL LISTRIK", "#22c55e", RP_KM_LISTRIK / RP_KM_BENSIN, rupiah(costL), `${((km * ASSUMPTIONS.listrik.kwhPer100) / 100).toFixed(1).replace(".", ",")} kWh  ·  0 kg CO₂ dari knalpot`],
  ];
  rows.forEach(([name, color, frac, cost, detail], i) => {
    const y = 180 + i * 178;
    ctx.fillStyle = color;
    ctx.font = "900 44px system-ui, sans-serif";
    ctx.fillText(name, 44, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 56px system-ui, sans-serif";
    ctx.fillText(cost, W - 44, y - 8);
    ctx.textAlign = "left";
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(44, y + 62, maxBar, 40);
    ctx.fillStyle = color;
    ctx.fillRect(44, y + 62, Math.max(6, maxBar * frac), 40);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText(detail, 44, y + 112);
  });

  ctx.fillStyle = "#4ade80";
  ctx.font = "900 46px system-ui, sans-serif";
  ctx.fillText(`Hemat ${rupiah(costB - costL)}  (±${Math.round((1 - RP_KM_LISTRIK / RP_KM_BENSIN) * 100)}% lebih murah)`, 44, 548);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 26px system-ui, sans-serif";
  const B = ASSUMPTIONS.bensin;
  const E = ASSUMPTIONS.listrik;
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText(`Isi penuh: bensin ${B.tank} L = ${rupiah(B.tank * B.rpPerL)} (±5 menit, jarak ±${Math.round((B.tank / B.lPer100) * 100)} km)`, 44, 610, W - 88);
  ctx.fillText(`listrik ${E.battery} kWh = ${rupiah(E.battery * E.rpPerKwh)} (AC ${E.chargeKw} kW ±${Math.round(E.battery / E.chargeKw)} jam, jarak ±${Math.round((E.battery / E.kwhPer100) * 100)} km)`, 44, 646, W - 88);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText(`Perkiraan: ${B.lPer100} L/100 km × Rp ${B.rpPerL.toLocaleString("id-ID")}/L · ${E.kwhPer100} kWh/100 km × Rp ${E.rpPerKwh.toLocaleString("id-ID")}/kWh · emisi pembangkit tidak dihitung.`, 44, 684, W - 88);
}

const resetGeometry = new THREE.ExtrudeGeometry(roundedRectShape(1.5, 0.42, 0.1), {
  depth: 0.05,
  bevelEnabled: true,
  bevelThickness: 0.012,
  bevelSize: 0.012,
  bevelSegments: 2,
  curveSegments: 6,
});

/* ---------------- komponen utama ---------------- */

/**
 * Armada: dua pasang (bensin + listrik). Satu pasang berjalan di jalan lingkar, pasangan lain
 * parkir; tiap beberapa putaran mereka bergantian. `noseMinusX` = hidung model menghadap -X.
 */
type CarDef = { model: string; kind: "bensin" | "listrik"; bay: number; noseMinusX: boolean; pair: 0 | 1 };
const FLEET: CarDef[] = [
  { model: "klasik-roda", kind: "bensin", bay: 0, noseMinusX: true, pair: 0 },
  { model: "mpv-roda", kind: "listrik", bay: 2, noseMinusX: true, pair: 0 },
  { model: "suv-roda", kind: "bensin", bay: 1, noseMinusX: true, pair: 1 },
  { model: "mobil", kind: "listrik", bay: 3, noseMinusX: true, pair: 1 },
];
const SPEED = 5.2; // m/s di jalan lingkar
const PARK_SPEED = 2.6; // m/s saat keluar / masuk petak
const LAPS_PER_TURN = 2;

type Curve = { pts: THREE.Vector3[]; dist: number[]; length: number };

function polyline(points: [number, number][]): Curve {
  const pts = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, dist, length: dist[dist.length - 1] };
}

function bezier(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], n = 24): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

function sampleCurve(curve: Curve, s: number, outPos: THREE.Vector3): number {
  s = Math.min(Math.max(s, 0), curve.length);
  let lo = 0;
  while (lo < curve.pts.length - 2 && curve.dist[lo + 1] < s) lo++;
  const a = curve.pts[lo];
  const b = curve.pts[lo + 1];
  const t = (s - curve.dist[lo]) / (curve.dist[lo + 1] - curve.dist[lo] || 1);
  outPos.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

const SOUTH_Z = PARKING.cz + PARKING.hz; // lurusan selatan (mobil melaju ke barat)
const EAST_X = PARKING.cx + PARKING.hx; // lurusan timur (mobil melaju ke selatan)
const JOIN_Z = 11;

/** Dari lurusan selatan belok kanan masuk petak, berhenti menghadap utara. */
function enterCurve(bayX: number): Curve {
  return polyline(bezier([bayX + 5, SOUTH_Z], [bayX + 1.6, SOUTH_Z], [bayX, SOUTH_Z - 2], [bayX, BAY_Z]));
}

/** Keluar petak ke utara, belok ke timur melintasi pelataran, lalu belok kanan ke lurusan timur. */
function exitCurve(bayX: number): Curve {
  return polyline([
    [bayX, BAY_Z],
    ...bezier([bayX, 9.8], [bayX, 6.9], [bayX + 2.4, 6.3], [-38.8, 6.3]).slice(0),
    ...bezier([-38.8, 6.3], [-35.2, 6.3], [EAST_X, 7.2], [EAST_X, JOIN_Z]).slice(1),
  ]);
}

/** Lajur SPBU di antara dua pulau pompa (lihat model spbu). Masuk dari lurusan utara (mobil
 *  melaju ke timur), berhenti di pompa, keluar ke pelataran, lalu bergabung di lurusan timur. */
const SPBU_LANE_X = -45.1;
const SPBU_PUMP_Z = -0.6;
const NORTH_Z = PARKING.cz - PARKING.hz;
function spbuCurve(): Curve {
  return polyline([
    ...bezier([-52, NORTH_Z], [-47.6, NORTH_Z], [SPBU_LANE_X, NORTH_Z + 2], [SPBU_LANE_X, -5.5]),
    ...bezier([SPBU_LANE_X, -5.5], [SPBU_LANE_X, -1.0], [SPBU_LANE_X, 1.5], [SPBU_LANE_X, 3.4]).slice(1),
    ...bezier([SPBU_LANE_X, 3.4], [SPBU_LANE_X, 5.9], [-43, 6.3], [-38.8, 6.3]).slice(1),
    ...bezier([-38.8, 6.3], [-35.2, 6.3], [EAST_X, 7.2], [EAST_X, JOIN_Z]).slice(1),
  ]);
}
/** Tiang cas di sisi kanan tiap petak mobil listrik (dilihat dari belakang mobil). */
const CHARGERS = BAYS.map((b, i) => ({ bay: i, x: b.x + BAY_W / 2, z: BAY_Z - 2.0 })).filter((c) => BAYS[c.bay].kind === "listrik");

/** Jarak di sepanjang jalan lingkar untuk sebuah titik pada lurusan selatan / timur. */
function loopS(path: LoopPath, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.pts.length; i++) {
    const d = (path.pts[i].x - x) ** 2 + (path.pts[i].z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return path.dist[best];
}

type CarState = {
  mode: "parked" | "exiting" | "loop" | "entering" | "spbu";
  s: number; // jarak pada kurva yang sedang diikuti
  driven: number; // total jarak tempuh (untuk putaran roda)
  wantPark: boolean;
  refueled: boolean; // mobil bensin sudah mampir SPBU pada giliran ini
  fill: number; // detik berhenti di pompa (>0 = sedang mengisi)
};

export function ParkingArea({ hall }: { hall: { x0: number; x1: number; z0: number; z1: number } }) {
  const root = useRef<THREE.Group>(null);
  const path = useMemo(buildLoop, []);
  const curves = useMemo(
    () =>
      FLEET.map((car) => {
        const x = BAYS[car.bay].x;
        return { enter: enterCurve(x), exit: exitCurve(x), sEnter: loopS(path, x + 5, SOUTH_Z), sJoin: loopS(path, EAST_X, JOIN_Z) };
      }),
    [path],
  );
  const carRefs = useRef<(THREE.Group | null)[]>([]);
  const labelRefs = useRef<(THREE.Mesh | null)[]>([]);
  const wheelRefs = useRef<{ node: THREE.Object3D; radius: number }[][]>(FLEET.map(() => []));
  const [carObjects, setCarObjects] = useState<(THREE.Object3D | null)[]>(FLEET.map(() => null));
  // pasangan 0 mulai di jalan (berseberangan), pasangan 1 mulai parkir
  const states = useRef<CarState[]>(
    FLEET.map((car, i) => ({
      mode: car.pair === 0 ? "loop" : "parked",
      s: car.pair === 0 ? (i === 0 ? 0 : 0.5) * path.length : 0,
      driven: 0,
      wantPark: false,
      refueled: false,
      fill: 0,
    })),
  );
  // isi tangki (L) / baterai (kWh) tiap mobil
  const energy = useRef<number[]>(FLEET.map((c) => (c.kind === "bensin" ? ASSUMPTIONS.bensin.tank : ASSUMPTIONS.listrik.battery)));
  const lastFill = useRef<{ bensin: { amt: number; active: boolean }; listrik: { amt: number; active: boolean }[] }>({ bensin: { amt: 0, active: false }, listrik: CHARGERS.map(() => ({ amt: 0, active: false })) });
  const spbu = useMemo(() => ({ curve: spbuCurve(), sIn: loopS(path, -52, NORTH_Z), sJoin: loopS(path, EAST_X, JOIN_Z) }), [path]);
  const spbuPumpS = useMemo(() => {
    let best = 0;
    spbu.curve.pts.forEach((p, i) => {
      if (Math.abs(p.z - SPBU_PUMP_Z) + Math.abs(p.x - SPBU_LANE_X) < Math.abs(spbu.curve.pts[best].z - SPBU_PUMP_Z) + Math.abs(spbu.curve.pts[best].x - SPBU_LANE_X)) best = i;
    });
    return spbu.curve.dist[best];
  }, [spbu]);
  const cableRefs = useRef<(THREE.Mesh | null)[]>([]);
  const fleet = useRef({ active: 0 as 0 | 1, phase: "drive" as "drive" | "return" | "depart", phaseDist: 0, departTimer: 0 });
  const travelled = useRef(0); // meter di lintasan
  if (import.meta.env.DEV) (window as any).__parking = { states: states.current, energy: energy.current, lastFill: lastFill.current, fleet: fleet.current };
  const lastDraw = useRef(-1);
  const [hotReset, setHotReset] = useState(false);

  const ground = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.round((1024 * GROUND_D) / GROUND_W);
    drawGround(c.getContext("2d")!, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);

  const meters = useMemo(
    () =>
      // satu meteran per jenis: [bensin, listrik]
      [0, 1].map(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 250;
        canvas.getContext("2d", { willReadFrequently: true }); // kanvas biasa: lihat SolarPower.tsx
        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        return { canvas, texture };
      }),
    [],
  );
  const screens = useMemo(
    () =>
      // [0] layar pompa SPBU, [1..] layar tiang cas
      [0, ...CHARGERS.map((_, k) => k + 1)].map(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 256;
        canvas.getContext("2d", { willReadFrequently: true });
        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        return { canvas, texture };
      }),
    [],
  );
  useEffect(() => () => screens.forEach((x) => x.texture.dispose()), [screens]);
  const board = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    canvas.getContext("2d", { willReadFrequently: true }); // kanvas biasa: lihat SolarPower.tsx
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return { canvas, texture };
  }, []);

  useEffect(
    () => () => {
      ground.dispose();
      board.texture.dispose();
      meters.forEach((m) => m.texture.dispose());
    },
    [ground, board, meters],
  );

  useEffect(() => {
    let cancelled = false;
    FLEET.forEach((car, i) => {
      loadGlb(modelUrl(car.model))
        .then((shared) => {
          if (cancelled) return;
          const model = shared.clone();
          // Model memanjang di sumbu X; putar agar hidung mobil searah +Z lokal (arah gerak)
          const holder = new THREE.Group();
          model.rotation.y = car.noseMinusX ? Math.PI / 2 : -Math.PI / 2;
          holder.add(model);
          const scale = fitModel(holder, 4.5);
          disableRaycast(holder);
          const wheels: { node: THREE.Object3D; radius: number }[] = [];
          holder.traverse((o) => {
            if (o.name.startsWith("wheel_") && !o.parent?.name.startsWith("wheel_")) {
              wheels.push({ node: o, radius: ((o.userData.radius as number) || 0.15) * scale });
              const m = o as THREE.Mesh;
              // dua sisi: sisi dalam roda hasil potongan tidak tampak bolong saat berputar
              if (m.isMesh) {
                m.material = (m.material as THREE.Material).clone();
                (m.material as THREE.Material).side = THREE.DoubleSide;
              }
              // cakram gelap menutup sisi dalam roda
              const rr = (o.userData.radius as number) || 0.15;
              const back = new THREE.Mesh(new THREE.CircleGeometry(rr * 0.9, 28), new THREE.MeshBasicMaterial({ color: 0x0b0d12, side: THREE.DoubleSide }));
              back.position.z = (o.name.endsWith("L") ? -1 : 1) * ((o.userData.inner as number) || 0.29);
              back.raycast = () => {};
              o.add(back);
            }
          });
          wheelRefs.current[i] = wheels;
          setCarObjects((prev) => {
            const next = [...prev];
            next[i] = holder;
            return next;
          });
        })
        .catch((err) => console.warn(`[ParkingArea] Model ${car.model} gagal dimuat:`, err));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Mobil bensin / listrik yang sedang di jalan (untuk meteran). */
  const onRoad = (kind: "bensin" | "listrik") => {
    const i = FLEET.findIndex((c, k) => c.kind === kind && c.pair === fleet.current.active && states.current[k].mode !== "parked");
    return i < 0 ? FLEET.findIndex((c) => c.kind === kind && c.pair === fleet.current.active) : i;
  };
  const redraw = () => {
    const km = (travelled.current * ASSUMPTIONS.scale) / 1000;
    const B = ASSUMPTIONS.bensin;
    const E = ASSUMPTIONS.listrik;
    const ib = onRoad("bensin");
    const il = onRoad("listrik");
    const fuel = energy.current[ib];
    const kwh = energy.current[il];
    const pumping = states.current[ib].fill > 0;
    drawMeter(meters[0].canvas, {
      title: pumping ? "MOBIL BENSIN · ISI DI SPBU" : "MOBIL BENSIN",
      color: "#f97316",
      lines: [`${km.toFixed(0)} km  ·  ${rupiah(km * RP_KM_BENSIN)}`, `${(km * CO2_KM_BENSIN).toFixed(0)} kg CO₂ knalpot`],
      gauge: { frac: fuel / B.tank, label: `Tangki ${fuel.toFixed(1).replace(".", ",")} / ${B.tank} L  ·  sisa ±${Math.round((fuel / B.lPer100) * 100)} km`, color: "#f97316" },
    });
    drawMeter(meters[1].canvas, {
      title: "MOBIL LISTRIK",
      color: "#22c55e",
      lines: [`${km.toFixed(0)} km  ·  ${rupiah(km * RP_KM_LISTRIK)}`, "0 kg CO₂ knalpot"],
      gauge: { frac: kwh / E.battery, label: `Baterai ${kwh.toFixed(1).replace(".", ",")} / ${E.battery} kWh  ·  sisa ±${Math.round((kwh / E.kwhPer100) * 100)} km`, color: "#22c55e" },
    });
    drawBoard(board.canvas, km);
    // layar pompa SPBU
    const lf = lastFill.current;
    drawScreen(screens[0].canvas, {
      title: lf.bensin.active ? "MENGISI BENSIN" : "POMPA BENSIN",
      color: "#f97316",
      big: `${lf.bensin.amt.toFixed(1).replace(".", ",")} L`,
      sub: `${rupiah(lf.bensin.amt * B.rpPerL)}  ·  Rp ${B.rpPerL.toLocaleString("id-ID")}/L`,
      foot: `Cepat: ±${Math.max(1, Math.round((lf.bensin.amt / 40) * 5))} menit`,
    });
    CHARGERS.forEach((c, k) => {
      const car = FLEET.findIndex((f) => f.bay === c.bay);
      const e = energy.current[car];
      const x = lf.listrik[k];
      drawScreen(screens[k + 1].canvas, {
        title: x.active ? `MENGISI ${Math.round((e / E.battery) * 100)}%` : e >= E.battery - 0.05 ? "PENUH" : "SIAP",
        color: "#22c55e",
        big: `+${x.amt.toFixed(1).replace(".", ",")} kWh`,
        sub: `${rupiah(x.amt * E.rpPerKwh)}  ·  Rp ${E.rpPerKwh.toLocaleString("id-ID")}/kWh`,
        foot: `Lama: AC ${E.chargeKw} kW ±${(x.amt / E.chargeKw).toFixed(1).replace(".", ",")} jam`,
      });
    });
    screens.forEach((x) => (x.texture.needsUpdate = true));
    meters[0].texture.needsUpdate = true;
    meters[1].texture.needsUpdate = true;
    board.texture.needsUpdate = true;
  };

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDelta) => {
    const group = root.current;
    if (!group) return;
    // Dari dalam gedung area ini tertutup tembok: tidak perlu digambar
    // (saat pengembangan, kamera uji tangkapan layar dipakai bila ada)
    const cam: THREE.Camera = (import.meta.env.DEV && (window as any).__shotCam) || state.camera;
    cam.getWorldPosition(camPos);
    const inside = camPos.x > hall.x0 && camPos.x < hall.x1 && camPos.z > hall.z0 && camPos.z < hall.z1;
    group.visible = !inside;
    if (inside) return;

    const delta = Math.min(rawDelta, 0.05);
    // (saat pengembangan, window.__timeScale mempercepat simulasi untuk pengujian)
    const reps = import.meta.env.DEV ? Math.max(1, Math.round((window as any).__timeScale || 1)) : 1;
    for (let rep = 0; rep < reps; rep++) {
    const f = fleet.current;
    const L = path.length;

    // ---- giliran: pasangan aktif berjalan beberapa putaran, pulang parkir, lalu pasangan lain berangkat ----
    if (f.phase === "drive") {
      f.phaseDist += delta * SPEED;
      travelled.current += delta * SPEED; // meteran hanya menghitung saat kedua mobil sama-sama melaju
      if (f.phaseDist >= LAPS_PER_TURN * L) {
        f.phase = "return";
        FLEET.forEach((car, i) => {
          if (car.pair === f.active) states.current[i].wantPark = true;
        });
      }
    } else if (f.phase === "return") {
      if (FLEET.every((car, i) => car.pair !== f.active || states.current[i].mode === "parked")) {
        f.active = f.active === 0 ? 1 : 0;
        f.phase = "depart";
        f.departTimer = 0;
      }
    } else {
      // berangkat satu per satu dengan jeda supaya tidak beriringan terlalu rapat
      f.departTimer += delta;
      let k = 0;
      FLEET.forEach((car, i) => {
        if (car.pair !== f.active) return;
        const st = states.current[i];
        if (st.mode === "parked" && f.departTimer > k * 9) {
          st.mode = "exiting";
          st.s = 0;
        }
        k++;
      });
      if (FLEET.every((car, i) => car.pair !== f.active || states.current[i].mode === "loop")) {
        f.phase = "drive";
        f.phaseDist = 0;
      }
    }

    FLEET.forEach((car, i) => {
      const g = carRefs.current[i];
      if (!g) return;
      const st = states.current[i];
      const c = curves[i];
      let heading = 0;
      let step = 0;
      if (st.mode === "loop") {
        step = delta * SPEED;
        const before = ((st.s % L) + L) % L;
        st.s += step;
        const after = ((st.s % L) + L) % L;
        // saatnya pulang: begitu melewati titik belok ke petaknya, pindah ke jalur masuk.
        // Mobil bensin lebih dulu mampir ke SPBU.
        const cross = (sx: number) => (before <= sx ? after >= sx && after - before < L / 2 : after >= sx && after < before);
        if (st.wantPark && car.kind === "bensin" && !st.refueled && cross(spbu.sIn)) {
          st.mode = "spbu";
          st.s = 0;
        } else if (st.wantPark && (car.kind === "listrik" || st.refueled) && cross(c.sEnter)) {
          st.mode = "entering";
          st.s = 0;
          st.wantPark = false;
          st.refueled = false;
        }
        heading = samplePath(path, st.s, tmp);
        if (st.mode === "entering") heading = sampleCurve(c.enter, 0, tmp);
        if (st.mode === "spbu") heading = sampleCurve(spbu.curve, 0, tmp);
      } else if (st.mode === "spbu") {
        const B = ASSUMPTIONS.bensin;
        const lf = lastFill.current.bensin;
        if (st.fill > 0) {
          // berhenti di pompa: bensin mengalir cepat (±4,5 L per detik di simulasi)
          const add = Math.min(B.tank - energy.current[i], 4.5 * delta);
          energy.current[i] += add;
          lf.amt += add;
          st.fill += delta;
          if (energy.current[i] >= B.tank - 0.01 && st.fill > 2.5) {
            st.fill = 0;
            lf.active = false;
            st.s += 0.3;
          }
        } else {
          const toPump = spbuPumpS - st.s;
          const v = st.s < spbuPumpS ? Math.max(0.6, Math.min(SPEED, PARK_SPEED + Math.max(0, toPump) * 0.35)) : Math.min(SPEED, 1.2 + (st.s - spbuPumpS) * 0.45);
          step = delta * v;
          if (st.s < spbuPumpS && st.s + step >= spbuPumpS) {
            step = spbuPumpS - st.s;
            st.fill = 0.001;
            lf.amt = 0;
            lf.active = true;
          }
          st.s += step;
        }
        heading = sampleCurve(spbu.curve, st.s, tmp);
        if (st.s >= spbu.curve.length) {
          st.mode = "loop";
          st.s = spbu.sJoin;
          st.refueled = true;
        }
      } else if (st.mode === "entering") {
        // melambat halus menjelang berhenti
        const left = c.enter.length - st.s;
        step = delta * Math.max(0.5, Math.min(SPEED, PARK_SPEED + left * 0.25)) * (left < 0.05 ? 0 : 1);
        st.s += step;
        heading = sampleCurve(c.enter, st.s, tmp);
        if (st.s >= c.enter.length - 0.05) {
          st.mode = "parked";
          st.s = 0;
        }
      } else if (st.mode === "exiting") {
        step = delta * Math.min(SPEED, 1.2 + st.s * 0.45);
        st.s += step;
        heading = sampleCurve(c.exit, st.s, tmp);
        if (st.s >= c.exit.length) {
          st.mode = "loop";
          st.s = c.sJoin;
        }
      } else {
        tmp.set(BAYS[car.bay].x, 0, BAY_Z);
        heading = Math.PI; // menghadap utara (-Z)
      }
      g.position.copy(tmp);
      g.rotation.y = heading;

      // konsumsi energi sesuai jarak (1 m lintasan = 1 km)
      if (step > 0) {
        const km = (step * ASSUMPTIONS.scale) / 1000;
        const per = car.kind === "bensin" ? ASSUMPTIONS.bensin.lPer100 / 100 : ASSUMPTIONS.listrik.kwhPer100 / 100;
        const cap = car.kind === "bensin" ? ASSUMPTIONS.bensin.tank : ASSUMPTIONS.listrik.battery;
        energy.current[i] = Math.max(cap * 0.05, energy.current[i] - km * per);
      }
      // mobil listrik yang parkir di petak bertiang cas: mengisi pelan (±0,5 kWh per detik di simulasi)
      const ci = CHARGERS.findIndex((x) => x.bay === car.bay);
      if (ci >= 0) {
        const x = lastFill.current.listrik[ci];
        const charging = st.mode === "parked" && energy.current[i] < ASSUMPTIONS.listrik.battery - 0.01;
        if (charging) {
          if (!x.active) x.amt = 0;
          const add = Math.min(ASSUMPTIONS.listrik.battery - energy.current[i], 0.5 * delta);
          energy.current[i] += add;
          x.amt += add;
        }
        x.active = charging;
        const cb = cableRefs.current[ci];
        if (cb) cb.visible = st.mode === "parked";
      }

      // roda menggelinding sesuai jarak tempuh
      if (step > 0) {
        const sign = car.noseMinusX ? 1 : -1;
        for (const w of wheelRefs.current[i]) w.node.rotation.z += (sign * step) / w.radius;
      }

      // meteran mengikuti mobil yang sedang berada di jalan, per jenis
      if (st.mode !== "parked") {
        const label = labelRefs.current[car.kind === "bensin" ? 0 : 1];
        if (label) {
          label.visible = true;
          label.position.set(tmp.x, 3.1, tmp.z);
          label.rotation.y = Math.atan2(camPos.x - tmp.x, camPos.z - tmp.z);
        }
      }
    });
    }
    // Meteran & papan digambar ulang ±2 kali per detik (bukan tiap frame)
    if (state.clock.elapsedTime - lastDraw.current > 0.5) {
      lastDraw.current = state.clock.elapsedTime;
      redraw();
    }
  });

  const reset = (e?: any) => {
    e?.stopPropagation?.();
    playVRClickSound();
    travelled.current = 0;
    redraw();
  };

  const junction = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 320;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#2a2c30";
    ctx.fillRect(0, 0, 256, 320);
    let seed = 23;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5200; i++) {
      const v = 34 + Math.floor(rnd() * 44);
      ctx.fillStyle = `rgba(${v},${v},${v + 4},0.6)`;
      ctx.fillRect(rnd() * 256, rnd() * 320, 1.6, 1.6);
    }
    // garis tepi di dua sisi simpang, melengkung keluar di kedua ujung (mulut simpang melebar)
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    for (const y of [16, 304]) {
      const out = y < 160 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(4, y + out * 14);
      ctx.quadraticCurveTo(22, y, 46, y);
      ctx.lineTo(210, y);
      ctx.quadraticCurveTo(234, y, 252, y + out * 14);
      ctx.stroke();
    }
    // garis henti sebelum masuk lintasan uji
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(196, 168, 10, 122);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => junction.dispose(), [junction]);

  return (
    <group ref={root} name="ParkingArea">
      {/* tanah beraspal + sambungan ke lintasan uji */}
      <mesh position={[PARKING.cx, 0.02, PARKING.cz]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[GROUND_W, GROUND_D]} />
        <meshStandardMaterial map={ground} roughness={0.95} metalness={0.02} />
      </mesh>
      {/* Persimpangan ke lintasan uji: aspal bertekstur sama, bergaris tepi sendiri, dan menutup
          garis tepi kedua jalan di mulut simpang supaya sambungannya tidak terpotong garis putih. */}
      <mesh position={[X0 + GROUND_W + 1.45, 0.046, PARKING.cz]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[4.3, 5.4]} />
        <meshStandardMaterial map={junction} roughness={0.95} metalness={0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>

      {/* armada: sepasang berjalan, sepasang parkir, bergantian */}
      {FLEET.map((car, i) => (
        <group
          key={car.model}
          name={`Parking_car_${car.model}`}
          ref={(g) => {
            carRefs.current[i] = g;
          }}
          position={[BAYS[car.bay].x, 0, BAY_Z]}
          rotation={[0, Math.PI, 0]}
        >
          {carObjects[i] && <primitive object={carObjects[i]!} />}
        </group>
      ))}
      {/* meteran: satu untuk mobil bensin, satu untuk mobil listrik yang sedang di jalan */}
      {[0, 1].map((k) => (
        <mesh
          key={k}
          name={`Parking_meter_${k}`}
          ref={(m) => {
            labelRefs.current[k] = m;
          }}
          visible={false}
          raycast={noRaycast}
          renderOrder={10}
        >
          <planeGeometry args={[3.6, 1.406]} />
          <meshBasicMaterial map={meters[k].texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}

      {/* papan perbandingan (menghadap timur, ke arah datangnya pemain) */}
      <group position={[BOARD.x, 0, BOARD.z]} rotation={[0, Math.PI / 2, 0]}>
        {[-2.9, 2.9].map((x) => (
          <mesh key={x} position={[x, 1.2, -0.22]} raycast={noRaycast}>
            <cylinderGeometry args={[0.09, 0.11, 2.4, 14]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 3.0, -0.06]} raycast={noRaycast}>
          <boxGeometry args={[6.6, 3.8, 0.1]} />
          <meshStandardMaterial color="#0b1220" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 3.0, 0]} raycast={noRaycast}>
          <planeGeometry args={[6.4, 3.6]} />
          <meshBasicMaterial map={board.texture} toneMapped={false} />
        </mesh>
        {/* tombol ulang dari nol */}
        <group position={[0, 0.82, 0.02]}>
          <mesh
            name="Parking_btn_reset"
            geometry={resetGeometry}
            scale={hotReset ? 1.05 : 1}
            userData={{ isVRButton: true, isInteractableMesh: true, onClick: reset }}
            onClick={reset}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHotReset(true);
            }}
            onPointerOut={() => setHotReset(false)}
          >
            <meshStandardMaterial color="#b45309" emissive="#b45309" emissiveIntensity={hotReset ? 0.5 : 0.15} roughness={0.35} />
          </mesh>
          <ResetLabel />
        </group>
      </group>

      {/* SPBU */}
      <StaticModel model="spbu" size={STATION.size} position={[STATION.x, 0, STATION.z]} rotation={Math.PI / 2} lod={false} />
      {/* layar pompa di atas pulau pompa (menghadap lajur & pemain dari timur) */}
      <group position={[-43.0, 2.35, SPBU_PUMP_Z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.03]} raycast={noRaycast}>
          <boxGeometry args={[1.5, 0.78, 0.05]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <mesh raycast={noRaycast}>
          <planeGeometry args={[1.42, 0.71]} />
          <meshBasicMaterial map={screens[0].texture} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[-43.0, 1.98, SPBU_PUMP_Z]} raycast={noRaycast}>
        <cylinderGeometry args={[0.04, 0.04, 0.0001 + 0.05, 8]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {/* tiang cas di petak mobil listrik */}
      {CHARGERS.map((c, k) => (
        <group key={c.bay}>
          <group position={[c.x, 0, c.z]}>
            <mesh position={[0, 0.8, 0]} raycast={noRaycast}>
              <boxGeometry args={[0.32, 1.6, 0.26]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.62, 0]} raycast={noRaycast}>
              <boxGeometry args={[0.36, 0.06, 0.3]} />
              <meshStandardMaterial color="#16a34a" emissive="#16a34a" emissiveIntensity={0.6} />
            </mesh>
            {/* layar menghadap selatan (ke arah pemain yang datang dari belakang mobil) */}
            <group position={[0, 2.25, 0]}>
              <mesh position={[0, 0, -0.03]} raycast={noRaycast}>
                <boxGeometry args={[1.1, 0.58, 0.05]} />
                <meshStandardMaterial color="#111827" />
              </mesh>
              <mesh raycast={noRaycast}>
                <planeGeometry args={[1.04, 0.52]} />
                <meshBasicMaterial map={screens[k + 1].texture} toneMapped={false} />
              </mesh>
              <mesh position={[0, 0, -0.06]} rotation={[0, Math.PI, 0]} raycast={noRaycast}>
                <planeGeometry args={[1.04, 0.52]} />
                <meshBasicMaterial map={screens[k + 1].texture} toneMapped={false} />
              </mesh>
            </group>
            <mesh position={[0, 1.95, 0]} raycast={noRaycast}>
              <cylinderGeometry args={[0.03, 0.03, 0.12, 8]} />
              <meshStandardMaterial color="#111827" />
            </mesh>
          </group>
          {/* kabel cas ke moncong mobil */}
          <mesh
            ref={(m) => {
              cableRefs.current[k] = m;
            }}
            raycast={noRaycast}
            geometry={chargeCable(c.x, c.z, BAYS[c.bay].x)}
          >
            <meshStandardMaterial color="#111827" roughness={0.6} />
          </mesh>
        </group>
      ))}
      <InfoSign
        title="SPBU — Pengisian Bensin"
        subtitle="Mobil bermesin bakar"
        accent="#f97316"
        position={[-36.9, 0, 4.3]}
        facing={-2.4}
        facts={[
          "Isi penuh ±5 menit, tetapi hanya 25–30% energi bensin menjadi gerak; sisanya panas.",
          "Setiap liter bensin yang dibakar menghasilkan ±2,3 kg CO₂ dari knalpot.",
          "Mobil listrik mengisi daya lebih lama (tiang cas di petak parkir), tetapi biayanya ±⅓ bensin.",
        ]}
      />

      {/* penunjuk arah di halaman depan gedung */}
      <InfoSign
        title="Area Parkir & SPBU"
        subtitle="Ke kiri dari pintu depan, ±40 m"
        accent="#facc15"
        position={[-8.5, 0, 11.5]}
        facing={0.9}
        facts={[
          "Bandingkan langsung biaya mobil bensin dan mobil listrik yang sedang berjalan.",
          "Lihat SPBU, petak parkir, dan papan \"Boros mana?\".",
        ]}
      />

      {/* pepohonan di sekeliling */}
      <Scenery
        model="redwood"
        size={15}
        places={[
          [-65.5, -7, 0.3],
          [-66, 7, 2.1, 1.1],
          [-64.5, 21, 4.0, 0.95],
        ]}
      />
      <Scenery
        model="pisang"
        size={3.6}
        places={[
          [-38.5, 24.6, 0.4],
          [-48, 24.9, 2.2, 1.1],
          [-57, 24.7, 4.1, 0.9],
          [-42, -14.6, 1.3, 1.05],
          [-54, -14.8, 3.0],
        ]}
      />
    </group>
  );
}

const cableCache = new Map<string, THREE.TubeGeometry>();
function chargeCable(px: number, pz: number, bayX: number) {
  const key = `${px},${pz}`;
  let g = cableCache.get(key);
  if (!g) {
    const pts = [
      new THREE.Vector3(px, 1.2, pz + 0.14),
      new THREE.Vector3(px - 0.15, 0.35, pz + 0.5),
      new THREE.Vector3(bayX + 0.7, 0.45, pz + 0.95),
      new THREE.Vector3(bayX + 0.55, 0.8, pz + 1.05),
    ];
    g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 8);
    cableCache.set(key, g);
  }
  return g;
}

function ResetLabel() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 144;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 62px system-ui, sans-serif";
    ctx.fillText("ULANG DARI 0", 256, 76);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 0, 0.066]} raycast={noRaycast}>
      <planeGeometry args={[1.4, 0.39]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
