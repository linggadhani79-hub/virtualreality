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

function makeLabelTexture(label: string, icon: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "64px system-ui, sans-serif";
  ctx.fillText(icon, 128, 56);
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.fillText(label, 128, 124);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tombol 3D yang bisa ditekan dengan mouse, laser controller, atau tatapan. */
function Button3D({
  label,
  icon,
  color,
  active,
  position,
  onPress,
}: {
  label: string;
  icon: string;
  color: string;
  active?: boolean;
  position: [number, number, number];
  onPress: () => void;
}) {
  const [hot, setHot] = useState(false);
  const texture = useMemo(() => makeLabelTexture(label, icon), [label, icon]);
  useEffect(() => () => texture.dispose(), [texture]);
  const press = (e?: any) => {
    e?.stopPropagation?.();
    onPress();
  };
  return (
    <group position={position}>
      <mesh
        name={`SampleEV_btn_${label}`}
        position={[0, 0, active ? -0.015 : 0]}
        scale={hot ? 1.06 : 1}
        userData={{ isVRButton: true, isInteractableMesh: true, onClick: press }}
        onClick={press}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
        }}
        onPointerOut={() => setHot(false)}
      >
        <boxGeometry args={[0.44, 0.28, 0.05]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 0.9 : hot ? 0.5 : 0.15}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 0, active ? 0.012 : 0.027]} raycast={() => null}>
        <planeGeometry args={[0.4, 0.25]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const _cam = new THREE.Vector3();
const _panel = new THREE.Vector3();
const noRaycast = () => null;

export function SampleEVCar({ position = [0, 0, -6] as [number, number, number] }) {
  const { invalidate } = useThree();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [xray, setXray] = useState(false);
  const [driving, setDriving] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [model, setModel] = useState<THREE.Object3D | null>(null);

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

      {/* Papan informasi (selalu menghadap pengguna) */}
      <mesh ref={panelRef} position={[0, 2.75, -0.6]} raycast={noRaycast} renderOrder={10}>
        <planeGeometry args={[3.2, 1.375]} />
        <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* Konsol tombol interaktif di depan mobil */}
      <group position={[0, 0, 2.9]}>
        <mesh position={[0, 0.27, 0.04]} raycast={noRaycast}>
          <boxGeometry args={[0.12, 0.54, 0.12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Rendah & miring supaya tidak menutupi mobil, tetap mudah dibidik laser */}
        <group position={[0, 0.62, 0]} rotation={[-0.95, 0, 0]}>
          <mesh position={[0, 0, -0.04]} raycast={noRaycast}>
            <boxGeometry args={[2.16, 0.42, 0.04]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.3} />
          </mesh>
          <Button3D
            label="KOMPONEN"
            icon="🔍"
            color="#0891b2"
            active={xray}
            position={[-0.78, 0, 0]}
            onPress={() => {
              setXray((v) => !v);
              setSelected(null);
            }}
          />
          <Button3D
            label={driving ? "BERHENTI" : "JALANKAN"}
            icon={driving ? "⏸" : "▶"}
            color="#16a34a"
            active={driving}
            position={[-0.26, 0, 0]}
            onPress={() => {
              setSpinning(false);
              if (carRef.current) carRef.current.rotation.y = 0;
              setDriving((v) => !v);
            }}
          />
          <Button3D
            label="PUTAR"
            icon="⟳"
            color="#7c3aed"
            active={spinning}
            position={[0.26, 0, 0]}
            onPress={() => {
              setDriving(false);
              setSpinning((v) => !v);
            }}
          />
          <Button3D label="RESET" icon="↺" color="#b45309" position={[0.78, 0, 0]} onPress={reset} />
        </group>
      </group>
    </group>
  );
}
