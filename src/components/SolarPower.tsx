import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Listrik lab dari matahari:
 *  - RoofSolarPanels : deretan panel surya di atap lengkung gedung (satu InstancedMesh, ringan)
 *  - EnergyRoom      : sudut energi di dalam lab — inverter surya, lemari baterai penyimpanan,
 *                      panel listrik, pipa kabel ke atap & lampu, dan papan alur energi yang hidup
 *                      (daya panel, isi baterai, dan pemakaian lampu berubah perlahan).
 */

const noRaycast = () => null;
type Vec3 = [number, number, number];

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/* ------------------------------------------------------------------ */
/*  Panel surya di atap                                                */
/* ------------------------------------------------------------------ */

const PANEL_W = 1.66; // melintang atap (mengikuti lengkung)
const PANEL_L = 0.99; // sepanjang gedung
const panelGeometry = new THREE.BoxGeometry(PANEL_W, 0.045, PANEL_L);

/** Atap = setengah elips: x = cx + half·cosθ, y = base + rise·sinθ, memanjang di sumbu Z. */
export function RoofSolarPanels({ cx, base, half, rise, z0, z1 }: { cx: number; base: number; half: number; rise: number; z0: number; z1: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const materials = useMemo(() => {
    const cells = canvasTexture(256, 160, (ctx) => {
      ctx.fillStyle = "#cbd5e1"; // bingkai aluminium
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = "#0b1a3a";
      ctx.fillRect(6, 6, 244, 148);
      // 6 x 10 sel, garis busbar tipis
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 10; c++) {
          const x = 8 + c * 24;
          const y = 8 + r * 24;
          const g = ctx.createLinearGradient(x, y, x + 22, y + 22);
          g.addColorStop(0, "#1e3a8a");
          g.addColorStop(1, "#0f2154");
          ctx.fillStyle = g;
          ctx.fillRect(x, y, 22, 22);
          ctx.fillStyle = "rgba(203,213,225,0.35)";
          ctx.fillRect(x + 7, y, 1, 22);
          ctx.fillRect(x + 15, y, 1, 22);
        }
    });
    const frame = new THREE.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.8, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ map: cells, metalness: 0.35, roughness: 0.18, envMapIntensity: 1.2 });
    // urutan muka BoxGeometry: +x, −x, +y (atas), −y, +z, −z
    return [frame, frame, glass, frame, frame, frame];
  }, []);
  useEffect(() => () => materials.forEach((m) => (m as THREE.MeshStandardMaterial).map?.dispose()), [materials]);

  const placements = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    // dua sayap panel di kiri-kanan bubungan, dengan lorong perawatan di tengah gedung
    const cols: number[] = [];
    for (let x = 2.4; x <= half - 2.6; x += PANEL_W + 0.06) cols.push(x, -x);
    const rows: number[] = [];
    const zMid = (z0 + z1) / 2;
    for (let z = z0 + 1.0; z <= z1 - 1.0; z += PANEL_L + 0.05) if (Math.abs(z - zMid) > 0.7) rows.push(z);
    for (const dx of cols) {
      const c = Math.max(-1, Math.min(1, dx / half));
      const th = Math.acos(c);
      // normal permukaan elips → kemiringan panel mengikuti atap
      const nx = Math.cos(th) / half;
      const ny = Math.sin(th) / rise;
      const tilt = Math.atan2(nx, ny);
      const len = Math.hypot(nx, ny);
      q.setFromAxisAngle(zAxis, -tilt);
      for (const z of rows) {
        pos.set(cx + dx + (nx / len) * 0.12, base + rise * Math.sin(th) + (ny / len) * 0.12, z);
        out.push(new THREE.Matrix4().compose(pos, q, scl));
      }
    }
    return out;
  }, [cx, base, half, rise, z0, z1]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    placements.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [placements]);

  return <instancedMesh key={placements.length} ref={mesh} args={[panelGeometry, materials, placements.length]} raycast={noRaycast} />;
}

/* ------------------------------------------------------------------ */
/*  Sudut energi di dalam lab                                          */
/* ------------------------------------------------------------------ */

const cabinetGeometry = new RoundedBoxGeometry(0.86, 1.9, 0.6, 5, 0.045);
const inverterGeometry = new RoundedBoxGeometry(0.72, 0.92, 0.24, 5, 0.04);
const panelBoxGeometry = new RoundedBoxGeometry(0.56, 0.74, 0.16, 4, 0.03);
const conduitGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 14);
const elbowGeometry = new THREE.TorusGeometry(0.12, 0.035, 10, 16, Math.PI / 2);

function drawCabinetFace(ctx: CanvasRenderingContext2D) {
  const W = 256;
  const H = 560;
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  (ctx as any).roundRect ? (ctx.beginPath(), (ctx as any).roundRect(24, 40, W - 48, 120, 14), ctx.fill()) : ctx.fillRect(24, 40, W - 48, 120);
  ctx.fillStyle = "#22c55e";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BATERAI", W / 2, 88);
  ctx.fillText("PENYIMPANAN", W / 2, 124);
  // kisi ventilasi
  ctx.fillStyle = "#9ca3af";
  for (let i = 0; i < 9; i++) ctx.fillRect(40, 220 + i * 26, W - 80, 9);
  // simbol baterai
  ctx.strokeStyle = "#16a34a";
  ctx.lineWidth = 8;
  ctx.strokeRect(78, 470, 92, 46);
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(170, 484, 10, 18);
  ctx.fillRect(86, 478, 60, 30);
}

function drawInverterFace(ctx: CanvasRenderingContext2D) {
  const W = 256;
  const H = 330;
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(30, 34, W - 60, 96);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "800 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("INVERTER SURYA", W / 2, 72);
  ctx.fillStyle = "#4ade80";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText("DC → AC  ·  ON", W / 2, 106);
  // matahari + gelombang AC
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(84, 220, 26, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(84 + Math.cos(a) * 36, 220 + Math.sin(a) * 36);
    ctx.lineTo(84 + Math.cos(a) * 48, 220 + Math.sin(a) * 48);
    ctx.stroke();
  }
  ctx.strokeStyle = "#0ea5e9";
  ctx.beginPath();
  for (let x = 0; x <= 80; x++) ctx.lineTo(146 + x, 220 - Math.sin((x / 80) * Math.PI * 2) * 22);
  ctx.stroke();
}

type Flow = { solar: number; soc: number; load: number; t: number };

function drawEnergyBoard(ctx: CanvasRenderingContext2D, f: Flow) {
  const W = 1280;
  const H = 720;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0b1220";
  ctx.beginPath();
  (ctx as any).roundRect?.(6, 6, W - 12, H - 12, 36) ?? ctx.rect(6, 6, W - 12, H - 12);
  ctx.fill();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fbbf24";
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.fillText("LISTRIK LAB DARI MATAHARI", 52, 40);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillText("Panel surya di atap mengisi baterai dan menyalakan lampu lab", 52, 106);

  const boxes: { x: number; title: string; sub: string; value: string; color: string }[] = [
    { x: 52, title: "PANEL SURYA", sub: "di atap · pembangkit", value: `${f.solar.toFixed(1)} kW`, color: "#f59e0b" },
    { x: 352, title: "INVERTER", sub: "DC → AC", value: "97 % efisien", color: "#38bdf8" },
    { x: 652, title: "BATERAI", sub: "penyimpanan 60 kWh", value: `${Math.round(f.soc)} %`, color: "#22c55e" },
    { x: 952, title: "LAMPU & ALAT", sub: "beban lab", value: `${f.load.toFixed(1)} kW`, color: "#e2e8f0" },
  ];
  const by = 200;
  const bw = 276;
  const bh = 230;
  boxes.forEach((b, i) => {
    ctx.fillStyle = "#111c33";
    ctx.beginPath();
    (ctx as any).roundRect?.(b.x, by, bw, bh, 24) ?? ctx.rect(b.x, by, bw, bh);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = b.color;
    ctx.font = "900 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(b.title, b.x + bw / 2, by + 28, bw - 24);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 24px system-ui, sans-serif";
    ctx.fillText(b.sub, b.x + bw / 2, by + 76, bw - 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 46px system-ui, sans-serif";
    ctx.fillText(b.value, b.x + bw / 2, by + 140, bw - 24);
    // panah alir + titik bergerak
    if (i < boxes.length - 1) {
      const x0 = b.x + bw + 4;
      const x1 = boxes[i + 1].x - 4;
      const y = by + bh / 2;
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1 - 12, y);
      ctx.stroke();
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x1 - 16, y - 12);
      ctx.lineTo(x1 - 16, y + 12);
      ctx.fill();
      ctx.fillStyle = b.color;
      for (let k = 0; k < 2; k++) {
        const u = (f.t * 0.8 + k * 0.5) % 1;
        ctx.beginPath();
        ctx.arc(x0 + (x1 - 16 - x0) * u, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  // bar isi baterai
  ctx.textAlign = "left";
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(652, by + bh + 22, bw, 22);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(652, by + bh + 22, (bw * f.soc) / 100, 22);

  const charging = f.solar > f.load;
  ctx.fillStyle = charging ? "#4ade80" : "#fbbf24";
  ctx.font = "800 32px system-ui, sans-serif";
  ctx.fillText(
    charging ? "Siang: daya panel lebih besar dari pemakaian → sisanya mengisi baterai." : "Daya panel kurang (berawan): baterai ikut menyuplai lampu.",
    52,
    520,
    W - 104,
  );
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillText("Malam hari lampu lab memakai listrik yang disimpan baterai siang tadi.", 52, 572, W - 104);
  ctx.fillText("Prinsipnya sama dengan mobil listrik: energi disimpan baterai, diubah inverter.", 52, 616, W - 104);
}

export function EnergyRoom({ position, wallZ }: { position: Vec3; /** z dinding belakang (lokal = dunia) */ wallZ: number }) {
  const cabinetFace = useMemo(() => canvasTexture(256, 560, drawCabinetFace), []);
  const inverterFace = useMemo(() => canvasTexture(256, 330, drawInverterFace), []);
  const board = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { c, t };
  }, []);
  useEffect(
    () => () => {
      cabinetFace.dispose();
      inverterFace.dispose();
      board.t.dispose();
    },
    [cabinetFace, inverterFace, board],
  );

  const leds = useRef<THREE.Mesh[]>([]);
  const lastDraw = useRef(-1);
  const flow = useRef<Flow>({ solar: 8.4, soc: 72, load: 3.1, t: 0 });

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    const f = flow.current;
    f.t += delta;
    // awan lewat: daya panel naik-turun perlahan; beban lampu hampir tetap
    f.solar = Math.max(1.2, 8.2 + Math.sin(t * 0.13) * 2.6 + Math.sin(t * 0.41) * 0.9);
    f.load = 3.0 + Math.sin(t * 0.07) * 0.3;
    f.soc = Math.min(98, Math.max(35, f.soc + (f.solar - f.load) * delta * 0.04));
    if (t - lastDraw.current > 0.25) {
      lastDraw.current = t;
      drawEnergyBoard(board.c.getContext("2d")!, f);
      board.t.needsUpdate = true;
    }
    // LED isi baterai di lemari berkedip pelan saat mengisi
    const lit = Math.round((f.soc / 100) * 5);
    leds.current.forEach((m, i) => {
      if (!m) return;
      const mat = m.material as THREE.MeshBasicMaterial;
      const on = i % 5 < lit;
      const blink = i % 5 === lit - 1 && f.solar > f.load ? 0.55 + 0.45 * Math.sin(t * 4) : 1;
      mat.color.set(on ? "#22c55e" : "#1f2937").multiplyScalar(on ? blink : 1);
    });
  });

  const [x] = position;
  const wz = wallZ + 0.02; // muka dinding bagian dalam
  return (
    <group name="EnergyRoom">
      {/* ---- tiga lemari baterai penyimpanan ---- */}
      {[0, 1, 2].map((i) => {
        const cxp = x + i * 0.98;
        const cz = wz + 0.32;
        return (
          <group key={i} position={[cxp, 0, cz]}>
            <mesh geometry={cabinetGeometry} position={[0, 0.98, 0]}>
              <meshStandardMaterial color="#e5e7eb" metalness={0.35} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.98, 0.301]} raycast={noRaycast}>
              <planeGeometry args={[0.74, 1.62]} />
              <meshStandardMaterial map={cabinetFace} roughness={0.5} />
            </mesh>
            {/* 5 LED isi baterai */}
            {[0, 1, 2, 3, 4].map((k) => (
              <mesh
                key={k}
                ref={(m) => {
                  if (m) leds.current[i * 5 + k] = m;
                }}
                position={[-0.16 + k * 0.08, 1.48, 0.305]}
                raycast={noRaycast}
              >
                <circleGeometry args={[0.022, 14]} />
                <meshBasicMaterial color="#22c55e" toneMapped={false} />
              </mesh>
            ))}
            {/* alas */}
            <mesh position={[0, 0.02, 0]} raycast={noRaycast}>
              <boxGeometry args={[0.9, 0.04, 0.64]} />
              <meshStandardMaterial color="#334155" roughness={0.7} />
            </mesh>
          </group>
        );
      })}

      {/* ---- inverter surya & panel listrik di dinding ---- */}
      <group position={[x + 3.2, 1.75, wz + 0.12]}>
        <mesh geometry={inverterGeometry}>
          <meshStandardMaterial color="#f1f5f9" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.02, 0.121]} raycast={noRaycast}>
          <planeGeometry args={[0.64, 0.82]} />
          <meshStandardMaterial map={inverterFace} roughness={0.5} />
        </mesh>
        {/* sirip pendingin di sisi */}
        {[-1, 1].map((sd) =>
          [0, 1, 2, 3, 4].map((k) => (
            <mesh key={`${sd}${k}`} position={[sd * 0.375, -0.3 + k * 0.15, -0.02]} raycast={noRaycast}>
              <boxGeometry args={[0.03, 0.1, 0.18]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.35} />
            </mesh>
          )),
        )}
      </group>
      <group position={[x + 4.25, 1.55, wz + 0.08]}>
        <mesh geometry={panelBoxGeometry}>
          <meshStandardMaterial color="#9ca3af" metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.2, 0.081]} raycast={noRaycast}>
          <planeGeometry args={[0.4, 0.12]} />
          <meshBasicMaterial color="#facc15" toneMapped={false} />
        </mesh>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} position={[-0.15 + k * 0.1, -0.05, 0.085]} raycast={noRaycast}>
            <boxGeometry args={[0.06, 0.16, 0.03]} />
            <meshStandardMaterial color="#1f2937" roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* ---- pipa kabel: dari atap turun ke inverter, inverter → baterai, panel → lampu ---- */}
      {(
        [
          // [x, yBawah, yAtas]
          [x + 3.2, 2.21, 7.0],
          [x + 4.25, 1.92, 7.0],
        ] as [number, number, number][]
      ).map(([px, y0, y1]) => (
        <mesh key={px} geometry={conduitGeometry} position={[px, (y0 + y1) / 2, wz + 0.12]} scale={[1, y1 - y0, 1]} raycast={noRaycast}>
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* inverter turun lalu belok ke atas lemari baterai */}
      <mesh geometry={conduitGeometry} position={[x + 3.2, 1.07, wz + 0.12]} scale={[1, 0.38, 1]} raycast={noRaycast}>
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh geometry={elbowGeometry} position={[x + 3.08, 0.88, wz + 0.12]} rotation={[0, 0, Math.PI]} raycast={noRaycast}>
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh geometry={conduitGeometry} position={[(x + 2.36 + x + 3.08) / 2, 0.76, wz + 0.12]} rotation={[0, 0, Math.PI / 2]} scale={[1, 3.08 - 2.36, 1]} raycast={noRaycast}>
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* ---- papan alur energi ---- */}
      <group position={[x + 7.0, 2.6, wz + 0.04]}>
        <mesh position={[0, 0, -0.02]} raycast={noRaycast}>
          <boxGeometry args={[3.3, 1.92, 0.04]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh raycast={noRaycast}>
          <planeGeometry args={[3.2, 1.8]} />
          <meshBasicMaterial map={board.t} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
