import { useEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * Lingkungan "Ruang Uji Kendaraan Listrik".
 *
 * Seluruhnya dibuat dari bentuk dasar + tekstur kanvas (tanpa file yang diunduh), jadi ringan
 * untuk Meta Quest dan HP: lantai aspal bermarka, lintasan uji, hanggar baja dengan lampu
 * plafon, stasiun pengisian, kerucut & pembatas, bengkel kecil, serta poster materi.
 *
 * Tata letak (meter, titik mulai pemain di 0,0,0 menghadap -Z):
 *   hanggar  : X -14..14, Z -14..6, tinggi 7
 *   lintasan : sepanjang sumbu X pada Z = -6 (tempat contoh mobil berjalan)
 */

const HALL = { x0: -14, x1: 14, z0: -14, z1: 6, h: 7 };
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

function drawChargerScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#22c55e";
  ctx.textAlign = "center";
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.fillText("DC FAST", w / 2, 70);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText("CCS2 · 120 kW", w / 2, 130);
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 8;
  ctx.strokeRect(40, 170, w - 80, 46);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(46, 176, (w - 92) * 0.8, 34);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText("SIAP DIGUNAKAN", w / 2, 250);
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

function Charger({ position }: { position: [number, number, number] }) {
  const screen = useCanvasTexture(512, 288, drawChargerScreen);
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.9, 0.12, 0.7]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[0.7, 1.8, 0.45]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.94, 0]}>
        <boxGeometry args={[0.74, 0.08, 0.49]} />
        <meshStandardMaterial color="#16a34a" emissive="#16a34a" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 1.4, 0.228]} raycast={noRaycast}>
        <planeGeometry args={[0.52, 0.29]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.9, 0.228]} raycast={noRaycast}>
        <planeGeometry args={[0.5, 0.06]} />
        <meshBasicMaterial color="#22c55e" toneMapped={false} />
      </mesh>
      {/* Kabel & konektor */}
      <mesh position={[0.36, 0.95, 0.1]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <torusGeometry args={[0.42, 0.022, 8, 20, Math.PI]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>
      <mesh position={[0.37, 0.98, 0.5]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.07, 0.2, 0.1]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Cone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.34, 0.04, 0.34]} />
        <meshStandardMaterial color="#c2410c" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <coneGeometry args={[0.13, 0.56, 14]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.062, 0.088, 0.11, 14]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

function Barrier({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * 0.8, 0.4, 0]}>
          <boxGeometry args={[0.8, 0.8, 0.42]} />
          <meshStandardMaterial color={i === 0 ? "#f8fafc" : "#dc2626"} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function Workshop({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Lemari perkakas */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.6, 1.1, 1.2]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.4} metalness={0.4} />
      </mesh>
      {[0.2, 0.45, 0.7, 0.95].map((y) => (
        <mesh key={y} position={[0.305, y, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.02, 0.03, 0.9]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {/* Meja kerja */}
      <mesh position={[0.05, 0.86, 2.2]}>
        <boxGeometry args={[0.8, 0.08, 2.2]} />
        <meshStandardMaterial color="#92400e" roughness={0.7} />
      </mesh>
      {[1.25, 3.15].map((z) => (
        <mesh key={z} position={[0.05, 0.41, z]}>
          <boxGeometry args={[0.7, 0.82, 0.08]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* Modul baterai peraga di atas meja */}
      <mesh position={[0.05, 1.0, 2.0]}>
        <boxGeometry args={[0.45, 0.2, 0.7]} />
        <meshStandardMaterial color="#22c55e" roughness={0.5} />
      </mesh>
      <mesh position={[0.05, 0.96, 2.85]}>
        <cylinderGeometry args={[0.14, 0.14, 0.26, 16]} />
        <meshStandardMaterial color="#f97316" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Tumpukan ban */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.25, 0.13 + i * 0.25, -2.2]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.12, 10, 20]} />
          <meshStandardMaterial color="#111827" roughness={0.95} />
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

  const trussZ = [-12, -8, -4, 0, 4];
  const columnX = [HALL.x0 + 0.35, HALL.x1 - 0.35];

  return (
    <group name="TestLabEnvironment">
      {/* ================= LANTAI ASPAL ================= */}
      <mesh position={[cx, 0.008, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={asphalt} color="#b9bdc6" roughness={0.95} metalness={0.02} />
      </mesh>
      {/* Lantai beton di luar pintu */}
      <mesh position={[cx, 0.004, HALL.z1 + 4]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[W + 6, 8]} />
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>

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
      {/* Dinding kiri & kanan */}
      {[HALL.x0 - 0.15, HALL.x1 + 0.15].map((x) => (
        <mesh key={x} position={[x, HALL.h / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[D, HALL.h, 0.3]} />
          <meshStandardMaterial map={wallSide} roughness={0.75} />
        </mesh>
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
            <boxGeometry args={[0.4, HALL.h, 0.4]} />
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
          <mesh position={[0, HALL.h - 0.35, 0]} raycast={noRaycast}>
            <boxGeometry args={[W, 0.3, 0.25]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.45} />
          </mesh>
          {[-9, -3, 3, 9].map((x) => (
            <mesh key={x} position={[x, HALL.h - 0.75, 2]} raycast={noRaycast}>
              <boxGeometry args={[3.6, 0.08, 0.7]} />
              <meshBasicMaterial color="#f8fafc" toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Cahaya dalam ruangan (tanpa bayangan agar ringan) */}
      <pointLight position={[0, 5.6, -6]} intensity={16} distance={22} decay={2} color="#eaf4ff" />
      <pointLight position={[0, 5.6, 1]} intensity={7} distance={18} decay={2} color="#fff7ed" />

      {/* ================= PAPAN & POSTER ================= */}
      <mesh position={[0, 4.7, HALL.z0 + 0.03]} raycast={noRaycast}>
        <planeGeometry args={[14, 2.19]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[HALL.x0 + 0.06, 2.75, -6]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[3.6, 2.7]} />
        <meshBasicMaterial map={safety} toneMapped={false} />
      </mesh>
      <mesh position={[HALL.x1 - 0.06, 2.75, -3]} rotation={[0, -Math.PI / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[4.6, 2.59]} />
        <meshBasicMaterial map={flow} toneMapped={false} />
      </mesh>

      {/* ================= PERALATAN ================= */}
      <Charger position={[7.9, 0, -13.2]} />
      <Charger position={[11.1, 0, -13.2]} />
      <Workshop position={[HALL.x0 + 0.75, 0, -1.6]} />

      {[-10, -6.5, 6.5, 10].map((x) => (
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
