import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { phoneVR, recenterPhoneVR } from "../lib/phoneVR";
import { collectRaycastCandidates, dispatchVRSelect, findInteractable } from "../lib/vrInteract";
import { playVRClickSound, playVRHoverSound } from "../lib/vrAudio";

const DWELL_SECONDS = 1.6;
const IDLE = new THREE.Color("#00f0ff");
const HOVER = new THREE.Color("#fbbf24");

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _size = new THREE.Vector2();

/**
 * Renders the scene side-by-side for a phone VR viewer (Cardboard, VR Box, ...)
 * and provides a gaze cursor: look at an object and hold, or tap the screen.
 * Mount inside <Canvas> only while phone VR is active.
 */
export function PhoneVRRenderer() {
  const { gl, scene, camera } = useThree();
  const stereo = useMemo(() => {
    const s = new THREE.StereoCamera();
    s.aspect = 0.5;
    s.eyeSep = 0.064;
    return s;
  }, []);
  const raycaster = useRef(new THREE.Raycaster());
  const candidates = useRef<THREE.Object3D[]>([]);
  const lastRefresh = useRef(-1);
  const hovered = useRef<THREE.Object3D | null>(null);
  const dwell = useRef(0);
  const fired = useRef(false);

  const reticle = useMemo(() => {
    const g = new THREE.Group();
    g.name = "VR_GazeReticle";
    const mk = (geo: THREE.BufferGeometry, opacity: number) => {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: IDLE,
          transparent: true,
          opacity,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.renderOrder = 9999;
      m.userData.isLaserHelper = true;
      m.name = "VR_GazeReticlePart";
      return m;
    };
    g.add(mk(new THREE.RingGeometry(0.012, 0.016, 32), 0.9)); // outer ring
    g.add(mk(new THREE.CircleGeometry(0.004, 16), 0.95)); // centre dot
    g.add(mk(new THREE.CircleGeometry(0.012, 32), 0.55)); // dwell fill
    g.userData.isLaserHelper = true;
    return g;
  }, []);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const prevFov = persp.fov;
    persp.fov = 80;
    persp.updateProjectionMatrix();
    scene.add(reticle);
    return () => {
      scene.remove(reticle);
      reticle.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material)?.dispose?.();
      });
      persp.fov = prevFov;
      persp.updateProjectionMatrix();
      gl.getSize(_size);
      gl.setScissorTest(false);
      gl.setViewport(0, 0, _size.x, _size.y);
    };
  }, [camera, gl, scene, reticle]);

  // Priority 1: takes over rendering from react-three-fiber while mounted
  useFrame((state, delta) => {
    // ---- Gaze cursor ----
    if (state.clock.elapsedTime - lastRefresh.current > 0.5) {
      lastRefresh.current = state.clock.elapsedTime;
      candidates.current = collectRaycastCandidates(scene);
    }
    camera.updateMatrixWorld();
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_dir);
    const rc = raycaster.current;
    rc.set(_origin, _dir);
    rc.near = 0.05;
    rc.far = 12;
    (rc as any).camera = camera;

    let hits: THREE.Intersection[] = [];
    try {
      hits = rc.intersectObjects(candidates.current, false);
    } catch {}

    let dist = 2.5;
    let target: THREE.Object3D | null = null;
    if (hits.length > 0) {
      dist = Math.max(0.3, hits[0].distance - 0.02);
      target = findInteractable(hits[0].object, scene);
    }
    _hit.copy(_origin).addScaledVector(_dir, dist);
    reticle.position.copy(_hit);
    reticle.quaternion.copy(camera.quaternion);
    reticle.scale.setScalar(dist); // constant apparent size

    if (target !== hovered.current) {
      hovered.current = target;
      dwell.current = 0;
      fired.current = false;
      if (target) playVRHoverSound();
    }

    const select = () => {
      if (!target) return;
      playVRClickSound();
      try {
        navigator.vibrate?.(30);
      } catch {}
      dispatchVRSelect(target, _hit, scene, { handedness: "gaze" });
    };

    if (phoneVR.tapRequested) {
      phoneVR.tapRequested = false;
      if (target) {
        select();
        fired.current = true;
        dwell.current = 0;
      }
    } else if (target && !fired.current && !phoneVR.walking) {
      dwell.current += delta;
      if (dwell.current >= DWELL_SECONDS) {
        select();
        fired.current = true;
        dwell.current = 0;
      }
    }

    const color = target ? HOVER : IDLE;
    const progress = target && !fired.current ? Math.min(1, dwell.current / DWELL_SECONDS) : 0;
    for (let i = 0; i < 3; i++) {
      ((reticle.children[i] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(color);
    }
    const fill = reticle.children[2];
    fill.visible = progress > 0.01;
    fill.scale.setScalar(Math.max(0.01, progress));

    // ---- Side-by-side stereo render ----
    stereo.update(camera as THREE.PerspectiveCamera);
    gl.getSize(_size);
    const w = _size.x;
    const h = _size.y;
    gl.setScissorTest(true);
    gl.setScissor(0, 0, w / 2, h);
    gl.setViewport(0, 0, w / 2, h);
    gl.render(scene, stereo.cameraL);
    gl.setScissor(w / 2, 0, w / 2, h);
    gl.setViewport(w / 2, 0, w / 2, h);
    gl.render(scene, stereo.cameraR);
    gl.setScissorTest(false);
  }, 1);

  return null;
}

/**
 * Full-screen touch layer for phone VR:
 *  - short tap  : select what the gaze cursor points at
 *  - hold       : walk forward in the viewing direction
 */
export function PhoneVROverlay({ onExit }: { onExit: () => void }) {
  const downAt = useRef(0);
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    const onFs = () => {
      // Leaving fullscreen (e.g. the back gesture) also leaves phone VR
      if (!document.fullscreenElement && wasFullscreen.current) onExit();
      if (document.fullscreenElement) wasFullscreen.current = true;
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      phoneVR.walking = false;
    };
  }, [onExit]);
  const wasFullscreen = useRef(!!document.fullscreenElement);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-[9500] pointer-events-auto touch-none select-none"
      onPointerDown={(e) => {
        e.stopPropagation();
        downAt.current = performance.now();
        holdTimer.current = window.setTimeout(() => {
          phoneVR.walking = true;
        }, 280);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
        if (!phoneVR.walking && performance.now() - downAt.current < 280) {
          phoneVR.tapRequested = true;
        }
        phoneVR.walking = false;
      }}
      onPointerCancel={() => {
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
        phoneVR.walking = false;
      }}
      onPointerMove={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Lens divider */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25 pointer-events-none" />

      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2"
        onPointerDown={stop}
        onPointerUp={stop}
      >
        <button
          id="btn-phonevr-recenter"
          onClick={() => recenterPhoneVR()}
          className="bg-black/50 text-white/80 text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/20"
        >
          ⟳ Tengah
        </button>
        <button
          id="btn-phonevr-exit"
          onClick={onExit}
          className="bg-black/50 text-white/80 text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/20"
        >
          ✕ Keluar VR
        </button>
      </div>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] text-white/50 bg-black/40 px-3 py-1 rounded-full pointer-events-none whitespace-nowrap">
        Tatap objek = pilih · Ketuk = pilih cepat · Berjalan / jalan di tempat = maju · Tahan layar = maju
      </div>
    </div>
  );
}
