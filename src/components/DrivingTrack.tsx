import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { disableRaycast, fitModel, loadGlb } from "../lib/glb";
import { modelUrl } from "../lib/quality";

/**
 * Lintasan uji di luar gedung, mirip lapangan ujian SIM: jalan aspal melingkar mengelilingi lab
 * dengan rintangan zig-zag, jalur sempit, polisi tidur, dan garis henti di penyeberangan.
 * Sebuah mobil listrik berkeliling terus-menerus dan tiap dua putaran menepi untuk mengisi daya
 * di stasiun pengisian tenaga surya.
 *
 * Jalan = pita mengikuti persegi panjang bersudut bulat; posisi mobil = titik pada pita itu +
 * simpangan samping (untuk zig-zag dan menepi), jadi tidak ada fisika yang perlu dihitung.
 */

const noRaycast = () => null;
const ROAD_W = 6;
const CRUISE = 6.5; // m/s
const ACCEL = 2.4;

type Loop = { cx: number; cz: number; hx: number; hz: number; r: number };

/** Titik-titik garis tengah (berlawanan arah jarum jam dilihat dari atas), jarak ± 0,5 m. */
function buildCenterline({ cx, cz, hx, hz, r }: Loop) {
  const pts: THREE.Vector3[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5);
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n));
  };
  const arc = (ax: number, az: number, a0: number, a1: number) => {
    const n = Math.ceil((Math.abs(a1 - a0) * r) / 0.5);
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector3(ax + Math.cos(a) * r, 0, az + Math.sin(a) * r));
    }
  };
  // depan (z besar) dari kanan ke kiri → kiri → belakang → kanan
  line(cx + hx - r, cz + hz, cx - hx + r, cz + hz);
  arc(cx - hx + r, cz + hz - r, Math.PI / 2, Math.PI);
  line(cx - hx, cz + hz - r, cx - hx, cz - hz + r);
  arc(cx - hx + r, cz - hz + r, Math.PI, Math.PI * 1.5);
  line(cx - hx + r, cz - hz, cx + hx - r, cz - hz);
  arc(cx + hx - r, cz - hz + r, -Math.PI / 2, 0);
  line(cx + hx, cz - hz + r, cx + hx, cz + hz - r);
  arc(cx + hx - r, cz + hz - r, 0, Math.PI / 2);
  const dist: number[] = [0];
  for (let i = 1; i <= pts.length; i++) dist.push(dist[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]));
  return { pts, dist, length: dist[pts.length] };
}

function drawRoad(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#2a2c30";
  ctx.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 5000; i++) {
    const v = 34 + Math.floor(rnd() * 44);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.6)`;
    ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
  }
  // garis tepi putih + garis tengah kuning putus-putus
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(w * 0.035, 0, w * 0.022, h);
  ctx.fillRect(w * 0.943, 0, w * 0.022, h);
  ctx.fillStyle = "#facc15";
  ctx.fillRect(w * 0.492, 0, w * 0.016, h * 0.5);
}

function makeSignTexture(lines: string[], bg: string, fg = "#ffffff") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.beginPath();
  (ctx as any).roundRect?.(6, 6, 500, 244, 34) ?? ctx.rect(6, 6, 500, 244);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.font = `900 ${i === 0 ? 86 : 50}px system-ui, sans-serif`;
    ctx.fillText(l, 256, lines.length === 1 ? 132 : i === 0 ? 96 : 186, 460);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function RoadSign({ position, facing, lines, bg, fg }: { position: [number, number, number]; facing: number; lines: string[]; bg: string; fg?: string }) {
  const texture = useMemo(() => makeSignTexture(lines, bg, fg), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={position} rotation={[0, facing, 0]}>
      <mesh position={[0, 1.2, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.04, 0.05, 2.4, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* dua muka, supaya terbaca dari kedua arah */}
      {[0, Math.PI].map((r) => (
        <mesh key={r} position={[0, 2.45, r ? -0.03 : 0.03]} rotation={[0, r, 0]} raycast={noRaycast}>
          <planeGeometry args={[1.5, 0.75]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const coneGeometry = new THREE.LatheGeometry(
  [
    [0.0, 0.03],
    [0.16, 0.03],
    [0.16, 0.06],
    [0.125, 0.07],
    [0.03, 0.6],
    [0.0, 0.62],
  ].map(([r, y]) => new THREE.Vector2(r, y)),
  18,
);
const poleGeometry = new THREE.CapsuleGeometry(0.06, 0.9, 4, 12);
const bumpGeometry = (() => {
  const g = new THREE.CylinderGeometry(0.22, 0.22, ROAD_W - 0.5, 16, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 0.45, 1);
  return g;
})();

export function DrivingTrack({ loop }: { loop: Loop }) {
  const path = useMemo(() => buildCenterline(loop), [loop]);
  const L = path.length;

  // jarak sepanjang lintasan untuk tiap ruas lurus
  const front = 2 * loop.hx - 2 * loop.r;
  const side = 2 * loop.hz - 2 * loop.r;
  const corner = (Math.PI / 2) * loop.r;
  const sFront = 0;
  const sLeft = front + corner;
  const sBack = sLeft + side + corner;
  const sRight = sBack + front + corner;

  // ---- rintangan (dalam jarak sepanjang lintasan) ----
  const zebraS = sFront + (loop.cx + loop.hx - loop.r); // di depan pintu gedung (x = 0)
  const slalom = { s0: sLeft + 6, d: 5, n: 6, amp: 1.25 };
  const gate = { s0: sBack + 10, len: 12 };
  const bumps = [sBack + front - 16, sBack + front - 10];
  const chargeS = sRight + side / 2;
  const PULL = -1.7; // menepi ke luar (negatif = sisi luar lintasan)

  const pointAt = (s: number, out: THREE.Vector3, tan?: THREE.Vector3) => {
    const d = ((s % L) + L) % L;
    let lo = 0;
    let hi = path.pts.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (path.dist[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = path.pts[lo];
    const b = path.pts[(lo + 1) % path.pts.length];
    const t = (d - path.dist[lo]) / Math.max(1e-6, path.dist[lo + 1] - path.dist[lo]);
    out.lerpVectors(a, b, t);
    if (tan) tan.subVectors(b, a).normalize();
    return out;
  };
  const smooth = (x: number) => {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
  };
  /** simpangan ke samping: positif = ke dalam lintasan */
  const lateralAt = (s: number, charging: boolean) => {
    let lat = 0;
    const end = slalom.s0 + slalom.d * (slalom.n - 1);
    if (s > slalom.s0 - slalom.d && s < end + slalom.d) {
      const env = smooth((s - (slalom.s0 - slalom.d)) / slalom.d) * smooth((end + slalom.d - s) / slalom.d);
      lat += Math.cos((Math.PI * (s - slalom.s0)) / slalom.d) * slalom.amp * env;
    }
    if (charging) lat += PULL * smooth((s - (chargeS - 14)) / 10) * smooth((chargeS + 14 - s) / 10);
    return lat;
  };
  const speedLimit = (s: number) => {
    const near = (c: number, r: number) => Math.abs(s - c) < r;
    if (s > slalom.s0 - 8 && s < slalom.s0 + slalom.d * slalom.n + 2) return 3.2;
    if (s > gate.s0 - 6 && s < gate.s0 + gate.len + 2) return 2.6;
    if (bumps.some((b) => near(b, 5))) return 1.8;
    return CRUISE;
  };

  // ---- geometri jalan ----
  const roadTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    drawRoad(c.getContext("2d")!, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }, []);
  const road = useMemo(() => {
    const n = path.pts.length;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx: number[] = [];
    const center = new THREE.Vector3(loop.cx, 0, loop.cz);
    const tan = new THREE.Vector3();
    const nor = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const p = path.pts[i % n];
      tan.subVectors(path.pts[(i + 1) % n], path.pts[(i - 1 + n) % n]).normalize();
      nor.set(-tan.z, 0, tan.x);
      // pastikan normal menunjuk ke dalam lintasan
      if (nor.dot(center.clone().sub(p)) < 0) nor.negate();
      const v = path.dist[i] / 6;
      pos.set([p.x + nor.x * (ROAD_W / 2), 0, p.z + nor.z * (ROAD_W / 2)], i * 6);
      pos.set([p.x - nor.x * (ROAD_W / 2), 0, p.z - nor.z * (ROAD_W / 2)], i * 6 + 3);
      uv.set([0, v], i * 4);
      uv.set([1, v], i * 4 + 2);
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [path, loop]);
  useEffect(
    () => () => {
      road.dispose();
      roadTex.dispose();
    },
    [road, roadTex],
  );

  // ---- letak benda di tepi jalan ----
  const place = (s: number, lat: number) => {
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    pointAt(s, p, t);
    const n = new THREE.Vector3(-t.z, 0, t.x);
    if (n.dot(new THREE.Vector3(loop.cx, 0, loop.cz).sub(p)) < 0) n.negate();
    p.addScaledVector(n, lat);
    return { p, heading: Math.atan2(t.x, t.z) };
  };
  const cones = useMemo(() => Array.from({ length: slalom.n }, (_, i) => place(slalom.s0 + i * slalom.d, 0)), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const gatePoles = useMemo(
    () => Array.from({ length: 7 }, (_, i) => [place(gate.s0 + i * 2, 1.35), place(gate.s0 + i * 2, -1.35)]).flat(),
    [path], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bumpPlaces = useMemo(() => bumps.map((b) => place(b, 0)), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const zebra = useMemo(() => place(zebraS, 0), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const station = useMemo(() => place(chargeS, -(ROAD_W / 2 + 3.2)), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const bay = useMemo(() => place(chargeS, PULL - 0.2), [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- model mobil & stasiun ----
  const [car, setCar] = useState<THREE.Object3D | null>(null);
  const carWheels = useRef<{ node: THREE.Object3D; radius: number }[]>([]);
  const [solar, setSolar] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGlb(modelUrl("mobil-konsep"))
      .then((shared) => {
        if (cancelled) return;
        const root = shared.clone();
        const scale = fitModel(root, 4.4);
        disableRaycast(root);
        // Roda dipisah menjadi node "wheel_*" (scripts/split-fused-wheels.mjs) supaya bisa berputar
        const wheels: { node: THREE.Object3D; radius: number }[] = [];
        let wheelMat: THREE.Material | null = null;
        root.traverse((o) => {
          if (!o.name.startsWith("wheel_")) return;
          wheels.push({ node: o, radius: ((o.userData.radius as number) || 0.16) * scale });
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            // dua sisi: bagian dalam roda hasil potongan tidak tampak bolong saat berputar
            if (!wheelMat) {
              wheelMat = (m.material as THREE.Material).clone();
              wheelMat.side = THREE.DoubleSide;
            }
            m.material = wheelMat;
          }
        });
        carWheels.current = wheels;
        setCar(root);
      })
      .catch((err) => console.warn("[DrivingTrack] Mobil gagal dimuat:", err));
    loadGlb(modelUrl("stasiun-surya"))
      .then((shared) => {
        if (cancelled) return;
        const root = shared.clone();
        fitModel(root, 8);
        disableRaycast(root);
        setSolar(root);
      })
      .catch((err) => console.warn("[DrivingTrack] Stasiun gagal dimuat:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- papan status pengisian ----
  const status = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas, texture };
  }, []);
  useEffect(() => () => status.texture.dispose(), [status]);
  const drawStatus = (pct: number) => {
    const ctx = status.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 160);
    ctx.fillStyle = "rgba(11,18,32,0.92)";
    ctx.beginPath();
    (ctx as any).roundRect?.(4, 4, 504, 152, 30) ?? ctx.rect(4, 4, 504, 152);
    ctx.fill();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#4ade80";
    ctx.font = "900 44px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`MENGISI DAYA  ${pct}%`, 30, 24);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(30, 92, 452, 36);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(30, 92, 4.52 * pct, 36);
    status.texture.needsUpdate = true;
  };

  // ---- gerak mobil ----
  const carRef = useRef<THREE.Group>(null);
  const statusRef = useRef<THREE.Mesh>(null);
  const cableRef = useRef<THREE.Mesh>(null);
  const sim = useRef({ s: sRight + side - 4, v: 0, lap: 0, wait: 0, stopped: "" as "" | "zebra" | "charge", lastPct: -1, didZebra: false, didCharge: false });
  const _p = useRef(new THREE.Vector3());
  const _t = useRef(new THREE.Vector3());
  const _n = useRef(new THREE.Vector3());
  const _ahead = useRef(new THREE.Vector3());
  const center = useMemo(() => new THREE.Vector3(loop.cx, 0, loop.cz), [loop]);

  useFrame((state, rawDelta) => {
    const g = carRef.current;
    if (!g) return;
    const delta = Math.min(rawDelta, 0.05);
    const m = sim.current;
    const charging = m.lap % 2 === 1; // tiap dua putaran mampir mengisi daya
    const sLap = m.s % L;

    // titik henti berikutnya: garis henti penyeberangan, atau stasiun pengisian
    let stopAt = -1;
    let stopKind: "zebra" | "charge" = "zebra";
    if (!m.didZebra && sLap < zebraS - 3.2 + 0.2) {
      stopAt = zebraS - 3.2;
    } else if (charging && !m.didCharge && sLap < chargeS + 0.2) {
      stopAt = chargeS;
      stopKind = "charge";
    }

    if (m.wait > 0) {
      m.wait -= delta;
      m.v = 0;
      if (m.stopped === "charge") {
        const total = 9;
        const pct = Math.min(100, Math.round(35 + (1 - m.wait / total) * 65));
        if (pct !== m.lastPct) {
          m.lastPct = pct;
          drawStatus(pct);
        }
      }
      if (m.wait <= 0) m.stopped = "";
    } else {
      let target = speedLimit(sLap);
      if (stopAt >= 0) {
        const gap = stopAt - sLap;
        target = Math.min(target, Math.sqrt(Math.max(0, 2 * ACCEL * 0.8 * gap)));
        if (gap < 0.15 && m.v < 0.4) {
          m.wait = stopKind === "charge" ? 9 : 2.2;
          m.stopped = stopKind;
          if (stopKind === "charge") m.didCharge = true;
          else m.didZebra = true;
        }
      }
      m.v += Math.sign(target - m.v) * Math.min(Math.abs(target - m.v), ACCEL * delta);
      const before = Math.floor(m.s / L);
      const ds = Math.max(m.v, stopAt >= 0 ? 0.25 : 0) * delta;
      m.s += ds;
      // roda menggelinding sesuai jarak tempuh (depan mobil = -X, poros roda = Z)
      for (const w of carWheels.current) w.node.rotation.z += ds / w.radius;
      if (Math.floor(m.s / L) !== before) {
        m.lap++;
        m.didZebra = false;
        m.didCharge = false;
      }
    }

    const pose = (s: number, out: THREE.Vector3) => {
      pointAt(s, _p.current, _t.current);
      _n.current.set(-_t.current.z, 0, _t.current.x);
      if (_n.current.dot(center.clone().sub(_p.current)) < 0) _n.current.negate();
      return out.copy(_p.current).addScaledVector(_n.current, lateralAt(((s % L) + L) % L, charging));
    };
    pose(m.s, g.position);
    pose(m.s + 1.2, _ahead.current);
    g.position.y = 0.02;
    // bagian depan model menghadap -X
    g.rotation.y = Math.atan2(_ahead.current.z - g.position.z, -(_ahead.current.x - g.position.x));
    // polisi tidur: mobil terangkat sedikit
    for (const b of bumps) {
      const d = Math.abs(sLap - b);
      if (d < 1.6) g.position.y += Math.cos((d / 1.6) * (Math.PI / 2)) * 0.07;
    }
    const isCharging = m.stopped === "charge";
    if (statusRef.current) {
      statusRef.current.visible = isCharging;
      statusRef.current.quaternion.copy(state.camera.quaternion);
    }
    if (cableRef.current) cableRef.current.visible = isCharging;
  });

  const cable = useMemo(() => {
    const a = bay.p.clone().setY(0.75);
    const b = station.p.clone().setY(1.0);
    const mid = a.clone().lerp(b, 0.5).setY(0.25);
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 24, 0.035, 8);
  }, [bay, station]);
  useEffect(() => () => cable.dispose(), [cable]);

  return (
    <group name="DrivingTrack">
      {/* jalan aspal */}
      <mesh geometry={road} position={[0, 0.012, 0]} raycast={noRaycast}>
        <meshStandardMaterial map={roadTex} roughness={0.95} metalness={0} />
      </mesh>

      {/* ----- 1. Garis henti + penyeberangan di depan pintu ----- */}
      <group position={[zebra.p.x, 0.02, zebra.p.z]} rotation={[0, zebra.heading, 0]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[(i - 3) * 0.8, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <planeGeometry args={[0.45, 3.2]} />
            <meshBasicMaterial color="#f8fafc" toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 0, -2.4]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[ROAD_W - 0.6, 0.35]} />
          <meshBasicMaterial color="#f8fafc" toneMapped={false} />
        </mesh>
      </group>
      <RoadSign position={[zebra.p.x + 5.2, 0, zebra.p.z + ROAD_W / 2 + 0.8]} facing={Math.PI / 2} lines={["STOP"]} bg="#dc2626" />

      {/* ----- 2. Zig-zag ----- */}
      {cones.map((c, i) => (
        <group key={i} position={[c.p.x, 0.012, c.p.z]}>
          <mesh geometry={coneGeometry} raycast={noRaycast}>
            <meshStandardMaterial color="#f97316" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.3, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.07, 0.092, 0.12, 16, 1, true]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
      <RoadSign position={[cones[0].p.x - ROAD_W / 2 - 0.8, 0, cones[0].p.z + 8]} facing={0} lines={["ZIG-ZAG", "Uji kelincahan"]} bg="#1d4ed8" />

      {/* ----- 3. Jalur sempit ----- */}
      {gatePoles.map((c, i) => (
        <group key={i} position={[c.p.x, 0, c.p.z]}>
          <mesh geometry={poleGeometry} position={[0, 0.52, 0]} raycast={noRaycast}>
            <meshStandardMaterial color={i % 4 < 2 ? "#facc15" : "#f8fafc"} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.03, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.16, 0.18, 0.06, 14]} />
            <meshStandardMaterial color="#111827" roughness={0.8} />
          </mesh>
        </group>
      ))}
      <RoadSign position={[gatePoles[0].p.x - 6, 0, gatePoles[0].p.z - ROAD_W / 2 - 2.2]} facing={-Math.PI / 2} lines={["JALUR SEMPIT", "Uji ketepatan"]} bg="#1d4ed8" />

      {/* ----- 4. Polisi tidur ----- */}
      {bumpPlaces.map((b, i) => (
        <mesh key={i} geometry={bumpGeometry} position={[b.p.x, 0.012, b.p.z]} rotation={[0, b.heading, 0]} raycast={noRaycast}>
          <meshStandardMaterial color={i % 2 ? "#facc15" : "#111827"} roughness={0.7} />
        </mesh>
      ))}
      <RoadSign position={[bumpPlaces[0].p.x - 5, 0, bumpPlaces[0].p.z - ROAD_W / 2 - 0.8]} facing={-Math.PI / 2} lines={["PELAN", "Polisi tidur"]} bg="#f59e0b" fg="#111827" />

      {/* ----- 5. Stasiun pengisian tenaga surya ----- */}
      <group position={[station.p.x, 0, station.p.z]} rotation={[0, Math.PI / 2, 0]}>
        {solar && <primitive object={solar} />}
      </group>
      <mesh position={[bay.p.x, 0.022, bay.p.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[2.6, 6.2]} />
        <meshBasicMaterial color="#16a34a" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <RoadSign position={[station.p.x - 2.4, 0, station.p.z - 6.5]} facing={-Math.PI / 2 + Math.PI} lines={["EV CHARGING", "Tenaga surya"]} bg="#16a34a" />
      <mesh ref={cableRef} geometry={cable} visible={false} raycast={noRaycast}>
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.8} roughness={0.5} />
      </mesh>
      <mesh ref={statusRef} position={[bay.p.x, 2.6, bay.p.z]} visible={false} raycast={noRaycast}>
        <planeGeometry args={[2.6, 0.81]} />
        <meshBasicMaterial map={status.texture} transparent toneMapped={false} depthWrite={false} />
      </mesh>

      {/* ----- Mobil listrik yang berkeliling ----- */}
      <group ref={carRef}>{car && <primitive object={car} />}</group>
    </group>
  );
}
