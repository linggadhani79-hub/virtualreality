import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Peralatan Ruang Uji (buatan sendiri, tanpa berkas unduhan): kerucut, pembatas,
 * bengkel, lift, troli diagnostik, lemari APD, dan APAR.
 *
 * Semua bentuk memakai sudut membulat, profil putar (lathe), kapsul, dan pipa lengkung supaya
 * tidak tampak kotak-kotak, tetapi tetap ringan: seluruh peralatan ± 25 rb segitiga.
 * Badan besar tetap bisa "ditabrak" laser; hiasan kecil memakai raycast kosong.
 */

const noRaycast = () => null;

type Vec3 = [number, number, number];

function useDrawnTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    draw(c.getContext("2d")!, width, height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// Geometri kotak membulat dipakai ulang untuk ukuran yang sama
const roundedCache = new Map<string, RoundedBoxGeometry>();
function roundedBox(w: number, h: number, d: number, r: number) {
  const radius = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const key = `${w}|${h}|${d}|${radius}`;
  let g = roundedCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 6, radius);
    roundedCache.set(key, g);
  }
  return g;
}

/** Kotak dengan sudut membulat. */
function RBox({
  args,
  radius = 0.03,
  solid,
  children,
  ...props
}: {
  args: Vec3;
  radius?: number;
  /** true = ikut menghalangi laser; bawaan: hiasan */
  solid?: boolean;
  children?: React.ReactNode;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
}) {
  return (
    <mesh geometry={roundedBox(args[0], args[1], args[2], radius)} raycast={solid ? undefined : noRaycast} {...props}>
      {children}
    </mesh>
  );
}

/** Pipa / kabel melengkung melalui beberapa titik. */
function Tube({ points, radius, children }: { points: Vec3[]; radius: number; children?: React.ReactNode }) {
  const geometry = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), points.length * 8, radius, 7),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={noRaycast}>
      {children}
    </mesh>
  );
}

function lathe(profile: [number, number][], segments = 40) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

const Steel = ({ color = "#475569" }: { color?: string }) => <meshStandardMaterial color={color} metalness={0.75} roughness={0.35} />;
const Rubber = () => <meshStandardMaterial color="#0b0f17" roughness={0.92} />;

/* ------------------------------------------------------------------ */
/*  Kerucut lalu lintas                                                */
/* ------------------------------------------------------------------ */

const CONE_R = (y: number) => 0.118 - ((y - 0.035) * 0.092) / 0.5;
const coneBody = lathe(
  [
    [0.0, 0.035],
    [0.118, 0.035],
    [CONE_R(0.535), 0.535],
    [0.02, 0.556],
    [0.0, 0.56],
  ],
  20,
);
const coneBase = new RoundedBoxGeometry(0.36, 0.04, 0.36, 6, 0.018);
const coneBandLow = new THREE.CylinderGeometry(CONE_R(0.29) + 0.002, CONE_R(0.2) + 0.002, 0.09, 20, 1, true);
const coneBandHigh = new THREE.CylinderGeometry(CONE_R(0.42) + 0.002, CONE_R(0.36) + 0.002, 0.06, 20, 1, true);

export function Cone({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh geometry={coneBase} position={[0, 0.02, 0]} raycast={noRaycast}>
        <meshStandardMaterial color="#c2410c" roughness={0.8} />
      </mesh>
      <mesh geometry={coneBody}>
        <meshStandardMaterial color="#f97316" roughness={0.55} />
      </mesh>
      <mesh geometry={coneBandLow} position={[0, 0.245, 0]} raycast={noRaycast}>
        <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.25} roughness={0.35} />
      </mesh>
      <mesh geometry={coneBandHigh} position={[0, 0.39, 0]} raycast={noRaycast}>
        <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.25} roughness={0.35} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Pembatas jalan (water barrier)                                     */
/* ------------------------------------------------------------------ */

const barrierGeometry = (() => {
  // penampang pembatas: kaki lebar, pinggang ramping, kepala membulat
  const s = new THREE.Shape();
  s.moveTo(-0.23, 0);
  s.lineTo(0.23, 0);
  s.lineTo(0.23, 0.1);
  s.quadraticCurveTo(0.12, 0.2, 0.1, 0.36);
  s.lineTo(0.09, 0.72);
  s.quadraticCurveTo(0.09, 0.8, 0, 0.8);
  s.quadraticCurveTo(-0.09, 0.8, -0.09, 0.72);
  s.lineTo(-0.1, 0.36);
  s.quadraticCurveTo(-0.12, 0.2, -0.23, 0.1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.74, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -0.37);
  g.rotateY(Math.PI / 2);
  return g;
})();

export function Barrier({ position, rotation = 0 }: { position: Vec3; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1, 0, 1].map((i) => (
        <group key={i} position={[i * 0.8, 0, 0]}>
          <mesh geometry={barrierGeometry}>
            <meshStandardMaterial color={i === 0 ? "#f8fafc" : "#dc2626"} roughness={0.45} />
          </mesh>
          {/* tutup pengisian air */}
          <mesh position={[0, 0.815, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.04, 0.045, 0.03, 28]} />
            <meshStandardMaterial color="#111827" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Bengkel: lemari perkakas, meja kerja, papan alat, tumpukan ban     */
/* ------------------------------------------------------------------ */

function drawPegboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(2,6,23,0.55)";
  for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) ctx.fillRect(x - 3, y - 3, 6, 6);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const tool = (x: number, color: string, drawHead: () => void) => {
    ctx.save();
    ctx.translate(x, 0);
    // gantungan
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-14, 60);
    ctx.lineTo(14, 60);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    drawHead();
    ctx.restore();
  };
  // kunci pas
  tool(90, "#cbd5e1", () => {
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(0, 96);
    ctx.lineTo(0, 300);
    ctx.stroke();
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(0, 78, 26, Math.PI * 0.2, Math.PI * 0.8, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 318, 22, 0, Math.PI * 2);
    ctx.stroke();
  });
  // obeng berisolasi (gagang oranye)
  for (const [x, c] of [
    [200, "#f97316"],
    [270, "#ef4444"],
  ] as [number, string][]) {
    tool(x, c, () => {
      ctx.lineWidth = 30;
      ctx.beginPath();
      ctx.moveTo(0, 76);
      ctx.lineTo(0, 170);
      ctx.stroke();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(0, 186);
      ctx.lineTo(0, 320);
      ctx.stroke();
    });
  }
  // tang berisolasi
  tool(380, "#f97316", () => {
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(-22, 80);
    ctx.quadraticCurveTo(-30, 170, 0, 210);
    ctx.moveTo(22, 80);
    ctx.quadraticCurveTo(30, 170, 0, 210);
    ctx.stroke();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 210);
    ctx.lineTo(-10, 300);
    ctx.moveTo(0, 210);
    ctx.lineTo(10, 300);
    ctx.stroke();
  });
  // multimeter
  tool(520, "#facc15", () => {
    ctx.beginPath();
    (ctx as any).roundRect?.(-54, 70, 108, 220, 18) ?? ctx.rect(-54, 70, 108, 220);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(-38, 88, 76, 56);
    ctx.fillStyle = "#4ade80";
    ctx.font = "800 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("0.0V", 0, 130);
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(0, 214, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 214);
    ctx.lineTo(18, 190);
    ctx.stroke();
  });
  // kunci momen
  tool(650, "#cbd5e1", () => {
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 110);
    ctx.lineTo(0, 330);
    ctx.stroke();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(0, 230);
    ctx.lineTo(0, 330);
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.arc(0, 92, 26, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#facc15";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("PERKAKAS BERISOLASI 1000 V", 28, h - 22);
}

const tireGeometry = new THREE.TorusGeometry(0.25, 0.095, 12, 28);
const rimGeometry = new THREE.CylinderGeometry(0.175, 0.175, 0.15, 20, 1, true);
const motorFins = new THREE.TorusGeometry(0.135, 0.012, 6, 24);

export function Workshop({ position }: { position: Vec3 }) {
  const pegboard = useDrawnTexture(768, 384, drawPegboard);
  return (
    <group position={position}>
      {/* ---------- Lemari perkakas beroda ---------- */}
      <group position={[0.05, 0, -1.05]}>
        <RBox args={[0.6, 0.96, 1.0]} radius={0.035} position={[0, 0.6, 0]} solid>
          <meshStandardMaterial color="#b91c1c" roughness={0.35} metalness={0.45} />
        </RBox>
        <RBox args={[0.64, 0.035, 1.04]} radius={0.015} position={[0, 1.095, 0]}>
          <meshStandardMaterial color="#111827" roughness={0.85} />
        </RBox>
        {[0.25, 0.47, 0.69, 0.91].map((y) => (
          <group key={y} position={[0.3, y, 0]}>
            <RBox args={[0.02, 0.19, 0.9]} radius={0.008}>
              <meshStandardMaterial color="#991b1b" roughness={0.35} metalness={0.45} />
            </RBox>
            <mesh position={[0.022, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
              <capsuleGeometry args={[0.011, 0.7, 3, 16]} />
              <Steel color="#e2e8f0" />
            </mesh>
          </group>
        ))}
        {[
          [-0.22, -0.4],
          [0.22, -0.4],
          [-0.22, 0.4],
          [0.22, 0.4],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.06, z]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.06, 0.06, 0.045, 28]} />
            <Rubber />
          </mesh>
        ))}
      </group>

      {/* ---------- Meja kerja + papan alat ---------- */}
      <group position={[0.05, 0, 0.42]}>
        <RBox args={[0.8, 0.07, 1.8]} radius={0.022} position={[0, 0.885, 0]} solid>
          <meshStandardMaterial color="#9a6a3a" roughness={0.7} />
        </RBox>
        {/* rangka baja */}
        {[-0.82, 0.82].map((z) =>
          [-0.32, 0.32].map((x) => (
            <mesh key={`${x}:${z}`} position={[x, 0.425, z]} raycast={noRaycast}>
              <cylinderGeometry args={[0.028, 0.028, 0.85, 28]} />
              <Steel color="#334155" />
            </mesh>
          )),
        )}
        <RBox args={[0.68, 0.03, 1.66]} radius={0.012} position={[0, 0.24, 0]}>
          <Steel color="#334155" />
        </RBox>
        {/* kotak perkakas di rak bawah */}
        <RBox args={[0.34, 0.22, 0.5]} radius={0.03} position={[0.02, 0.37, -0.4]}>
          <meshStandardMaterial color="#1d4ed8" roughness={0.45} metalness={0.3} />
        </RBox>
        <mesh position={[0.02, 0.5, -0.4]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <torusGeometry args={[0.07, 0.012, 10, 28, Math.PI]} />
          <Steel color="#cbd5e1" />
        </mesh>
        {/* papan alat menempel di dinding */}
        <RBox args={[0.03, 0.82, 1.64]} radius={0.012} position={[-0.38, 1.62, 0]}>
          <meshStandardMaterial color="#0f172a" roughness={0.7} />
        </RBox>
        <mesh position={[-0.362, 1.62, 0]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast}>
          <planeGeometry args={[1.58, 0.79]} />
          <meshBasicMaterial map={pegboard} toneMapped={false} />
        </mesh>

        {/* modul baterai peraga */}
        <group position={[0, 0.92, -0.35]}>
          <RBox args={[0.42, 0.18, 0.62]} radius={0.025} position={[0, 0.09, 0]}>
            <meshStandardMaterial color="#16a34a" roughness={0.45} metalness={0.2} />
          </RBox>
          <RBox args={[0.36, 0.02, 0.56]} radius={0.008} position={[0, 0.19, 0]}>
            <meshStandardMaterial color="#0f172a" roughness={0.5} />
          </RBox>
          {[-0.2, 0.2].map((z, i) => (
            <mesh key={z} position={[0.1, 0.215, z]} raycast={noRaycast}>
              <cylinderGeometry args={[0.022, 0.022, 0.035, 28]} />
              <meshStandardMaterial color={i === 0 ? "#dc2626" : "#111827"} roughness={0.4} metalness={0.4} />
            </mesh>
          ))}
          <Tube
            radius={0.012}
            points={[
              [0.1, 0.23, 0.2],
              [0.16, 0.3, 0.3],
              [0.2, 0.1, 0.42],
              [0.12, 0.012, 0.56],
              [-0.05, 0.012, 0.66],
            ]}
          >
            <meshStandardMaterial color="#ea580c" roughness={0.55} />
          </Tube>
        </group>

        {/* motor listrik peraga: rumah bersirip + poros */}
        <group position={[0, 1.07, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh raycast={noRaycast}>
            <cylinderGeometry args={[0.13, 0.13, 0.3, 28]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.35} />
          </mesh>
          {[-0.1, -0.05, 0, 0.05, 0.1].map((y) => (
            <mesh key={y} geometry={motorFins} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
              <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.4} />
            </mesh>
          ))}
          {[-0.165, 0.165].map((y) => (
            <mesh key={y} position={[0, y, 0]} raycast={noRaycast}>
              <cylinderGeometry args={[0.115, 0.115, 0.03, 28]} />
              <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.45} />
            </mesh>
          ))}
          <mesh position={[0, 0.25, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.022, 0.022, 0.16, 28]} />
            <Steel color="#e2e8f0" />
          </mesh>
          {/* dudukan */}
          <RBox args={[0.24, 0.26, 0.03]} radius={0.01} position={[0, 0, 0.135]}>
            <Steel color="#334155" />
          </RBox>
        </group>
      </group>

      {/* ---------- Tumpukan ban ---------- */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[0.2, 0.095 + i * 0.195, -2.02]} rotation={[0, i * 0.4, 0]}>
          <mesh geometry={tireGeometry} rotation={[Math.PI / 2, 0, 0]}>
            <Rubber />
          </mesh>
          <mesh geometry={rimGeometry} raycast={noRaycast}>
            <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.4} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Lift dua tiang                                                     */
/* ------------------------------------------------------------------ */

function drawLiftPanel(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  ctx.font = "900 34px system-ui, sans-serif";
  ctx.fillText("LIFT", w / 2, 30);
  const arrow = (cy: number, up: boolean) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const d = up ? -1 : 1;
    ctx.moveTo(w / 2, cy + d * 30);
    ctx.lineTo(w / 2 - 34, cy - d * 22);
    ctx.lineTo(w / 2 + 34, cy - d * 22);
    ctx.closePath();
    ctx.fill();
  };
  arrow(128, true);
  arrow(288, false);
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.fillText("NAIK", w / 2, 200);
  ctx.fillText("TURUN", w / 2, 360);
}

const LIFT_MIN = 0.42;
const LIFT_MAX = 1.75;

/**
 * Lift dua tiang. Tombol NAIK / TURUN di tiang kanan menggerakkan lengan angkat beserta
 * muatannya (`children`, mis. sasis). Bisa ditekan dengan mouse, laser Quest, atau tatapan.
 */
export function Lift({
  position,
  armHeight = 0.4,
  loadOffset = 0,
  children,
}: {
  position: Vec3;
  /** tinggi awal lengan angkat dari lantai */
  armHeight?: number;
  /** letak dasar muatan relatif terhadap lengan (negatif = roda menggantung di bawah lengan) */
  loadOffset?: number;
  children?: React.ReactNode;
}) {
  const [target, setTarget] = useState(armHeight);
  const [hot, setHot] = useState<"up" | "down" | null>(null);
  const height = useRef(armHeight);
  const carriages = useRef<(THREE.Group | null)[]>([]);
  const load = useRef<THREE.Group>(null);
  const panel = useDrawnTexture(160, 400, drawLiftPanel);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    // kecepatan tetap seperti lift hidrolik sungguhan
    const diff = target - height.current;
    if (Math.abs(diff) > 0.0005) height.current += Math.sign(diff) * Math.min(Math.abs(diff), delta * 0.35);
    for (const c of carriages.current) if (c) c.position.y = height.current;
    if (load.current) load.current.position.y = height.current + loadOffset;
  });

  const press = (dir: "up" | "down") => (e?: any) => {
    e?.stopPropagation?.();
    setTarget(dir === "up" ? LIFT_MAX : LIFT_MIN);
  };
  const moving = (dir: "up" | "down") => (dir === "up" ? target === LIFT_MAX : target === LIFT_MIN);

  return (
    <group position={position}>
      {[-1.5, 1.5].map((x, pi) => {
        const inward = -Math.sign(x);
        return (
          <group key={x} position={[x, 0, 0]}>
            <RBox args={[0.74, 0.05, 0.94]} radius={0.02} position={[0, 0.025, 0]}>
              <Steel color="#1e293b" />
            </RBox>
            {/* tiang */}
            <RBox args={[0.28, 3.8, 0.36]} radius={0.05} position={[0, 1.93, 0]} solid>
              <meshStandardMaterial color="#1d4ed8" metalness={0.45} roughness={0.4} />
            </RBox>
            {/* rel luncur di sisi dalam */}
            <RBox args={[0.03, 3.4, 0.2]} radius={0.01} position={[inward * 0.15, 1.9, 0]}>
              <Steel color="#0f172a" />
            </RBox>
            {/* kereta angkat + lengan berengsel (ikut naik-turun) */}
            <group
              ref={(g) => {
                carriages.current[pi] = g;
              }}
              position={[0, armHeight, 0]}
            >
              <RBox args={[0.2, 0.34, 0.44]} radius={0.04} position={[inward * 0.2, 0.1, 0]}>
                <meshStandardMaterial color="#facc15" metalness={0.35} roughness={0.45} />
              </RBox>
              {[-1, 1].map((s) => (
                <group key={s} position={[inward * 0.26, 0, s * 0.17]} rotation={[0, -inward * s * 0.55, 0]}>
                  <RBox args={[1.05, 0.07, 0.11]} radius={0.025} position={[inward * 0.52, 0, 0]}>
                    <meshStandardMaterial color="#facc15" metalness={0.35} roughness={0.45} />
                  </RBox>
                  <mesh raycast={noRaycast}>
                    <cylinderGeometry args={[0.07, 0.07, 0.1, 28]} />
                    <Steel color="#334155" />
                  </mesh>
                  {/* bantalan karet di ujung lengan */}
                  <mesh position={[inward * 1.0, 0.055, 0]} raycast={noRaycast}>
                    <cylinderGeometry args={[0.075, 0.085, 0.045, 28]} />
                    <Rubber />
                  </mesh>
                </group>
              ))}
            </group>
            {/* stiker peringatan */}
            <RBox args={[0.2, 0.3, 0.012]} radius={0.004} position={[0, 2.3, 0.184]}>
              <meshStandardMaterial color="#facc15" roughness={0.55} />
            </RBox>
          </group>
        );
      })}
      {/* palang atas */}
      <RBox args={[3.3, 0.16, 0.3]} radius={0.05} position={[0, 3.9, 0]}>
        <meshStandardMaterial color="#1d4ed8" metalness={0.45} roughness={0.4} />
      </RBox>
      {/* unit hidrolik di sisi luar tiang kanan */}
      <mesh position={[1.72, 1.55, 0]} raycast={noRaycast}>
        <capsuleGeometry args={[0.085, 0.42, 4, 16]} />
        <Steel color="#334155" />
      </mesh>

      {/* ---------- Panel kendali NAIK / TURUN di muka tiang kanan ---------- */}
      <group position={[1.5, 1.22, 0.2]}>
        <RBox args={[0.3, 0.62, 0.07]} radius={0.03} position={[0, 0, 0.02]}>
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} metalness={0.2} />
        </RBox>
        {(
          [
            ["up", 0.085, "#16a34a"],
            ["down", -0.165, "#dc2626"],
          ] as ["up" | "down", number, string][]
        ).map(([dir, y, color]) => (
          <mesh
            key={dir}
            name={`Lift_btn_${dir}`}
            position={[0, y, 0.07 - (moving(dir) ? 0.012 : 0)]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={hot === dir ? 1.08 : 1}
            userData={{ isVRButton: true, isInteractableMesh: true, onClick: press(dir) }}
            onClick={press(dir)}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHot(dir);
            }}
            onPointerOut={() => setHot((h) => (h === dir ? null : h))}
          >
            <cylinderGeometry args={[0.085, 0.092, 0.04, 28]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={moving(dir) ? 0.9 : hot === dir ? 0.5 : 0.15} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, -0.02, 0.093]} raycast={noRaycast}>
          <planeGeometry args={[0.24, 0.6]} />
          <meshBasicMaterial map={panel} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      {/* muatan di atas lengan */}
      <group ref={load} position={[0, armHeight + loadOffset, 0]}>
        {children}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Troli diagnostik                                                   */
/* ------------------------------------------------------------------ */

export function DiagnosticCart({ position, rotation = 0 }: { position: Vec3; rotation?: number }) {
  const screen = useDrawnTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#22d3ee";
    ctx.font = "800 34px system-ui, sans-serif";
    ctx.fillText("DIAGNOSTIK EV", 24, 44);
    ctx.fillStyle = "#0e7490";
    ctx.fillRect(24, 58, w - 48, 3);
    const rows: [string, string][] = [
      ["Tegangan baterai", "396 V"],
      ["SOC", "82 %"],
      ["Suhu sel maks", "31 °C"],
      ["Isolasi", "> 5 MΩ"],
      ["Kode gangguan", "0"],
    ];
    ctx.font = "600 28px system-ui, sans-serif";
    rows.forEach(([k, v], i) => {
      ctx.fillStyle = "#cbd5e1";
      ctx.textAlign = "left";
      ctx.fillText(k, 24, 108 + i * 44);
      ctx.fillStyle = "#4ade80";
      ctx.textAlign = "right";
      ctx.fillText(v, w - 24, 108 + i * 44);
    });
    ctx.textAlign = "left";
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* badan troli */}
      <RBox args={[0.82, 0.78, 0.56]} radius={0.05} position={[0, 0.54, 0]} solid>
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.45} />
      </RBox>
      {[0.32, 0.56, 0.78].map((y) => (
        <group key={y} position={[0, y, 0.281]}>
          <RBox args={[0.7, 0.19, 0.02]} radius={0.008}>
            <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
          </RBox>
          <mesh position={[0, 0.03, 0.02]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
            <capsuleGeometry args={[0.01, 0.3, 3, 16]} />
            <Steel color="#e2e8f0" />
          </mesh>
        </group>
      ))}
      {/* alas kerja karet */}
      <RBox args={[0.88, 0.04, 0.62]} radius={0.018} position={[0, 0.95, 0]}>
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </RBox>
      {/* pegangan dorong */}
      <Tube
        radius={0.016}
        points={[
          [-0.44, 0.9, -0.2],
          [-0.54, 0.98, -0.2],
          [-0.56, 1.02, 0],
          [-0.54, 0.98, 0.2],
          [-0.44, 0.9, 0.2],
        ]}
      >
        <Steel color="#cbd5e1" />
      </Tube>
      {/* monitor + tiang */}
      <mesh position={[0, 1.06, -0.16]} raycast={noRaycast}>
        <cylinderGeometry args={[0.022, 0.03, 0.2, 28]} />
        <Steel color="#1e293b" />
      </mesh>
      <mesh position={[0, 0.975, -0.16]} raycast={noRaycast}>
        <cylinderGeometry args={[0.11, 0.12, 0.012, 28]} />
        <Steel color="#1e293b" />
      </mesh>
      <group position={[0, 1.34, -0.14]} rotation={[-0.2, 0, 0]}>
        <RBox args={[0.74, 0.49, 0.045]} radius={0.02} solid>
          <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.3} />
        </RBox>
        <mesh position={[0, 0, 0.0235]} raycast={noRaycast}>
          <planeGeometry args={[0.68, 0.425]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      </group>
      {/* roda kastor */}
      {[
        [-0.33, -0.21],
        [0.33, -0.21],
        [-0.33, 0.21],
        [0.33, 0.21],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.115, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.02, 0.02, 0.07, 28]} />
            <Steel color="#94a3b8" />
          </mesh>
          <mesh position={[0, 0.055, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
            <cylinderGeometry args={[0.055, 0.055, 0.04, 28]} />
            <Rubber />
          </mesh>
        </group>
      ))}
      {/* alat ukur genggam + kabel oranye */}
      <RBox args={[0.11, 0.035, 0.2]} radius={0.014} position={[0.26, 0.988, 0.12]} rotation={[0, 0.4, 0]}>
        <meshStandardMaterial color="#facc15" roughness={0.5} />
      </RBox>
      <Tube
        radius={0.009}
        points={[
          [0.24, 0.98, 0.03],
          [0.12, 0.975, -0.02],
          [0.0, 0.975, 0.1],
          [-0.12, 0.975, 0.16],
          [-0.24, 0.975, 0.06],
        ]}
      >
        <meshStandardMaterial color="#ea580c" roughness={0.55} />
      </Tube>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Lemari APD tegangan tinggi                                         */
/* ------------------------------------------------------------------ */

function drawApdHeader(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#166534";
  ctx.fillRect(0, 0, w, h);
  // segitiga peringatan
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.moveTo(84, 30);
  ctx.lineTo(140, 128);
  ctx.lineTo(28, 128);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.moveTo(92, 52);
  ctx.lineTo(70, 92);
  ctx.lineTo(86, 92);
  ctx.lineTo(76, 120);
  ctx.lineTo(102, 80);
  ctx.lineTo(86, 80);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "900 64px system-ui, sans-serif";
  ctx.fillText("APD TEGANGAN TINGGI", 172, 58, w - 200);
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillStyle = "#dcfce7";
  ctx.fillText("Wajib dipakai sebelum menyentuh komponen oranye", 172, 116, w - 200);
}

function drawApdLabels(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const items = ["Helm", "Kacamata", "Sarung tangan 1000 V", "Sepatu isolasi"];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 30px system-ui, sans-serif";
  items.forEach((t, i) => {
    const cw = w / items.length;
    const x = cw * i + cw / 2;
    ctx.fillStyle = "#166534";
    ctx.beginPath();
    (ctx as any).roundRect?.(x - cw / 2 + 10, 8, cw - 20, h - 16, 14) ?? ctx.rect(x - cw / 2 + 10, 8, cw - 20, h - 16);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(t, x, h / 2 + 2, cw - 36);
  });
}

const helmetShell = lathe(
  [
    [0.0, 0.118],
    [0.05, 0.112],
    [0.092, 0.09],
    [0.118, 0.05],
    [0.126, 0.0],
    [0.15, -0.006],
    [0.152, -0.014],
    [0.118, -0.014],
  ],
  24,
);

function Glove({ position, mirror = 1 }: { position: Vec3; mirror?: number }) {
  const mat = <meshStandardMaterial color="#ea580c" roughness={0.6} />;
  return (
    <group position={position} scale={[mirror, 1, 1]}>
      {/* manset panjang */}
      <mesh position={[0, 0.03, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.05, 0.062, 0.2, 28]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.132, 0]} raycast={noRaycast}>
        <torusGeometry args={[0.061, 0.008, 10, 28]} />
        <meshStandardMaterial color="#c2410c" roughness={0.6} />
      </mesh>
      {/* telapak */}
      <RBox args={[0.11, 0.1, 0.05]} radius={0.024} position={[0, -0.11, 0]}>
        {mat}
      </RBox>
      {/* jari (menggantung ke bawah) */}
      {[-0.039, -0.013, 0.013, 0.039].map((x, i) => (
        <mesh key={x} position={[x, -0.19 - (i === 1 || i === 2 ? 0.008 : 0), 0]} raycast={noRaycast}>
          <capsuleGeometry args={[0.0125, i === 3 ? 0.045 : 0.06, 3, 16]} />
          {mat}
        </mesh>
      ))}
      <mesh position={[-0.066, -0.115, 0.004]} rotation={[0, 0, -0.55]} raycast={noRaycast}>
        <capsuleGeometry args={[0.014, 0.045, 3, 16]} />
        {mat}
      </mesh>
    </group>
  );
}

function Boot({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* batang sepatu */}
      <mesh position={[0, 0.2, -0.03]} raycast={noRaycast}>
        <cylinderGeometry args={[0.062, 0.056, 0.28, 28]} />
        <meshStandardMaterial color="#facc15" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.34, -0.03]} raycast={noRaycast}>
        <torusGeometry args={[0.061, 0.009, 10, 28]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>
      {/* punggung kaki & ujung membulat */}
      <mesh position={[0, 0.06, 0.035]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.82]} raycast={noRaycast}>
        <capsuleGeometry args={[0.058, 0.13, 4, 16]} />
        <meshStandardMaterial color="#facc15" roughness={0.5} />
      </mesh>
      {/* sol */}
      <RBox args={[0.125, 0.03, 0.27]} radius={0.014} position={[0, 0.015, 0.03]}>
        <Rubber />
      </RBox>
    </group>
  );
}

/** Lemari APD di dinding kanan (menghadap -X). */
export function SafetyStation({ position }: { position: Vec3 }) {
  const header = useDrawnTexture(1024, 160, drawApdHeader);
  const labels = useDrawnTexture(1024, 64, drawApdLabels);
  const W = 1.9;
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      {/* ---------- rangka lemari terbuka ---------- */}
      <RBox args={[W, 1.7, 0.04]} radius={0.015} position={[0, 1.35, -0.13]} solid>
        <meshStandardMaterial color="#f1f5f9" roughness={0.55} />
      </RBox>
      {[-W / 2 + 0.02, W / 2 - 0.02].map((x) => (
        <RBox key={x} args={[0.04, 1.7, 0.34]} radius={0.015} position={[x, 1.35, 0.04]}>
          <meshStandardMaterial color="#cbd5e1" roughness={0.45} metalness={0.3} />
        </RBox>
      ))}
      {/* papan atas, rak tengah, dan alas */}
      {[2.18, 1.3, 0.52].map((y) => (
        <RBox key={y} args={[W, 0.04, 0.34]} radius={0.015} position={[0, y, 0.04]}>
          <meshStandardMaterial color="#cbd5e1" roughness={0.45} metalness={0.3} />
        </RBox>
      ))}
      {/* papan nama */}
      <RBox args={[W, 0.34, 0.05]} radius={0.02} position={[0, 2.4, -0.1]}>
        <meshStandardMaterial color="#14532d" roughness={0.5} />
      </RBox>
      <mesh position={[0, 2.4, -0.073]} raycast={noRaycast}>
        <planeGeometry args={[W - 0.06, (W - 0.06) * (160 / 1024)]} />
        <meshBasicMaterial map={header} toneMapped={false} />
      </mesh>
      {/* label isi di tepi rak tengah */}
      <mesh position={[0, 1.245, 0.213]} raycast={noRaycast}>
        <planeGeometry args={[W - 0.1, (W - 0.1) * (64 / 1024)]} />
        <meshBasicMaterial map={labels} transparent toneMapped={false} />
      </mesh>

      {/* ---------- rak atas: helm & kacamata ---------- */}
      <group position={[-0.675, 1.335, 0.05]} scale={1.15}>
        <mesh geometry={helmetShell} position={[0, 0.014, 0]} raycast={noRaycast}>
          <meshStandardMaterial color="#facc15" roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        {/* rusuk penguat & lidah depan */}
        <mesh position={[0, 0.07, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 0.22, 1]} raycast={noRaycast}>
          <torusGeometry args={[0.062, 0.02, 10, 28, Math.PI]} />
          <meshStandardMaterial color="#eab308" roughness={0.35} />
        </mesh>
        <RBox args={[0.2, 0.012, 0.09]} radius={0.005} position={[0, 0.006, 0.15]}>
          <meshStandardMaterial color="#facc15" roughness={0.35} />
        </RBox>
      </group>
      <group position={[-0.225, 1.385, 0.08]} scale={1.45}>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.042, 0.045, 0.045, 28]} />
            <meshStandardMaterial color="#0ea5e9" transparent opacity={0.6} roughness={0.1} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]} raycast={noRaycast}>
          <torusGeometry args={[0.1, 0.012, 10, 28]} />
          <meshStandardMaterial color="#111827" roughness={0.6} />
        </mesh>
      </group>
      {/* kotak P3K */}
      <group position={[0.45, 1.47, 0.02]}>
        <RBox args={[0.42, 0.28, 0.14]} radius={0.03}>
          <meshStandardMaterial color="#16a34a" roughness={0.45} />
        </RBox>
        <RBox args={[0.14, 0.04, 0.01]} radius={0.004} position={[0, 0, 0.071]}>
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </RBox>
        <RBox args={[0.04, 0.14, 0.01]} radius={0.004} position={[0, 0, 0.071]}>
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </RBox>
      </group>

      {/* ---------- rak bawah: sarung tangan tergantung & sepatu ---------- */}
      <mesh position={[0.225, 1.18, 0.08]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
        <cylinderGeometry args={[0.012, 0.012, 0.42, 28]} />
        <Steel color="#94a3b8" />
      </mesh>
      <Glove position={[0.12, 1.04, 0.08]} />
      <Glove position={[0.33, 1.04, 0.08]} mirror={-1} />
      {/* matras isolasi tergulung */}
      <mesh position={[-0.45, 0.62, 0.04]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 28]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.8} />
      </mesh>
      <mesh position={[-0.45, 0.62, 0.04]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
        <cylinderGeometry args={[0.083, 0.083, 0.05, 28]} />
        <meshStandardMaterial color="#111827" roughness={0.7} />
      </mesh>
      <Boot position={[0.59, 0.54, 0.0]} />
      <Boot position={[0.76, 0.54, 0.0]} />
      {/* kaki lemari */}
      {[-W / 2 + 0.06, W / 2 - 0.06].map((x) => (
        <mesh key={x} position={[x, 0.25, 0.04]} raycast={noRaycast}>
          <cylinderGeometry args={[0.022, 0.022, 0.5, 28]} />
          <Steel color="#64748b" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  APAR                                                               */
/* ------------------------------------------------------------------ */

const extinguisherBody = lathe(
  [
    [0.0, 0.05],
    [0.078, 0.05],
    [0.09, 0.07],
    [0.09, 0.52],
    [0.08, 0.59],
    [0.05, 0.635],
    [0.03, 0.65],
    [0.0, 0.65],
  ],
  20,
);

export function Extinguisher({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      {/* dudukan lantai */}
      <mesh position={[0, 0.025, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.13, 0.14, 0.05, 28]} />
        <Steel color="#1e293b" />
      </mesh>
      <mesh geometry={extinguisherBody}>
        <meshStandardMaterial color="#dc2626" roughness={0.3} metalness={0.35} />
      </mesh>
      {/* label */}
      <mesh position={[0, 0.34, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.0915, 0.0915, 0.16, 28, 1, true]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      {/* katup, tuas, pengukur tekanan */}
      <mesh position={[0, 0.68, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.028, 0.032, 0.07, 28]} />
        <Steel color="#cbd5e1" />
      </mesh>
      <RBox args={[0.17, 0.018, 0.035]} radius={0.008} position={[0.045, 0.735, 0]} rotation={[0, 0, 0.18]}>
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </RBox>
      <RBox args={[0.15, 0.016, 0.03]} radius={0.007} position={[0.045, 0.7, 0]} rotation={[0, 0, -0.08]}>
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </RBox>
      <mesh position={[0, 0.69, 0.04]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.024, 0.024, 0.014, 28]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} />
      </mesh>
      {/* selang + corong */}
      <Tube
        radius={0.011}
        points={[
          [-0.03, 0.69, 0],
          [-0.1, 0.66, 0.02],
          [-0.125, 0.5, 0.04],
          [-0.115, 0.32, 0.04],
        ]}
      >
        <Rubber />
      </Tube>
      <mesh position={[-0.113, 0.26, 0.04]} raycast={noRaycast}>
        <cylinderGeometry args={[0.014, 0.03, 0.13, 28]} />
        <Rubber />
      </mesh>
    </group>
  );
}
