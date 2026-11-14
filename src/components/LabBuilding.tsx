import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoofSolarPanels } from "./SolarPower";

/**
 * Tampak luar gedung lab + halaman: atap lengkung, lis & kolom sudut membulat, jendela, kanopi
 * pintu dengan papan nama, jalan paving, bolard, lampu taman, dan tanah.
 *
 * Tanah memakai `public/lab/tanah.webp`: potret tampak-atas aset lantai taman dari pemilik, lalu
 * disambung bercermin (MirroredRepeat) sehingga rapi tanpa garis sambungan dan tanpa menambah
 * segitiga. Semua bagian lain dibuat dari bentuk dasar + tekstur kanvas (± 6 rb segitiga).
 */

const noRaycast = () => null;

type Hall = { x0: number; x1: number; z0: number; z1: number; h: number };

function useDrawn(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    draw(c.getContext("2d")!, width, height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
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

function drawRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // seng gelombang: garis terang-gelap berulang
  for (let x = 0; x < w; x++) {
    const v = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2 * 8);
    const c = Math.round(70 + v * 46);
    ctx.fillStyle = `rgb(${c - 18},${c},${c + 26})`;
    ctx.fillRect(x, 0, 1, h);
  }
}

function drawEntranceSign(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#0b1220");
  g.addColorStop(1, "#13233f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  // petir
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.moveTo(110, 28);
  ctx.lineTo(62, 112);
  ctx.lineTo(98, 112);
  ctx.lineTo(74, 176);
  ctx.lineTo(140, 86);
  ctx.lineTo(102, 86);
  ctx.closePath();
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 86px system-ui, sans-serif";
  ctx.fillText("SMART VOCATIONAL EV LAB", 178, 78, w - 220);
  ctx.fillStyle = "#7dd3fc";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText("Ruang Uji Kendaraan Listrik  ·  Bengkel Pembanding Non-EV", 182, 152, w - 220);
}

function drawPavers(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#8b929c";
  ctx.fillRect(0, 0, w, h);
  const n = 4;
  const s = w / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const off = j % 2 ? s / 2 : 0;
      const v = 150 + ((i * 37 + j * 91) % 5) * 9;
      ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
      for (const x of [i * s + off, i * s + off - w]) {
        ctx.beginPath();
        (ctx as any).roundRect?.(x + 3, j * s + 3, s - 6, s - 6, 7) ?? ctx.rect(x + 3, j * s + 3, s - 6, s - 6);
        ctx.fill();
      }
    }
}

const columnGeometry = new THREE.CylinderGeometry(0.36, 0.36, 1, 20);
const bollardGeometry = new THREE.CapsuleGeometry(0.09, 0.62, 4, 14);

export function LabBuilding({ hall }: { hall: Hall }) {
  const W = hall.x1 - hall.x0;
  const D = hall.z1 - hall.z0;
  const cz = (hall.z0 + hall.z1) / 2;
  const cx = (hall.x0 + hall.x1) / 2;
  const T = 0.3; // tebal dinding

  const roofTex = useDrawn(256, 8, drawRoof, [D / 4, 1]);
  const signTex = useDrawn(2048, 208, drawEntranceSign);
  const paverTex = useDrawn(256, 256, drawPavers, [5, 6]);

  // Tanah: ubin dari aset lantai taman, disambung bercermin
  const ground = useMemo(() => {
    const t = new THREE.TextureLoader().load("/lab/tanah.webp");
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.repeat.set(240 / 3.9, 240 / 3.9);
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => ground.dispose(), [ground]);

  const roof = useMemo(() => {
    // setengah tabung terbuka menghadap ke atas, memanjang sumbu Z
    const g = new THREE.CylinderGeometry(1, 1, D + 1.6, 40, 1, true, Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2);
    return g;
  }, [D]);
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, 1, 1, 0, Math.PI, false, 0);
    s.closePath();
    return new THREE.ShapeGeometry(s, 32);
  }, []);
  const fascia = useMemo(() => new RoundedBoxGeometry(0.5, 0.42, D + 1.9, 3, 0.12), [D]);
  const canopy = useMemo(() => new RoundedBoxGeometry(12, 0.24, 3.0, 3, 0.1), []);
  useEffect(
    () => () => {
      roof.dispose();
      gable.dispose();
      fascia.dispose();
      canopy.dispose();
    },
    [roof, gable, fascia, canopy],
  );

  const HALF = W / 2 + 0.9; // setengah bentang atap (ada teritis)
  const RISE = 3.1;

  return (
    <group name="LabBuilding">
      {/* ================= TANAH & JALAN ================= */}
      <mesh position={[0, -0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[240, 240]} />
        {/* warna pengali meredam cahaya lab yang terang supaya tekstur tidak pucat */}
        <meshStandardMaterial map={ground} color="#8a8f88" roughness={1} metalness={0} />
      </mesh>
      {/* jalan paving menuju pintu + tepi */}
      {/* sedikit masuk ke bawah aspal lintasan supaya tidak ada celah di sambungannya */}
      <mesh position={[0, 0.004, hall.z1 + 6.75]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[11, 13.5]} />
        <meshStandardMaterial map={paverTex} roughness={0.9} />
      </mesh>
      {[-5.6, 5.6].map((x) => (
        <mesh key={x} position={[x, 0.03, hall.z1 + 6.5]} raycast={noRaycast}>
          <boxGeometry args={[0.2, 0.1, 13]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.8} />
        </mesh>
      ))}

      {/* ================= ATAP LENGKUNG ================= */}
      <mesh geometry={roof} position={[cx, hall.h + 0.05, cz]} scale={[HALF, RISE, 1]} raycast={noRaycast}>
        <meshStandardMaterial map={roofTex} metalness={0.55} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      {[hall.z1 + T + 0.5, hall.z0 - T - 0.5].map((z, i) => (
        <mesh key={z} geometry={gable} position={[cx, hall.h + 0.05, z]} rotation={[0, i ? Math.PI : 0, 0]} scale={[HALF, RISE, 1]} raycast={noRaycast}>
          <meshStandardMaterial color="#dbe2ea" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* panel surya di atap: sumber listrik lampu lab (lihat sudut energi di dalam) */}
      <RoofSolarPanels cx={cx} base={hall.h + 0.05} half={HALF} rise={RISE} z0={hall.z0} z1={hall.z1} />
      {/* lisplang membulat di kedua sisi */}
      {[cx - HALF + 0.1, cx + HALF - 0.1].map((x) => (
        <mesh key={x} geometry={fascia} position={[x, hall.h + 0.02, cz]} raycast={noRaycast}>
          <meshStandardMaterial color="#1e3a8a" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* plat penutup teritis (dilihat dari bawah) */}
      <mesh position={[cx, hall.h + 0.03, cz]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[HALF * 2, D + 1.6]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.8} />
      </mesh>

      {/* ================= DINDING LUAR ================= */}
      {/* kolom sudut membulat */}
      {[hall.x0 - T / 2, hall.x1 + T / 2].map((x) =>
        [hall.z0 - T / 2, hall.z1 + T / 2].map((z) => (
          <mesh key={`${x}:${z}`} geometry={columnGeometry} position={[x, hall.h / 2, z]} scale={[1, hall.h, 1]} raycast={noRaycast}>
            <meshStandardMaterial color="#475569" metalness={0.55} roughness={0.45} />
          </mesh>
        )),
      )}
      {/* lis bawah gelap + garis aksen sian (samping & belakang) */}
      {(
        [
          [hall.x0 - T - 0.05, cz, D + 0.5, Math.PI / 2],
          [hall.x1 + T + 0.05, cz, D + 0.5, Math.PI / 2],
          [cx, hall.z0 - T - 0.05, W + 0.5, 0],
        ] as [number, number, number, number][]
      ).map(([x, z, len, rot], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, rot, 0]}>
          <mesh position={[0, 0.55, 0]} raycast={noRaycast}>
            <boxGeometry args={[len, 1.1, 0.12]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.16, 0]} raycast={noRaycast}>
            <boxGeometry args={[len, 0.1, 0.14]} />
            <meshBasicMaterial color="#22d3ee" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* ================= MUKA DEPAN ================= */}
      {/* lis bawah depan (kiri & kanan pintu) */}
      {[
        [(hall.x0 - 5.4) / 2, -hall.x0 - 5.4],
        [(hall.x1 + 5.4) / 2, hall.x1 - 5.4],
      ].map(([x, len]) => (
        <group key={x} position={[x, 0, hall.z1 + T + 0.05]}>
          <mesh position={[0, 0.55, 0]} raycast={noRaycast}>
            <boxGeometry args={[len, 1.1, 0.12]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.16, 0]} raycast={noRaycast}>
            <boxGeometry args={[len, 0.1, 0.14]} />
            <meshBasicMaterial color="#22d3ee" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* kusen pintu membulat */}
      {[-5.2, 5.2].map((x) => (
        <mesh key={x} geometry={columnGeometry} position={[x, 2.4, hall.z1 + T]} scale={[0.75, 4.8, 0.75]} raycast={noRaycast}>
          <meshStandardMaterial color="#1e3a8a" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* kanopi + tiang */}
      <mesh geometry={canopy} position={[0, 4.95, hall.z1 + T + 1.5]} raycast={noRaycast}>
        <meshStandardMaterial color="#1e3a8a" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 4.82, hall.z1 + T + 1.5]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[11.4, 2.6]} />
        <meshBasicMaterial color="#f8fafc" toneMapped={false} />
      </mesh>
      {[-5.6, 5.6].map((x) => (
        <mesh key={x} position={[x, 2.42, hall.z1 + T + 2.75]} raycast={noRaycast}>
          <cylinderGeometry args={[0.11, 0.13, 4.84, 16]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {/* papan nama */}
      <mesh position={[0, 5.95, hall.z1 + T + 0.02]} raycast={noRaycast}>
        <planeGeometry args={[11.4, 1.16]} />
        <meshBasicMaterial map={signTex} toneMapped={false} />
      </mesh>

      {/* ================= HALAMAN ================= */}
      {/* bolard di tepi jalan */}
      {[9, 12, 15, 17.6].map((z) =>
        [-5.95, 5.95].map((x) => (
          <group key={`${x}:${z}`} position={[x, 0, z]}>
            <mesh geometry={bollardGeometry} position={[0, 0.36, 0]} raycast={noRaycast}>
              <meshStandardMaterial color="#facc15" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.5, 0]} raycast={noRaycast}>
              <cylinderGeometry args={[0.093, 0.093, 0.1, 14]} />
              <meshStandardMaterial color="#111827" roughness={0.6} />
            </mesh>
          </group>
        )),
      )}
      {/* lampu taman */}
      {[-6.9, 6.9].map((x) => (
        <group key={x} position={[x, 0, 13.5]}>
          <mesh position={[0, 0.06, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.2, 0.24, 0.12, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.9, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.045, 0.07, 3.6, 12]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[-Math.sign(x) * 0.32, 3.72, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <torusGeometry args={[0.32, 0.035, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[-Math.sign(x) * 0.64, 3.62, 0]} scale={[1, 0.6, 1]} raycast={noRaycast}>
            <sphereGeometry args={[0.17, 16, 12]} />
            <meshStandardMaterial color="#fef9c3" emissive="#fde68a" emissiveIntensity={1.2} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
