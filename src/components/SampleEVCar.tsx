import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Stasiun contoh mobil listrik (BEV).
 *
 * - Model mobil: public/models/contoh-mobil-listrik.glb (sudah dioptimasi dari 29 MB: ±165 rb segitiga,
 *   tekstur WebP 2K, kompresi Meshopt → ±2,4 MB, tanpa decoder dari CDN).
 * - Mode "Komponen": bodi menjadi tembus pandang dan komponen EV di dalamnya bisa dipilih.
 * - Tombol 3D interaktif (mouse, laser controller Quest, atau tatapan di VR HP):
 *   Komponen · Jalankan · Putar · Reset.
 */

const MODEL_URL = "/models/contoh-mobil-listrik.glb";
const CAR_LENGTH = 4.5; // meter
const DRIVE_RANGE = 3.2; // jarak maju-mundur dari titik tengah

type PartDef = {
  id: string;
  name: string;
  desc: string;
  color: string;
  position: [number, number, number];
  size: [number, number, number];
  shape?: "box" | "cylinderX";
};

// Sumbu: X = lebar, Y = tinggi, Z = panjang (depan mobil ke arah -Z)
const PARTS: PartDef[] = [
  {
    id: "battery",
    name: "Baterai Traksi (Battery Pack)",
    desc: "Menyimpan energi listrik tegangan tinggi (±400–800 V) dalam ratusan sel lithium-ion. Dipasang di lantai agar titik berat rendah.",
    color: "#22c55e",
    position: [0, 0.3, 0],
    size: [1.35, 0.14, 2.1],
  },
  {
    id: "bms",
    name: "BMS (Battery Management System)",
    desc: "Memantau tegangan, arus, dan suhu tiap sel; menyeimbangkan sel dan memutus arus bila tidak aman.",
    color: "#a3e635",
    position: [0, 0.41, 0.85],
    size: [0.5, 0.06, 0.25],
  },
  {
    id: "motor-rear",
    name: "Motor Listrik Belakang",
    desc: "Mengubah energi listrik menjadi gerak putar roda. Saat pengereman bekerja sebagai generator (regenerative braking).",
    color: "#f97316",
    position: [0, 0.36, 1.45],
    size: [0.3, 0.3, 0.5],
    shape: "cylinderX",
  },
  {
    id: "motor-front",
    name: "Motor Listrik Depan",
    desc: "Motor kedua pada sistem penggerak semua roda (AWD) untuk traksi dan akselerasi lebih baik.",
    color: "#fb923c",
    position: [0, 0.36, -1.45],
    size: [0.26, 0.26, 0.42],
    shape: "cylinderX",
  },
  {
    id: "inverter",
    name: "Inverter",
    desc: "Mengubah arus searah (DC) baterai menjadi arus bolak-balik (AC) 3 fasa dan mengatur kecepatan serta torsi motor.",
    color: "#38bdf8",
    position: [0, 0.62, 1.45],
    size: [0.5, 0.14, 0.36],
  },
  {
    id: "obc",
    name: "On-Board Charger (OBC)",
    desc: "Mengubah listrik AC dari stopkontak / charger rumah menjadi DC untuk mengisi baterai.",
    color: "#c084fc",
    position: [0.38, 0.6, -1.5],
    size: [0.36, 0.14, 0.34],
  },
  {
    id: "dcdc",
    name: "DC-DC Converter",
    desc: "Menurunkan tegangan tinggi baterai menjadi 12 V untuk lampu, wiper, audio, dan mengisi aki 12 V.",
    color: "#f472b6",
    position: [-0.38, 0.6, -1.5],
    size: [0.32, 0.12, 0.3],
  },
  {
    id: "port",
    name: "Port Pengisian (Charging Port)",
    desc: "Tempat menancapkan konektor charger. AC (Type 2) untuk pengisian biasa, DC (CCS2) untuk pengisian cepat.",
    color: "#facc15",
    position: [0.83, 0.85, 1.25],
    size: [0.06, 0.16, 0.2],
  },
  {
    id: "cable",
    name: "Kabel Tegangan Tinggi",
    desc: "Kabel berwarna oranye penghubung baterai, inverter, dan motor. Berbahaya — hanya boleh ditangani teknisi bersertifikat dengan APD.",
    color: "#ea580c",
    position: [0.5, 0.42, 0],
    size: [0.05, 0.05, 2.8],
  },
];

const WHEELS: [number, number, number][] = [
  [0.82, 0.33, -1.4],
  [-0.82, 0.33, -1.4],
  [0.82, 0.33, 1.4],
  [-0.82, 0.33, 1.4],
];

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawPanel(canvas: HTMLCanvasElement, part: PartDef | null) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.beginPath();
  (ctx as any).roundRect?.(8, 8, W - 16, H - 16, 36) ?? ctx.rect(8, 8, W - 16, H - 16);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = part ? part.color : "#22d3ee";
  ctx.stroke();

  ctx.textBaseline = "top";
  ctx.fillStyle = "#67e8f9";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText("CONTOH MOBIL LISTRIK (BEV)", 48, 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 50px system-ui, sans-serif";
  ctx.fillText(part ? part.name : "Selamat datang di Lab EV", 48, 92);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "34px system-ui, sans-serif";
  const body = part
    ? part.desc
    : "Arahkan laser / tatapan ke mobil atau tombol di konsol, lalu tekan trigger (atau klik). Tombol KOMPONEN menampilkan bagian dalam mobil.";
  wrapText(ctx, body, W - 96).slice(0, 5).forEach((l, i) => ctx.fillText(l, 48, 172 + i * 46));
}

const CAR_INFO: PartDef = {
  id: "car",
  name: "Mobil Listrik Baterai (BEV)",
  desc: "Digerakkan sepenuhnya oleh motor listrik dengan energi dari baterai. Tekan tombol KOMPONEN untuk melihat bagian dalamnya, JALANKAN untuk menggerakkan mobil.",
  color: "#22d3ee",
  position: [0, 0, 0],
  size: [0, 0, 0],
};

type IconName = "search" | "play" | "pause" | "rotate" | "reset";

// Ikon digambar sebagai vektor (bukan emoji) supaya tampil sama di Quest, HP, dan PC
function drawIcon(ctx: CanvasRenderingContext2D, icon: IconName, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = r * 0.26;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  const arrowHead = (x: number, y: number, ang: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(r * 0.42, 0);
    ctx.lineTo(-r * 0.28, -r * 0.4);
    ctx.lineTo(-r * 0.28, r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  if (icon === "search") {
    ctx.beginPath();
    ctx.arc(-r * 0.18, -r * 0.18, r * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.28, r * 0.28);
    ctx.lineTo(r * 0.85, r * 0.85);
    ctx.stroke();
  } else if (icon === "play") {
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.8);
    ctx.lineTo(r * 0.85, 0);
    ctx.lineTo(-r * 0.5, r * 0.8);
    ctx.closePath();
    ctx.fill();
  } else if (icon === "pause") {
    ctx.fillRect(-r * 0.6, -r * 0.75, r * 0.42, r * 1.5);
    ctx.fillRect(r * 0.18, -r * 0.75, r * 0.42, r * 1.5);
  } else if (icon === "rotate") {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, -Math.PI * 0.35, Math.PI * 1.25);
    ctx.stroke();
    arrowHead(Math.cos(-Math.PI * 0.35) * r * 0.7, Math.sin(-Math.PI * 0.35) * r * 0.7, -Math.PI * 0.35 - Math.PI / 2 + 0.25);
  } else {
    // reset = panah melingkar berlawanan arah (cermin dari ikon putar)
    ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, -Math.PI * 0.35, Math.PI * 1.25);
    ctx.stroke();
    arrowHead(Math.cos(-Math.PI * 0.35) * r * 0.7, Math.sin(-Math.PI * 0.35) * r * 0.7, -Math.PI * 0.35 - Math.PI / 2 + 0.25);
  }
  ctx.restore();
}

function makeLabelTexture(label: string, icon: IconName) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  drawIcon(ctx, icon, 192, 86, 52);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 58px system-ui, sans-serif";
  ctx.fillText(label, 192, 204, 360);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const BTN_W = 0.42;
const BTN_H = 0.3;
// Geometri dipakai bersama oleh semua tombol
const capGeometry = new THREE.ExtrudeGeometry(roundedRectShape(BTN_W, BTN_H, 0.06), {
  depth: 0.035,
  bevelEnabled: true,
  bevelThickness: 0.012,
  bevelSize: 0.012,
  bevelSegments: 3,
  curveSegments: 8,
});
const bezelGeometry = new THREE.ExtrudeGeometry(roundedRectShape(BTN_W + 0.07, BTN_H + 0.07, 0.085), {
  depth: 0.02,
  bevelEnabled: true,
  bevelThickness: 0.006,
  bevelSize: 0.006,
  bevelSegments: 2,
  curveSegments: 8,
});
const glowGeometry = new THREE.ShapeGeometry(roundedRectShape(BTN_W + 0.1, BTN_H + 0.1, 0.1), 8);

/**
 * Tombol 3D: tutup mengilap di atas bingkai logam, ikut tertekan saat dipilih, dan
 * berpendar sesuai keadaan. Bisa ditekan dengan mouse, laser controller, atau tatapan.
 */
function Button3D({
  label,
  icon,
  color,
  active,
  position,
  onPress,
}: {
  label: string;
  icon: IconName;
  color: string;
  active?: boolean;
  position: [number, number, number];
  onPress: () => void;
}) {
  const [hot, setHot] = useState(false);
  const capRef = useRef<THREE.Group>(null);
  const capMat = useRef<THREE.MeshStandardMaterial>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const pulse = useRef(0);
  const texture = useMemo(() => makeLabelTexture(label, icon), [label, icon]);
  useEffect(() => () => texture.dispose(), [texture]);

  const press = (e?: any) => {
    e?.stopPropagation?.();
    pulse.current = 1; // animasi tertekan
    onPress();
  };

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    pulse.current = Math.max(0, pulse.current - delta * 4);
    const depth = Math.max(active ? 0.6 : 0, pulse.current);
    if (capRef.current) {
      capRef.current.position.z = THREE.MathUtils.damp(capRef.current.position.z, 0.03 - depth * 0.022, 18, delta);
      const s = hot ? 1.04 : 1;
      capRef.current.scale.x = capRef.current.scale.y = THREE.MathUtils.damp(capRef.current.scale.x, s, 14, delta);
    }
    if (capMat.current) {
      capMat.current.emissiveIntensity = THREE.MathUtils.damp(capMat.current.emissiveIntensity, active ? 0.55 : hot ? 0.3 : 0.04, 10, delta);
    }
    if (glowMat.current) {
      glowMat.current.opacity = THREE.MathUtils.damp(glowMat.current.opacity, active ? 0.9 : hot ? 0.55 : 0.12, 10, delta);
    }
  });

  return (
    <group position={position}>
      {/* Pendar di sekeliling tombol */}
      <mesh geometry={glowGeometry} position={[0, 0, 0.002]} raycast={noRaycast}>
        <meshBasicMaterial ref={glowMat} color={color} transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Bingkai logam */}
      <mesh geometry={bezelGeometry} position={[0, 0, 0.004]} raycast={noRaycast}>
        <meshStandardMaterial color="#111827" metalness={0.85} roughness={0.3} />
      </mesh>
      <group ref={capRef} position={[0, 0, 0.03]}>
        <mesh
          name={`SampleEV_btn_${label}`}
          geometry={capGeometry}
          userData={{ isVRButton: true, isInteractableMesh: true, onClick: press }}
          onClick={press}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHot(true);
          }}
          onPointerOut={() => setHot(false)}
        >
          <meshStandardMaterial
            ref={capMat}
            color={color}
            emissive={color}
            emissiveIntensity={0.04}
            roughness={0.3}
            metalness={0.1}
            envMapIntensity={0.35}
          />
        </mesh>
        <mesh position={[0, 0.005, 0.05]} raycast={noRaycast}>
          <planeGeometry args={[0.39, 0.26]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function makeConsoleTitleTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#67e8f9";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 38px system-ui, sans-serif";
  ctx.fillText("P A N E L   K O N T R O L   ·   M O B I L   L I S T R I K", 512, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const consoleGeometry = new THREE.ExtrudeGeometry(roundedRectShape(2.36, 0.62, 0.09), {
  depth: 0.05,
  bevelEnabled: true,
  bevelThickness: 0.015,
  bevelSize: 0.015,
  bevelSegments: 3,
  curveSegments: 8,
});

const _cam = new THREE.Vector3();
const _panel = new THREE.Vector3();
const noRaycast = () => null;

export function SampleEVCar({
  position = [0, 0, -6] as [number, number, number],
  showPlatform = true,
}: {
  position?: [number, number, number];
  /** Panggung gelap + garis lintasan; matikan bila lantai sudah disediakan lingkungan lab */
  showPlatform?: boolean;
}) {
  const { invalidate } = useThree();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [xray, setXray] = useState(false);
  const [driving, setDriving] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [model, setModel] = useState<THREE.Object3D | null>(null);

  const consoleTitle = useMemo(makeConsoleTitleTexture, []);
  useEffect(() => () => consoleTitle.dispose(), [consoleTitle]);
  const panelRef = useRef<THREE.Mesh>(null);
  const carRef = useRef<THREE.Group>(null);
  const wheelRefs = useRef<THREE.Mesh[]>([]);
  const driveT = useRef(0);
  const lastX = useRef(0);

  // ---- Muat model mobil (gagal muat tidak merusak aplikasi: rangka komponen tetap tampil) ----
  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = CAR_LENGTH / Math.max(size.x, size.z);
        root.scale.setScalar(scale);
        // Tengahkan dan letakkan roda tepat di lantai
        root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.raycast = noRaycast; // mesh padat: pemilihan memakai kotak proxy agar laser tetap ringan
          m.frustumCulled = true;
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.map) mat.map.anisotropy = 8;
        });
        setModel(root);
      },
      undefined,
      (err) => console.warn("[SampleEVCar] Model contoh gagal dimuat:", err),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      model?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.normalMap?.dispose();
        mat.metalnessMap?.dispose();
        mat.dispose();
      });
    },
    [model],
  );

  // ---- Bodi tembus pandang saat mode Komponen ----
  useEffect(() => {
    model?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.transparent = xray;
      mat.opacity = xray ? 0.16 : 1;
      mat.depthWrite = !xray;
      mat.needsUpdate = true;
    });
  }, [model, xray]);

  // ---- Papan informasi ----
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 440;
    drawPanel(canvas, null);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas, texture };
  }, []);

  useEffect(() => {
    const part = selected === "car" ? CAR_INFO : PARTS.find((p) => p.id === selected) || null;
    drawPanel(canvas, part);
    texture.needsUpdate = true;
    invalidate();
  }, [selected, canvas, texture, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);

  const reset = () => {
    setDriving(false);
    setSpinning(false);
    setXray(false);
    setSelected(null);
    driveT.current = 0;
    if (carRef.current) {
      carRef.current.position.x = 0;
      carRef.current.rotation.y = 0;
    }
  };

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const panel = panelRef.current;
    if (panel) {
      state.camera.getWorldPosition(_cam);
      panel.getWorldPosition(_panel);
      panel.rotation.y = Math.atan2(_cam.x - _panel.x, _cam.z - _panel.z);
    }

    const car = carRef.current;
    if (!car) return;
    if (driving) {
      // Maju-mundur halus di lintasan lurus
      driveT.current += delta * 0.55;
      car.position.x = Math.sin(driveT.current) * DRIVE_RANGE;
    } else if (Math.abs(car.position.x) > 0.001) {
      // Kembali ke titik tengah
      car.position.x = THREE.MathUtils.damp(car.position.x, 0, 3, delta);
      if (Math.abs(car.position.x) < 0.002) {
        car.position.x = 0;
        driveT.current = 0;
      }
    }
    if (spinning) car.rotation.y += delta * 0.5;

    // Roda rangka berputar sesuai jarak tempuh
    const dx = car.position.x - lastX.current;
    lastX.current = car.position.x;
    if (dx !== 0) for (const w of wheelRefs.current) if (w) w.rotation.x -= dx / 0.33;
  });

  return (
    <group position={position} name="SampleEVCar">
      {/* Panggung & lintasan */}
      {showPlatform && (
        <>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[DRIVE_RANGE * 2 + CAR_LENGTH + 0.6, 2.9]} />
        <meshStandardMaterial color="#0f172a" roughness={0.85} />
      </mesh>
      {[-1.35, 1.35].map((z) => (
        <mesh key={z} position={[0, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[DRIVE_RANGE * 2 + CAR_LENGTH + 0.6, 0.06]} />
          <meshBasicMaterial color="#22d3ee" />
        </mesh>
      ))}
        </>
      )}

      {/* Mobil: panjang searah sumbu X sehingga terlihat dari samping */}
      <group ref={carRef}>
        {model && <primitive object={model} />}

        {/* Kotak proxy untuk memilih mobil (tidak digambar) */}
        {!xray && (
          <mesh
            name="SampleEV_car"
            position={[0, 0.75, 0]}
            userData={{ isInteractableMesh: true, onClick: () => setSelected("car") }}
            onClick={(e) => {
              e.stopPropagation();
              setSelected("car");
            }}
          >
            <boxGeometry args={[CAR_LENGTH, 1.4, 1.9]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
          </mesh>
        )}

        {/* Rangka & komponen: tampil saat mode Komponen, atau bila model belum/ gagal dimuat */}
        {(xray || !model) && (
          <group rotation={[0, Math.PI / 2, 0]} scale={1.08}>
            <mesh position={[0, 0.2, 0]} raycast={noRaycast}>
              <boxGeometry args={[1.5, 0.05, 3.6]} />
              <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.5} />
            </mesh>
            {WHEELS.map((p, i) => (
              <mesh
                key={i}
                ref={(m) => {
                  if (m) wheelRefs.current[i] = m;
                }}
                position={p}
                rotation={[0, 0, Math.PI / 2]}
                raycast={noRaycast}
              >
                <cylinderGeometry args={[0.33, 0.33, 0.2, 20]} />
                <meshStandardMaterial color="#0f172a" roughness={0.9} transparent opacity={model ? 0.35 : 1} />
              </mesh>
            ))}
            {PARTS.map((part) => {
              const active = selected === part.id;
              const hot = hovered === part.id;
              const pick = (e?: any) => {
                e?.stopPropagation?.();
                setSelected((cur) => (cur === part.id ? null : part.id));
              };
              return (
                <mesh
                  key={part.id}
                  name={`SampleEV_${part.id}`}
                  position={part.position}
                  rotation={part.shape === "cylinderX" ? [0, 0, Math.PI / 2] : [0, 0, 0]}
                  scale={active ? 1.06 : 1}
                  userData={{ isInteractableMesh: true, onClick: pick, partName: part.name }}
                  onClick={pick}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(part.id);
                  }}
                  onPointerOut={() => setHovered((h) => (h === part.id ? null : h))}
                >
                  {part.shape === "cylinderX" ? (
                    <cylinderGeometry args={[part.size[0] / 2, part.size[1] / 2, part.size[2], 20]} />
                  ) : (
                    <boxGeometry args={part.size} />
                  )}
                  <meshStandardMaterial
                    color={part.color}
                    emissive={part.color}
                    emissiveIntensity={active ? 0.9 : hot ? 0.45 : 0.15}
                    roughness={0.45}
                    metalness={0.25}
                  />
                </mesh>
              );
            })}
          </group>
        )}
      </group>

      {/* Papan informasi di sisi kiri mobil (selalu menghadap pengguna) + tiangnya */}
      <mesh position={[-4.6, 0.85, -1.6]} raycast={noRaycast}>
        <cylinderGeometry args={[0.045, 0.06, 1.7, 14]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh ref={panelRef} position={[-4.6, 2.35, -1.6]} raycast={noRaycast} renderOrder={10}>
        <planeGeometry args={[3.0, 1.29]} />
        <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* Konsol tombol interaktif di depan mobil */}
      <group position={[0, 0, 2.9]}>
        {/* Tiang & kaki */}
        <mesh position={[0, 0.03, 0.05]} raycast={noRaycast}>
          <cylinderGeometry args={[0.34, 0.38, 0.06, 28]} />
          <meshStandardMaterial color="#111827" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.3, 0.05]} raycast={noRaycast}>
          <cylinderGeometry args={[0.07, 0.09, 0.52, 20]} />
          <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.3, 0.05]} raycast={noRaycast}>
          <cylinderGeometry args={[0.076, 0.076, 0.03, 20]} />
          <meshBasicMaterial color="#22d3ee" toneMapped={false} />
        </mesh>
        {/* Rendah & miring supaya tidak menutupi mobil, tetap mudah dibidik laser */}
        <group position={[0, 0.66, 0]} rotation={[-0.95, 0, 0]}>
          <mesh geometry={consoleGeometry} position={[0, 0.03, -0.07]} raycast={noRaycast}>
            <meshStandardMaterial color="#0b1220" metalness={0.7} roughness={0.35} />
          </mesh>
          {/* Garis lampu aksen */}
          <mesh position={[0, -0.235, 0.001]} raycast={noRaycast}>
            <planeGeometry args={[2.1, 0.018]} />
            <meshBasicMaterial color="#22d3ee" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.265, 0.001]} raycast={noRaycast}>
            <planeGeometry args={[1.5, 0.094]} />
            <meshBasicMaterial map={consoleTitle} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <Button3D
            label="KOMPONEN"
            icon="search"
            color="#0891b2"
            active={xray}
            position={[-0.81, 0, 0]}
            onPress={() => {
              setXray((v) => !v);
              setSelected(null);
            }}
          />
          <Button3D
            label={driving ? "BERHENTI" : "JALANKAN"}
            icon={driving ? "pause" : "play"}
            color="#16a34a"
            active={driving}
            position={[-0.27, 0, 0]}
            onPress={() => {
              setSpinning(false);
              if (carRef.current) carRef.current.rotation.y = 0;
              setDriving((v) => !v);
            }}
          />
          <Button3D
            label="PUTAR"
            icon="rotate"
            color="#7c3aed"
            active={spinning}
            position={[0.27, 0, 0]}
            onPress={() => {
              setDriving(false);
              setSpinning((v) => !v);
            }}
          />
          <Button3D label="RESET" icon="reset" color="#d97706" position={[0.81, 0, 0]} onPress={reset} />
        </group>
      </group>
    </group>
  );
}
