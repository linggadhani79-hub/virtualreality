import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ACTIVITIES, COURSE, CPMK, evaluate, nextActivity, recordVisit, useObe } from "../lib/obe";
import { PARKING } from "./ParkingArea";

/**
 * Papan "Alur Pembelajaran" (OBE) di dinding lab: urutan kegiatan, tanda selesai, dan nilai tiap
 * CPMK siswa yang sedang aktif. Terlihat juga di dalam VR. `ObeTracker` mencatat kunjungan zona.
 */

const noRaycast = () => null;
const W = 1280;
const H = 900;

function draw(ctx: CanvasRenderingContext2D, student: ReturnType<typeof useObe>["student"]) {
  const res = evaluate(student);
  const next = nextActivity(student);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(0, 0, W, 10);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#67e8f9";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.fillText("ALUR PEMBELAJARAN · OBE", 44, 50);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 44px system-ui, sans-serif";
  ctx.fillText(COURSE.name, 44, 98);
  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText(`Siswa: ${student.name}${student.kelas ? " · " + student.kelas : ""}`, W - 44, 50);
  ctx.fillStyle = res.pass ? "#4ade80" : "#fbbf24";
  ctx.font = "900 34px system-ui, sans-serif";
  ctx.fillText(`${res.doneCount}/${ACTIVITIES.length} kegiatan · nilai ${res.total}`, W - 44, 98);

  // urutan kegiatan
  const rowH = 62;
  ACTIVITIES.forEach((a, i) => {
    const y = 150 + i * rowH;
    const rec = student.acts[a.id];
    const isNext = next?.id === a.id;
    ctx.fillStyle = isNext ? "rgba(34,211,238,0.14)" : i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)";
    ctx.fillRect(32, y, 800, rowH - 6);
    // nomor / tanda selesai
    ctx.beginPath();
    ctx.arc(66, y + 28, 20, 0, Math.PI * 2);
    ctx.fillStyle = rec?.done ? "#16a34a" : isNext ? "#0891b2" : "#334155";
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 22px system-ui, sans-serif";
    if (rec?.done) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(56, y + 28);
      ctx.lineTo(63, y + 36);
      ctx.lineTo(77, y + 20);
      ctx.stroke();
    } else ctx.fillText(String(i + 1), 66, y + 29);
    ctx.textAlign = "left";
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "800 23px system-ui, sans-serif";
    ctx.fillText(a.title, 100, y + 19, 560);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 17px system-ui, sans-serif";
    ctx.fillText(`${a.kind} · ${a.cpmk.length > 3 ? "semua CPMK" : a.cpmk.join(", ")} · ${a.where}`, 100, y + 42, 600);
    ctx.textAlign = "right";
    ctx.font = "900 24px system-ui, sans-serif";
    ctx.fillStyle = rec?.done ? "#4ade80" : isNext ? "#67e8f9" : "#475569";
    ctx.fillText(rec?.done ? String(rec.score) : isNext ? "LANJUT" : "—", 818, y + 29);
  });

  // nilai CPMK
  ctx.textAlign = "left";
  ctx.fillStyle = "#67e8f9";
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillText(`KETERCAPAIAN CPMK (tuntas ≥ ${COURSE.pass})`, 868, 162);
  res.cpmk.forEach((r, i) => {
    const y = 196 + i * 92;
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "800 22px system-ui, sans-serif";
    ctx.fillText(`${r.id} → ${CPMK[i].cpl}`, 868, y + 12);
    ctx.textAlign = "right";
    ctx.fillStyle = !r.started ? "#64748b" : r.pass ? "#4ade80" : "#fbbf24";
    ctx.fillText(r.started ? `${r.score}` : "belum", W - 44, y + 12);
    ctx.textAlign = "left";
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(868, y + 32, W - 44 - 868, 16);
    ctx.fillStyle = r.pass ? "#22c55e" : "#f59e0b";
    ctx.fillRect(868, y + 32, ((W - 44 - 868) * r.score) / 100, 16);
    ctx.fillStyle = "#64748b";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.fillText(`kuis ${r.quiz === null ? "—" : Math.round(r.quiz)} · kegiatan ${r.activity === null ? "—" : Math.round(r.activity)}`, 868, y + 64);
  });

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 19px system-ui, sans-serif";
  ctx.fillText(`Nilai CPMK = ${COURSE.weight.quiz * 100}% kuis + ${COURSE.weight.activity * 100}% kegiatan. Ganti siswa & lihat rincian: tombol "Capaian".`, 44, H - 34, W - 88);
}

export function ObeBoard({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const { student } = useObe();
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, texture };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    draw(canvas.getContext("2d")!, student);
    texture.needsUpdate = true;
  }, [canvas, texture, student]);
  const w = 3.0;
  const h = (w * H) / W;
  return (
    <group position={position} rotation={[0, rotation, 0]} name="ObeBoard">
      <mesh position={[0, 0, -0.03]} raycast={noRaycast}>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.06]} />
        <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0, 0.004]} raycast={noRaycast}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Zona kunjungan di dalam lab: [id kegiatan, x, z, jari-jari]. */
const ZONES: [string, number, number, number][] = [
  ["k3", 22.6, 2, 3.6],
  ["komponen", -9.6, 0.2, 4.6],
  ["pembanding", -0.6, -11.2, 4.8],
  ["pengisian", 12.9, -9.7, 4.2],
];

export function ObeTracker() {
  const t = useRef(0);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    t.current += delta;
    if (t.current < 0.6) return;
    t.current = 0;
    state.camera.getWorldPosition(p);
    for (const [id, x, z, r] of ZONES) if (Math.hypot(p.x - x, p.z - z) < r) recordVisit(id);
    // area parkir / SPBU (uji boros) di luar gedung
    if (Math.abs(p.x - PARKING.cx) < PARKING.hx + 3 && Math.abs(p.z - PARKING.cz) < PARKING.hz + 3) recordVisit("pengisian");
  });
  return null;
}
