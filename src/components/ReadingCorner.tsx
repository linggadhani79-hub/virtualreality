import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { roundedRectShape, wrapText } from "../lib/glb";
import { TeachingModule, getModules, illustrationUrl, loadModules, subscribeModules } from "../lib/modules";
import { playVRClickSound } from "../lib/vrAudio";

/**
 * Pojok Baca: meja dengan buku-buku modul ajar. Memilih sebuah buku membukanya sebagai
 * slideshow di layar besar, yang nyaman dibaca dari dalam headset.
 *
 * Arah lokal: layar menghadap -Z, pembaca berdiri di sisi -Z meja.
 */

const noRaycast = () => null;
const SCREEN_W = 5.2;
const SCREEN_H = SCREEN_W * (9 / 16);

// Gambar ilustrasi dimuat sekali per alamat. Tidak memakai event "load" (bisa terlewat saat
// halaman sibuk): komponen memeriksa tiap frame apakah gambar yang ditunggu sudah siap.
const images = new Map<string, HTMLImageElement>();
function illustration(id: string): HTMLImageElement {
  const url = illustrationUrl(id);
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img;
}
const ready = (img: HTMLImageElement | null) => !!img && img.complete && img.naturalWidth > 0;

function drawSlide(
  canvas: HTMLCanvasElement,
  mod: TeachingModule | null,
  slideIndex: number,
  moduleCount: number,
): boolean {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b1220");
  g.addColorStop(1, "#13233f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";

  if (!mod) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#67e8f9";
    ctx.font = "800 60px system-ui, sans-serif";
    ctx.fillText("POJOK BACA  ·  MODUL AJAR DIGITAL", W / 2, 300);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 110px system-ui, sans-serif";
    ctx.fillText("Pilih buku di meja", W / 2, 400);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 50px system-ui, sans-serif";
    ctx.fillText(
      moduleCount ? `${moduleCount} modul tersedia — arahkan laser ke buku lalu tekan trigger` : "Belum ada modul",
      W / 2,
      580,
    );
    ctx.textAlign = "left";
    return true;
  }

  const slide = mod.slides[slideIndex];
  const pic = slide.image ? illustration(slide.image) : null;
  const img = ready(pic) ? pic : null;
  const hasImage = !!slide.image;
  // dengan ilustrasi: teks di kolom kiri, gambar + keterangan di kanan
  const textW = hasImage ? 1000 : W - 140;
  // kepala
  ctx.fillStyle = mod.color;
  ctx.fillRect(0, 0, W, 128);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 54px system-ui, sans-serif";
  ctx.fillText(mod.title, 70, 36, W - 520);
  ctx.textAlign = "right";
  ctx.font = "700 46px system-ui, sans-serif";
  ctx.fillText(`Slide ${slideIndex + 1} / ${mod.slides.length}`, W - 70, 42);
  ctx.textAlign = "left";

  // judul
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 92px system-ui, sans-serif";
  let y = 176;
  for (const line of wrapText(ctx, slide.title, textW).slice(0, 2)) {
    ctx.fillText(line, 70, y);
    y += 104;
  }
  ctx.fillStyle = mod.color;
  ctx.fillRect(70, y + 6, 220, 10);
  y += 54;

  // isi: butir "- " dan nomor "1. " dibuat menjorok

  // ---- kartu ilustrasi ----
  if (hasImage) {
    const cx = 1110;
    const cy = 176;
    const cw = W - cx - 70;
    const ch = Math.round(cw * 0.75);
    ctx.fillStyle = "#0f1a2e";
    ctx.beginPath();
    (ctx as any).roundRect?.(cx - 12, cy - 12, cw + 24, ch + 110, 28) ?? ctx.rect(cx - 12, cy - 12, cw + 24, ch + 110);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    (ctx as any).roundRect?.(cx, cy, cw, ch, 20) ?? ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    if (img) ctx.drawImage(img, cx, cy, cw, ch);
    else {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = "#64748b";
      ctx.font = "600 40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Memuat gambar…", cx + cw / 2, cy + ch / 2 - 20);
      ctx.textAlign = "left";
    }
    ctx.restore();
    ctx.strokeStyle = mod.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    (ctx as any).roundRect?.(cx, cy, cw, ch, 20) ?? ctx.rect(cx, cy, cw, ch);
    ctx.stroke();
    if (slide.caption) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 34px system-ui, sans-serif";
      wrapText(ctx, slide.caption, cw)
        .slice(0, 2)
        .forEach((l, i) => ctx.fillText(l, cx, cy + ch + 22 + i * 42));
    }
  }
  const maxY = H - 110;
  // Ukuran huruf isi dikecilkan bertahap sampai seluruh teks muat (tidak terpotong "…")
  type Row = { text: string; bullet: boolean; num: string | null; first: boolean; gap?: boolean };
  const layout = (size: number) => {
    ctx.font = `500 ${size}px system-ui, sans-serif`;
    const rows: Row[] = [];
    for (const raw of slide.body.split("\n")) {
      const text = raw.trim();
      if (!text) {
        rows.push({ text: "", bullet: false, num: null, first: false, gap: true });
        continue;
      }
      const bullet = /^[-•]\s+/.test(text);
      const numbered = text.match(/^(\d+)[.)]\s+/);
      const content = bullet ? text.replace(/^[-•]\s+/, "") : numbered ? text.slice(numbered[0].length) : text;
      const indent = bullet || numbered ? Math.round(size * 1.3) : 0;
      wrapText(ctx, content, textW - indent).forEach((l, i) => rows.push({ text: l, bullet, num: numbered ? numbered[1] : null, first: i === 0 }));
    }
    const lh = Math.round(size * 1.28);
    const height = rows.reduce((h, r) => h + (r.gap ? lh * 0.45 : lh), 0);
    return { rows, lh, height, size };
  };
  const sizes = hasImage ? [48, 44, 40, 36, 33] : [60, 54, 48, 44, 40];
  let L = layout(sizes[0]);
  for (const sz of sizes.slice(1)) {
    if (y + L.height <= maxY) break;
    L = layout(sz);
  }
  const indentOf = (r: Row) => (r.bullet || r.num ? Math.round(L.size * 1.3) : 0);
  for (const r of L.rows) {
    if (r.gap) {
      y += L.lh * 0.45;
      continue;
    }
    if (y + L.lh > maxY) {
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("…", 70, y - 10);
      break;
    }
    if (r.first && r.bullet) {
      ctx.fillStyle = mod.color;
      ctx.beginPath();
      ctx.arc(70 + L.size * 0.4, y + L.lh * 0.45, L.size * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    if (r.first && r.num) {
      ctx.fillStyle = mod.color;
      ctx.font = `800 ${L.size}px system-ui, sans-serif`;
      ctx.fillText(r.num + ".", 70, y);
      ctx.font = `500 ${L.size}px system-ui, sans-serif`;
    }
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(r.text, 70 + indentOf(r), y);
    y += L.lh;
  }

  // titik progres
  const dots = mod.slides.length;
  const gap = 34;
  let dx = W / 2 - ((dots - 1) * gap) / 2;
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = i === slideIndex ? "#ffffff" : "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.arc(dx, H - 52, i === slideIndex ? 11 : 8, 0, Math.PI * 2);
    ctx.fill();
    dx += gap;
  }
  return !hasImage || !!img;
}

function makeCoverTexture(mod: TeachingModule) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = mod.color;
  ctx.fillRect(0, 0, 384, 512);
  // gradasi lembut + lipatan punggung buku supaya sampul tidak tampak datar
  const g = ctx.createLinearGradient(0, 0, 384, 512);
  g.addColorStop(0, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 384, 512);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0, 0, 26, 512);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(26, 0, 4, 512);
  // bingkai timbul
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  (ctx as any).roundRect?.(46, 22, 316, 468, 14) ?? ctx.rect(46, 22, 316, 468);
  ctx.stroke();
  // label + ikon petir
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textBaseline = "top";
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillText("MODUL AJAR", 68, 46);
  ctx.beginPath();
  ctx.moveTo(326, 40);
  ctx.lineTo(304, 76);
  ctx.lineTo(320, 76);
  ctx.lineTo(310, 104);
  ctx.lineTo(340, 64);
  ctx.lineTo(322, 64);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(68, 80, 150, 6);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 44px system-ui, sans-serif";
  let y = 124;
  for (const line of wrapText(ctx, mod.title, 270).slice(0, 5)) {
    ctx.fillText(line, 68, y);
    y += 54;
  }
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  (ctx as any).roundRect?.(68, 424, 140, 44, 22) ?? ctx.rect(68, 424, 140, 44);
  ctx.fill();
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(`${mod.slides.length} slide`, 138, 433);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Ukuran buku (meter): lebar, tebal, panjang
const BOOK_W = 0.3;
const BOOK_T = 0.05;
const BOOK_L = 0.4;
const LEAN = 0.2; // kemiringan buku saat berdiri di penyangga (radian)
const coverGeometry = new RoundedBoxGeometry(BOOK_W, 0.007, BOOK_L, 2, 0.0034);
const spineGeometry = new RoundedBoxGeometry(0.014, BOOK_T, BOOK_L, 3, 0.0068);
const pagesGeometry = new RoundedBoxGeometry(BOOK_W - 0.022, BOOK_T - 0.012, BOOK_L - 0.016, 2, 0.004);
const standPlate = new RoundedBoxGeometry(0.25, 0.3, 0.012, 2, 0.0058);
const standLip = new RoundedBoxGeometry(0.25, 0.014, 0.075, 2, 0.0068);
const standLeg = new RoundedBoxGeometry(0.035, 0.3, 0.012, 2, 0.0058);

/**
 * Buku modul: tergeletak di meja; saat dipilih, buku berdiri bersandar pada penyangganya
 * dengan sampul menghadap pembaca (dan layar besar menampilkan isinya).
 */
function Book({
  mod,
  position,
  open,
  onPick,
}: {
  mod: TeachingModule;
  position: [number, number, number];
  open: boolean;
  onPick: () => void;
}) {
  const [hot, setHot] = useState(false);
  const cover = useMemo(() => makeCoverTexture(mod), [mod]);
  useEffect(() => () => cover.dispose(), [cover]);
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const g = ref.current;
    if (!g) return;
    t.current = THREE.MathUtils.damp(t.current, open ? 1 : 0, 7, delta);
    const k = t.current;
    // dari rebah (dekat pembaca) → berdiri bersandar di penyangga, sedikit terangkat di tengah gerakan
    g.position.z = THREE.MathUtils.lerp(-0.3, 0.2, k);
    g.position.y = Math.sin(Math.PI * k) * 0.07 + (hot && !open ? 0.025 : 0) * (1 - k);
    g.rotation.x = -k * (Math.PI / 2 - LEAN);
  });

  const pick = (e?: any) => {
    e?.stopPropagation?.();
    onPick();
  };
  const glow = open ? 0.35 : hot ? 0.25 : 0.03;

  return (
    <group position={position}>
      {/* penyangga buku */}
      <group position={[0, 0, 0.2]}>
        <mesh geometry={standLip} position={[0, 0.007, -0.02]} raycast={noRaycast}>
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh geometry={standPlate} position={[0, 0.155, 0.04]} rotation={[LEAN, 0, 0]} raycast={noRaycast}>
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh geometry={standLeg} position={[0, 0.14, 0.115]} rotation={[-0.42, 0, 0]} raycast={noRaycast}>
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>

      {/* buku: titik putar di tepi bawah sampul belakang */}
      <group ref={ref} position={[0, 0, -0.3]}>
        <group position={[0, 0, BOOK_L / 2]}>
          {/* kotak pilih (tak terlihat) */}
          <mesh
            name={`Book_${mod.id}`}
            position={[0, BOOK_T / 2, 0]}
            userData={{ isInteractableMesh: true, isVRButton: true, onClick: pick }}
            onClick={pick}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHot(true);
            }}
            onPointerOut={() => setHot(false)}
          >
            <boxGeometry args={[BOOK_W + 0.02, BOOK_T + 0.02, BOOK_L + 0.02]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
          </mesh>
          {/* sampul belakang, punggung, sampul depan */}
          <mesh geometry={coverGeometry} position={[0, 0.0035, 0]} raycast={noRaycast}>
            <meshStandardMaterial color={mod.color} roughness={0.55} emissive={mod.color} emissiveIntensity={glow} />
          </mesh>
          <mesh geometry={spineGeometry} position={[BOOK_W / 2 - 0.006, BOOK_T / 2, 0]} raycast={noRaycast}>
            <meshStandardMaterial color={mod.color} roughness={0.55} emissive={mod.color} emissiveIntensity={glow} />
          </mesh>
          <mesh geometry={coverGeometry} position={[0, BOOK_T - 0.0035, 0]} raycast={noRaycast}>
            <meshStandardMaterial color={mod.color} roughness={0.55} emissive={mod.color} emissiveIntensity={glow} />
          </mesh>
          {/* blok halaman */}
          <mesh geometry={pagesGeometry} position={[-0.008, BOOK_T / 2, 0]} raycast={noRaycast}>
            <meshStandardMaterial color="#f5f0e1" roughness={0.95} />
          </mesh>
          {/* pita pembatas */}
          <mesh position={[-0.06, BOOK_T / 2, -BOOK_L / 2 - 0.02]} raycast={noRaycast}>
            <boxGeometry args={[0.018, 0.003, 0.07]} />
            <meshStandardMaterial color="#facc15" roughness={0.7} />
          </mesh>
          {/* gambar sampul (judul terbaca dari sisi pembaca) */}
          <mesh position={[0, BOOK_T + 0.0006, 0]} rotation={[-Math.PI / 2, 0, Math.PI]} raycast={noRaycast}>
            <planeGeometry args={[BOOK_W - 0.006, BOOK_L - 0.006]} />
            <meshBasicMaterial map={cover} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

const screenFrame = new RoundedBoxGeometry(SCREEN_W + 0.24, SCREEN_H + 0.24, 0.1, 3, 0.045);
const tableTop = new RoundedBoxGeometry(3.0, 0.07, 0.84, 3, 0.03);
const tableApron = new RoundedBoxGeometry(2.84, 0.09, 0.7, 2, 0.02);
const navGeometry = new THREE.ExtrudeGeometry(roundedRectShape(0.46, 0.2, 0.05), {
  depth: 0.03,
  bevelEnabled: true,
  bevelThickness: 0.008,
  bevelSize: 0.008,
  bevelSegments: 2,
  curveSegments: 6,
});

function NavButton({
  label,
  color,
  disabled,
  position,
  onPress,
}: {
  label: string;
  color: string;
  disabled?: boolean;
  position: [number, number, number];
  onPress: () => void;
}) {
  const [hot, setHot] = useState(false);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 368;
    c.height = 160;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 56px system-ui, sans-serif";
    ctx.fillText(label, 184, 84, 340);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  const press = (e?: any) => {
    e?.stopPropagation?.();
    if (!disabled) onPress();
  };
  const c = disabled ? "#334155" : color;
  return (
    <group position={position}>
      <mesh
        name={`Reader_btn_${label}`}
        geometry={navGeometry}
        scale={hot && !disabled ? 1.05 : 1}
        userData={{ isVRButton: true, isInteractableMesh: true, onClick: press }}
        onClick={press}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
        }}
        onPointerOut={() => setHot(false)}
      >
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={disabled ? 0 : hot ? 0.5 : 0.15} roughness={0.35} envMapIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.042]} raycast={noRaycast}>
        <planeGeometry args={[0.42, 0.183]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} opacity={disabled ? 0.4 : 1} />
      </mesh>
    </group>
  );
}

export function ReadingCorner({
  position,
  facing = 0,
}: {
  position: [number, number, number];
  facing?: number;
}) {
  const [mods, setMods] = useState<TeachingModule[]>(getModules);
  const [openId, setOpenId] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    loadModules().then(setMods);
    return subscribeModules(setMods);
  }, []);

  const open = mods.find((m) => m.id === openId) || null;
  const slideIndex = open ? Math.min(slide, open.slides.length - 1) : 0;

  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, texture };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const [imgTick, setImgTick] = useState(0);
  const waiting = useRef(false);
  useEffect(() => {
    waiting.current = !drawSlide(canvas, open, slideIndex, mods.length);
    texture.needsUpdate = true;
  }, [canvas, texture, open, slideIndex, mods.length, imgTick]);
  // gambar slide yang sedang dibuka belum siap → gambar ulang begitu siap
  useFrame(() => {
    if (!waiting.current) return;
    const id = open?.slides[slideIndex]?.image;
    if (!id || ready(illustration(id))) {
      waiting.current = false;
      setImgTick((t) => t + 1);
    }
  });
  // muat semua ilustrasi lebih dulu supaya pindah slide langsung tampil
  useEffect(() => {
    for (const m of mods) for (const sl of m.slides) if (sl.image) illustration(sl.image);
  }, [mods]);

  const shown = mods.slice(0, 6);
  const spacing = 0.42;

  return (
    <group position={position} rotation={[0, facing, 0]} name="ReadingCorner">
      {/* ---------- Layar besar ---------- */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.55 + SCREEN_H / 2, 0.05]} raycast={noRaycast}>
          <primitive object={screenFrame} attach="geometry" />
          <meshStandardMaterial color="#0b1220" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.55 + SCREEN_H / 2, -0.005]} rotation={[0, Math.PI, 0]} raycast={noRaycast}>
          <planeGeometry args={[SCREEN_W, SCREEN_H]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.5, 0.02]} raycast={noRaycast}>
          <boxGeometry args={[SCREEN_W + 0.24, 0.04, 0.16]} />
          <meshBasicMaterial color="#22d3ee" toneMapped={false} />
        </mesh>
      </group>

      {/* ---------- Meja buku ---------- */}
      <group position={[0, 0, -3.1]}>
        <mesh geometry={tableTop} position={[0, 0.86, 0]}>
          <meshStandardMaterial color="#9a6a3a" roughness={0.6} />
        </mesh>
        <mesh geometry={tableApron} position={[0, 0.79, 0]} raycast={noRaycast}>
          <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
        </mesh>
        {[
          [-1.38, -0.32],
          [1.38, -0.32],
          [-1.38, 0.32],
          [1.38, 0.32],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.4, 0]} raycast={noRaycast}>
              <cylinderGeometry args={[0.03, 0.022, 0.78, 14]} />
              <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.012, 0]} raycast={noRaycast}>
              <cylinderGeometry args={[0.04, 0.045, 0.024, 14]} />
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </mesh>
          </group>
        ))}

        {shown.map((m, i) => (
          <Book
            key={m.id}
            mod={m}
            open={m.id === openId}
            position={[(i - (shown.length - 1) / 2) * spacing, 0.896, -0.04]}
            onPick={() => {
              playVRClickSound();
              setOpenId((cur) => (cur === m.id ? null : m.id));
              setSlide(0);
            }}
          />
        ))}

        {/* Tombol navigasi di tepi meja, miring ke arah pembaca */}
        <group position={[0, 0.9, -0.5]} rotation={[0.9, Math.PI, 0]}>
          <NavButton
            label="◀ SEBELUM"
            color="#0369a1"
            disabled={!open || slideIndex === 0}
            position={[-0.54, 0, 0]}
            onPress={() => {
              playVRClickSound();
              setSlide(slideIndex - 1);
            }}
          />
          <NavButton
            label="TUTUP"
            color="#b45309"
            disabled={!open}
            position={[0, 0, 0]}
            onPress={() => {
              playVRClickSound();
              setOpenId(null);
            }}
          />
          <NavButton
            label="LANJUT ▶"
            color="#15803d"
            disabled={!open || slideIndex >= open.slides.length - 1}
            position={[0.54, 0, 0]}
            onPress={() => {
              playVRClickSound();
              setSlide(slideIndex + 1);
            }}
          />
        </group>
      </group>
    </group>
  );
}
