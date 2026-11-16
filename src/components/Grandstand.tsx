import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { playVRClickSound } from "../lib/vrAudio";
import { playerTeleport, type Box } from "../lib/worldBounds";
import { Btn } from "./BatteryGame";

/**
 * Tribun penonton Sirkuit Uji Termal (sisi selatan oval, menghadap utara).
 *
 * 8 baris bertingkat (naik 42 cm, dalam 85 cm; baris teratas 1,4 m untuk lorong belakang), kursi
 * ember berwarna, dua lorong tangga dengan anak tangga setengah + pegangan, dinding samping miring,
 * dinding belakang, pagar depan, dan atap kantilever dengan papan nama.
 *
 * Lantainya bisa dinaiki: `grandstandFloor(x, z)` memberi tinggi lantai untuk pemain (lihat
 * worldBounds.floor). Tombol "DUDUK DI ATAS" di kedua ujung lorong depan memindahkan pemain ke kursi
 * pantau di tengah baris teratas (lantai 3,36 m → mata ± 4,6 m) yang melihat seluruh oval; tombol
 * "TURUN" di sebelah kursi itu mengembalikan pemain ke depan papan simulasi.
 */

const noRaycast = () => null;

/** Tata letak (meter, koordinat dunia). */
const GS = {
  hw: 12, // setengah lebar
  front: -42.3, // tepi depan lorong depan (pagar)
  walk: 1.0, // lorong depan di permukaan tanah
  rows: 8,
  depth: 0.85,
  rise: 0.42,
  top: 1.4, // kedalaman baris teratas
  wall: 0.25,
  aisles: [-6, 6], // pusat lorong tangga
  aisleW: 1.1,
};
const Z_ROW0 = GS.front + GS.walk;
const rowStart = (k: number) => Z_ROW0 + k * GS.depth;
const Z_BACK = rowStart(GS.rows - 1) + GS.top;
const TOP_Y = GS.rows * GS.rise; // 3,36 m
const inAisle = (x: number) => GS.aisles.some((a) => Math.abs(x - a) < GS.aisleW / 2);

/** Tempat duduk pantau: tengah baris teratas. */
const SEAT = { x: 0, z: rowStart(GS.rows - 1) + 0.5 };
/** Arah pandang dari kursi ke tengah oval (5, -66). */
const SEAT_YAW = -Math.atan2(5 - SEAT.x, -(-66 - SEAT.z));

/** Tinggi lantai tribun di (x, z); 0 di luar tribun. */
export function grandstandFloor(x: number, z: number) {
  if (Math.abs(x) > GS.hw || z < Z_ROW0 || z > Z_BACK) return 0;
  const k = Math.min(GS.rows - 1, Math.floor((z - Z_ROW0) / GS.depth));
  const local = z - rowStart(k);
  if (inAisle(x) && local < GS.depth / 2) return k * GS.rise + GS.rise / 2;
  return (k + 1) * GS.rise;
}

const W = GS.wall;
export const GRANDSTAND_SOLIDS: Box[] = [
  // pagar depan
  { minX: -GS.hw - W, maxX: GS.hw + W, minZ: GS.front - W, maxZ: GS.front },
  // dinding samping (lorong depan tetap terbuka di kedua ujung)
  { minX: -GS.hw - W, maxX: -GS.hw, minZ: Z_ROW0, maxZ: Z_BACK + W },
  { minX: GS.hw, maxX: GS.hw + W, minZ: Z_ROW0, maxZ: Z_BACK + W },
  // dinding belakang
  { minX: -GS.hw - W, maxX: GS.hw + W, minZ: Z_BACK, maxZ: Z_BACK + W },
  // tiang tombol di kedua ujung
  { minX: GS.hw + 0.9, maxX: GS.hw + 1.5, minZ: GS.front + 0.2, maxZ: GS.front + 0.6 },
  { minX: -GS.hw - 1.5, maxX: -GS.hw - 0.9, minZ: GS.front + 0.2, maxZ: GS.front + 0.6 },
];

/* ---------------- geometri (dibuat sekali) ---------------- */

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Badan beton bertingkat: baris dipotong di lorong, lorong diberi anak tangga setengah. */
function buildConcrete() {
  const parts: THREE.BufferGeometry[] = [];
  const cuts = [-GS.hw, ...GS.aisles.flatMap((a) => [a - GS.aisleW / 2, a + GS.aisleW / 2]), GS.hw];
  for (let k = 0; k < GS.rows; k++) {
    const z0 = rowStart(k);
    const d = k === GS.rows - 1 ? GS.top : GS.depth;
    const h = (k + 1) * GS.rise;
    for (let i = 0; i < cuts.length; i += 2) {
      const x0 = cuts[i], x1 = cuts[i + 1];
      parts.push(box(x1 - x0, h, d, (x0 + x1) / 2, h / 2, z0 + d / 2));
    }
    for (const a of GS.aisles) {
      const hh = k * GS.rise + GS.rise / 2;
      parts.push(box(GS.aisleW, hh, GS.depth / 2, a, hh / 2, z0 + GS.depth / 4));
      parts.push(box(GS.aisleW, h, d - GS.depth / 2, a, h / 2, z0 + GS.depth / 2 + (d - GS.depth / 2) / 2));
    }
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Garis kuning penanda tepi anak tangga di lorong. */
function buildNosing() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < GS.rows; k++) {
    for (const a of GS.aisles) {
      parts.push(box(GS.aisleW - 0.06, 0.012, 0.06, a, k * GS.rise + GS.rise / 2 + 0.006, rowStart(k) + 0.03));
      parts.push(box(GS.aisleW - 0.06, 0.012, 0.06, a, (k + 1) * GS.rise + 0.006, rowStart(k) + GS.depth / 2 + 0.03));
    }
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Kursi ember: dudukan + sandaran + kaki (menghadap -Z). */
function buildSeat() {
  const pan = new RoundedBoxGeometry(0.46, 0.07, 0.42, 2, 0.03).translate(0, 0.43, 0);
  const back = new RoundedBoxGeometry(0.46, 0.4, 0.06, 2, 0.03).rotateX(-0.12).translate(0, 0.66, 0.22);
  const leg = new THREE.BoxGeometry(0.08, 0.4, 0.26).translate(0, 0.2, 0.05);
  const g = mergeGeometries([pan.toNonIndexed(), back.toNonIndexed(), leg.toNonIndexed()])!;
  [pan, back, leg].forEach((p) => p.dispose());
  return g;
}

type Seat = { x: number; y: number; z: number; c: string };
function seatList(): Seat[] {
  const out: Seat[] = [];
  const palette = ["#1d4ed8", "#1d4ed8", "#2563eb", "#0891b2", "#0891b2", "#2563eb", "#1d4ed8", "#1e40af"];
  for (let k = 0; k < GS.rows; k++) {
    const top = k === GS.rows - 1;
    for (let x = -GS.hw + 0.45; x <= GS.hw - 0.44; x += 0.56) {
      if (GS.aisles.some((a) => Math.abs(x - a) < GS.aisleW / 2 + 0.25)) continue;
      if (top && Math.abs(x - SEAT.x) < 1.15) continue; // kursi pantau dibuat terpisah
      // huruf "EV" dari kursi oranye di blok tengah
      const c = (k === 3 || k === 4) && Math.abs(x) < 4.5 && Math.round((x + 12) / 0.56) % 3 === 0 ? "#f97316" : palette[k];
      out.push({ x, y: k * GS.rise + GS.rise, z: rowStart(k) + 0.5, c });
    }
  }
  return out;
}

/** Profil dinding samping (bidang z–y) sebagai ExtrudeGeometry. */
function buildSideWall() {
  const s = new THREE.Shape();
  s.moveTo(Z_ROW0, 0);
  s.lineTo(Z_ROW0, GS.rise + 1.0);
  s.lineTo(rowStart(GS.rows - 1), TOP_Y + 1.1);
  s.lineTo(Z_BACK + W, TOP_Y + 1.1);
  s.lineTo(Z_BACK + W, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
  // bentuk x→dunia z, bentuk y→dunia y, ketebalan → -x
  g.rotateY(-Math.PI / 2);
  return g;
}

function drawSign() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const gr = ctx.createLinearGradient(0, 0, 2048, 0);
  gr.addColorStop(0, "#0f172a");
  gr.addColorStop(0.5, "#1e3a8a");
  gr.addColorStop(1, "#0f172a");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 2048, 128);
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(0, 118, 2048, 10);
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = "TRIBUN  ·  SIRKUIT UJI TERMAL  ·  SMART VOCATIONAL EV";
  let size = 76;
  do {
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 1900 && size > 30);
  ctx.fillText(text, 1024, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function drawHint(lines: string[], bg: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 52px system-ui, sans-serif";
  ctx.fillText(lines[0], 256, 70);
  ctx.font = "600 34px system-ui, sans-serif";
  lines.slice(1).forEach((l, i) => ctx.fillText(l, 256, 140 + i * 48));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pipa lurus dari a ke b. */
function Tube({ a, b, r = 0.035, color = "#cbd5e1" }: { a: [number, number, number]; b: [number, number, number]; r?: number; color?: string }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    return {
      pos: va.clone().add(vb).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
      len: dir.length(),
    };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} raycast={noRaycast}>
      <cylinderGeometry args={[r, r, len, 10]} />
      <meshStandardMaterial color={color} metalness={0.85} roughness={0.3} />
    </mesh>
  );
}

const sitTop = () => {
  playVRClickSound();
  playerTeleport.pending = { x: SEAT.x, z: SEAT.z, yaw: SEAT_YAW };
};
const goDown = () => {
  playVRClickSound();
  playerTeleport.pending = { x: 24, z: -37.6, yaw: 0 };
};

/** Tiang tombol di ujung lorong depan. */
function SitPost({ x }: { x: number }) {
  const hint = useMemo(() => drawHint(["TRIBUN", "Duduk di baris teratas,", "lihat seluruh sirkuit"], "#1e3a8a"), []);
  useEffect(() => () => hint.dispose(), [hint]);
  return (
    <group position={[x, 0, GS.front + 0.4]}>
      <mesh position={[0, 0.55, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.5, 1.1, 0.3]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.55, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.95, 0.5, 0.06]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, 1.55, 0.032]} raycast={noRaycast}>
        <planeGeometry args={[0.9, 0.45]} />
        <meshBasicMaterial map={hint} toneMapped={false} />
      </mesh>
      <group position={[0, 1.12, 0.17]} rotation={[-0.35, 0, 0]} scale={2}>
        <Btn name={`duduk_${x > 0 ? "timur" : "barat"}`} label="DUDUK DI ATAS" color="#16a34a" prefix="Tribun_btn_" position={[0, 0, 0]} onPress={sitTop} />
      </group>
    </group>
  );
}

export function Grandstand() {
  const concrete = useMemo(buildConcrete, []);
  const nosing = useMemo(buildNosing, []);
  const seatGeo = useMemo(buildSeat, []);
  const sideWall = useMemo(buildSideWall, []);
  const seats = useMemo(seatList, []);
  const sign = useMemo(drawSign, []);
  const seatsRef = useRef<THREE.InstancedMesh>(null);
  useEffect(
    () => () => {
      [concrete, nosing, seatGeo, sideWall].forEach((g) => g.dispose());
      sign.dispose();
    },
    [concrete, nosing, seatGeo, sideWall, sign],
  );
  useLayoutEffect(() => {
    const m = seatsRef.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    seats.forEach((s, i) => {
      o.position.set(s.x, s.y, s.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(s.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [seats]);

  // atap kantilever: belakang tinggi 8,4 m, depan 7,9 m (tidak menghalangi pandangan dari baris teratas)
  const RB = 8.4, RF = 7.9;
  const roofBack = Z_BACK + 0.6, roofFront = GS.front - 0.4;
  const roofLen = roofBack - roofFront;
  const roofTilt = Math.atan2(RB - RF, roofLen);
  const roofMid: [number, number, number] = [0, (RB + RF) / 2, (roofBack + roofFront) / 2];
  const masts = [-12, -4, 4, 12];
  const zMast = Z_BACK + 0.6;

  return (
    <group name="Grandstand">
      {/* badan beton bertingkat */}
      <mesh geometry={concrete} raycast={noRaycast}>
        <meshStandardMaterial color="#a8b0bb" roughness={0.9} />
      </mesh>
      <mesh geometry={nosing} raycast={noRaycast}>
        <meshBasicMaterial color="#facc15" toneMapped={false} />
      </mesh>
      {/* kursi */}
      <instancedMesh ref={seatsRef} args={[seatGeo, undefined, seats.length]} raycast={noRaycast}>
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      {/* kursi pantau di tengah baris teratas */}
      <mesh geometry={seatGeo} position={[SEAT.x, TOP_Y, SEAT.z]} rotation={[0, SEAT_YAW, 0]} raycast={noRaycast}>
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.25} roughness={0.4} />
      </mesh>
      <group position={[SEAT.x - 0.85, TOP_Y, rowStart(GS.rows - 1) + 0.12]}>
        <mesh position={[0, 0.42, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.14, 0.84, 0.14]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
        </mesh>
        <group position={[0, 0.92, 0.04]} rotation={[-0.5, 0, 0]} scale={1.6}>
          <Btn name="turun" label="TURUN" color="#dc2626" prefix="Tribun_btn_" position={[0, 0, 0]} onPress={goDown} />
        </group>
      </group>

      {/* dinding samping miring */}
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <mesh geometry={sideWall} position={[sd > 0 ? GS.hw + W : -GS.hw, 0, 0]} raycast={noRaycast}>
            <meshStandardMaterial color="#1e3a8a" roughness={0.6} metalness={0.2} />
          </mesh>
          <Tube a={[sd * (GS.hw + W / 2), GS.rise + 1.04, Z_ROW0]} b={[sd * (GS.hw + W / 2), TOP_Y + 1.14, rowStart(GS.rows - 1)]} r={0.045} />
        </group>
      ))}
      {/* dinding belakang + pagar atas */}
      <mesh position={[0, (TOP_Y + 1.1) / 2, Z_BACK + W / 2]} raycast={noRaycast}>
        <boxGeometry args={[2 * GS.hw + 2 * W, TOP_Y + 1.1, W]} />
        <meshStandardMaterial color="#1e3a8a" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 2.3, Z_BACK + W + 0.012]} raycast={noRaycast}>
        <planeGeometry args={[20, 1.25]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[0, TOP_Y + 1.12, Z_BACK + W / 2]} raycast={noRaycast}>
        <boxGeometry args={[2 * GS.hw + 2 * W, 0.05, W + 0.06]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.4} />
      </mesh>

      {/* pegangan tangga di tengah lorong */}
      {GS.aisles.map((a) => (
        <group key={a}>
          <Tube a={[a, GS.rise / 2 + 0.9, Z_ROW0 + 0.2]} b={[a, TOP_Y - GS.rise / 2 + 0.9, rowStart(GS.rows - 1) + 0.2]} />
          {Array.from({ length: 4 }, (_, i) => {
            const k = 1 + i * 2;
            return <Tube key={i} a={[a, k * GS.rise + GS.rise / 2, rowStart(k) + 0.2]} b={[a, k * GS.rise + GS.rise / 2 + 0.9, rowStart(k) + 0.2]} r={0.03} />;
          })}
        </group>
      ))}

      {/* pagar depan: tiang + dua pipa + panel kaca */}
      {Array.from({ length: 13 }, (_, i) => -GS.hw + i * 2).map((x) => (
        <mesh key={x} position={[x, 0.55, GS.front - W / 2]} raycast={noRaycast}>
          <boxGeometry args={[0.07, 1.1, 0.07]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      <Tube a={[-GS.hw, 1.1, GS.front - W / 2]} b={[GS.hw, 1.1, GS.front - W / 2]} r={0.04} />
      <Tube a={[-GS.hw, 0.15, GS.front - W / 2]} b={[GS.hw, 0.15, GS.front - W / 2]} r={0.03} />
      <mesh position={[0, 0.62, GS.front - W / 2]} raycast={noRaycast}>
        <boxGeometry args={[2 * GS.hw, 0.9, 0.02]} />
        <meshStandardMaterial color="#bae6fd" transparent opacity={0.25} roughness={0.05} metalness={0.2} depthWrite={false} />
      </mesh>

      {/* atap kantilever: tiang di belakang, batang tarik ke tepi depan */}
      {masts.map((x) => (
        <group key={x}>
          <mesh position={[x, 5.2, zMast]} raycast={noRaycast}>
            <boxGeometry args={[0.32, 10.4, 0.32]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.7} roughness={0.35} />
          </mesh>
          <Tube a={[x, 10.3, zMast]} b={[x, RF + 0.15, roofFront + 1.5]} r={0.04} color="#94a3b8" />
          <Tube a={[x, 10.3, zMast]} b={[x, RF + 0.35, roofFront + roofLen * 0.55]} r={0.04} color="#94a3b8" />
          {/* balok atap */}
          <mesh position={[x, roofMid[1] - 0.22, roofMid[2]]} rotation={[roofTilt, 0, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.2, 0.36, roofLen]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <mesh position={roofMid} rotation={[roofTilt, 0, 0]} raycast={noRaycast}>
        <boxGeometry args={[2 * GS.hw + 1.2, 0.12, roofLen]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.3} roughness={0.55} />
      </mesh>
      {/* lampu bawah atap */}
      {[0.25, 0.6].map((f) => (
        <mesh key={f} position={[0, RB - (RB - RF) * (1 - f) - 0.08 - 0.25, roofBack - roofLen * (1 - f)]} rotation={[Math.PI / 2 + roofTilt, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[2 * GS.hw - 1, 0.12]} />
          <meshBasicMaterial color="#fef9c3" toneMapped={false} />
        </mesh>
      ))}
      {/* papan nama di tepi depan atap */}
      <group position={[0, RF - 0.28, roofFront - 0.02]}>
        <mesh raycast={noRaycast}>
          <boxGeometry args={[2 * GS.hw + 1.2, 0.72, 0.1]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 0, -0.055]} rotation={[0, Math.PI, 0]} raycast={noRaycast}>
          <planeGeometry args={[2 * GS.hw + 1.1, 0.66]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.055]} raycast={noRaycast}>
          <planeGeometry args={[2 * GS.hw + 1.1, 0.66]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      </group>

      {/* tombol duduk di kedua ujung lorong depan */}
      <SitPost x={GS.hw + 1.2} />
      <SitPost x={-GS.hw - 1.2} />
    </group>
  );
}
