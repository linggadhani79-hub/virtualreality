import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Html, TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { Play, Video, Film } from "lucide-react";
import { UploadedModelData } from "./ModelUploader";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { triggerWorkspaceSave } from "./WorkspaceManager";

interface VideoScreenObjectProps {
  id: string;
  viewMode: "tpp" | "fpp" | "dev";
  position: [number, number, number];
  initialRotation?: [number, number, number];
  initialScale?: number;
  initialLocked?: boolean;
  videoUrl?: string;
  onUpdateModel?: (id: string, updates: Partial<UploadedModelData>) => void;
  onRemove?: (id: string) => void;
  onDragChange?: (dragging: boolean) => void;
  isAdmin?: boolean;
}

import { VRButton } from "./VRMenu";

export function VideoScreenObject({
  id,
  viewMode,
  position,
  initialRotation = [0, 0, 0],
  initialScale = 1.0,
  initialLocked = false,
  videoUrl = "",
  onUpdateModel,
  onRemove,
  onDragChange,
  isAdmin: propIsAdmin,
}: VideoScreenObjectProps) {
  const isVRActive = useXR((state) => !!state.session);
  const [active, setActive] = useState(false);
  const [localIsAdmin, setLocalIsAdmin] = useState(false);
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  
  const [objPos, setObjPos] = useState<[number, number, number]>(position);
  const [scaleMultiplier, setScaleMultiplier] = useState(initialScale);
  const [rotationX, setRotationX] = useState(initialRotation[0]);
  const [rotationY, setRotationY] = useState(initialRotation[1]);
  const [rotationZ, setRotationZ] = useState(initialRotation[2]);
  const [isLocked, setIsLocked] = useState(initialLocked);
  const [url, setUrl] = useState(videoUrl);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale" | "none">("translate");
  const [glowColor, setGlowColor] = useState<string>("#4f46e5"); // Neon backglow
  const [isPlayingModalOpen, setIsPlayingModalOpen] = useState<boolean>(false); // Full video modal for guest/playback mode

  const isAdmin = propIsAdmin !== undefined ? propIsAdmin : localIsAdmin;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setLocalIsAdmin(u?.email === "ranggadino1@gmail.com");
    });
    return () => unsub();
  }, []);
  
  useEffect(() => {
    if (!active) {
      setObjPos(position);
    }
  }, [position[0], position[1], position[2], active]);

  useEffect(() => {
    if (!active) {
      setScaleMultiplier(initialScale);
      setRotationX(initialRotation[0]);
      setRotationY(initialRotation[1]);
      setRotationZ(initialRotation[2]);
      setIsLocked(initialLocked);
      setUrl(videoUrl);
    }
  }, [initialScale, initialRotation, initialLocked, videoUrl, active]);
  
  const isYouTube = url && (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("youtube-nocookie.com"));
  
  // Convert standard YouTube links to embed links
  let embedUrl = url;
  if (isYouTube) {
    if (url.includes("watch?v=")) {
      embedUrl = url.replace("watch?v=", "embed/");
      embedUrl = embedUrl.split("&")[0]; // Remove other params
    } else if (url.includes("youtu.be/")) {
      embedUrl = url.replace("youtu.be/", "www.youtube.com/embed/");
      embedUrl = embedUrl.split("?")[0];
    }
  }


  
  // Sync back local state changes to Firestore
  useEffect(() => {
    if (active && onUpdateModel) {
      onUpdateModel(id, {
        position: objPos,
        initialScale: scaleMultiplier,
        initialRotation: [rotationX, rotationY, rotationZ],
        isLocked,
        videoUrl: url
      });
    }
  }, [objPos, scaleMultiplier, rotationX, rotationY, rotationZ, isLocked, url, active]);

  // Cursor handling
  useEffect(() => {
    if (isAdmin && hovered) {
      document.body.style.cursor = "pointer";
    } else {
      document.body.style.cursor = "auto";
    }
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered, isAdmin]);

  // Screen Base dimensions (Cinematic 16:9 ratio - 6m wide)
  const screenWidth = 6.0;
  const screenHeight = 3.375;
  const bezelPadding = 0.15;
  const frameWidth = screenWidth + bezelPadding;
  const frameHeight = screenHeight + bezelPadding;

  return (
    <>
      {active && isAdmin && !isLocked && transformMode !== "none" && (
        <TransformControls
          object={groupRef}
          mode={transformMode}
          onChange={() => {
            if (transformMode === "translate" && groupRef.current) {
              // Clamp minimum height to floor level (0)
              if (groupRef.current.position.y < 0) {
                groupRef.current.position.y = 0;
              }
            }
          }}
          onMouseDown={() => {
            if (onDragChange) onDragChange(true);
          }}
          onMouseUp={() => {
            if (onDragChange) onDragChange(false);
            if (groupRef.current) {
              const p = groupRef.current.position;
              const r = groupRef.current.rotation;
              const s = groupRef.current.scale.x;
              
              setObjPos([p.x, p.y, p.z]);
              setRotationX(r.x);
              setRotationY(r.y);
              setRotationZ(r.z);
              setScaleMultiplier(s);

              if (onUpdateModel) {
                onUpdateModel(id, {
                  position: [p.x, p.y, p.z],
                  initialRotation: [r.x, r.y, r.z],
                  initialScale: s,
                });
              }
              setTimeout(() => triggerWorkspaceSave(), 100);
            }
          }}
        />
      )}

      <group
        ref={groupRef}
        position={objPos}
        rotation={[rotationX, rotationY, rotationZ]}
        scale={[scaleMultiplier, scaleMultiplier, scaleMultiplier]}
        onClick={(e) => {
          e.stopPropagation();
          if (isAdmin) {
            setActive(true);
          } else if (url && url.trim().length > 0) {
            setIsPlayingModalOpen(true);
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
      >
        {/* Ambient Neon Backglow */}
        {glowColor && glowColor !== "none" && (
          <pointLight
            position={[0, 0, -0.2]}
            distance={10}
            intensity={2.8}
            color={glowColor}
          />
        )}

        {/* Outer Premium Metallic Frame Bezel */}
        <mesh position={[0, 0, -0.05]}>
          <boxGeometry args={[frameWidth, frameHeight, 0.1]} />
          <meshStandardMaterial
            color="#111111"
            roughness={0.15}
            metalness={0.8}
          />
        </mesh>

        {/* Sleek Glossy Border Trim */}
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[frameWidth + 0.05, frameHeight + 0.05, 0.02]} />
          <meshStandardMaterial
            color="#222222"
            roughness={0.1}
            metalness={0.9}
          />
        </mesh>
        
        {/* Screen Base Canvas (Sleek Matte Black Screen) */}
        <mesh 
          position={[0, 0, 0.01]}
          userData={{
            isInteractableMesh: true,
            onClick: (e: any) => {
              if (isAdmin) {
                setActive(true);
              } else if (url && url.trim().length > 0) {
                setIsPlayingModalOpen(true);
              }
            }
          }}
        >
          <planeGeometry args={[screenWidth, screenHeight]} />
          <meshStandardMaterial
            color="#050505"
            roughness={0.8}
            metalness={0.2}
          />
        </mesh>

        {/* Play Button in the Center of 3D Screen */}
        {isVRActive && url && url.trim().length > 0 && (
          <VRButton 
            position={[0, 0, 0.05]} 
            text="Putar Video (Layar)" 
            color="#4f46e5"
            onClick={(e: any) => {
              if (isAdmin) {
                setActive(true);
              } else {
                setIsPlayingModalOpen(true);
              }
            }} 
          />
        )}
        
        {!isVRActive && url && url.trim().length > 0 && (
          <Html position={[0, 0, 0.05]} center zIndexRange={[50, 0]}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isAdmin) {
                  setActive(true);
                } else {
                  setIsPlayingModalOpen(true);
                }
              }}
              className="bg-indigo-600/90 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-2xl border border-indigo-300/50 backdrop-blur-md flex items-center gap-2 cursor-pointer transition-all hover:scale-110 active:scale-95 shadow-indigo-950/80"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Putar Video</span>
            </button>
          </Html>
        )}

        {/* Floating Label / Button to Open Settings */}
        {!isVRActive && isAdmin && (
          <Html position={[0, frameHeight / 2 + 0.9, 0]} center zIndexRange={[60, 0]}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActive(true);
              }}
              className={`bg-black/85 hover:bg-neutral-800 border ${
                active ? 'border-indigo-400 bg-indigo-950/90 text-indigo-200' : 'border-white/20 text-white'
              } backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-[11px] whitespace-nowrap font-extrabold cursor-pointer transition-all hover:scale-105 active:scale-95`}
            >
              <span className={`w-2 h-2 rounded-full ${isLocked ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
              <span>{isLocked ? "🔒 Layar Video (Terkunci) - Klik untuk Edit" : "⚙️ Edit Layar Video"}</span>
            </button>
          </Html>
        )}

        {/* 2D HTML Editor Menu */}
        {!isVRActive && active && isAdmin && (
          <Html position={[0, frameHeight / 2 + 1.2, 0]} center zIndexRange={[100, 0]}>
            <div
              className="bg-neutral-900/95 backdrop-blur-lg border border-white/10 p-4 rounded-2xl shadow-2xl text-white w-[340px] flex flex-col gap-4"
              onPointerDown={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <Video className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-xs uppercase tracking-wider text-neutral-200">Edit Layar Video</span>
                </div>
                <button
                  onClick={() => {
                    setActive(false);
                    const evt = new CustomEvent('force-workspace-save');
                    window.dispatchEvent(evt);
                  }}
                  className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Quick Play Button in Editor */}
              {url && url.trim().length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlayingModalOpen(true);
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg border border-indigo-400/30 flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Putar Video Fullscreen</span>
                </button>
              )}
              
              {/* Video URL Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-white/50 uppercase font-extrabold tracking-wider">Video URL (.mp4 atau YouTube)</label>
                <input 
                  type="text" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-indigo-500 transition-all text-white placeholder-neutral-600 font-sans"
                  placeholder="https://.../video.mp4"
                />
              </div>

              {/* 3D Transform Controls Selector (Addressing: "bisa saya pindah seperti layaknya objek glb") */}
              {!isLocked && (
                <div className="flex flex-col gap-2 bg-white/5 p-2 rounded-xl border border-white/10">
                  <span className="text-[10px] text-neutral-300 font-extrabold uppercase tracking-wider">Mode Perpindahan 3D</span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setTransformMode("translate"); }}
                      className={`flex-1 py-1.5 text-[10px] uppercase tracking-wide font-extrabold rounded-lg border transition-all cursor-pointer ${transformMode === "translate" ? "bg-indigo-600 text-white border-indigo-400/50 shadow-md shadow-indigo-900/30" : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700 hover:text-white"}`}
                    >
                      Geser
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTransformMode("rotate"); }}
                      className={`flex-1 py-1.5 text-[10px] uppercase tracking-wide font-extrabold rounded-lg border transition-all cursor-pointer ${transformMode === "rotate" ? "bg-indigo-600 text-white border-indigo-400/50 shadow-md shadow-indigo-900/30" : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700 hover:text-white"}`}
                    >
                      Putar
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTransformMode("scale"); }}
                      className={`flex-1 py-1.5 text-[10px] uppercase tracking-wide font-extrabold rounded-lg border transition-all cursor-pointer ${transformMode === "scale" ? "bg-indigo-600 text-white border-indigo-400/50 shadow-md shadow-indigo-900/30" : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700 hover:text-white"}`}
                    >
                      Skala
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Backglow Glow Selection */}
              <div className="flex flex-col gap-1.5 bg-white/5 p-2 rounded-xl border border-white/10">
                <span className="text-[10px] text-neutral-300 font-extrabold uppercase tracking-wider">Lampu Latar (Neon Ambilight)</span>
                <div className="flex gap-1.5 overflow-x-auto py-1 justify-between">
                  {[
                    { color: "none", label: "✕", value: "" },
                    { color: "#4f46e5", label: "Indigo", value: "#4f46e5" },
                    { color: "#10b981", label: "Emerald", value: "#10b981" },
                    { color: "#ef4444", label: "Ruby", value: "#ef4444" },
                    { color: "#f59e0b", label: "Amber", value: "#f59e0b" },
                  ].map((glow) => (
                    <button
                      key={glow.color}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGlowColor(glow.value);
                      }}
                      className={`px-2.5 py-1 text-[9px] font-bold rounded-md border transition-all cursor-pointer ${
                        glowColor === glow.value
                          ? "bg-white text-black border-white"
                          : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700"
                      }`}
                    >
                      {glow.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Precise Height and Lock Options */}
              <div className="flex flex-col gap-2.5 bg-white/5 p-2.5 rounded-xl border border-white/10 text-xs">
                <div className="flex justify-between items-center">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isLocked}
                      onChange={e => setIsLocked(e.target.checked)}
                      className="accent-indigo-500 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="font-medium text-neutral-300 text-[11px]">Kunci Posisi (Lock)</span>
                  </label>
                </div>
              </div>
              
              {/* Delete Button */}
              <button 
                onClick={() => {
                  if (onRemove) onRemove(id);
                }}
                className="w-full bg-red-500/10 hover:bg-red-500/25 active:scale-[0.98] text-red-400 border border-red-500/20 hover:border-red-500/30 rounded-xl py-2 text-xs font-bold transition-all uppercase tracking-wider cursor-pointer"
              >
                Hapus Layar Video
              </button>
            </div>
          </Html>
        )}
      </group>

      {/* Fullscreen Video Modal Popup for Guest / Preview Mode */}
      {isPlayingModalOpen && (
        <Html zIndexRange={[99999, 0]}>
          {createPortal(
            <div 
              className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-fadeIn pointer-events-auto"
              onClick={() => setIsPlayingModalOpen(false)}
            >
              <div 
                className="relative w-full max-w-4xl bg-neutral-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-neutral-950">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg">
                      <Video className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-sm text-white tracking-wide">Pemutar Video 3D</span>
                  </div>
                  <button
                    onClick={() => setIsPlayingModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center font-bold text-sm transition-all cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Video Viewport */}
                <div className="w-full aspect-video bg-black flex items-center justify-center relative">
                  {isYouTube && embedUrl ? (
                    <iframe
                      className="w-full h-full border-none"
                      src={embedUrl + (embedUrl.includes("?") ? "&autoplay=1" : "?autoplay=1")}
                      title="YouTube Video Player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : url ? (
                    <video
                      className="w-full h-full object-contain"
                      src={url}
                      controls
                      autoPlay
                    />
                  ) : (
                    <div className="text-neutral-400 text-sm font-sans p-6 text-center">
                      URL Video belum dikonfigurasi.
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-neutral-950 border-t border-white/10 flex justify-between items-center text-xs text-neutral-400">
                  <span className="truncate max-w-[70%] font-mono text-[11px] opacity-70">{url}</span>
                  <button
                    onClick={() => setIsPlayingModalOpen(false)}
                    className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-lg transition-all cursor-pointer shadow-md"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </Html>
      )}
    </>
  );
}
