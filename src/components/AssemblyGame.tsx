import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { disableRaycast, fitModel, loadGlb, roundedRectShape, wrapText } from "../lib/glb";
import { modelUrl, qualityTier } from "../lib/quality";
import { playVRClickSound, playVRHoverSound } from "../lib/vrAudio";

/**
 * Game "Rakit Mobil Listrik".
 *
 * Komponen mobil tersebar di sekitar panggung rakit. Pemain memilih komponen (mouse, laser
 * Quest, atau tatapan VR HP) sesuai urutan perakitan yang benar; komponen yang benar terbang
 * ke tempatnya, yang salah ditolak dengan penjelasan. Layar besar menampilkan langkah, waktu,
 * dan jumlah salah pilih. Semua model memakai aset yang sudah ada (salinan, geometri bersama).
 *
 * Arah lokal: mobil memanjang di sumbu X, pemain berdiri di sisi +Z, layar di sisi -Z.
 */

const noRaycast = () => null;
const PLATFORM_Y = 0.12;

type Vec3 = [number, number, number];
type StepDef = {
  id: string;
  label: string;
  /** kalimat setelah komponen terpasang */
  done: string;
  /** alasan bila dipilih terlalu cepat */
  early: string;
  model?: string;
  size?: number;
  start: Vec3;
  startRot?: Vec3;
  end: Vec3;
  endRot?: Vec3;
  /** tinggi lengkung lintasan terbang */
  lift: number;
  /** ukuran kotak pilih */
  pick: Vec3;
  color: string;
};

const STEPS: StepDef[] = [
  {
    id: "sasis",
    label: "Rangka & roda",
    done: "Rangka menjadi dasar semua komponen: suspensi, kemudi, dan roda sudah menempel.",
    early: "",
    model: "sasis",
    size: 4.3,
    start: [0, 0, -4.4],
    end: [0, PLATFORM_Y, 0],
    lift: 0,
    pick: [4.3, 1.0, 1.9],
    color: "#38bdf8",
  },
  {
    id: "baterai",
    label: "Baterai traksi",
    done: "Baterai dipasang rata di lantai rangka supaya titik berat mobil rendah dan stabil.",
    early: "Baterai butuh rangka sebagai dudukannya.",
    model: "baterai",
    size: 1.7,
    start: [-3.9, 0.62, 3.0],
    end: [0, 0.3, 0],
    lift: 1.3,
    pick: [1.8, 0.5, 1.2],
    color: "#22c55e",
  },
  {
    id: "motor",
    label: "Motor listrik",
    done: "Motor dipasang di poros roda: tenaganya langsung memutar roda tanpa poros kopel.",
    early: "Pasang baterai dulu; motor dipasang setelah sumber energinya ada di rangka.",
    model: "motor-listrik",
    size: 0.5,
    start: [-1.3, 0.92, 3.5],
    end: [1.36, 0.3, 0],
    lift: 1.2,
    pick: [0.7, 0.8, 0.7],
    color: "#f97316",
  },
  {
    id: "inverter",
    label: "Inverter",
    done: "Inverter duduk di atas motor: mengubah DC baterai menjadi AC 3 fasa untuk motor.",
    early: "Inverter mengatur motor, jadi motornya harus terpasang dulu.",
    model: "inverter",
    size: 0.5,
    start: [1.2, 0.92, 3.5],
    // tepat di atas motor (motor setinggi ± 0,5 m dari y = 0,3), tidak saling menembus
    end: [1.36, 0.82, 0],
    lift: 1.2,
    pick: [0.8, 0.5, 0.6],
    color: "#a78bfa",
  },
  {
    id: "kabel",
    label: "Kabel tegangan tinggi",
    done: "Kabel oranye menghubungkan baterai → inverter → motor. Di mobil asli hanya teknisi ber-APD yang boleh memasangnya.",
    early: "Kabel baru bisa disambung bila baterai, motor, dan inverter sudah terpasang.",
    start: [3.7, 0.66, 3.0],
    end: [0, 0, 0],
    lift: 1.0,
    pick: [0.8, 0.5, 0.8],
    color: "#ea580c",
  },
  {
    id: "bodi",
    label: "Bodi mobil",
    done: "Bodi diturunkan paling akhir, menutup semua komponen. Mobil listrik selesai dirakit!",
    early: "Bodi dipasang terakhir, setelah semua komponen di rangka terpasang dan tersambung.",
    model: "mobil",
    size: 4.5,
    start: [0, 2.7, 0],
    end: [0, PLATFORM_Y, 0],
    lift: 0,
    pick: [4.5, 1.2, 1.9],
    color: "#e2e8f0",
  },
];

function fmtTime(sec: number) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function drawScreen(
  canvas: HTMLCanvasElement,
  st: { done: number; mistakes: number; elapsed: number; message: string; tone: "info" | "good" | "bad"; finished: boolean },
) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1220");
  g.addColorStop(1, "#111c33");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#67e8f9";
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.fillText("GAME · RAKIT MOBIL LISTRIK", 56, 40);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "800 44px system-ui, sans-serif";
  ctx.fillText(`Waktu ${fmtTime(st.elapsed)}   ·   Salah ${st.mistakes}`, W - 56, 46);
  ctx.textAlign = "left";

  // daftar langkah
  const colW = (W - 112) / 2;
  STEPS.forEach((step, i) => {
    const x = 56 + (i % 2) * colW;
    const y = 138 + Math.floor(i / 2) * 96;
    const state = i < st.done ? "done" : i === st.done ? "next" : "todo";
    ctx.fillStyle = state === "done" ? "#166534" : state === "next" ? "#1d4ed8" : "#1e293b";
    ctx.beginPath();
    (ctx as any).roundRect?.(x, y, colW - 24, 78, 18) ?? ctx.rect(x, y, colW - 24, 78);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(x + 44, y + 39, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "900 34px system-ui, sans-serif";
    if (state === "done") {
      // centang digambar vektor (bukan emoji)
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + 31, y + 40);
      ctx.lineTo(x + 41, y + 51);
      ctx.lineTo(x + 58, y + 28);
      ctx.stroke();
    } else {
      ctx.fillText(String(i + 1), x + 44, y + 21);
    }
    ctx.textAlign = "left";
    ctx.font = `${state === "todo" ? 600 : 800} 38px system-ui, sans-serif`;
    ctx.fillStyle = state === "todo" ? "#94a3b8" : "#ffffff";
    ctx.fillText(step.label, x + 88, y + 19, colW - 130);
  });

  // pesan
  const my = 448;
  ctx.fillStyle = st.tone === "good" ? "rgba(22,101,52,0.55)" : st.tone === "bad" ? "rgba(153,27,27,0.6)" : "rgba(30,41,59,0.8)";
  ctx.beginPath();
  (ctx as any).roundRect?.(56, my, W - 112, H - my - 44, 22) ?? ctx.rect(56, my, W - 112, H - my - 44);
  ctx.fill();
  ctx.fillStyle = st.tone === "good" ? "#bbf7d0" : st.tone === "bad" ? "#fecaca" : "#e2e8f0";
  ctx.font = `${st.finished ? 800 : 600} 40px system-ui, sans-serif`;
  wrapText(ctx, st.message, W - 180)
    .slice(0, 4)
    .forEach((line, i) => ctx.fillText(line, 88, my + 24 + i * 52));
}

function makeTagTexture(num: number, label: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 112;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(11,18,32,0.9)";
  ctx.beginPath();
  (ctx as any).roundRect?.(4, 4, 504, 104, 52) ?? ctx.rect(4, 4, 504, 104);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(58, 56, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1220";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 46px system-ui, sans-serif";
  ctx.fillText("?", 58, 59);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.fillText(label, 112, 59, 380);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const gameButtonGeometry = new THREE.ExtrudeGeometry(roundedRectShape(0.62, 0.24, 0.06), {
  depth: 0.035,
  bevelEnabled: true,
  bevelThickness: 0.01,
  bevelSize: 0.01,
  bevelSegments: 3,
  curveSegments: 8,
});

function GameButton({ label, color, position, onPress }: { label: string; color: string; position: Vec3; onPress: () => void }) {
  const [hot, setHot] = useState(false);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 496;
    c.height = 192;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 64px system-ui, sans-serif";
    ctx.fillText(label, 248, 100, 470);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  const press = (e?: any) => {
    e?.stopPropagation?.();
    onPress();
  };
  return (
    <group position={position}>
      <mesh
        name={`Rakit_btn_${label}`}
        geometry={gameButtonGeometry}
        scale={hot ? 1.05 : 1}
        userData={{ isVRButton: true, isInteractableMesh: true, onClick: press }}
        onClick={press}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
        }}
        onPointerOut={() => setHot(false)}
      >
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hot ? 0.5 : 0.15} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.048]} raycast={noRaycast}>
        <planeGeometry args={[0.58, 0.224]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const platformGeometry = new RoundedBoxGeometry(5.6, PLATFORM_Y, 2.8, 6, 0.055);
const standTop = new RoundedBoxGeometry(1, 0.06, 1, 6, 0.029);
const postGeometry = new THREE.CylinderGeometry(0.09, 0.11, 4.3, 16);
const hintGeometry = new THREE.ConeGeometry(0.16, 0.34, 20);
/**
 * Jalur kabel dengan tikungan membulat: garis lurus antar-titik, tiap sudut diganti lengkung
 * berjari-jari `bend` (seperti kabel sungguhan yang ditekuk rapi, bukan melayang).
 */
function routed(points: [number, number, number][], bend: number) {
  const v = points.map((p) => new THREE.Vector3(...p));
  const path = new THREE.CurvePath<THREE.Vector3>();
  let from = v[0].clone();
  for (let i = 1; i < v.length - 1; i++) {
    const inDir = v[i].clone().sub(v[i - 1]).normalize();
    const outDir = v[i + 1].clone().sub(v[i]).normalize();
    const r = Math.min(bend, v[i].distanceTo(v[i - 1]) / 2, v[i].distanceTo(v[i + 1]) / 2);
    const a = v[i].clone().addScaledVector(inDir, -r);
    const c = v[i].clone().addScaledVector(outDir, r);
    path.add(new THREE.LineCurve3(from, a));
    path.add(new THREE.QuadraticBezierCurve3(a, v[i].clone(), c));
    from = c;
  }
  path.add(new THREE.LineCurve3(from, v[v.length - 1].clone()));
  return path;
}
const tube = (points: [number, number, number][], radius: number, bend = 0.06) =>
  new THREE.TubeGeometry(routed(points, bend), 96, radius, 10, false);

// Kabel tegangan tinggi pada mobil yang dirakit (koordinat lokal game; ukuran komponen diukur dari
// modelnya: baterai x ±0,85 / atas y 0,45, inverter x 1,11–1,61 / y 0,82–0,96, motor y 0,30–0,80).
//  - sepasang kabel DC (+/−) dari konektor ujung baterai, menyusur di atas rangka, naik ke inverter
//  - tiga kabel AC fase dari sisi inverter turun ke motor
const DC_Z = [-0.045, 0.045];
const cableGeometries = [
  ...DC_Z.map((z) =>
    tube(
      [
        [0.8, 0.43, z],
        [0.96, 0.43, z],
        [1.04, 0.43, z],
        [1.04, 0.89, z],
        [1.12, 0.89, z],
      ],
      0.019,
    ),
  ),
  ...[-0.07, 0, 0.07].map((x) =>
    tube(
      [
        [1.36 + x, 0.89, 0.12],
        [1.36 + x, 0.89, 0.2],
        [1.36 + x, 0.62, 0.2],
        [1.36 + x, 0.62, 0.165],
      ],
      0.013,
      0.04,
    ),
  ),
];
// konektor (soket di ujung kabel) dan klem pengikat kabel
const plugGeometry = new THREE.CylinderGeometry(0.032, 0.032, 0.06, 16).rotateZ(Math.PI / 2);
const phasePlug = new THREE.CylinderGeometry(0.022, 0.022, 0.04, 14).rotateX(Math.PI / 2);
const clampGeometry = new THREE.TorusGeometry(0.03, 0.008, 6, 18);
const CABLE_PLUGS: [number, number, number][] = [
  ...DC_Z.map((z) => [0.8, 0.43, z] as [number, number, number]),
  ...DC_Z.map((z) => [1.1, 0.89, z] as [number, number, number]),
];
const CABLE_CLAMPS: { p: [number, number, number]; r: [number, number, number] }[] = [
  ...DC_Z.map((z) => ({ p: [1.04, 0.62, z] as [number, number, number], r: [Math.PI / 2, 0, 0] as [number, number, number] })),
  ...DC_Z.map((z) => ({ p: [0.9, 0.43, z] as [number, number, number], r: [0, Math.PI / 2, 0] as [number, number, number] })),
];

const coilGeometry = new THREE.TorusGeometry(0.24, 0.035, 10, 32);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function AssemblyGame({
  position,
  screen,
}: {
  position: Vec3;
  /** letak & arah layar skor (lokal), biasanya menempel dinding di samping pemain */
  screen: { position: Vec3; rotationY: number };
}) {
  const [done, setDone] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "good" | "bad" }>({
    text: "Pilih komponen sesuai urutan perakitan. Mulai dari yang menjadi dasar mobil.",
    tone: "info",
  });
  const [elapsed, setElapsed] = useState(0);
  const [objects, setObjects] = useState<Record<string, THREE.Object3D>>({});
  const startedAt = useRef<number | null>(null);
  const finishedAt = useRef<number | null>(null);
  const progress = useRef<number[]>(STEPS.map(() => 0));
  const groups = useRef<(THREE.Group | null)[]>([]);
  const hintRef = useRef<THREE.Mesh>(null);
  const partsRef = useRef<THREE.Group>(null);
  const bodyWheels = useRef<THREE.Object3D[]>([]);
  const rootRef = useRef<THREE.Group>(null);
  const shake = useRef<{ index: number; t: number }>({ index: -1, t: 0 });
  const finished = done >= STEPS.length;
  const tags = useMemo(() => STEPS.map((st, i) => makeTagTexture(i + 1, st.label, st.color)), []);
  useEffect(() => () => tags.forEach((t) => t.dispose()), [tags]);
  const tagRefs = useRef<(THREE.Mesh | null)[]>([]);
  const help = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 640;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(11,18,32,0.97)";
    ctx.beginPath();
    (ctx as any).roundRect?.(6, 6, 1012, 628, 34) ?? ctx.rect(6, 6, 1012, 628);
    ctx.fill();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.textBaseline = "top";
    ctx.fillStyle = "#facc15";
    ctx.font = "900 60px system-ui, sans-serif";
    ctx.fillText("CARA BERMAIN", 46, 40);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 36px system-ui, sans-serif";
    const lines = [
      "1. Lihat komponen berlabel di sekitar panggung.",
      "2. Pilih (klik / laser / tatap) komponen yang harus",
      "    dipasang lebih dulu. Mulai dari dasar mobil.",
      "3. Benar: komponen terbang ke tempatnya.",
      "    Salah: komponen bergoyang, coba yang lain.",
      "4. Enam komponen terpasang = mobil selesai.",
      "PETUNJUK: panah kuning menunjuk komponen berikutnya.",
      "Skor & langkah ada di layar dinding kanan.",
    ];
    lines.forEach((l, i) => {
      ctx.fillStyle = i >= 6 ? "#67e8f9" : "#e2e8f0";
      ctx.fillText(l, 46, 130 + i * 58, 940);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => help.dispose(), [help]);

  // ---- model komponen (salinan; geometri & tekstur dipakai bersama dengan etalase) ----
  useEffect(() => {
    let cancelled = false;
    bodyWheels.current = [];
    for (const step of STEPS) {
      if (!step.model) continue;
      loadGlb(modelUrl(step.model))
        .then((shared) => {
          if (cancelled) return;
          const root = shared.clone();
          fitModel(root, step.size!);
          disableRaycast(root);
          if (step.id === "bodi") {
            root.traverse((o) => {
              // Selama bodi masih tergantung, rodanya disembunyikan (roda ada di rangka). Begitu bodi
              // terpasang, roda bodi yang ditampilkan dan rangka disembunyikan: jarak sumbu roda rangka
              // sedikit berbeda dari lengkung roda bodi, jadi roda rangka tampak tidak pas.
              if (o.name.startsWith("wheel_")) {
                o.visible = false;
                bodyWheels.current.push(o);
              }
              const m = o as THREE.Mesh;
              // bahan sendiri, supaya mode Komponen pada mobil di lintasan tidak ikut mengubah bodi ini
              if (m.isMesh) m.material = (m.material as THREE.Material).clone();
            });
          }
          setObjects((cur) => ({ ...cur, [step.id]: root }));
        })
        .catch((err) => console.warn(`[AssemblyGame] Model ${step.model} gagal dimuat:`, err));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- layar ----
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 720;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, texture };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    drawScreen(canvas, { done, mistakes, elapsed, message: message.text, tone: message.tone, finished });
    texture.needsUpdate = true;
  }, [canvas, texture, done, mistakes, elapsed, message, finished]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    // Tingkat ringan (Quest / HP): model komponen (± 460 rb segitiga) baru digambar saat pemain
    // mendekat, supaya tidak membebani pandangan dari bagian lab yang lain.
    if (import.meta.env.DEV && (window as any).__rakitInstant) {
      if (partsRef.current) partsRef.current.visible = true;
    } else if (partsRef.current && rootRef.current && qualityTier === "lite") {
      state.camera.getWorldPosition(_a);
      rootRef.current.getWorldPosition(_b);
      const d = Math.hypot(_a.x - _b.x, _a.z - _b.z);
      if (partsRef.current.visible ? d > 17 : d < 15.5) partsRef.current.visible = !partsRef.current.visible;
    }
    // jam berjalan (diperbarui tiap detik saja agar layar tidak digambar ulang tiap frame)
    if (startedAt.current !== null) {
      const now = finishedAt.current ?? state.clock.elapsedTime;
      const sec = Math.floor(now - startedAt.current);
      if (sec !== elapsed) setElapsed(sec);
    }
    STEPS.forEach((step, i) => {
      const g = groups.current[i];
      if (!g) return;
      const target = i < done ? 1 : 0;
      const p = progress.current[i];
      // hanya saat pengembangan: lewati animasi untuk pengujian otomatis
      const instant = import.meta.env.DEV && (window as any).__rakitInstant;
      const next = instant ? target : p + Math.sign(target - p) * Math.min(Math.abs(target - p), delta / (target ? 1.5 : 0.5));
      progress.current[i] = next;
      const e = next * next * (3 - 2 * next); // halus di awal & akhir
      _a.set(...step.start);
      _b.set(...step.end);
      g.position.lerpVectors(_a, _b, e);
      g.position.y += Math.sin(Math.PI * e) * step.lift;
      // komponen yang salah dipilih bergoyang sebentar
      if (shake.current.index === i && shake.current.t > 0) {
        g.position.x += Math.sin(shake.current.t * 60) * 0.03 * shake.current.t * 3;
      }
      // sebelum dipasang, komponen kecil berputar pelan di tempatnya
      if (step.lift > 0 && step.id !== "kabel") g.rotation.y = (1 - e) * state.clock.elapsedTime * 0.5;
    });
    if (shake.current.t > 0) shake.current.t = Math.max(0, shake.current.t - delta);
    // bodi sudah duduk: tukar roda rangka dengan roda bodi yang pas di lengkung rodanya
    const landed = progress.current[STEPS.length - 1] > 0.985;
    for (const w of bodyWheels.current) w.visible = landed;
    for (let i = 0; i < STEPS.length - 1; i++) {
      const g = groups.current[i];
      if (g) g.visible = !landed;
    }
    // label nama selalu menghadap pemain
    for (const tag of tagRefs.current) if (tag) tag.quaternion.copy(state.camera.quaternion);
    if (hintRef.current) {
      const step = STEPS[done];
      hintRef.current.visible = hint && !!step;
      if (step) {
        hintRef.current.position.set(step.start[0], step.start[1] + step.pick[1] + 0.45 + Math.sin(state.clock.elapsedTime * 4) * 0.08, step.start[2]);
        hintRef.current.rotation.y += delta * 2;
      }
    }
  });

  const pick = (i: number) => (e?: any) => {
    e?.stopPropagation?.();
    if (i < done) return;
    if (i === done) {
      playVRClickSound();
      setDone(done + 1);
      setHint(false);
      setMessage({ text: STEPS[i].done, tone: "good" });
    } else {
      playVRHoverSound();
      shake.current = { index: i, t: 0.35 };
      setMistakes((m) => m + 1);
      setMessage({ text: `Belum saatnya memasang ${STEPS[i].label.toLowerCase()}. ${STEPS[i].early}`, tone: "bad" });
    }
  };

  // waktu memakai jam render (state.clock), jadi titik mulai dicatat pada frame berikutnya
  const clockStart = useRef(false);
  useFrame((state) => {
    if (done > 0 && !clockStart.current) {
      clockStart.current = true;
      startedAt.current = state.clock.elapsedTime;
    }
    if (finished && finishedAt.current === null && progress.current[STEPS.length - 1] >= 1) {
      finishedAt.current = state.clock.elapsedTime;
      const sec = Math.floor(finishedAt.current - (startedAt.current ?? finishedAt.current));
      const stars = mistakes === 0 ? "Sempurna" : mistakes <= 2 ? "Bagus" : "Selesai";
      setMessage({
        text: `${stars}! Mobil listrik selesai dirakit dalam ${fmtTime(sec)} dengan ${mistakes} kali salah pilih. Tekan ULANGI untuk mencoba lagi.`,
        tone: "good",
      });
    }
  });

  const reset = () => {
    playVRClickSound();
    setDone(0);
    setMistakes(0);
    setHint(false);
    setElapsed(0);
    startedAt.current = null;
    finishedAt.current = null;
    clockStart.current = false;
    setMessage({ text: "Pilih komponen sesuai urutan perakitan. Mulai dari yang menjadi dasar mobil.", tone: "info" });
  };

  return (
    <group ref={rootRef} position={position} name="AssemblyGame">
      {/* ---------- Panggung rakit ---------- */}
      <mesh geometry={platformGeometry} position={[0, PLATFORM_Y / 2, 0]}>
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, PLATFORM_Y + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[5.3, 2.5]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>
      {[-1.34, 1.34].map((z) => (
        <mesh key={z} position={[0, PLATFORM_Y + 0.004, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[5.3, 0.07]} />
          <meshBasicMaterial color="#facc15" toneMapped={false} />
        </mesh>
      ))}

      {/* ---------- Derek gantung untuk bodi ---------- */}
      {[-2.95, 2.95].map((x) =>
        [-1.75, 1.75].map((z) => (
          <mesh key={`${x}:${z}`} geometry={postGeometry} position={[x, 2.15, z]} raycast={noRaycast}>
            <meshStandardMaterial color="#facc15" metalness={0.4} roughness={0.5} />
          </mesh>
        )),
      )}
      {[-1.75, 1.75].map((z) => (
        <mesh key={z} position={[0, 4.3, z]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
          <capsuleGeometry args={[0.1, 6.0, 6, 14]} />
          <meshStandardMaterial color="#facc15" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 4.42, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <capsuleGeometry args={[0.09, 3.6, 6, 14]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* ---------- Dudukan komponen ---------- */}
      {/* troli baterai */}
      <group position={[-3.9, 0, 3.0]}>
        <mesh geometry={standTop} position={[0, 0.56, 0]} scale={[2.0, 1, 1.3]} raycast={noRaycast}>
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.45} />
        </mesh>
        {/* pegangan dorong */}
        <mesh position={[-1.05, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <capsuleGeometry args={[0.022, 1.0, 6, 14]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
        </mesh>
        {[-0.5, 0.5].map((z) => (
          <mesh key={z} position={[-1.02, 0.68, z]} rotation={[0, 0, 0.12]} raycast={noRaycast}>
            <cylinderGeometry args={[0.02, 0.02, 0.26, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
        {[
          [-0.85, -0.5],
          [0.85, -0.5],
          [-0.85, 0.5],
          [0.85, 0.5],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.32, 0]} raycast={noRaycast}>
              <cylinderGeometry args={[0.025, 0.025, 0.44, 16]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
              <cylinderGeometry args={[0.06, 0.06, 0.045, 16]} />
              <meshStandardMaterial color="#0b0f17" roughness={0.9} />
            </mesh>
          </group>
        ))}
      </group>
      {/* meja motor, inverter, dan gulungan kabel */}
      {[-1.3, 1.2, 3.7].map((x, i) => (
        <group key={x} position={[x, 0, i === 2 ? 3.0 : 3.5]}>
          <mesh position={[0, i === 2 ? 0.3 : 0.44, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.09, 0.2, i === 2 ? 0.6 : 0.88, 20]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.45} />
          </mesh>
          <mesh geometry={standTop} position={[0, i === 2 ? 0.61 : 0.89, 0]} scale={[0.9, 1, 0.9]} raycast={noRaycast}>
            <meshStandardMaterial color="#e2e8f0" metalness={0.3} roughness={0.35} />
          </mesh>
        </group>
      ))}

      {/* ---------- Komponen ---------- */}
      <group ref={partsRef}>
      {STEPS.map((step, i) => (
        <group
          key={step.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={step.start}
        >
          {step.model && objects[step.id] && <primitive object={objects[step.id]} />}
          {step.id === "kabel" && (
            <>
              {/* gulungan di meja → berubah menjadi kabel terpasang */}
              <mesh geometry={coilGeometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} visible={i >= done} raycast={noRaycast}>
                <meshStandardMaterial color="#ea580c" roughness={0.5} />
              </mesh>
              <mesh geometry={coilGeometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.11, 0]} scale={0.92} visible={i >= done} raycast={noRaycast}>
                <meshStandardMaterial color="#f97316" roughness={0.5} />
              </mesh>
              <group visible={i < done}>
                {cableGeometries.map((g, k) => (
                  <mesh key={k} geometry={g} raycast={noRaycast}>
                    <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.25} roughness={0.45} />
                  </mesh>
                ))}
                {CABLE_PLUGS.map((p, k) => (
                  <mesh key={k} geometry={plugGeometry} position={p} raycast={noRaycast}>
                    <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
                  </mesh>
                ))}
                {[-0.07, 0, 0.07].flatMap((x) => [0.89, 0.62].map((y) => [1.36 + x, y, y > 0.8 ? 0.13 : 0.165] as [number, number, number])).map((p, k) => (
                  <mesh key={`f${k}`} geometry={phasePlug} position={p} raycast={noRaycast}>
                    <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
                  </mesh>
                ))}
                {CABLE_CLAMPS.map((c, k) => (
                  <mesh key={`c${k}`} geometry={clampGeometry} position={c.p} rotation={c.r} raycast={noRaycast}>
                    <meshStandardMaterial color="#111827" roughness={0.6} />
                  </mesh>
                ))}
              </group>
            </>
          )}
          {/* label nama: hilang setelah komponen terpasang */}
          {i >= done && (
            <mesh
              ref={(m) => {
                tagRefs.current[i] = m;
              }}
              position={[0, step.pick[1] + 0.22, 0]}
              raycast={noRaycast}
              renderOrder={30}
            >
              <planeGeometry args={[0.92, 0.2]} />
              <meshBasicMaterial map={tags[i]} transparent depthWrite={false} toneMapped={false} />
            </mesh>
          )}
          {/* kotak pilih (tak terlihat); hilang setelah terpasang agar tidak menghalangi laser */}
          {i >= done && (
            <mesh
              name={`Rakit_${step.id}`}
              position={[0, step.pick[1] / 2, 0]}
              userData={{ isInteractableMesh: true, isVRButton: true, onClick: pick(i) }}
              onClick={pick(i)}
            >
              <boxGeometry args={step.pick} />
              <meshBasicMaterial colorWrite={false} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}
      </group>
      {/* tali derek bodi */}
      {done < STEPS.length &&
        [-1.2, 1.2].map((x) => (
          <mesh key={x} position={[x, 4.3 - (4.3 - 2.7 - 1.25) / 2, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.012, 0.012, 4.3 - 2.7 - 1.25, 6]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}

      {/* panah petunjuk */}
      <mesh ref={hintRef} geometry={hintGeometry} rotation={[Math.PI, 0, 0]} visible={false} raycast={noRaycast}>
        <meshBasicMaterial color="#facc15" toneMapped={false} />
      </mesh>

      {/* ---------- Layar & tombol ---------- */}
      <group position={screen.position} rotation={[0, screen.rotationY, 0]}>
        <mesh position={[0, 0, -0.03]} raycast={noRaycast}>
          <boxGeometry args={[3.66, 1.74, 0.08]} />
          <meshStandardMaterial color="#0b1220" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.02]} raycast={noRaycast}>
          <planeGeometry args={[3.5, 3.5 * (720 / 1600)]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
      {/* papan cara bermain di samping konsol */}
      <group position={[-1.9, 0, 4.7]} rotation={[0, 0.25, 0]}>
        <mesh position={[0, 0.55, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.035, 0.05, 1.1, 28]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.012, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.2, 0.22, 0.024, 28]} />
          <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.42, 0.02]} rotation={[-0.25, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[1.5, 0.9375]} />
          <meshBasicMaterial map={help} transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* konsol tombol di depan pemain */}
      <group position={[0, 0, 4.6]}>
        <mesh position={[0, 0.42, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.07, 0.16, 0.84, 20]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
        </mesh>
        <group position={[0, 0.95, 0]} rotation={[-0.9, 0, 0]}>
          <mesh position={[0, 0, -0.03]} raycast={noRaycast}>
            <boxGeometry args={[1.6, 0.42, 0.05]} />
            <meshStandardMaterial color="#0b1220" metalness={0.7} roughness={0.35} />
          </mesh>
          <GameButton
            label="PETUNJUK"
            color="#0369a1"
            position={[-0.38, 0, 0]}
            onPress={() => {
              playVRClickSound();
              setHint(true);
              if (!finished) setMessage({ text: `Petunjuk: komponen berikutnya adalah ${STEPS[done].label.toLowerCase()} (lihat panah kuning).`, tone: "info" });
            }}
          />
          <GameButton label="ULANGI" color="#b45309" position={[0.38, 0, 0]} onPress={reset} />
        </group>
      </group>
    </group>
  );
}
