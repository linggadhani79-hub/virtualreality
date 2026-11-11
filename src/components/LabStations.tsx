import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { disableRaycast, fitModel, loadGlb, roundedRectShape, wrapText } from "../lib/glb";
import { modelUrl } from "../lib/quality";
import { playVRClickSound } from "../lib/vrAudio";

/**
 * Stasiun pendukung di Ruang Uji:
 *  - ExhibitStand : etalase komponen (model asli di atas meja putar + papan keterangan)
 *  - QuizStation  : kios tanya-jawab interaktif (bisa dijawab dengan mouse, laser Quest, atau tatapan)
 */

const noRaycast = () => null;

function useCanvasTexture(width: number, height: number) {
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, texture };
  }, [width, height]);
  useEffect(() => () => texture.dispose(), [texture]);
  return { canvas, texture };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  (ctx as any).roundRect?.(x, y, w, h, r) ?? ctx.rect(x, y, w, h);
}

/* ------------------------------------------------------------------ */
/*  Etalase komponen                                                   */
/* ------------------------------------------------------------------ */

export function ExhibitStand({
  model,
  title,
  subtitle,
  facts,
  accent = "#22d3ee",
  position,
  facing = 0,
  size = 1.6,
  tilt = 0,
  modelRotation = [0, 0, 0],
  tint,
  low = false,
}: {
  /** nama model tanpa akhiran kualitas, mis. "baterai" */
  model: string;
  title: string;
  subtitle: string;
  facts: string[];
  accent?: string;
  position: [number, number, number];
  /** arah hadap papan keterangan (radian, sumbu Y) */
  facing?: number;
  /** panjang sisi terpanjang model, meter */
  size?: number;
  /** kemiringan model agar terlihat dari depan (radian) */
  tilt?: number;
  modelRotation?: [number, number, number];
  /** warna logam untuk model tanpa tekstur */
  tint?: string;
  /** panggung rendah (untuk benda besar seperti sasis) */
  low?: boolean;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [spinning, setSpinning] = useState(true);
  const [hot, setHot] = useState(false);
  const turntable = useRef<THREE.Group>(null);

  useEffect(() => {
    let cancelled = false;
    loadGlb(modelUrl(model))
      .then((root) => {
        if (cancelled) return;
        // Bungkus supaya rotasi tampilan tidak mengganggu penskalaan
        const holder = new THREE.Group();
        root.rotation.set(modelRotation[0], modelRotation[1], modelRotation[2]);
        holder.add(root);
        fitModel(holder, size);
        disableRaycast(holder);
        holder.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.map) mat.map.anisotropy = 8;
          else if (tint) {
            mat.color.set(tint);
            mat.metalness = 0.75;
            mat.roughness = 0.38;
          }
        });
        setObject(holder);
      })
      .catch((err) => console.warn(`[ExhibitStand] Model ${model} gagal dimuat:`, err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, size]);

  useFrame((_, delta) => {
    if (spinning && turntable.current) turntable.current.rotation.y += Math.min(delta, 0.05) * 0.35;
  });

  const toggle = (e?: any) => {
    e?.stopPropagation?.();
    playVRClickSound();
    setSpinning((v) => !v);
  };

  const pedestalR = Math.max(0.75, size * 0.52);
  const pickH = low ? Math.max(0.5, size * 0.3) : size * 0.75;
  const top = low ? 0.24 : 0.79; // tinggi permukaan meja putar

  return (
    <group position={position} rotation={[0, facing, 0]} name={`Exhibit_${model}`}>
      {/* Alas */}
      <mesh position={[0, 0.045, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[pedestalR + 0.12, pedestalR + 0.2, 0.09, 40]} />
        <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.09 + (top - 0.17) / 2, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[pedestalR * (low ? 0.92 : 0.55), pedestalR * (low ? 0.96 : 0.7), top - 0.17, 40]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh position={[0, top - 0.045, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[pedestalR, pedestalR, 0.07, 48]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.3} roughness={0.35} />
      </mesh>
      <mesh position={[0, top - 0.065, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[pedestalR + 0.012, pedestalR + 0.012, 0.022, 48]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>

      {/* Model di meja putar */}
      <group ref={turntable} position={[0, top, 0]}>
        <group rotation={[tilt, 0, 0]} position={[0, tilt ? Math.sin(Math.abs(tilt)) * size * 0.36 : 0, 0]}>
          {object && <primitive object={object} />}
        </group>
      </group>

      {/* Kotak pilih (tak terlihat) */}
      <mesh
        name={`Exhibit_pick_${model}`}
        position={[0, top + 0.01 + pickH / 2, 0]}
        userData={{ isInteractableMesh: true, onClick: toggle }}
        onClick={toggle}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
        }}
        onPointerOut={() => setHot(false)}
      >
        <cylinderGeometry args={[pedestalR * 0.95, pedestalR * 0.95, pickH, 16]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, top, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <ringGeometry args={[pedestalR * 0.9, pedestalR * 0.97, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={hot ? 0.95 : 0.35} toneMapped={false} />
      </mesh>

      {/* Papan keterangan di depan etalase */}
      <InfoSign
        position={[0, 0, pedestalR + 0.55]}
        title={title}
        subtitle={subtitle}
        facts={facts}
        accent={accent}
        footer="Pilih etalase untuk menghentikan / memutar"
      />
    </group>
  );
}

/** Papan keterangan miring di atas tiang (teks digambar ke kanvas). */
export function InfoSign({
  title,
  subtitle,
  facts,
  accent = "#22d3ee",
  position,
  facing = 0,
  footer,
}: {
  title: string;
  subtitle: string;
  facts: string[];
  accent?: string;
  position: [number, number, number];
  facing?: number;
  footer?: string;
}) {
  const { canvas, texture } = useCanvasTexture(1024, 640);
  useEffect(() => {
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(11,18,32,0.96)";
    roundRect(ctx, 6, 6, W - 12, H - 12, 34);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(46, 150, 120, 8);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText(subtitle.toUpperCase(), 46, 44);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 62px system-ui, sans-serif";
    ctx.fillText(title, 46, 80, W - 92);
    ctx.font = "500 36px system-ui, sans-serif";
    let y = 190;
    for (const fact of facts) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(60, y + 22, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      for (const line of wrapText(ctx, fact, W - 150)) {
        ctx.fillText(line, 90, y);
        y += 46;
      }
      y += 14;
    }
    if (footer) {
      ctx.fillStyle = "#64748b";
      ctx.font = "600 26px system-ui, sans-serif";
      ctx.fillText(footer, 46, H - 60);
    }
    texture.needsUpdate = true;
  }, [canvas, texture, title, subtitle, facts, accent, footer]);

  return (
    <group position={position} rotation={[0, facing, 0]}>
      <mesh position={[0, 0.012, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.16, 0.18, 0.024, 20]} />
        <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.5, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.03, 0.04, 1.0, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
      </mesh>
      <group position={[0, 1.08, 0.02]} rotation={[-0.5, 0, 0]}>
        <mesh geometry={signBack} position={[0, 0, -0.014]} raycast={noRaycast}>
          <meshStandardMaterial color="#0b1220" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh raycast={noRaycast}>
          <planeGeometry args={[1.1, 0.6875]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

const signBack = new THREE.ExtrudeGeometry(roundedRectShape(1.14, 0.73, 0.05), { depth: 0.02, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.012);

/** Model diam (tanpa meja putar), mis. sasis di atas lift. */
export function StaticModel({
  model,
  size,
  position,
  rotation = 0,
}: {
  model: string;
  size: number;
  position: [number, number, number];
  rotation?: number;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGlb(modelUrl(model))
      .then((root) => {
        if (cancelled) return;
        fitModel(root, size);
        disableRaycast(root);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && (m.material as THREE.MeshStandardMaterial).map) (m.material as THREE.MeshStandardMaterial).map!.anisotropy = 8;
        });
        setObject(root);
      })
      .catch((err) => console.warn(`[StaticModel] Model ${model} gagal dimuat:`, err));
    return () => {
      cancelled = true;
    };
  }, [model, size]);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {object && <primitive object={object} />}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Kios tanya-jawab                                                   */
/* ------------------------------------------------------------------ */

type Question = { q: string; options: string[]; answer: number; why: string };

const QUESTIONS: Question[] = [
  {
    q: "Komponen apa yang menyimpan energi listrik utama pada mobil listrik (BEV)?",
    options: ["Inverter", "Baterai traksi", "Motor listrik", "DC-DC converter"],
    answer: 1,
    why: "Baterai traksi menyimpan energi tegangan tinggi (±400–800 V) untuk menggerakkan mobil.",
  },
  {
    q: "Apa fungsi inverter pada mobil listrik?",
    options: [
      "Mengubah DC baterai menjadi AC untuk motor",
      "Menyimpan energi listrik",
      "Mendinginkan baterai",
      "Mengisi aki 12 V",
    ],
    answer: 0,
    why: "Inverter mengubah arus searah (DC) menjadi bolak-balik (AC) 3 fasa dan mengatur putaran motor.",
  },
  {
    q: "Kabel tegangan tinggi pada kendaraan listrik berwarna…",
    options: ["Hitam", "Biru", "Oranye", "Hijau"],
    answer: 2,
    why: "Warna oranye menandai kabel tegangan tinggi. Jangan disentuh tanpa prosedur K3 dan APD.",
  },
  {
    q: "Saat pengereman regeneratif, motor listrik bekerja sebagai…",
    options: ["Pemanas", "Generator", "Kompresor", "Saklar"],
    answer: 1,
    why: "Motor menjadi generator: energi gerak diubah kembali menjadi listrik untuk mengisi baterai.",
  },
  {
    q: "Komponen yang mengubah listrik AC dari charger rumah menjadi DC untuk baterai adalah…",
    options: ["On-Board Charger (OBC)", "BMS", "Inverter", "Motor"],
    answer: 0,
    why: "OBC berada di dalam mobil dan menyearahkan AC menjadi DC saat pengisian biasa.",
  },
  {
    q: "Tugas utama BMS (Battery Management System) adalah…",
    options: [
      "Menggerakkan roda",
      "Memantau tegangan, arus, dan suhu sel baterai",
      "Mengatur lampu kabin",
      "Mengubah AC menjadi DC",
    ],
    answer: 1,
    why: "BMS menjaga baterai tetap aman: memantau tiap sel, menyeimbangkan, dan memutus arus bila berbahaya.",
  },
  {
    q: "DC-DC converter berfungsi untuk…",
    options: [
      "Menaikkan tegangan motor",
      "Menurunkan tegangan tinggi menjadi 12 V",
      "Mengisi baterai dari PLN",
      "Mengerem kendaraan",
    ],
    answer: 1,
    why: "Tegangan tinggi baterai diturunkan ke 12 V untuk lampu, wiper, audio, dan aki 12 V.",
  },
  {
    q: "Langkah pertama sebelum mengerjakan sistem tegangan tinggi adalah…",
    options: [
      "Langsung membuka kabel oranye",
      "Menyalakan kendaraan",
      "Memakai APD dan mematikan kendaraan",
      "Mengisi baterai sampai penuh",
    ],
    answer: 2,
    why: "Pakai APD, matikan kendaraan, lepas service plug, tunggu kapasitor kosong, lalu ukur 0 V.",
  },
  {
    q: "Mengapa baterai traksi dipasang di lantai kendaraan?",
    options: [
      "Agar mudah dicuri",
      "Agar titik berat rendah dan stabil",
      "Agar cepat panas",
      "Agar suara mesin keras",
    ],
    answer: 1,
    why: "Posisi di lantai menurunkan titik berat sehingga mobil lebih stabil, dan ruang kabin tetap lega.",
  },
  {
    q: "Konektor pengisian cepat DC yang umum dipakai di Indonesia adalah…",
    options: ["CCS2", "USB-C", "HDMI", "RJ45"],
    answer: 0,
    why: "CCS2 dipakai untuk pengisian cepat DC; Type 2 untuk pengisian AC.",
  },
];

const BTN_W = 1.02;
const BTN_H = 0.25;
const answerGeometry = new THREE.ExtrudeGeometry(roundedRectShape(BTN_W, BTN_H, 0.045), {
  depth: 0.03,
  bevelEnabled: true,
  bevelThickness: 0.008,
  bevelSize: 0.008,
  bevelSegments: 2,
  curveSegments: 6,
});

function AnswerButton({
  label,
  letter,
  state,
  position,
  onPress,
}: {
  label: string;
  letter: string;
  /** idle | correct | wrong | dim */
  state: "idle" | "correct" | "wrong" | "dim";
  position: [number, number, number];
  onPress: () => void;
}) {
  const [hot, setHot] = useState(false);
  const { canvas, texture } = useCanvasTexture(768, 188);
  const cap = useRef<THREE.Group>(null);
  const pulse = useRef(0);

  useEffect(() => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(76, 94, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 64px system-ui, sans-serif";
    ctx.fillText(letter, 76, 98);
    ctx.textAlign = "left";
    ctx.font = "700 50px system-ui, sans-serif";
    const lines = wrapText(ctx, label, 590).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, 150, 98 + (i - (lines.length - 1) / 2) * 56));
    texture.needsUpdate = true;
  }, [canvas, texture, label, letter]);

  const color = state === "correct" ? "#16a34a" : state === "wrong" ? "#dc2626" : state === "dim" ? "#334155" : "#1d4ed8";

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    pulse.current = Math.max(0, pulse.current - delta * 4);
    if (cap.current) {
      cap.current.position.z = THREE.MathUtils.damp(cap.current.position.z, 0.012 - pulse.current * 0.012, 18, delta);
      const s = hot && state === "idle" ? 1.03 : 1;
      cap.current.scale.x = cap.current.scale.y = THREE.MathUtils.damp(cap.current.scale.x, s, 14, delta);
    }
  });

  const press = (e?: any) => {
    e?.stopPropagation?.();
    pulse.current = 1;
    onPress();
  };

  return (
    <group position={position}>
      <group ref={cap} position={[0, 0, 0.012]}>
        <mesh
          name={`Quiz_answer_${letter}`}
          geometry={answerGeometry}
          userData={{ isVRButton: true, isInteractableMesh: true, onClick: press }}
          onClick={press}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHot(true);
          }}
          onPointerOut={() => setHot(false)}
        >
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={state === "idle" ? (hot ? 0.45 : 0.12) : state === "dim" ? 0 : 0.6}
            roughness={0.35}
            envMapIntensity={0.35}
          />
        </mesh>
        <mesh position={[0, 0, 0.042]} raycast={noRaycast}>
          <planeGeometry args={[BTN_W - 0.04, (BTN_W - 0.04) * (188 / 768)]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function QuizStation({
  position,
  facing = 0,
}: {
  position: [number, number, number];
  facing?: number;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const { canvas, texture } = useCanvasTexture(1280, 640);
  const question = QUESTIONS[index];
  const total = QUESTIONS.length;

  useEffect(() => {
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b1220");
    g.addColorStop(1, "#111c33");
    ctx.fillStyle = g;
    roundRect(ctx, 6, 6, W - 12, H - 12, 36);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#22d3ee";
    ctx.stroke();
    ctx.textBaseline = "top";

    if (finished) {
      const pct = Math.round((score / total) * 100);
      ctx.textAlign = "center";
      ctx.fillStyle = "#67e8f9";
      ctx.font = "800 44px system-ui, sans-serif";
      ctx.fillText("HASIL TANYA JAWAB", W / 2, 70);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 170px system-ui, sans-serif";
      ctx.fillText(`${score} / ${total}`, W / 2, 150);
      ctx.fillStyle = pct >= 80 ? "#4ade80" : pct >= 60 ? "#facc15" : "#f87171";
      ctx.font = "800 56px system-ui, sans-serif";
      ctx.fillText(
        pct >= 80 ? "Sangat baik! Anda menguasai materi." : pct >= 60 ? "Cukup baik. Pelajari lagi komponennya." : "Ayo pelajari lagi, lalu coba ulang.",
        W / 2,
        370,
        W - 120,
      );
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 38px system-ui, sans-serif";
      ctx.fillText("Tekan tombol ULANGI untuk mencoba lagi", W / 2, 480);
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = "#67e8f9";
      ctx.font = "800 36px system-ui, sans-serif";
      ctx.fillText("TANYA JAWAB KENDARAAN LISTRIK", 56, 48);
      ctx.textAlign = "right";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`Soal ${index + 1} / ${total}   ·   Skor ${score}`, W - 56, 48);
      ctx.textAlign = "left";
      // progres
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(56, 104, W - 112, 10);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(56, 104, ((W - 112) * (index + (picked !== null ? 1 : 0))) / total, 10);

      ctx.fillStyle = "#ffffff";
      ctx.font = "800 58px system-ui, sans-serif";
      let y = 150;
      for (const line of wrapText(ctx, question.q, W - 112).slice(0, 4)) {
        ctx.fillText(line, 56, y);
        y += 70;
      }
      if (picked !== null) {
        const right = picked === question.answer;
        ctx.fillStyle = right ? "#4ade80" : "#f87171";
        ctx.font = "900 46px system-ui, sans-serif";
        ctx.fillText(right ? "✔ Benar!" : `✘ Belum tepat — jawaban: ${question.options[question.answer]}`, 56, 440, W - 112);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "500 36px system-ui, sans-serif";
        let yy = 506;
        for (const line of wrapText(ctx, question.why, W - 112).slice(0, 2)) {
          ctx.fillText(line, 56, yy);
          yy += 44;
        }
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 36px system-ui, sans-serif";
        ctx.fillText("Pilih salah satu jawaban di bawah (laser / tatapan / klik)", 56, 540);
      }
    }
    texture.needsUpdate = true;
  }, [canvas, texture, question, index, picked, score, finished, total]);

  const pick = (i: number) => {
    if (picked !== null || finished) return;
    playVRClickSound();
    setPicked(i);
    if (i === question.answer) setScore((s) => s + 1);
  };

  const next = () => {
    playVRClickSound();
    if (finished) {
      setIndex(0);
      setPicked(null);
      setScore(0);
      setFinished(false);
      return;
    }
    if (picked === null) return;
    if (index + 1 >= total) {
      setFinished(true);
    } else {
      setIndex(index + 1);
      setPicked(null);
    }
  };

  const stateOf = (i: number): "idle" | "correct" | "wrong" | "dim" => {
    if (picked === null) return "idle";
    if (i === question.answer) return "correct";
    if (i === picked) return "wrong";
    return "dim";
  };

  const nextLabel = finished ? "ULANGI" : index + 1 >= total ? "LIHAT HASIL" : "SOAL BERIKUTNYA";

  return (
    <group position={position} rotation={[0, facing, 0]} name="QuizStation">
      {/* Kaki & badan kios */}
      <mesh position={[0, 0.04, 0]} raycast={noRaycast}>
        <boxGeometry args={[2.5, 0.08, 0.7]} />
        <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.4} />
      </mesh>
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} position={[x, 1.25, -0.06]} raycast={noRaycast}>
          <boxGeometry args={[0.09, 2.4, 0.09]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 1.42, -0.05]} raycast={noRaycast}>
        <boxGeometry args={[2.34, 2.12, 0.06]} />
        <meshStandardMaterial color="#0b1220" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.5, -0.02]} raycast={noRaycast}>
        <boxGeometry args={[2.34, 0.035, 0.1]} />
        <meshBasicMaterial color="#22d3ee" toneMapped={false} />
      </mesh>

      {/* Layar pertanyaan */}
      <mesh position={[0, 1.9, 0]} raycast={noRaycast}>
        <planeGeometry args={[2.2, 1.1]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* Tombol jawaban 2 x 2 */}
      {!finished &&
        question.options.map((opt, i) => (
          <AnswerButton
            key={`${index}-${i}`}
            letter={"ABCD"[i]}
            label={opt}
            state={stateOf(i)}
            position={[i % 2 === 0 ? -0.56 : 0.56, i < 2 ? 1.15 : 0.85, 0]}
            onPress={() => pick(i)}
          />
        ))}

      {/* Tombol lanjut / ulangi */}
      {(picked !== null || finished) && (
        <AnswerButton letter="▶" label={nextLabel} state="idle" position={[0, 0.53, 0]} onPress={next} />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Pemandangan (taman, pohon): satu model dipakai di banyak tempat     */
/* ------------------------------------------------------------------ */

export function Scenery({
  model,
  size,
  places,
}: {
  model: string;
  /** panjang sisi terpanjang, meter */
  size: number;
  /** [x, z, putaran Y, skala] tiap salinan; geometri & tekstur dipakai bersama */
  places: [number, number, number?, number?][];
}) {
  const [copies, setCopies] = useState<THREE.Object3D[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadGlb(modelUrl(model))
      .then((root) => {
        if (cancelled) return;
        fitModel(root, size);
        disableRaycast(root);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.side = THREE.DoubleSide; // daun & rumput tipis terlihat dari dua sisi
          mat.metalness = 0;
          mat.roughness = 1;
        });
        setCopies(places.map((_, i) => (i === 0 ? root : root.clone())));
      })
      .catch((err) => console.warn(`[Scenery] Model ${model} gagal dimuat:`, err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, size]);
  return (
    <>
      {copies.map((o, i) => (
        <group key={i} position={[places[i][0], 0, places[i][1]]} rotation={[0, places[i][2] ?? 0, 0]} scale={places[i][3] ?? 1}>
          <primitive object={o} />
        </group>
      ))}
    </>
  );
}
