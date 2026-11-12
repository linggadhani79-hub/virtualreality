import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { disableRaycast, fitModel, loadGlb, roundedRectShape, wrapText } from "../lib/glb";
import { modelUrl } from "../lib/quality";
import { playVRClickSound } from "../lib/vrAudio";
import { InfoSign, Scenery, StaticModel } from "./LabStations";

/**
 * Area parkir & SPBU di sisi barat, di luar lintasan uji.
 *
 *  - Jalan lingkar tempat dua mobil terus berjalan berdampingan waktu: mobil BENSIN dan mobil
 *    LISTRIK. Di atas tiap mobil ada meteran jarak, biaya, dan emisi yang terus bertambah.
 *  - Papan besar "Boros mana?" yang membandingkan keduanya secara langsung.
 *  - SPBU (pengisian bensin) berukuran nyata, petak parkir, dan mobil yang diparkir.
 *
 * Angka biaya adalah PERKIRAAN untuk bahan ajar (lihat ASSUMPTIONS); 1 m di lintasan dihitung
 * sebagai 100 m perjalanan supaya angkanya bergerak cukup cepat untuk diamati.
 */

const noRaycast = () => null;

/** Pusat area (X, Z) dan ukuran jalan lingkar (garis tengah): setengah lebar, setengah panjang, jari-jari sudut. */
export const PARKING = { cx: -47.5, cz: 5, hx: 14, hz: 15, r: 6, road: 5 };
const GROUND_W = PARKING.hx * 2 + PARKING.road; // 27 m (X)
const GROUND_D = PARKING.hz * 2 + PARKING.road; // 29 m (Z)
const X0 = PARKING.cx - GROUND_W / 2;
const Z0 = PARKING.cz - GROUND_D / 2;

const ASSUMPTIONS = {
  scale: 100, // 1 m di lintasan = 100 m perjalanan
  bensin: { lPer100: 8, rpPerL: 10000, co2PerL: 2.3 },
  listrik: { kwhPer100: 15, rpPerKwh: 2466 },
};
const RP_KM_BENSIN = (ASSUMPTIONS.bensin.lPer100 / 100) * ASSUMPTIONS.bensin.rpPerL; // Rp 800 / km
const RP_KM_LISTRIK = (ASSUMPTIONS.listrik.kwhPer100 / 100) * ASSUMPTIONS.listrik.rpPerKwh; // ± Rp 370 / km
const CO2_KM_BENSIN = (ASSUMPTIONS.bensin.lPer100 / 100) * ASSUMPTIONS.bensin.co2PerL; // kg / km

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Petak parkir: pusat X tiap petak (mobil menghadap utara / -Z). */
const BAY_Z = 13.2;
const BAY_W = 2.8;
const BAYS: { x: number; kind: "bensin" | "listrik" }[] = [
  { x: -51.7, kind: "bensin" },
  { x: -48.9, kind: "bensin" },
  { x: -46.1, kind: "listrik" },
  { x: -43.3, kind: "listrik" },
];

/** SPBU: ukuran nyata (kanopi ±13 m), memanjang di sumbu X. */
const STATION = { x: -47.5, z: -1.5, size: 13 };
const BOARD = { x: -58.8, z: 10.5 };

/** Kotak yang tidak bisa ditembus pemain (dipakai SOLIDS di TestLabEnvironment). SPBU sengaja
 *  tidak dimasukkan supaya pemain bisa berjalan ke bawah kanopi dan melihat pompa dari dekat. */
export const PARKING_SOLIDS = [
  // papan perbandingan
  { minX: BOARD.x - 0.4, maxX: BOARD.x + 0.4, minZ: BOARD.z - 3.3, maxZ: BOARD.z + 3.3 },
  // mobil yang diparkir
  { minX: BAYS[0].x - 1.1, maxX: BAYS[0].x + 1.1, minZ: BAY_Z - 2.4, maxZ: BAY_Z + 2.4 },
  { minX: BAYS[2].x - 1.1, maxX: BAYS[2].x + 1.1, minZ: BAY_Z - 2.4, maxZ: BAY_Z + 2.4 },
];

/* ---------------- lintasan lingkar ---------------- */

function buildLoop() {
  const { cx, cz, hx, hz, r } = PARKING;
  const pts: THREE.Vector3[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n));
  };
  const arc = (ax: number, az: number, a0: number, a1: number) => {
    const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.4);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector3(ax + Math.cos(a) * r, 0, az + Math.sin(a) * r));
    }
  };
  line(cx + hx - r, cz + hz, cx - hx + r, cz + hz);
  arc(cx - hx + r, cz + hz - r, Math.PI / 2, Math.PI);
  line(cx - hx, cz + hz - r, cx - hx, cz - hz + r);
  arc(cx - hx + r, cz - hz + r, Math.PI, Math.PI * 1.5);
  line(cx - hx + r, cz - hz, cx + hx - r, cz - hz);
  arc(cx + hx - r, cz - hz + r, -Math.PI / 2, 0);
  line(cx + hx, cz - hz + r, cx + hx, cz + hz - r);
  arc(cx + hx - r, cz + hz - r, 0, Math.PI / 2);
  const dist = [0];
  for (let i = 1; i <= pts.length; i++) dist.push(dist[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]));
  return { pts, dist, length: dist[pts.length] };
}

type LoopPath = ReturnType<typeof buildLoop>;

function samplePath(path: LoopPath, s: number, outPos: THREE.Vector3): number {
  const L = path.length;
  s = ((s % L) + L) % L;
  let lo = 0;
  let hi = path.pts.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.dist[mid] <= s) lo = mid;
    else hi = mid;
  }
  const a = path.pts[lo];
  const b = path.pts[(lo + 1) % path.pts.length];
  const seg = path.dist[lo + 1] - path.dist[lo] || 1;
  const t = (s - path.dist[lo]) / seg;
  outPos.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
  return Math.atan2(b.x - a.x, b.z - a.z); // arah hadap (rotasi Y agar +Z lokal searah gerak)
}

/* ---------------- tanah: aspal, jalan, petak parkir (satu tekstur) ---------------- */

function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const ppm = W / GROUND_W;
  const X = (x: number) => (x - X0) * ppm;
  const Z = (z: number) => (z - Z0) * ppm;
  ctx.fillStyle = "#2f3136";
  ctx.fillRect(0, 0, W, H);
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16000; i++) {
    const v = 36 + Math.floor(rnd() * 50);
    ctx.fillStyle = `rgba(${v},${v},${v + 5},0.55)`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }

  // jalan lingkar: pita lebih gelap + garis tepi putih + garis tengah putus-putus kuning
  const { cx, cz, hx, hz, r, road } = PARKING;
  const ring = (inset: number) => {
    const rr = Math.max(0.1, r - inset);
    ctx.beginPath();
    (ctx as any).roundRect(X(cx - hx + inset), Z(cz - hz + inset), (hx - inset) * 2 * ppm, (hz - inset) * 2 * ppm, rr * ppm);
  };
  ctx.lineJoin = "round";
  ring(0);
  ctx.strokeStyle = "#232529";
  ctx.lineWidth = road * ppm;
  ctx.stroke();
  for (const inset of [-road / 2 + 0.15, road / 2 - 0.15]) {
    ring(inset);
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 0.12 * ppm;
    ctx.stroke();
  }
  ring(0);
  ctx.setLineDash([1.6 * ppm, 1.6 * ppm]);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 0.12 * ppm;
  ctx.stroke();
  ctx.setLineDash([]);

  // petak parkir
  for (const bay of BAYS) {
    const x = X(bay.x - BAY_W / 2);
    const z = Z(BAY_Z - 2.3);
    if (bay.kind === "listrik") {
      ctx.fillStyle = "rgba(21,128,61,0.55)";
      ctx.fillRect(x, z, BAY_W * ppm, 4.6 * ppm);
    }
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 0.1 * ppm;
    ctx.strokeRect(x, z, BAY_W * ppm, 4.6 * ppm);
    ctx.save();
    ctx.translate(X(bay.x), Z(BAY_Z + 1.75));
    ctx.fillStyle = bay.kind === "listrik" ? "#bbf7d0" : "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${0.46 * ppm}px system-ui, sans-serif`;
    ctx.fillText(bay.kind === "listrik" ? "LISTRIK" : "BENSIN", 0, 0);
    ctx.restore();
  }
  // huruf P
  ctx.fillStyle = "#1d4ed8";
  ctx.fillRect(X(-40.6), Z(10.9), 1.4 * ppm, 1.4 * ppm);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${1.1 * ppm}px system-ui, sans-serif`;
  ctx.fillText("P", X(-39.9), Z(11.65));

  // lantai SPBU: beton terang + garis kuning
  ctx.fillStyle = "#6b7280";
  const sw = STATION.size + 1.2;
  const sd = STATION.size * 0.87 + 0.6;
  ctx.fillRect(X(STATION.x - sw / 2), Z(STATION.z - sd / 2), sw * ppm, sd * ppm);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 0.14 * ppm;
  ctx.strokeRect(X(STATION.x - sw / 2), Z(STATION.z - sd / 2), sw * ppm, sd * ppm);
}

/* ---------------- label meteran di atas mobil ---------------- */

type Meter = { title: string; color: string; lines: string[] };

function drawMeter(canvas: HTMLCanvasElement, m: Meter) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(11,18,32,0.9)";
  ctx.beginPath();
  (ctx as any).roundRect(4, 4, W - 8, H - 8, 26);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = m.color;
  ctx.stroke();
  ctx.textBaseline = "top";
  ctx.fillStyle = m.color;
  ctx.font = "900 46px system-ui, sans-serif";
  ctx.fillText(m.title, 28, 22);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 40px system-ui, sans-serif";
  m.lines.forEach((l, i) => ctx.fillText(l, 28, 84 + i * 50));
}

/* ---------------- papan perbandingan ---------------- */

function drawBoard(canvas: HTMLCanvasElement, km: number) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1220");
  g.addColorStop(1, "#13233f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#facc15";
  ctx.font = "900 64px system-ui, sans-serif";
  ctx.fillText("BOROS MANA?  BENSIN vs LISTRIK", 44, 30);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 38px system-ui, sans-serif";
  ctx.fillText(`Kedua mobil sudah menempuh ${km.toFixed(1).replace(".", ",")} km`, 44, 108);

  const costB = km * RP_KM_BENSIN;
  const costL = km * RP_KM_LISTRIK;
  const maxBar = W - 88;
  const rows: [string, string, number, string, string][] = [
    ["MOBIL BENSIN", "#f97316", 1, rupiah(costB), `${((km * ASSUMPTIONS.bensin.lPer100) / 100).toFixed(1).replace(".", ",")} liter  ·  ${(km * CO2_KM_BENSIN).toFixed(1).replace(".", ",")} kg CO₂ dari knalpot`],
    ["MOBIL LISTRIK", "#22c55e", RP_KM_LISTRIK / RP_KM_BENSIN, rupiah(costL), `${((km * ASSUMPTIONS.listrik.kwhPer100) / 100).toFixed(1).replace(".", ",")} kWh  ·  0 kg CO₂ dari knalpot`],
  ];
  rows.forEach(([name, color, frac, cost, detail], i) => {
    const y = 180 + i * 178;
    ctx.fillStyle = color;
    ctx.font = "900 44px system-ui, sans-serif";
    ctx.fillText(name, 44, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 56px system-ui, sans-serif";
    ctx.fillText(cost, W - 44, y - 8);
    ctx.textAlign = "left";
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(44, y + 62, maxBar, 40);
    ctx.fillStyle = color;
    ctx.fillRect(44, y + 62, Math.max(6, maxBar * frac), 40);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText(detail, 44, y + 112);
  });

  ctx.fillStyle = "#4ade80";
  ctx.font = "900 46px system-ui, sans-serif";
  ctx.fillText(`Hemat ${rupiah(costB - costL)}  (±${Math.round((1 - RP_KM_LISTRIK / RP_KM_BENSIN) * 100)}% lebih murah)`, 44, 548);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 26px system-ui, sans-serif";
  const note = `Perkiraan: bensin ${ASSUMPTIONS.bensin.lPer100} L/100 km × Rp ${ASSUMPTIONS.bensin.rpPerL.toLocaleString("id-ID")}/L; listrik ${ASSUMPTIONS.listrik.kwhPer100} kWh/100 km × Rp ${ASSUMPTIONS.listrik.rpPerKwh.toLocaleString("id-ID")}/kWh. Emisi pembangkit listrik tidak dihitung.`;
  wrapText(ctx, note, W - 88).forEach((l, i) => ctx.fillText(l, 44, 616 + i * 32));
}

const resetGeometry = new THREE.ExtrudeGeometry(roundedRectShape(1.5, 0.42, 0.1), {
  depth: 0.05,
  bevelEnabled: true,
  bevelThickness: 0.012,
  bevelSize: 0.012,
  bevelSegments: 2,
  curveSegments: 6,
});

/* ---------------- komponen utama ---------------- */

type CarDef = { model: string; offset: number; flip: boolean };

export function ParkingArea({ hall }: { hall: { x0: number; x1: number; z0: number; z1: number } }) {
  const root = useRef<THREE.Group>(null);
  const path = useMemo(buildLoop, []);
  const cars: CarDef[] = useMemo(
    () => [
      { model: "mobil-klasik", offset: 0, flip: false },
      { model: "mobil-mpv", offset: 0.5, flip: true },
    ],
    [],
  );
  const carRefs = useRef<(THREE.Group | null)[]>([]);
  const labelRefs = useRef<(THREE.Mesh | null)[]>([]);
  const [carObjects, setCarObjects] = useState<(THREE.Object3D | null)[]>([null, null]);
  const travelled = useRef(0); // meter di lintasan
  const lastDraw = useRef(-1);
  const [hotReset, setHotReset] = useState(false);

  const ground = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.round((1024 * GROUND_D) / GROUND_W);
    drawGround(c.getContext("2d")!, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);

  const meters = useMemo(
    () =>
      [0, 1].map(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 250;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return { canvas, texture };
      }),
    [],
  );
  const board = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, texture };
  }, []);

  useEffect(
    () => () => {
      ground.dispose();
      board.texture.dispose();
      meters.forEach((m) => m.texture.dispose());
    },
    [ground, board, meters],
  );

  useEffect(() => {
    let cancelled = false;
    cars.forEach((car, i) => {
      loadGlb(modelUrl(car.model))
        .then((shared) => {
          if (cancelled) return;
          const model = shared.clone();
          // Model memanjang di sumbu X; putar agar hidung mobil searah +Z lokal (arah gerak)
          const holder = new THREE.Group();
          model.rotation.y = car.flip ? Math.PI / 2 : -Math.PI / 2;
          holder.add(model);
          fitModel(holder, 4.5);
          disableRaycast(holder);
          setCarObjects((prev) => {
            const next = [...prev];
            next[i] = holder;
            return next;
          });
        })
        .catch((err) => console.warn(`[ParkingArea] Model ${car.model} gagal dimuat:`, err));
    });
    return () => {
      cancelled = true;
    };
  }, [cars]);

  const redraw = () => {
    const km = (travelled.current * ASSUMPTIONS.scale) / 1000;
    drawMeter(meters[0].canvas, {
      title: "MOBIL BENSIN",
      color: "#f97316",
      lines: [`${km.toFixed(1).replace(".", ",")} km  ·  ${rupiah(km * RP_KM_BENSIN)}`, `${(km * CO2_KM_BENSIN).toFixed(1).replace(".", ",")} kg CO₂ knalpot`],
    });
    drawMeter(meters[1].canvas, {
      title: "MOBIL LISTRIK",
      color: "#22c55e",
      lines: [`${km.toFixed(1).replace(".", ",")} km  ·  ${rupiah(km * RP_KM_LISTRIK)}`, "0 kg CO₂ knalpot"],
    });
    drawBoard(board.canvas, km);
    meters[0].texture.needsUpdate = true;
    meters[1].texture.needsUpdate = true;
    board.texture.needsUpdate = true;
  };

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDelta) => {
    const group = root.current;
    if (!group) return;
    // Dari dalam gedung area ini tertutup tembok: tidak perlu digambar
    // (saat pengembangan, kamera uji tangkapan layar dipakai bila ada)
    const cam: THREE.Camera = (import.meta.env.DEV && (window as any).__shotCam) || state.camera;
    cam.getWorldPosition(camPos);
    const inside = camPos.x > hall.x0 && camPos.x < hall.x1 && camPos.z > hall.z0 && camPos.z < hall.z1;
    group.visible = !inside;
    if (inside) return;

    const delta = Math.min(rawDelta, 0.05);
    travelled.current += delta * 5.2; // m/s
    cars.forEach((car, i) => {
      const g = carRefs.current[i];
      if (!g) return;
      const heading = samplePath(path, travelled.current + car.offset * path.length, tmp);
      g.position.copy(tmp);
      g.rotation.y = heading;
      const label = labelRefs.current[i];
      if (label) {
        label.position.set(tmp.x, 3.1, tmp.z);
        label.rotation.y = Math.atan2(camPos.x - tmp.x, camPos.z - tmp.z);
      }
    });
    // Meteran & papan digambar ulang ±2 kali per detik (bukan tiap frame)
    if (state.clock.elapsedTime - lastDraw.current > 0.5) {
      lastDraw.current = state.clock.elapsedTime;
      redraw();
    }
  });

  const reset = (e?: any) => {
    e?.stopPropagation?.();
    playVRClickSound();
    travelled.current = 0;
    redraw();
  };

  return (
    <group ref={root} name="ParkingArea">
      {/* tanah beraspal + sambungan ke lintasan uji */}
      <mesh position={[PARKING.cx, 0.02, PARKING.cz]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[GROUND_W, GROUND_D]} />
        <meshStandardMaterial map={ground} roughness={0.95} metalness={0.02} />
      </mesh>
      <mesh position={[X0 + GROUND_W + 1.6, 0.018, PARKING.cz]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[3.4, 5]} />
        <meshStandardMaterial color="#2f3136" roughness={0.95} />
      </mesh>

      {/* dua mobil yang terus berjalan + meteran di atasnya */}
      {cars.map((car, i) => (
        <group key={car.model}>
          <group
            ref={(g) => {
              carRefs.current[i] = g;
            }}
          >
            {carObjects[i] && <primitive object={carObjects[i]!} />}
          </group>
          <mesh
            ref={(m) => {
              labelRefs.current[i] = m;
            }}
            raycast={noRaycast}
            renderOrder={10}
          >
            <planeGeometry args={[3.6, 1.406]} />
            <meshBasicMaterial map={meters[i].texture} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* papan perbandingan (menghadap timur, ke arah datangnya pemain) */}
      <group position={[BOARD.x, 0, BOARD.z]} rotation={[0, Math.PI / 2, 0]}>
        {[-2.9, 2.9].map((x) => (
          <mesh key={x} position={[x, 1.2, -0.06]} raycast={noRaycast}>
            <cylinderGeometry args={[0.09, 0.11, 2.4, 14]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 3.0, -0.06]} raycast={noRaycast}>
          <boxGeometry args={[6.6, 3.8, 0.1]} />
          <meshStandardMaterial color="#0b1220" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 3.0, 0]} raycast={noRaycast}>
          <planeGeometry args={[6.4, 3.6]} />
          <meshBasicMaterial map={board.texture} toneMapped={false} />
        </mesh>
        {/* tombol ulang dari nol */}
        <group position={[0, 0.82, 0.02]}>
          <mesh
            name="Parking_btn_reset"
            geometry={resetGeometry}
            scale={hotReset ? 1.05 : 1}
            userData={{ isVRButton: true, isInteractableMesh: true, onClick: reset }}
            onClick={reset}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHotReset(true);
            }}
            onPointerOut={() => setHotReset(false)}
          >
            <meshStandardMaterial color="#b45309" emissive="#b45309" emissiveIntensity={hotReset ? 0.5 : 0.15} roughness={0.35} />
          </mesh>
          <ResetLabel />
        </group>
      </group>

      {/* SPBU */}
      <StaticModel model="spbu" size={STATION.size} position={[STATION.x, 0, STATION.z]} rotation={Math.PI / 2} lod={false} />
      <InfoSign
        title="SPBU — Pengisian Bensin"
        subtitle="Mobil bermesin bakar"
        accent="#f97316"
        position={[-38.6, 0, 6.6]}
        facing={0.9}
        facts={[
          "Isi penuh ±5 menit, tetapi hanya 25–30% energi bensin menjadi gerak; sisanya panas.",
          "Setiap liter bensin yang dibakar menghasilkan ±2,3 kg CO₂ dari knalpot.",
          "Mobil listrik mengisi daya lebih lama, tetapi bisa dilakukan di rumah saat diparkir.",
        ]}
      />

      {/* penunjuk arah di halaman depan gedung */}
      <InfoSign
        title="Area Parkir & SPBU"
        subtitle="Ke kiri dari pintu depan, ±40 m"
        accent="#facc15"
        position={[-8.5, 0, 11.5]}
        facing={0.9}
        facts={[
          "Bandingkan langsung biaya mobil bensin dan mobil listrik yang sedang berjalan.",
          "Lihat SPBU, petak parkir, dan papan \"Boros mana?\".",
        ]}
      />

      {/* mobil yang diparkir */}
      <StaticModel model="mobil-klasik" size={4.5} position={[BAYS[0].x, 0, BAY_Z]} rotation={Math.PI / 2} lod={false} />
      <StaticModel model="zerone" size={4.5} position={[BAYS[2].x, 0, BAY_Z]} rotation={Math.PI / 2} lod={false} />

      {/* pepohonan di sekeliling */}
      <Scenery
        model="redwood"
        size={15}
        places={[
          [-65.5, -7, 0.3],
          [-66, 7, 2.1, 1.1],
          [-64.5, 21, 4.0, 0.95],
        ]}
      />
      <Scenery
        model="pisang"
        size={3.6}
        places={[
          [-38.5, 24.6, 0.4],
          [-48, 24.9, 2.2, 1.1],
          [-57, 24.7, 4.1, 0.9],
          [-42, -14.6, 1.3, 1.05],
          [-54, -14.8, 3.0],
        ]}
      />
    </group>
  );
}

function ResetLabel() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 144;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 62px system-ui, sans-serif";
    ctx.fillText("ULANG DARI 0", 256, 76);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 0, 0.066]} raycast={noRaycast}>
      <planeGeometry args={[1.4, 0.39]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
