import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ExhibitStand, InfoSign, QuizStation, Scenery, StaticModel } from "./LabStations";
import { ReadingCorner } from "./ReadingCorner";
import { Barrier, Cone, DiagnosticCart, Extinguisher, Lift, SafetyStation, Workshop } from "./LabProps";
import { LabBuilding } from "./LabBuilding";
import { AssemblyGame } from "./AssemblyGame";
import { EnergyRoom } from "./SolarPower";
import { BatteryGame } from "./BatteryGame";
import { ParkingArea, PARKING_SOLIDS } from "./ParkingArea";
import { DrivingTrack } from "./DrivingTrack";
import { boxAt, worldBounds, type Box } from "../lib/worldBounds";

/**
 * Lingkungan "Ruang Uji Kendaraan Listrik".
 *
 * Seluruhnya dibuat dari bentuk dasar + tekstur kanvas (tanpa file yang diunduh), jadi ringan
 * untuk Meta Quest dan HP: lantai aspal bermarka, lintasan uji, hanggar baja dengan lampu
 * plafon, stasiun pengisian, kerucut & pembatas, bengkel kecil, serta poster materi.
 *
 * Tata letak (meter, titik mulai pemain di 0,0,0 menghadap -Z):
 *   hanggar  : X -14..24, Z -14..6, tinggi 7 (X 14..24 = area game merakit mobil)
 *   lintasan : sepanjang sumbu X pada Z = -6 (tempat contoh mobil berjalan)
 */

// Sayap kanan (X 14..24) adalah area game merakit mobil.
const HALL = { x0: -14, x1: 24, z0: -14, z1: 6, h: 7 };
// Lintasan luar: persegi panjang bersudut bulat mengelilingi gedung (garis tengah jalan)
const TRACK = { cx: 5, cz: -2, hx: 30, hz: 24, r: 9 };
/**
 * Benda yang tidak boleh ditembus pemain (tampak atas, meter). Perbarui bila tata letak berubah.
 * Mobil di lintasan dalam dan mobil di lintasan luar bergerak, jadi tidak dimasukkan.
 */
const T = 0.3; // tebal tembok
const stand = (x: number, z: number, size: number): Box => boxAt(x, z, (Math.max(0.75, size * 0.52) + 0.2) * 0.85);
const SOLIDS: Box[] = [
  // area parkir & SPBU di luar lintasan (lihat ParkingArea.tsx)
  ...PARKING_SOLIDS,
  // tembok: belakang, kiri, kanan, depan kiri & kanan pintu (bukaan X -5..5)
  { minX: HALL.x0 - T, maxX: HALL.x1 + T, minZ: HALL.z0 - T, maxZ: HALL.z0 },
  { minX: HALL.x0 - T, maxX: HALL.x0, minZ: HALL.z0, maxZ: HALL.z1 },
  { minX: HALL.x1, maxX: HALL.x1 + T, minZ: HALL.z0, maxZ: HALL.z1 },
  { minX: HALL.x0 - T, maxX: -5, minZ: HALL.z1, maxZ: HALL.z1 + T },
  { minX: 5, maxX: HALL.x1 + T, minZ: HALL.z1, maxZ: HALL.z1 + T },
  // etalase
  stand(-6.4, -1.3, 1.9),
  stand(-10.2, -1.3, 1.5),
  stand(-12.5, 2.0, 1.3),
  stand(6.6, 3.5, 2.1),
  stand(9.3, -1.5, 3.0),
  stand(-5.6, -12.4, 1.35),
  stand(-3.3, -12.4, 1.3),
  stand(-1.0, -12.4, 1.0),
  stand(1.3, -12.4, 0.95),
  stand(4.3, -11.9, 2.8),
  stand(12.9, -9.7, 0.75),
  // lift + sasis, charger, troli, bengkel, lemari APD, kios kuis, pojok baca, konsol mobil, pembatas
  { minX: -11.4, maxX: -7.6, minZ: -11.9, maxZ: -10.1 },
  boxAt(7.9, -13.5, 0.55),
  boxAt(11.1, -13.0, 0.5),
  boxAt(6.7, -9.5, 0.5, 0.4),
  { minX: -14, maxX: -12.75, minZ: -3.95, maxZ: -0.2 },
  { minX: HALL.x1 - 0.6, maxX: HALL.x1, minZ: 1.0, maxZ: 3.0 },
  { minX: -10.8, maxX: -8.2, minZ: 4.8, maxZ: 5.6 },
  { minX: 6.8, maxX: 12.2, minZ: 5.5, maxZ: 6 },
  { minX: 8.0, maxX: 11.0, minZ: 2.2, maxZ: 3.05 },
  boxAt(0, -3.1, 1.2, 0.3),
  boxAt(-11.6, -6, 0.25, 1.2),
  boxAt(11.6, -6, 0.25, 1.2),
  // game restorasi baterai: meja + papan
  { minX: 17.4, maxX: 20.2, minZ: 3.9, maxZ: 5.0 },
  // sudut energi surya: lemari baterai
  { minX: 14.4, maxX: 17.35, minZ: HALL.z0, maxZ: HALL.z0 + 0.66 },
  // game rakit: panggung, tiang derek, troli & meja komponen, konsol
  { minX: 16.2, maxX: 21.8, minZ: -7.0, maxZ: -4.2 },
  boxAt(16.05, -7.35, 0.15),
  boxAt(21.95, -7.35, 0.15),
  boxAt(16.05, -3.85, 0.15),
  boxAt(21.95, -3.85, 0.15),
  boxAt(15.1, -2.6, 1.0, 0.65),
  boxAt(17.7, -2.1, 0.45),
  boxAt(20.2, -2.1, 0.45),
  boxAt(22.7, -2.6, 0.45),
  boxAt(19, -1.0, 0.8, 0.25),
  // luar gedung: tiang kanopi, lampu taman, stasiun surya, batang pohon
  boxAt(-5.6, 9.05, 0.13),
  boxAt(5.6, 9.05, 0.13),
  boxAt(-6.9, 13.5, 0.15),
  boxAt(6.9, 13.5, 0.15),
  { minX: 39.6, maxX: 43.0, minZ: -6.2, maxZ: 2.2 },
  ...(
    [
      [-11.5, 13],
      [14, 14],
      [-19.5, -2],
      [29.5, -14],
      [5, 31],
      [-32, -12],
      [42, 16],
      [-4, -33],
    ] as [number, number][]
  ).map(([x, z]) => boxAt(x, z, 0.4)),
];

const LANE_Z = -6;
const LANE_HALF = 1.7;
const LANE_LEN = 21;

const noRaycast = () => null;

function useCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat?: [number, number],
) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    draw(c.getContext("2d")!, width, height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// Pseudo-acak tetap, supaya tekstur sama setiap kali dimuat
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function drawAsphalt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#2b2d31";
  ctx.fillRect(0, 0, w, h);
  const r = rng(7);
  for (let i = 0; i < 9000; i++) {
    const v = 30 + Math.floor(r() * 60);
    ctx.fillStyle = `rgba(${v + 8},${v + 8},${v + 12},${0.25 + r() * 0.5})`;
    const s = 0.6 + r() * 1.8;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  // bercak aus halus
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 30 + r() * 70);
    g.addColorStop(0, `rgba(${r() > 0.5 ? "70,72,78" : "20,21,24"},0.16)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawWall(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#d7dde5");
  g.addColorStop(1, "#c3cad4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(71,85,105,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, w - 12, h - 12);
}

function drawHazard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#facc15";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#111827";
  for (let x = -h; x < w + h; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 32, h);
    ctx.lineTo(x + 32 + h, 0);
    ctx.lineTo(x + h, 0);
    ctx.fill();
  }
}

function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const n = 2;
  const s = w / n;
  for (let y = 0; y < h / s; y++)
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#111827" : "#f8fafc";
      ctx.fillRect(x * s, y * s, s, s);
    }
}

function floorText(text: string, color: string) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.floor(h * 0.7)}px system-ui, sans-serif`;
    ctx.fillText(text, w / 2, h / 2 + 4);
  };
}

function drawSign(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#0b1220");
  g.addColorStop(0.5, "#13233f");
  g.addColorStop(1, "#0b1220");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(0, h - 14, w, 14);
  ctx.fillRect(0, 0, w, 6);
  // petir
  ctx.beginPath();
  const bx = 150;
  const by = h / 2;
  ctx.moveTo(bx + 20, by - 90);
  ctx.lineTo(bx - 50, by + 14);
  ctx.lineTo(bx - 4, by + 14);
  ctx.lineTo(bx - 24, by + 90);
  ctx.lineTo(bx + 54, by - 22);
  ctx.lineTo(bx + 6, by - 22);
  ctx.closePath();
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 112px system-ui, sans-serif";
  ctx.fillText("RUANG UJI KENDARAAN LISTRIK", 260, h / 2 - 34, w - 320);
  ctx.fillStyle = "#7dd3fc";
  ctx.font = "600 50px system-ui, sans-serif";
  ctx.fillText("SMART VOCATIONAL  ·  ELECTRIC VEHICLE TEST LAB", 264, h / 2 + 68, w - 320);
}

function posterBase(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, accent: string) {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 120);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.font = "900 56px system-ui, sans-serif";
  ctx.fillText(title, 40, 62);
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
}

function drawSafetyPoster(ctx: CanvasRenderingContext2D, w: number, h: number) {
  posterBase(ctx, w, h, "⚠  K3 TEGANGAN TINGGI", "#dc2626");
  const items = [
    "Pakai APD: sarung tangan isolasi, kacamata, sepatu isolasi",
    "Matikan kendaraan & cabut kunci kontak",
    "Lepas service plug / MSD baterai traksi",
    "Tunggu ±10 menit sampai kapasitor kosong",
    "Ukur: pastikan tegangan 0 V sebelum bekerja",
    "Kabel ORANYE = tegangan tinggi, jangan disentuh",
  ];
  items.forEach((t, i) => {
    const y = 190 + i * 92;
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(70, y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "900 36px system-ui, sans-serif";
    ctx.fillText(String(i + 1), 70, y + 2);
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.fillText(t, 124, y + 2);
  });
}

function drawFlowPoster(ctx: CanvasRenderingContext2D, w: number, h: number) {
  posterBase(ctx, w, h, "⚡  ALUR ENERGI MOBIL LISTRIK", "#0369a1");
  const steps: [string, string, string][] = [
    ["Charger", "AC / DC", "#facc15"],
    ["OBC", "AC → DC", "#c084fc"],
    ["Baterai", "400–800 V", "#22c55e"],
    ["Inverter", "DC → AC", "#38bdf8"],
    ["Motor", "Listrik → Gerak", "#f97316"],
    ["Roda", "Traksi", "#64748b"],
  ];
  const bw = 150;
  const gap = (w - 80 - bw * steps.length) / (steps.length - 1);
  steps.forEach(([name, sub, color], i) => {
    const x = 40 + i * (bw + gap);
    const y = 250;
    ctx.fillStyle = color;
    ctx.beginPath();
    (ctx as any).roundRect?.(x, y, bw, 170, 18) ?? ctx.rect(x, y, bw, 170);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.font = "900 32px system-ui, sans-serif";
    ctx.fillText(name, x + bw / 2, y + 66);
    ctx.font = "600 21px system-ui, sans-serif";
    ctx.fillText(sub, x + bw / 2, y + 116);
    if (i < steps.length - 1) {
      ctx.fillStyle = "#0f172a";
      const ax = x + bw + 6;
      const ay = y + 85;
      ctx.beginPath();
      ctx.moveTo(ax, ay - 14);
      ctx.lineTo(ax + gap - 12, ay);
      ctx.lineTo(ax, ay + 14);
      ctx.fill();
    }
  });
  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "600 32px system-ui, sans-serif";
  ctx.fillText("Saat mengerem, alurnya berbalik: motor menjadi generator", 40, 520);
  ctx.fillText("dan mengisi kembali baterai (regenerative braking).", 40, 566);
  ctx.fillStyle = "#0369a1";
  ctx.font = "900 32px system-ui, sans-serif";
  ctx.fillText("DC-DC Converter: 400 V → 12 V untuk lampu & aksesori", 40, 650);
}

function drawComparePoster(ctx: CanvasRenderingContext2D, w: number, h: number) {
  posterBase(ctx, w, h, "MOBIL LISTRIK  vs  MOBIL BENSIN", "#b45309");
  const rows: [string, string, string][] = [
    ["Sumber energi", "Baterai (listrik)", "Bensin / solar di tangki"],
    ["Penggerak", "Motor listrik", "Mesin pembakaran dalam"],
    ["Komponen bergerak", "± 20 buah", "± 2.000 buah"],
    ["Transmisi", "1 percepatan", "5–8 percepatan / CVT"],
    ["Efisiensi energi", "± 85–90 %", "± 25–35 %"],
    ["Emisi knalpot", "Tidak ada", "CO₂, CO, NOx"],
    ["Perawatan rutin", "Tanpa oli mesin & busi", "Oli, busi, filter, timing belt"],
    ["Pengereman", "Regeneratif + cakram", "Cakram / tromol"],
  ];
  const x0 = 40;
  const cols = [x0, x0 + 330, x0 + 330 + 430];
  const top = 150;
  const rh = (h - top - 40) / (rows.length + 1);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "900 34px system-ui, sans-serif";
  ctx.fillStyle = "#15803d";
  ctx.fillRect(cols[1] - 14, top, 416, rh - 10);
  ctx.fillStyle = "#b45309";
  ctx.fillRect(cols[2] - 14, top, w - cols[2] - 26, rh - 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("LISTRIK (BEV)", cols[1], top + rh / 2 - 4);
  ctx.fillText("BENSIN (ICE)", cols[2], top + rh / 2 - 4);
  rows.forEach(([k, ev, ice], i) => {
    const y = top + rh * (i + 1);
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(15,23,42,0.06)";
      ctx.fillRect(x0 - 14, y, w - 2 * x0 + 28, rh);
    }
    ctx.font = "800 30px system-ui, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(k, cols[0], y + rh / 2, 310);
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillStyle = "#166534";
    ctx.fillText(ev, cols[1], y + rh / 2, 400);
    ctx.fillStyle = "#9a3412";
    ctx.fillText(ice, cols[2], y + rh / 2, w - cols[2] - 40);
  });
  ctx.textBaseline = "alphabetic";
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#3b82c4");
  g.addColorStop(0.42, "#9cc9ee");
  g.addColorStop(0.5, "#dcefff");
  g.addColorStop(0.52, "#b9d3a8");
  g.addColorStop(1, "#6f9a5a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Dekal datar di atas aspal. */
function FloorDecal({
  position,
  size,
  rotation = 0,
  color = "#ffffff",
  map,
  opacity = 1,
  lift = 0.012,
}: {
  position: [number, number];
  size: [number, number];
  rotation?: number;
  color?: string;
  map?: THREE.Texture;
  opacity?: number;
  lift?: number;
}) {
  return (
    <mesh position={[position[0], lift, position[1]]} rotation={[-Math.PI / 2, 0, rotation]} raycast={noRaycast}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        color={map ? "#ffffff" : color}
        map={map}
        transparent={!!map || opacity < 1}
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        toneMapped={false}
      />
    </mesh>
  );
}

const lampHousing = new RoundedBoxGeometry(3.7, 0.1, 0.8, 4, 0.045);
const lampDiffuser = new RoundedBoxGeometry(3.5, 0.1, 0.62, 5, 0.048);
const beamGeometry = new RoundedBoxGeometry(1, 0.3, 0.25, 4, 0.06);

// Jendela sungguhan (dinding berlubang + kaca bening) hanya di dinding samping, dua per sisi
const SIDE_WINDOWS_Z = [-10, -2];
const WIN_W = 3.2;
const WIN_Y0 = 3.6;
const WIN_Y1 = 5.2;

/** Potongan kotak dinding dengan UV yang diskalakan, supaya pola panel dinding tetap sama ukurannya. */
function wallPiece(len: number, h: number, fullLen: number) {
  const g = new THREE.BoxGeometry(0.3, h, len);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / fullLen), uv.getY(i) * (h / HALL.h));
  return g;
}
const sideWallPieces = (() => {
  const D = HALL.z1 - HALL.z0;
  const out: { geo: THREE.BufferGeometry; y: number; z: number }[] = [];
  const cz = (HALL.z0 + HALL.z1) / 2;
  out.push({ geo: wallPiece(D, WIN_Y0, D), y: WIN_Y0 / 2, z: cz });
  out.push({ geo: wallPiece(D, HALL.h - WIN_Y1, D), y: (WIN_Y1 + HALL.h) / 2, z: cz });
  const edges = [HALL.z0, ...SIDE_WINDOWS_Z.flatMap((z) => [z - WIN_W / 2, z + WIN_W / 2]), HALL.z1];
  for (let i = 0; i < edges.length; i += 2) {
    const len = edges[i + 1] - edges[i];
    if (len > 0.01) out.push({ geo: wallPiece(len, WIN_Y1 - WIN_Y0, D), y: (WIN_Y0 + WIN_Y1) / 2, z: (edges[i] + edges[i + 1]) / 2 });
  }
  return out;
})();
const winFrameGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
const glassMaterial = new THREE.MeshStandardMaterial({ color: "#cfe8ff", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });

/** Jendela pada dinding samping (sumbu Z): kusen aluminium, satu tiang tengah, kaca bening. */
function GlassWindow({ position, width, height }: { position: [number, number, number]; width: number; height: number }) {
  const f = 0.08; // tebal kusen
  const frame = <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />;
  return (
    <group position={position}>
      <mesh material={glassMaterial} raycast={noRaycast} rotation={[0, Math.PI / 2, 0]} renderOrder={5}>
        <planeGeometry args={[width, height]} />
      </mesh>
      {[height / 2, -height / 2].map((y) => (
        <mesh key={y} geometry={winFrameGeo} position={[0, y, 0]} scale={[0.36, f, width + f]} raycast={noRaycast}>
          {frame}
        </mesh>
      ))}
      {[width / 2, -width / 2, 0].map((z) => (
        <mesh key={z} geometry={winFrameGeo} position={[0, 0, z]} scale={[0.36, height, z === 0 ? f * 0.6 : f]} raycast={noRaycast}>
          {frame}
        </mesh>
      ))}
    </group>
  );
}

export function TestLabEnvironment() {
  const W = HALL.x1 - HALL.x0;
  const D = HALL.z1 - HALL.z0;
  const cx = (HALL.x0 + HALL.x1) / 2;
  const cz = (HALL.z0 + HALL.z1) / 2;

  const asphalt = useCanvasTexture(512, 512, drawAsphalt, [W / 4, D / 4]);
  const wallBack = useCanvasTexture(256, 256, drawWall, [W / 2, 2]);
  const wallSide = useCanvasTexture(256, 256, drawWall, [D / 2, 2]);
  const hazard = useCanvasTexture(512, 64, drawHazard, [LANE_LEN / 2.4, 1]);
  const checker = useCanvasTexture(64, 64, drawChecker, [1, LANE_HALF]);
  const sign = useCanvasTexture(2048, 320, drawSign);
  const safety = useCanvasTexture(1024, 768, drawSafetyPoster);
  const flow = useCanvasTexture(1280, 720, drawFlowPoster);
  const txtLane = useCanvasTexture(1024, 128, floorText("LINTASAN UJI", "rgba(248,250,252,0.9)"));
  const txtObserver = useCanvasTexture(1024, 128, floorText("AREA PENGAMAT", "rgba(250,204,21,0.95)"));
  const txtCharge = useCanvasTexture(1024, 128, floorText("EV CHARGING", "rgba(255,255,255,0.95)"));

  const txtRead = useCanvasTexture(1024, 128, floorText("POJOK BACA", "rgba(125,211,252,0.95)"));
  const txtQuiz = useCanvasTexture(1024, 128, floorText("TANYA JAWAB", "rgba(125,211,252,0.95)"));
  const txtExhibit = useCanvasTexture(1024, 128, floorText("ETALASE KOMPONEN EV", "rgba(125,211,252,0.95)"));
  const txtChassis = useCanvasTexture(1024, 128, floorText("RANGKA & RODA EV", "rgba(125,211,252,0.95)"));
  const txtNonEv = useCanvasTexture(2048, 128, floorText("BENGKEL NON-EV · MESIN BENSIN", "rgba(253,186,116,0.95)"));
  const txtBattery = useCanvasTexture(1024, 128, floorText("RESTORASI BATERAI", "rgba(74,222,128,0.95)"));
  const txtSolar = useCanvasTexture(1024, 128, floorText("ENERGI SURYA", "rgba(251,191,36,0.95)"));
  const txtGame = useCanvasTexture(1024, 128, floorText("GAME RAKIT MOBIL EV", "rgba(250,204,21,0.95)"));
  const compare = useCanvasTexture(1280, 900, drawComparePoster);
  const sky = useCanvasTexture(16, 256, drawSky);

  // Tembok dan aset menahan pemain dari sisi mana pun; keluar-masuk hanya lewat pintu depan
  useEffect(() => {
    worldBounds.current = { boxes: SOLIDS, limit: { minX: -85, maxX: 95, minZ: -85, maxZ: 85 } };
    return () => {
      worldBounds.current = null;
    };
  }, []);

  const trussZ = [-12, -8, -4, 0, 4];
  const columnX = [HALL.x0 + 0.35, HALL.x1 - 0.35];

  return (
    <group name="TestLabEnvironment">
      {/* ================= LANTAI ASPAL ================= */}
      <mesh position={[cx, 0.008, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={asphalt} color="#b9bdc6" roughness={0.95} metalness={0.02} />
      </mesh>
      {/* Tampak luar gedung, tanah, dan halaman */}
      <LabBuilding hall={HALL} />

      {/* ----- Lintasan uji (sepanjang X) ----- */}
      <FloorDecal position={[0, LANE_Z - LANE_HALF]} size={[LANE_LEN, 0.12]} />
      <FloorDecal position={[0, LANE_Z + LANE_HALF]} size={[LANE_LEN, 0.12]} />
      {Array.from({ length: 10 }, (_, i) => (
        <FloorDecal key={i} position={[-9 + i * 2, LANE_Z]} size={[0.9, 0.1]} color="#e5e7eb" opacity={0.55} />
      ))}
      <FloorDecal position={[-LANE_LEN / 2 + 0.4, LANE_Z]} size={[0.6, LANE_HALF * 2]} map={checker} />
      <FloorDecal position={[LANE_LEN / 2 - 0.4, LANE_Z]} size={[0.6, LANE_HALF * 2]} map={checker} />
      {/* Garis aman bergaris kuning-hitam antara pengamat dan lintasan */}
      <FloorDecal position={[0, LANE_Z + LANE_HALF + 0.45]} size={[LANE_LEN, 0.3]} map={hazard} />
      <FloorDecal position={[0, LANE_Z - LANE_HALF - 0.45]} size={[LANE_LEN, 0.3]} map={hazard} />
      <FloorDecal position={[0, LANE_Z - LANE_HALF - 1.5]} size={[6.4, 0.8]} map={txtLane} />

      {/* ----- Area pengamat (tempat pemain mulai) ----- */}
      {(
        [
          [[0, -2.55], [7, 0.1]],
          [[0, 2.2], [7, 0.1]],
          [[-3.5, -0.175], [0.1, 4.85]],
          [[3.5, -0.175], [0.1, 4.85]],
        ] as [[number, number], [number, number]][]
      ).map(([p, s], i) => (
        <FloorDecal key={i} position={p} size={s} color="#facc15" />
      ))}
      <FloorDecal position={[0, -1.7]} size={[5.2, 0.65]} map={txtObserver} />

      {/* ----- Area pengisian ----- */}
      <FloorDecal position={[9.5, -11]} size={[6.4, 4.6]} color="#15803d" opacity={0.5} />
      {[6.3, 9.5, 12.7].map((x) => (
        <FloorDecal key={x} position={[x, -11]} size={[0.1, 4.6]} lift={0.016} />
      ))}
      <FloorDecal position={[9.5, -8.25]} size={[4.6, 0.58]} map={txtCharge} lift={0.016} />

      {/* ================= HANGGAR ================= */}
      {/* Dinding belakang */}
      <mesh position={[cx, HALL.h / 2, HALL.z0 - 0.15]}>
        <boxGeometry args={[W + 0.6, HALL.h, 0.3]} />
        <meshStandardMaterial map={wallBack} roughness={0.75} />
      </mesh>
      {/* Dinding kiri & kanan, masing-masing dengan dua jendela kaca bening (terlihat tembus) */}
      {[HALL.x0 - 0.15, HALL.x1 + 0.15].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {sideWallPieces.map((pc, i) => (
            <mesh key={i} geometry={pc.geo} position={[0, pc.y, pc.z]}>
              <meshStandardMaterial map={wallSide} roughness={0.75} />
            </mesh>
          ))}
          {SIDE_WINDOWS_Z.map((z) => (
            <GlassWindow key={z} position={[0, (WIN_Y0 + WIN_Y1) / 2, z]} width={WIN_W} height={WIN_Y1 - WIN_Y0} />
          ))}
        </group>
      ))}
      {/* Dinding depan dengan bukaan pintu besar (X -5..5, tinggi 4.6) */}
      {[
        [(HALL.x0 - 5) / 2, HALL.h / 2, HALL.x0 * -1 - 5, HALL.h],
        [(HALL.x1 + 5) / 2, HALL.h / 2, HALL.x1 - 5, HALL.h],
        [0, 4.6 + (HALL.h - 4.6) / 2, 10, HALL.h - 4.6],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, HALL.z1 + 0.15]}>
          <boxGeometry args={[w, h, 0.3]} />
          <meshStandardMaterial color="#cbd2db" roughness={0.75} />
        </mesh>
      ))}
      {/* Rangka pintu */}
      <mesh position={[0, 4.68, HALL.z1 - 0.02]} raycast={noRaycast}>
        <boxGeometry args={[10.4, 0.16, 0.1]} />
        <meshStandardMaterial map={hazard} roughness={0.6} />
      </mesh>

      {/* Lis bawah gelap + garis aksen sian sekeliling dinding */}
      {(
        [
          [cx, HALL.z0 + 0.02, W, 0],
          [HALL.x0 + 0.02, cz, D, Math.PI / 2],
          [HALL.x1 - 0.02, cz, D, Math.PI / 2],
        ] as [number, number, number, number][]
      ).map(([x, z, len, rot], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, rot, 0]}>
          <mesh position={[0, 0.6, 0]} raycast={noRaycast}>
            <boxGeometry args={[len, 1.2, 0.04]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.26, 0]} raycast={noRaycast}>
            <boxGeometry args={[len, 0.1, 0.05]} />
            <meshBasicMaterial color="#22d3ee" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Kolom baja */}
      {trussZ.map((z) =>
        columnX.map((x) => (
          <mesh key={`${x}:${z}`} position={[x, HALL.h / 2, z]} raycast={noRaycast}>
            <cylinderGeometry args={[0.2, 0.2, HALL.h, 24]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.45} />
          </mesh>
        )),
      )}

      {/* Plafon, rangka atap, dan lampu */}
      <mesh position={[cx, HALL.h, cz]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#111827" roughness={0.9} />
      </mesh>
      {trussZ.map((z) => (
        <group key={z} position={[cx, 0, z]}>
          <mesh geometry={beamGeometry} position={[0, HALL.h - 0.35, 0]} scale={[W, 1, 1]} raycast={noRaycast}>
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.45} />
          </mesh>
          {Array.from({ length: Math.round(W / 6.3) }, (_, i) => (i + 0.5) * (W / Math.round(W / 6.3)) - W / 2).map((x) => (
            <group key={x} position={[x, HALL.h - 0.85, 0]}>
              {/* lampu digantung tepat di bawah balok atap: rumah lampu + penutup membulat + 2 batang */}
              <mesh geometry={lampHousing} position={[0, 0.07, 0]} raycast={noRaycast}>
                <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh geometry={lampDiffuser} raycast={noRaycast}>
                <meshBasicMaterial color="#f8fafc" toneMapped={false} />
              </mesh>
              {[-1.3, 1.3].map((dx) => (
                <mesh key={dx} position={[dx, 0.235, 0]} raycast={noRaycast}>
                  <cylinderGeometry args={[0.015, 0.015, 0.23, 12]} />
                  <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      {/* Cahaya dalam ruangan (tanpa bayangan agar ringan) */}
      <pointLight position={[0, 5.6, -6]} intensity={16} distance={22} decay={2} color="#eaf4ff" />
      <pointLight position={[0, 5.6, 1]} intensity={7} distance={18} decay={2} color="#fff7ed" />
      <pointLight position={[19, 5.6, -5]} intensity={14} distance={20} decay={2} color="#eaf4ff" />

      {/* ================= PAPAN & POSTER ================= */}
      {/* papan nama di atas, poster di bawahnya: tidak saling menindih */}
      <mesh position={[0, 5.05, HALL.z0 + 0.03]} raycast={noRaycast}>
        <planeGeometry args={[14, 2.19]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      {/* Poster dipasang di tengah antar-kolom (kolom tiap 4 m) supaya tidak tertutup tiang */}
      <mesh position={[HALL.x0 + 0.06, 2.75, -6]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[3.0, 2.25]} />
        <meshBasicMaterial map={safety} toneMapped={false} />
      </mesh>
      <mesh position={[HALL.x1 - 0.06, 2.75, -6]} rotation={[0, -Math.PI / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[3.2, 1.8]} />
        <meshBasicMaterial map={flow} toneMapped={false} />
      </mesh>

      {/* ================= STASIUN BELAJAR ================= */}
      {/* ----- Zona EV: etalase komponen (kiri depan) ----- */}
      <FloorDecal position={[-8.2, 1.05]} size={[5.2, 0.58]} map={txtExhibit} />
      <ExhibitStand
        model="baterai"
        title="Paket Baterai Traksi"
        subtitle="Komponen EV"
        accent="#22c55e"
        position={[-6.4, 0, -1.3]}
        facing={0.35}
        size={1.9}
        tilt={-0.6}
        facts={[
          "Ratusan sel lithium-ion dirangkai menjadi modul, tegangan ±400–800 V.",
          "Dipasang di lantai mobil agar titik berat rendah.",
          "Dipantau BMS dan didinginkan cairan agar suhu stabil.",
        ]}
      />
      <ExhibitStand
        model="motor-listrik"
        title="Motor Listrik (Dinamo)"
        subtitle="Komponen EV"
        accent="#f97316"
        position={[-10.2, 0, -1.3]}
        facing={0.55}
        size={1.5}
        facts={[
          "Motor listrik, inverter, dan gigi reduksi dalam satu unit (e-axle).",
          "Lilitan tembaga stator menghasilkan medan putar yang memutar rotor.",
          "Saat mengerem, motor menjadi generator dan mengisi baterai.",
        ]}
      />

      <ExhibitStand
        model="inverter"
        title="Inverter & Elektronika Daya"
        subtitle="Komponen EV"
        accent="#38bdf8"
        position={[-12.5, 0, 2.0]}
        facing={Math.PI / 2}
        size={1.3}
        facts={[
          "Mengubah arus searah (DC) baterai menjadi arus bolak-balik (AC) 3 fasa untuk motor.",
          "Mengatur kecepatan dan torsi motor ribuan kali per detik.",
          "Rumah bersirip membuang panas; label oranye menandai tegangan tinggi.",
        ]}
      />
      <ExhibitStand
        model="motor-ev"
        low
        title="Sepeda Motor Listrik"
        subtitle="Kendaraan listrik roda dua"
        accent="#a78bfa"
        position={[6.6, 0, 3.5]}
        facing={-Math.PI / 2}
        size={2.1}
        facts={[
          "Prinsipnya sama dengan mobil listrik: baterai, pengendali (controller), dan motor.",
          "Baterai di tengah rangka; motor memutar roda belakang lewat rantai atau langsung di roda.",
          "Tanpa kopling, tanpa knalpot, dan torsi langsung besar sejak putaran nol.",
        ]}
      />

      {/* ----- Zona EV: rangka & roda tanpa bodi (kanan tengah) ----- */}
      <FloorDecal position={[9.3, 1.3]} size={[4.4, 0.52]} map={txtChassis} rotation={Math.PI} />
      <ExhibitStand
        model="sasis"
        low
        title="Rangka & Roda EV"
        subtitle="Sasis mobil listrik contoh"
        accent="#38bdf8"
        position={[9.3, 0, -1.5]}
        size={3.0}
        facts={[
          "Rangka yang sama dengan di dalam mobil contoh, ditampilkan tanpa bodi.",
          "Baterai rata di lantai; motor menyatu dengan poros roda.",
          "Tanpa mesin, tangki, knalpot, dan poros kopel.",
        ]}
      />

      {/* ----- Bengkel non-EV untuk perbandingan (belakang kiri) ----- */}
      <FloorDecal position={[-3.75, -11.85]} size={[19.9, 3.9]} color="#b45309" opacity={0.22} />
      <FloorDecal position={[-2.4, -10.25]} size={[8.6, 0.54]} map={txtNonEv} lift={0.016} />
      <Lift position={[-9.5, 0, -11]} armHeight={1.12} loadOffset={-0.34}>
        <StaticModel model="sasis-bensin" size={3.5} position={[0, 0, 0]} rotation={Math.PI / 2} />
      </Lift>
      <InfoSign
        position={[-7.1, 0, -9.35]}
        title="Sasis Tangga (Non-EV)"
        subtitle="Bengkel non-EV"
        accent="#f59e0b"
        facts={[
          "Rangka baja memanjang menopang mesin, transmisi, gardan, dan tangki.",
          "Tenaga mesin di depan dikirim ke roda belakang lewat poros kopel.",
          "Tekan tombol NAIK / TURUN di tiang lift untuk melihat bagian bawahnya.",
        ]}
      />
      <ExhibitStand
        model="mesin-bensin"
        title="Mesin Bensin 4 Silinder"
        subtitle="Bengkel non-EV"
        accent="#f59e0b"
        position={[-5.6, 0, -12.4]}
        size={1.35}
        facts={[
          "Membakar campuran bensin dan udara di dalam silinder (4 langkah).",
          "Ribuan komponen bergerak: piston, katup, poros engkol, poros nok.",
          "Butuh oli, pendingin, busi, dan knalpot; efisiensi hanya ±25–35 %.",
        ]}
      />
      <ExhibitStand
        model="mesin-v8"
        title="Mesin V8"
        subtitle="Bengkel non-EV"
        accent="#f59e0b"
        position={[-3.3, 0, -12.4]}
        size={1.3}
        facts={[
          "Delapan silinder tersusun bentuk V untuk tenaga besar.",
          "Sabuk dan puli memutar alternator, pompa air, dan kompresor AC.",
          "Pada EV semua itu digerakkan listrik, tanpa sabuk mesin.",
        ]}
      />
      <ExhibitStand
        model="piston"
        title="Piston & Batang Torak"
        subtitle="Bengkel non-EV"
        accent="#f59e0b"
        position={[-1.0, 0, -12.4]}
        size={1.0}
        facts={[
          "Ledakan pembakaran mendorong piston naik-turun.",
          "Batang torak mengubah gerak naik-turun menjadi putaran poros engkol.",
          "Motor listrik langsung berputar, jadi tidak punya piston.",
        ]}
      />
      <ExhibitStand
        model="rem"
        title="Rem Cakram & Kaliper"
        subtitle="Dipakai EV dan non-EV"
        accent="#ef4444"
        position={[1.3, 0, -12.4]}
        size={0.95}
        facts={[
          "Kaliper menjepit cakram sehingga energi gerak menjadi panas.",
          "Mobil bensin hanya mengandalkan rem gesek seperti ini.",
          "EV mengerem dulu dengan motor (regeneratif), jadi kampas rem lebih awet.",
        ]}
      />
      <ExhibitStand
        model="sasis-mesin"
        low
        title="Rangka Mobil Bermesin Bensin"
        subtitle="Bengkel non-EV"
        accent="#f59e0b"
        position={[4.3, 0, -11.9]}
        size={2.8}
        facts={[
          "Mesin di depan, lalu transmisi, poros kopel, dan gardan ke roda.",
          "Perlu tangki bahan bakar, knalpot, dan radiator besar.",
          "Bandingkan dengan Rangka & Roda EV di sisi kanan lab.",
        ]}
      />
      {/* Poster perbandingan di dinding belakang */}
      <mesh position={[4.3, 2.45, HALL.z0 + 0.04]} raycast={noRaycast}>
        <planeGeometry args={[3.1, 2.18]} />
        <meshBasicMaterial map={compare} toneMapped={false} />
      </mesh>

      {/* ----- Sudut energi surya (belakang kanan): baterai penyimpanan, inverter, papan alur ----- */}
      <FloorDecal position={[18.6, -12.3]} size={[5.2, 0.55]} map={txtSolar} />
      <EnergyRoom position={[14.9, 0, HALL.z0]} wallZ={HALL.z0} />

      {/* ----- Game restorasi baterai (depan sayap kanan) ----- */}
      <FloorDecal position={[18.8, 2.7]} size={[4.6, 0.55]} map={txtBattery} />
      <BatteryGame position={[18.8, 0, 4.4]} facing={Math.PI} />

      {/* ----- Game merakit mobil listrik (sayap kanan) ----- */}
      <FloorDecal position={[19, 0.6]} size={[5.6, 0.6]} map={txtGame} />
      <AssemblyGame position={[19, 0, -5.6]} screen={{ position: [HALL.x1 - 19 - 0.1, 2.7, 3.6], rotationY: -Math.PI / 2 }} />

      {/* Tanya jawab (dinding depan kiri) */}
      <FloorDecal position={[-9.5, 2.6]} size={[3.6, 0.5]} map={txtQuiz} rotation={Math.PI} />
      <QuizStation position={[-9.5, 0, 5.2]} facing={Math.PI} />

      {/* Pojok baca (dinding depan kanan) */}
      <FloorDecal position={[9.5, 2.05]} size={[3.4, 0.5]} map={txtRead} rotation={Math.PI} />
      <ReadingCorner position={[9.5, 0, 5.72]} />

      {/* ================= PERALATAN ================= */}
      <DiagnosticCart position={[6.7, 0, -9.5]} rotation={-0.5} />
      <SafetyStation position={[HALL.x1 - 0.2, 0, 2]} />
      <Extinguisher position={[HALL.x0 + 0.45, 0, -9.6]} />
      <Extinguisher position={[5.6, 0, HALL.z1 - 0.45]} />

      {/* ----- Area pengisian: charger asli dari aset pemilik ----- */}
      {/* punggung charger DC terbuka, jadi ditempel ke dinding belakang */}
      <StaticModel model="charger" size={2.0} position={[7.9, 0, HALL.z0 + 0.33]} />
      <StaticModel model="stasiun-cas" size={1.9} position={[11.1, 0, -13.0]} />
      <InfoSign
        position={[9.5, 0, -12.9]}
        title="Pengisian Daya EV"
        subtitle="Area pengisian"
        accent="#22c55e"
        facts={[
          "Kiri: charger DC cepat — arus searah langsung ke baterai, 20–80 % dalam ±30 menit.",
          "Kanan: stasiun AC — lewat On-Board Charger di mobil, cocok untuk parkir lama.",
          "Kabel tetap terkunci selama pengisian dan arus baru mengalir setelah mobil memberi izin.",
        ]}
      />
      <ExhibitStand
        model="konektor"
        title="Konektor CCS2"
        subtitle="Area pengisian"
        accent="#22c55e"
        position={[12.9, 0, -9.7]}
        facing={-Math.PI / 2}
        size={0.75}
        facts={[
          "Dua pin besar di bawah untuk DC cepat, bagian atas (Type 2) untuk AC.",
          "Pin kecil dipakai mobil dan charger untuk saling berkomunikasi.",
          "Standar pengisian cepat yang dipakai di Indonesia.",
        ]}
      />
      <Workshop position={[HALL.x0 + 0.75, 0, -1.6]} />

      {/* ================= LUAR GEDUNG: langit, rumput, taman, pohon ================= */}
      <mesh raycast={noRaycast} position={[0, 0, 0]}>
        <sphereGeometry args={[220, 24, 16]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} toneMapped={false} fog={false} depthWrite={false} />
      </mesh>
      {/* lintasan aspal ala ujian SIM mengelilingi gedung + mobil yang berkeliling */}
      <DrivingTrack loop={TRACK} />
      {/* area parkir, SPBU, dan perbandingan mobil bensin vs listrik di sisi barat */}
      <ParkingArea hall={HALL} />
      <Scenery
        model="pohon"
        size={8.5}
        places={[
          [-11.5, 13, 0.4],
          [14, 14, 2.6, 1.1],
          [-19.5, -2, 4.0, 0.9],
          [29.5, -14, 1.1, 1.0],
          [5, 31, 5.2, 1.25],
          [-32, -12, 3.1, 1.1],
          [42, 16, 0.7, 1.15],
          [-4, -33, 2.0, 1.2],
        ]}
      />

      {[-10, -6.5, 6.2, 12.6].map((x) => (
        <Cone key={`a${x}`} position={[x, 0, LANE_Z + LANE_HALF + 0.95]} />
      ))}
      {[-10, -5, 0, 5, 10].map((x) => (
        <Cone key={`b${x}`} position={[x, 0, LANE_Z - LANE_HALF - 0.95]} />
      ))}
      <Barrier position={[-11.6, 0, LANE_Z]} rotation={Math.PI / 2} />
      <Barrier position={[11.6, 0, LANE_Z]} rotation={Math.PI / 2} />
    </group>
  );
}
