import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { wrapText } from "../lib/glb";
import { playVRClickSound } from "../lib/vrAudio";
import { Btn, useLiveCanvas } from "./BatteryGame";

/**
 * Stasiun "Sistem Pendingin Baterai" (thermal management).
 *
 * Paket baterai terbuka (sel terlihat, warnanya mengikuti suhu) duduk di atas pelat dingin.
 * Cairan pendingin (air + glikol) dipompa: pompa → (chiller / pemanas) → pelat dingin di bawah sel
 * → keluar membawa panas → radiator + kipas melepas panas ke udara → kembali ke pompa.
 * Panah di dalam pipa bergerak sesuai putaran pompa; kipas dan impeler pompa berputar; warna cairan
 * berubah dari biru (dingin) ke merah (panas).
 *
 * Tombol skenario mengubah panas yang dihasilkan sel; pengendali (seperti BMS/VCU) menaikkan putaran
 * pompa & kipas, membuka chiller bila terlalu panas, atau menyalakan pemanas bila terlalu dingin.
 *
 * Arah lokal: meja memanjang di sumbu X, pemain berdiri di sisi +Z.
 */

const noRaycast = () => null;
type Vec3 = [number, number, number];
const TOP = 0.76;

type Mode = "santai" | "ngebut" | "fast" | "dingin";
const MODES: { id: Mode; label: string; color: string; heat: number; amb: number; text: string }[] = [
  { id: "santai", label: "JALAN SANTAI", color: "#0891b2", heat: 0.6, amb: 30, text: "Arus kecil → panas sel sedikit. Pompa pelan sudah cukup, kipas radiator hampir tidak perlu berputar." },
  { id: "ngebut", label: "TANJAKAN / NGEBUT", color: "#d97706", heat: 3.5, amb: 32, text: "Arus besar → panas I²R di setiap sel naik. Pompa dan kipas dipercepat; bila suhu > 38 °C chiller ikut membantu." },
  { id: "fast", label: "FAST CHARGING", color: "#dc2626", heat: 6, amb: 32, text: "Pengisian cepat DC menghasilkan panas paling besar. Chiller (memakai AC mobil) mendinginkan cairan di bawah suhu udara agar sel tetap < 40 °C." },
  { id: "dingin", label: "CUACA DINGIN", color: "#2563eb", heat: 0.3, amb: 5, text: "Sel terlalu dingin (< 15 °C) membuat daya & pengisian dibatasi. Pemanas PTC menghangatkan cairan supaya baterai kembali ke suhu kerja." },
];

/* ---------------------------- warna suhu ---------------------------- */

const STOPS: [number, THREE.Color][] = [
  [5, new THREE.Color("#1d4ed8")],
  [20, new THREE.Color("#06b6d4")],
  [30, new THREE.Color("#22c55e")],
  [38, new THREE.Color("#eab308")],
  [46, new THREE.Color("#dc2626")],
];
function tempColor(t: number, out = new THREE.Color()) {
  if (t <= STOPS[0][0]) return out.copy(STOPS[0][1]);
  for (let k = 1; k < STOPS.length; k++) {
    if (t <= STOPS[k][0]) {
      const [a, ca] = STOPS[k - 1];
      const [b, cb] = STOPS[k];
      return out.copy(ca).lerp(cb, (t - a) / (b - a));
    }
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}
const css = (t: number) => "#" + tempColor(t).getHexString();
const f1 = (n: number) => n.toFixed(1).replace(".", ",");

/* ---------------------------- tekstur panah ---------------------------- */

function makeArrowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(30, 6);
  ctx.lineTo(96, 32);
  ctx.lineTo(30, 58);
  ctx.lineTo(52, 32);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pipa cairan pendingin dengan panah bergerak. Panjang pipa menentukan jumlah panah. */
/** Jalur pipa siku-siku dengan tikungan membulat (seperti selang pendingin yang dirapikan klem). */
function filletPath(points: Vec3[], r = 0.05) {
  const v = points.map((p) => new THREE.Vector3(...p));
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cur = v[0].clone();
  for (let k = 1; k < v.length - 1; k++) {
    const a = v[k - 1];
    const b = v[k];
    const c = v[k + 1];
    const rr = Math.min(r, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const p1 = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(rr));
    const p2 = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(rr));
    if (cur.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(cur, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    cur = p2;
  }
  path.add(new THREE.LineCurve3(cur, v[v.length - 1].clone()));
  return path;
}

function Pipe({ points, texture, colorRef, dim, radius = 0.016 }: { points: Vec3[]; texture: THREE.Texture; colorRef: React.MutableRefObject<THREE.Color>; dim?: React.MutableRefObject<boolean>; radius?: number }) {
  const { geo, mat } = useMemo(() => {
    const curve = filletPath(points);
    const len = curve.getLength();
    const geo = new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, Math.max(24, Math.round(len * 60)), radius, 10, false);
    const map = texture.clone();
    map.repeat.set(Math.round(len / 0.09), 1);
    map.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92, emissive: "#000000" });
    return { geo, mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => (geo.dispose(), mat.map?.dispose(), mat.dispose()), [geo, mat]);
  useFrame(() => {
    mat.map!.offset.x = texture.offset.x;
    const off = dim?.current;
    mat.color.copy(colorRef.current).multiplyScalar(off ? 0.25 : 1);
    mat.emissive.copy(colorRef.current).multiplyScalar(off ? 0 : 0.35);
    mat.opacity = off ? 0.45 : 0.92;
  });
  return <mesh geometry={geo} material={mat} raycast={noRaycast} />;
}

/* ---------------------------- papan ---------------------------- */

type Sim = { tb: number; tin: number; tout: number; pump: number; fan: number; chiller: boolean; heater: boolean; heat: number; amb: number; cool: number };

function drawBoard(ctx: CanvasRenderingContext2D, mode: Mode, s: Sim) {
  const W = 1600;
  const H = 900;
  const m = MODES.find((x) => x.id === mode)!;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.fillText("SISTEM PENDINGIN BATERAI", 44, 30);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillText("Battery Thermal Management · cairan air + glikol", 46, 96);

  // cara kerja
  const steps = [
    ["Pompa", "mendorong cairan pendingin berputar dalam sirkuit tertutup."],
    ["Pelat dingin", "di bawah sel tipe blade menyerap panas (konduksi)."],
    ["Pipa panas", "membawa cairan hangat keluar dari paket baterai."],
    ["Radiator + kipas", "melepas panas ke udara luar (konveksi)."],
    ["Modul termal", "pompa, katup, chiller (AC) & PTC dalam satu blok."],
    ["Pemanas PTC", "menghangatkan baterai saat cuaca dingin."],
  ];
  let y = 156;
  steps.forEach(([a, b], i) => {
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(66, y + 20, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "900 24px system-ui, sans-serif";
    ctx.fillText(String(i + 1), 66, y + 8);
    ctx.textAlign = "left";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(a, 98, y + 4);
    const w = ctx.measureText(a + " ").width;
    ctx.font = "500 26px system-ui, sans-serif";
    ctx.fillStyle = "#cbd5e1";
    wrapText(ctx, b, 760 - w)
      .slice(0, 1)
      .forEach((l) => ctx.fillText(l, 98 + w, y + 6));
    y += 56;
  });

  // suhu ideal
  y += 12;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText("Suhu baterai", 46, y);
  const bx = 46;
  const bw = 820;
  const by = y + 34;
  const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  STOPS.forEach(([t, c]) => grad.addColorStop((t - 0) / 50, "#" + c.getHexString()));
  ctx.fillStyle = grad;
  ctx.fillRect(bx, by, bw, 26);
  const tx = (t: number) => bx + (Math.min(50, Math.max(0, t)) / 50) * bw;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(tx(20), by - 4, tx(40) - tx(20), 34);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText("0 °C", bx, by + 34);
  ctx.textAlign = "center";
  ctx.fillText("ideal 20–40 °C", (tx(20) + tx(40)) / 2, by + 34);
  ctx.textAlign = "right";
  ctx.fillText("50 °C", bx + bw, by + 34);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(tx(s.tb), by - 6);
  ctx.lineTo(tx(s.tb) - 12, by - 26);
  ctx.lineTo(tx(s.tb) + 12, by - 26);
  ctx.closePath();
  ctx.fill();

  // panel nilai langsung
  const px = 920;
  ctx.fillStyle = "#111c33";
  ctx.fillRect(px, 150, W - px - 44, 420);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "900 32px system-ui, sans-serif";
  ctx.fillText(`Skenario: ${m.label}`, px + 24, 166, W - px - 90);
  const rows: [string, string, string?][] = [
    ["Suhu sel", `${f1(s.tb)} °C`, css(s.tb)],
    ["Udara luar", `${f1(s.amb)} °C`],
    ["Panas dari sel", `${f1(s.heat)} kW`],
    ["Cairan masuk → keluar", `${f1(s.tin)} → ${f1(s.tout)} °C`],
    ["Panas dibuang", `${f1(s.cool)} kW`],
    ["Pompa", `${Math.round(s.pump * 100)} %`],
    ["Kipas radiator", `${Math.round(s.fan * 100)} %`],
    ["Chiller (AC)", s.chiller ? "MENYALA" : "mati", s.chiller ? "#38bdf8" : "#64748b"],
    ["Pemanas PTC", s.heater ? "MENYALA" : "mati", s.heater ? "#fb923c" : "#64748b"],
  ];
  rows.forEach(([a, b, c], k) => {
    const ry = 220 + k * 38;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.fillText(a, px + 24, ry);
    ctx.textAlign = "right";
    ctx.fillStyle = c ?? "#f8fafc";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.fillText(b, W - 70, ry - 2);
    ctx.textAlign = "left";
  });

  // pesan skenario
  ctx.fillStyle = s.tb > 42 ? "rgba(153,27,27,0.6)" : "rgba(30,41,59,0.85)";
  ctx.fillRect(44, 620, W - 88, 240);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 34px system-ui, sans-serif";
  const tail = s.chiller
    ? " Sekarang chiller aktif: cairan didinginkan lebih rendah dari suhu udara."
    : s.heater
      ? " Sekarang pemanas aktif: cairan dihangatkan sebelum masuk ke pelat dingin."
      : "";
  wrapText(ctx, m.text + tail, W - 150)
    .slice(0, 5)
    .forEach((l, i) => ctx.fillText(l, 76, 642 + i * 42));
}

/* ---------------------------- komponen ---------------------------- */

const tableTop = new RoundedBoxGeometry(3.7, 0.06, 1.0, 4, 0.02);
const packBox = new RoundedBoxGeometry(1.22, 0.02, 0.72, 2, 0.006);
const finGeo = new THREE.BoxGeometry(0.004, 0.46, 0.05);
const bladeGeo = new THREE.BoxGeometry(0.05, 0.2, 0.008);
const BLADES = 22;
const BLADE_DX = 0.05;

export function CoolingSystem({ position, facing = 0 }: { position: Vec3; facing?: number }) {
  const [mode, setMode] = useState<Mode>("santai");
  const modeRef = useRef<Mode>("santai");
  const sim = useRef<Sim>({ tb: 26, tin: 25, tout: 27, pump: 0.2, fan: 0, chiller: false, heater: false, heat: 0.6, amb: 30, cool: 0.6 });

  const arrow = useMemo(makeArrowTexture, []);
  useEffect(() => () => arrow.dispose(), [arrow]);
  const coldC = useRef(new THREE.Color("#06b6d4"));
  const hotC = useRef(new THREE.Color("#eab308"));
  const chillC = useRef(new THREE.Color("#3b82f6"));
  const chillerOff = useRef(true);
  const bypassOff = useRef(false);

  const board = useLiveCanvas(1600, 900);
  const cells = useRef<THREE.InstancedMesh>(null);
  const fan = useRef<THREE.Group>(null);
  const impeller = useRef<THREE.Group>(null);
  const heaterMat = useRef<THREE.MeshStandardMaterial>(null);
  const chillerLamp = useRef<THREE.MeshBasicMaterial>(null);
  const air = useRef<THREE.InstancedMesh>(null);
  const acc = useRef({ board: 1, cells: 1 });
  const tmpC = useMemo(() => new THREE.Color(), []);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    const m = cells.current;
    if (!m) return;
    for (let k = 0; k < BLADES; k++) {
      tmpM.makeTranslation((k - (BLADES - 1) / 2) * BLADE_DX, 0, -0.07);
      m.setMatrixAt(k, tmpM);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [tmpM]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.25);
    const s = sim.current;
    const md = MODES.find((x) => x.id === modeRef.current)!;
    // --- simulasi (dipercepat supaya perubahan terlihat dalam hitungan detik) ---
    s.heat += (md.heat - s.heat) * Math.min(1, dt * 2);
    s.amb += (md.amb - s.amb) * Math.min(1, dt * 1.5);
    const pumpT = THREE.MathUtils.clamp((s.tb - 18) / 16, 0.2, 1);
    const fanT = s.tb > s.amb ? THREE.MathUtils.clamp((s.tb - 28) / 10, 0, 1) : 0;
    s.pump += (pumpT - s.pump) * Math.min(1, dt * 1.5);
    s.fan += (fanT - s.fan) * Math.min(1, dt * 1.5);
    if (!s.chiller && s.tb > 38) s.chiller = true;
    if (s.chiller && s.tb < 33) s.chiller = false;
    if (!s.heater && s.tb < 15) s.heater = true;
    if (s.heater && s.tb > 21) s.heater = false;
    const radiator = (s.tb - s.amb) * (0.08 * s.pump + 0.28 * s.fan);
    const chill = s.chiller ? 5 * s.pump : 0;
    const heat = s.heater ? -1.6 : 0;
    s.cool = radiator + chill + heat;
    s.tb += ((s.heat - s.cool) / 3) * dt;
    s.tin = s.tb - 1 - (s.chiller ? 7 : 0) + (s.heater ? 5 : 0) - s.fan * 2;
    s.tout = s.tb + s.heat * 0.5;

    tempColor(s.tin, coldC.current);
    tempColor(s.tout, hotC.current);
    tempColor(s.tin - 2, chillC.current);
    chillerOff.current = !s.chiller;
    bypassOff.current = s.chiller;

    // --- animasi ---
    arrow.offset.x -= dt * (0.4 + s.pump * 2.2);
    if (fan.current) fan.current.rotation.z -= dt * (s.fan * 28 + 0.4);
    if (impeller.current) impeller.current.rotation.z -= dt * (4 + s.pump * 30);
    if (heaterMat.current) heaterMat.current.emissiveIntensity = s.heater ? 1.2 + Math.sin(performance.now() / 160) * 0.3 : 0;
    if (chillerLamp.current) chillerLamp.current.color.set(s.chiller ? "#38bdf8" : "#1e293b");
    // udara panas keluar dari radiator
    const am = air.current;
    if (am) {
      const t = performance.now() / 1000;
      for (let k = 0; k < 14; k++) {
        const ph = (t * (0.3 + s.fan * 1.2) + k / 14) % 1;
        const x = -0.28 + (k % 7) * 0.09;
        const yy = 0.08 + Math.floor(k / 7) * 0.24 + Math.sin(k * 3.1 + t) * 0.03;
        const sc = s.fan < 0.05 ? 0.001 : 0.6 + ph;
        tmpM.makeScale(sc, sc, sc).setPosition(x, yy, -0.12 - ph * 0.55);
        am.setMatrixAt(k, tmpM);
      }
      am.instanceMatrix.needsUpdate = true;
      (am.material as THREE.MeshBasicMaterial).color.copy(hotC.current);
      (am.material as THREE.MeshBasicMaterial).opacity = 0.35 * Math.min(1, s.fan * 2);
    }
    const a = acc.current;
    a.cells += dt;
    a.board += dt;
    if (a.cells > 0.2 && cells.current) {
      a.cells = 0;
      const m = cells.current;
      for (let k = 0; k < BLADES; k++) {
        // sel di dekat saluran masuk sedikit lebih dingin dari sel di ujung keluar
        m.setColorAt(k, tempColor(s.tb - 1.5 + (k / (BLADES - 1)) * 3 * Math.min(1, s.heat / 2), tmpC));
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (a.board > 0.3) {
      a.board = 0;
      drawBoard(board.ctx, modeRef.current, s);
      board.t.needsUpdate = true;
    }
  });

  const choose = (m: Mode) => {
    playVRClickSound();
    modeRef.current = m;
    setMode(m);
  };

  // --- tata letak (lokal): paket kiri, modul termal tengah, radiator kanan ---
  const PACK_X = -0.85;
  const PW = 1.2; // panjang paket (X)
  const py = TOP + 0.035; // ketinggian header & saluran
  const ZF = 0.3; // header masuk (depan)
  const ZB = -0.33; // header keluar (belakang)
  const PR = PACK_X + PW / 2; // sisi kanan paket (sambungan)
  const CH = 7; // jumlah saluran paralel di pelat dingin
  const MOD: Vec3 = [0.22, TOP, 0.08];
  const RAD_X = 1.2;
  const RAD_Z = -0.22;
  const RAD_Y = TOP + 0.36;
  const RW = 0.8;
  const pl = (x: number, y: number, z: number): Vec3 => [x, y, z];

  const clips: Vec3[] = [
    [PR + 0.25, py, ZB - 0.02],
    [0.62, py, ZB - 0.02],
    [RAD_X + RW / 2 + 0.05, py, 0.0],
    [0.95, py, 0.3],
    [PR + 0.12, py, ZF],
  ];

  return (
    <group position={position} rotation={[0, facing, 0]}>
      {/* meja */}
      <mesh geometry={tableTop} position={[0, TOP - 0.03, 0]} raycast={noRaycast}>
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </mesh>
      {[-1.75, 1.75].flatMap((x) =>
        [-0.42, 0.42].map((z) => (
          <mesh key={`${x}${z}`} position={[x, (TOP - 0.06) / 2, z]} raycast={noRaycast}>
            <cylinderGeometry args={[0.03, 0.03, TOP - 0.06, 12]} />
            <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
          </mesh>
        )),
      )}

      {/* ---- paket baterai: sel blade berdiri rapat di atas pelat dingin ---- */}
      <group position={[PACK_X, 0, 0]}>
        {/* pelat dingin aluminium (bagian depan dibiarkan terbuka/terpotong supaya saluran terlihat) */}
        <mesh geometry={packBox} position={[0, TOP + 0.012, -0.015]} raycast={noRaycast}>
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* rangka rumah baterai di tiga sisi */}
        {[
          [0, -0.39, PW + 0.04, 0.02],
          [PW / 2 + 0.01, -0.07, 0.02, 0.66],
          [-PW / 2 - 0.01, -0.07, 0.02, 0.66],
        ].map(([x, z, w, d], k) => (
          <mesh key={k} position={[x, TOP + 0.075, z]} raycast={noRaycast}>
            <boxGeometry args={[w, 0.13, d]} />
            <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        <instancedMesh ref={cells} args={[undefined, undefined, BLADES]} position={[0, TOP + 0.085, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.038, 0.12, 0.5]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.2} />
        </instancedMesh>
      </group>
      {/* saluran paralel di dalam pelat dingin (header depan → header belakang) */}
      {Array.from({ length: CH }, (_, k) => {
        const x = PACK_X - PW / 2 + 0.1 + (k * (PW - 0.2)) / (CH - 1);
        return <Pipe key={k} points={[pl(x, TOP + 0.03, ZF), pl(x, TOP + 0.03, ZB)]} texture={arrow} colorRef={coldC} radius={0.009} />;
      })}
      {/* header (manifold) masuk & keluar */}
      <Pipe points={[pl(PR + 0.06, py, ZF), pl(PACK_X - PW / 2 + 0.08, py, ZF)]} texture={arrow} colorRef={coldC} radius={0.017} />
      <Pipe points={[pl(PACK_X - PW / 2 + 0.08, py, ZB), pl(PR + 0.06, py, ZB)]} texture={arrow} colorRef={hotC} radius={0.017} />

      {/* ---- pipa balik (panas): paket → radiator, lewat belakang ---- */}
      <Pipe points={[pl(PR + 0.06, py, ZB), pl(RAD_X - RW / 2 - 0.06, py, ZB), pl(RAD_X - RW / 2 - 0.06, RAD_Y + 0.17, ZB), pl(RAD_X - RW / 2 - 0.06, RAD_Y + 0.17, RAD_Z), pl(RAD_X - RW / 2, RAD_Y + 0.17, RAD_Z)]} texture={arrow} colorRef={hotC} />
      {/* ---- radiator → modul termal (pompa), lewat kanan & depan ---- */}
      <Pipe points={[pl(RAD_X + RW / 2, RAD_Y - 0.17, RAD_Z), pl(RAD_X + RW / 2 + 0.06, RAD_Y - 0.17, RAD_Z), pl(RAD_X + RW / 2 + 0.06, py, RAD_Z), pl(RAD_X + RW / 2 + 0.06, py, 0.3), pl(MOD[0] + 0.2, py, 0.3), pl(MOD[0] + 0.2, py, 0.2)]} texture={arrow} colorRef={coldC} />
      {/* ---- modul termal → header masuk paket ---- */}
      <Pipe points={[pl(MOD[0] - 0.2, py, 0.2), pl(MOD[0] - 0.2, py, ZF), pl(PR + 0.06, py, ZF)]} texture={arrow} colorRef={chillC} />
      {/* klem pipa */}
      {clips.map((p, k) => (
        <mesh key={k} position={[p[0], p[1] - 0.012, p[2]]} raycast={noRaycast}>
          <boxGeometry args={[0.05, 0.03, 0.05]} />
          <meshStandardMaterial color="#0f172a" roughness={0.6} />
        </mesh>
      ))}
      {/* sambungan cepat di sisi paket */}
      {[ZF, ZB].map((z) => (
        <mesh key={z} position={[PR + 0.06, py, z]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
          <cylinderGeometry args={[0.024, 0.024, 0.05, 14]} />
          <meshStandardMaterial color={z === ZF ? "#2563eb" : "#ea580c"} metalness={0.4} roughness={0.35} />
        </mesh>
      ))}

      {/* ---- modul termal terpadu: pompa + katup + chiller + PTC ---- */}
      <group position={MOD}>
        <mesh position={[0, 0.11, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.4, 0.2, 0.24]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* pompa (impeler terlihat di balik kaca) */}
        <group position={[-0.1, 0.1, 0.121]}>
          <mesh raycast={noRaycast}>
            <circleGeometry args={[0.06, 24]} />
            <meshStandardMaterial color="#0f766e" />
          </mesh>
          <group ref={impeller} position={[0, 0, 0.004]}>
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <mesh key={k} rotation={[0, 0, (k * Math.PI) / 3]} position={[Math.cos((k * Math.PI) / 3) * 0.024, Math.sin((k * Math.PI) / 3) * 0.024, 0]} raycast={noRaycast}>
                <boxGeometry args={[0.042, 0.009, 0.004]} />
                <meshStandardMaterial color="#facc15" />
              </mesh>
            ))}
          </group>
          <mesh position={[0, 0, 0.008]} raycast={noRaycast}>
            <circleGeometry args={[0.06, 24]} />
            <meshStandardMaterial color="#e2e8f0" transparent opacity={0.25} depthWrite={false} />
          </mesh>
        </group>
        {/* lampu status: chiller & PTC */}
        <mesh position={[0.08, 0.15, 0.121]} raycast={noRaycast}>
          <circleGeometry args={[0.022, 16]} />
          <meshBasicMaterial ref={chillerLamp} color="#1e293b" toneMapped={false} />
        </mesh>
        <mesh position={[0.08, 0.07, 0.121]} raycast={noRaycast}>
          <circleGeometry args={[0.022, 16]} />
          <meshStandardMaterial ref={heaterMat} color="#7c2d12" emissive="#f97316" emissiveIntensity={0} />
        </mesh>
        {/* chiller bersirip di atas modul */}
        <mesh position={[0.05, 0.25, -0.02]} raycast={noRaycast}>
          <boxGeometry args={[0.26, 0.08, 0.16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} />
        </mesh>
        {/* pipa refrigeran ke kompresor AC */}
        {[-0.03, 0.03].map((dz) => (
          <mesh key={dz} position={[0.18, 0.25, -0.02 + dz]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
            <cylinderGeometry args={[0.008, 0.008, 0.1, 8]} />
            <meshStandardMaterial color="#b45309" metalness={0.9} roughness={0.3} />
          </mesh>
        ))}
        {/* port masuk/keluar */}
        {[-0.2, 0.2].map((x) => (
          <mesh key={x} position={[x, py - TOP, 0.12]} raycast={noRaycast}>
            <cylinderGeometry args={[0.024, 0.024, 0.05, 14]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* tangki ekspansi (reservoir) */}
      <group position={[0.22, TOP, -0.3]}>
        <mesh position={[0, 0.12, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.055, 0.055, 0.24, 20]} />
          <meshStandardMaterial color="#e2e8f0" transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.08, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.05, 0.15, 20]} />
          <meshStandardMaterial color="#ec4899" transparent opacity={0.7} />
        </mesh>
        <mesh position={[0, 0.25, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.032, 0.032, 0.03, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      </group>

      {/* radiator aliran silang + kipas dengan rumah (shroud) */}
      <group position={[RAD_X, RAD_Y, RAD_Z]}>
        {Array.from({ length: 30 }, (_, k) => (
          <mesh key={k} geometry={finGeo} position={[-RW / 2 + 0.04 + k * ((RW - 0.08) / 29), 0, 0]} raycast={noRaycast}>
            <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}
        {[0.235, -0.235].map((y) => (
          <mesh key={y} position={[0, y, 0]} raycast={noRaycast}>
            <boxGeometry args={[RW, 0.02, 0.06]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}
        {/* tangki samping (masuk kiri atas, keluar kanan bawah) */}
        {[-RW / 2, RW / 2].map((x) => (
          <mesh key={x} position={[x, 0, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.045, 0.5, 0.07]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        ))}
        {/* shroud & kipas di depan */}
        <mesh position={[0, 0, 0.045]} raycast={noRaycast}>
          <torusGeometry args={[0.2, 0.02, 8, 36]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <group ref={fan} position={[0, 0, 0.05]}>
          {[0, 1, 2, 3, 4, 5, 6].map((k) => (
            <mesh key={k} geometry={bladeGeo} rotation={[0.35, 0, (k * Math.PI * 2) / 7]} position={[Math.sin((k * Math.PI * 2) / 7) * -0.1, Math.cos((k * Math.PI * 2) / 7) * 0.1, 0]} raycast={noRaycast}>
              <meshStandardMaterial color="#334155" roughness={0.5} />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.035, 0.035, 0.03, 16]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, -0.3, -0.01]} raycast={noRaycast}>
            <boxGeometry args={[0.05, 0.12, 0.14]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}
        {/* udara panas yang dibuang */}
        <instancedMesh ref={air} args={[undefined, undefined, 14]} position={[0, -0.12, 0]} raycast={noRaycast}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
        </instancedMesh>
      </group>

      {/* label komponen di meja */}
      <Labels
        items={[
          ["SEL BLADE + PELAT DINGIN", [PACK_X, TOP + 0.005, 0.42]],
          ["MODUL TERMAL", [MOD[0], TOP + 0.005, 0.42]],
          ["TANGKI", [0.22, TOP + 0.005, -0.44]],
          ["RADIATOR + KIPAS", [RAD_X, TOP + 0.005, 0.42]],
        ]}
      />

      {/* tombol skenario */}
      <group position={[0, TOP + 0.04, 0.62]} rotation={[-0.75, 0, 0]}>
        {MODES.map((m, k) => (
          <Btn key={m.id} prefix="Pendingin_btn_" name={m.id} label={m.label} color={m.color} position={[-0.6 + k * 0.4, 0, 0]} active={mode === m.id} onPress={() => choose(m.id)} />
        ))}
      </group>
      <mesh position={[0, TOP - 0.03, 0.6]} raycast={noRaycast}>
        <boxGeometry args={[1.8, 0.05, 0.22]} />
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </mesh>

      {/* papan penjelasan */}
      <group position={[0, 1.95, -0.62]}>
        <mesh position={[0, 0, -0.03]} raycast={noRaycast}>
          <boxGeometry args={[2.72, 1.56, 0.05]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh raycast={noRaycast}>
          <planeGeometry args={[2.64, 1.485]} />
          <meshBasicMaterial map={board.t} toneMapped={false} />
        </mesh>
        {[-1.2, 1.2].map((x) => (
          <mesh key={x} position={[x, -0.78 - 0.585, -0.06]} raycast={noRaycast}>
            <cylinderGeometry args={[0.035, 0.04, 1.17, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Label kecil rebah di permukaan meja. */
function Labels({ items }: { items: [string, Vec3][] }) {
  const tex = useMemo(
    () =>
      items.map(([text]) => {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 64;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "800 36px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 256, 34, 500);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => tex.forEach((t) => t.dispose()), [tex]);
  return (
    <>
      {items.map(([, p], k) => (
        <mesh key={k} position={p} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[0.48, 0.06]} />
          <meshBasicMaterial map={tex[k]} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
