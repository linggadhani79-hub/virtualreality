import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { roundedRectShape, wrapText } from "../lib/glb";
import { TeachingModule, getModules, loadModules, subscribeModules } from "../lib/modules";
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

function drawSlide(
  canvas: HTMLCanvasElement,
  mod: TeachingModule | null,
  slideIndex: number,
  moduleCount: number,
) {
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
    return;
  }

  const slide = mod.slides[slideIndex];
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
  for (const line of wrapText(ctx, slide.title, W - 140).slice(0, 2)) {
    ctx.fillText(line, 70, y);
    y += 104;
  }
  ctx.fillStyle = mod.color;
  ctx.fillRect(70, y + 6, 220, 10);
  y += 54;

  // isi: butir "- " dan nomor "1. " dibuat menjorok
  ctx.font = "500 60px system-ui, sans-serif";
  const lineH = 76;
  const maxY = H - 110;
  outer: for (const raw of slide.body.split("\n")) {
    const text = raw.trim();
    if (!text) {
      y += lineH * 0.45;
      continue;
    }
    const bullet = /^[-•]\s+/.test(text);
    const numbered = text.match(/^(\d+)[.)]\s+/);
    const content = bullet ? text.replace(/^[-•]\s+/, "") : numbered ? text.slice(numbered[0].length) : text;
    const indent = bullet || numbered ? 76 : 0;
    const lines = wrapText(ctx, content, W - 140 - indent);
    for (let i = 0; i < lines.length; i++) {
      if (y + lineH > maxY) {
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("…", 70, y - 10);
        break outer;
      }
      if (i === 0 && bullet) {
        ctx.fillStyle = mod.color;
        ctx.beginPath();
        ctx.arc(70 + 22, y + 34, 13, 0, Math.PI * 2);
        ctx.fill();
      }
      if (i === 0 && numbered) {
        ctx.fillStyle = mod.color;
        ctx.font = "800 60px system-ui, sans-serif";
        ctx.fillText(numbered[1] + ".", 70, y);
        ctx.font = "500 60px system-ui, sans-serif";
      }
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(lines[i], 70 + indent, y);
      y += lineH;
    }
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
}

function makeCoverTexture(mod: TeachingModule) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = mod.color;
  ctx.fillRect(0, 0, 384, 512);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, 30, 512);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(56, 56, 272, 8);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  ctx.font = "900 46px system-ui, sans-serif";
  let y = 92;
  for (const line of wrapText(ctx, mod.title, 270).slice(0, 5)) {
    ctx.fillText(line, 56, y);
    y += 56;
  }
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(`${mod.slides.length} slide`, 56, 430);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

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

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    if (!ref.current) return;
    // buku yang dibuka / disorot terangkat sedikit
    ref.current.position.y = THREE.MathUtils.damp(ref.current.position.y, open ? 0.1 : hot ? 0.04 : 0, 10, delta);
    ref.current.rotation.x = THREE.MathUtils.damp(ref.current.rotation.x, open ? 0.5 : 0, 10, delta);
  });

  const pick = (e?: any) => {
    e?.stopPropagation?.();
    onPick();
  };

  return (
    <group position={position}>
      <group ref={ref}>
        <mesh
          name={`Book_${mod.id}`}
          position={[0, 0.03, 0]}
          userData={{ isInteractableMesh: true, isVRButton: true, onClick: pick }}
          onClick={pick}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHot(true);
          }}
          onPointerOut={() => setHot(false)}
        >
          <boxGeometry args={[0.3, 0.06, 0.4]} />
          <meshStandardMaterial color={mod.color} roughness={0.6} emissive={mod.color} emissiveIntensity={open ? 0.5 : hot ? 0.3 : 0.05} />
        </mesh>
        {/* halaman */}
        <mesh position={[0.008, 0.03, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.29, 0.046, 0.385]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.9} />
        </mesh>
        {/* sampul (judul terbaca dari sisi pembaca) */}
        <mesh position={[0, 0.0615, 0]} rotation={[-Math.PI / 2, 0, Math.PI]} raycast={noRaycast}>
          <planeGeometry args={[0.3, 0.4]} />
          <meshBasicMaterial map={cover} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

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

  useEffect(() => {
    drawSlide(canvas, open, slideIndex, mods.length);
    texture.needsUpdate = true;
  }, [canvas, texture, open, slideIndex, mods.length]);

  const shown = mods.slice(0, 6);
  const spacing = 0.42;

  return (
    <group position={position} rotation={[0, facing, 0]} name="ReadingCorner">
      {/* ---------- Layar besar ---------- */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.55 + SCREEN_H / 2, 0.05]} raycast={noRaycast}>
          <boxGeometry args={[SCREEN_W + 0.24, SCREEN_H + 0.24, 0.1]} />
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
        <mesh position={[0, 0.86, 0]}>
          <boxGeometry args={[3.0, 0.07, 0.8]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.82, 0]} raycast={noRaycast}>
          <boxGeometry args={[3.04, 0.03, 0.84]} />
          <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
        </mesh>
        {[
          [-1.38, -0.32],
          [1.38, -0.32],
          [-1.38, 0.32],
          [1.38, 0.32],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.41, z]} raycast={noRaycast}>
            <boxGeometry args={[0.07, 0.82, 0.07]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
          </mesh>
        ))}

        {shown.map((m, i) => (
          <Book
            key={m.id}
            mod={m}
            open={m.id === openId}
            position={[(i - (shown.length - 1) / 2) * spacing, 0.895, -0.08]}
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
