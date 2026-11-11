import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Penanda batas ruang (mirip Guardian di Meta Quest).
 *
 * - Jika headset memberikan batas ruang asli (reference space "bounded-floor"),
 *   garis & dinding mengikuti bentuk batas yang digambar pengguna di headset.
 * - Jika tidak (mode diam / HP), dipakai lingkaran aman radius 1 m di titik awal.
 *
 * Garis lantai selalu terlihat; dinding grid muncul saat kepala atau tangan
 * mendekati batas dan berubah merah ketika melewatinya.
 *
 * Harus dipasang sebagai anak dari <XROrigin> supaya ikut bergerak bersama pemain.
 */

const WALL_HEIGHT = 2.4;
const CELL = 0.3;
const FALLBACK_RADIUS = 1.0;
const SHOW_DISTANCE = 0.45; // wall starts to appear
const FULL_DISTANCE = 0.15; // wall fully visible

type Pt = { x: number; z: number };

const SAFE = new THREE.Color("#38bdf8");
const DANGER = new THREE.Color("#ef4444");
const _probe = new THREE.Vector3();
const _color = new THREE.Color();

function circlePoints(radius: number, segments = 40): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius });
  }
  return pts;
}

function buildWallGeometry(points: Pt[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let u = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const u0 = u / CELL;
    const u1 = (u + len) / CELL;
    const base = pos.length / 3;
    pos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, WALL_HEIGHT, b.z, a.x, WALL_HEIGHT, a.z);
    uv.push(u0, 0, u1, 0, u1, WALL_HEIGHT / CELL, u0, WALL_HEIGHT / CELL);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    u += len;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function buildFloorLineGeometry(points: Pt[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of points) pos.push(p.x, 0.02, p.z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** Signed distance to the polygon outline: positive inside, negative outside. */
function signedDistance(px: number, pz: number, points: Pt[]): number {
  let min = Infinity;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.z > pz !== b.z > pz && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / l2));
    const d = Math.hypot(px - (a.x + ex * t), pz - (a.z + ez * t));
    if (d < min) min = d;
  }
  return inside ? min : -min;
}

function makeGridTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 64, 64);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function GuardianBoundary() {
  const { gl, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<Pt[]>(circlePoints(FALLBACK_RADIUS));
  const boundedSpaceRef = useRef<XRReferenceSpace | null>(null);
  const opacityRef = useRef(0);

  const { wall, line } = useMemo(() => {
    const wallMat = new THREE.MeshBasicMaterial({
      map: makeGridTexture(),
      color: SAFE,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wall = new THREE.Mesh(buildWallGeometry(pointsRef.current), wallMat);
    wall.name = "VR_GuardianWall";
    wall.userData.isLaserHelper = true;
    wall.frustumCulled = false;
    wall.renderOrder = 998;
    wall.raycast = () => {};

    const line = new THREE.LineLoop(
      buildFloorLineGeometry(pointsRef.current),
      new THREE.LineBasicMaterial({ color: SAFE, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    line.name = "VR_GuardianLine";
    line.userData.isLaserHelper = true;
    line.frustumCulled = false;
    line.raycast = () => {};
    return { wall, line };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.add(wall, line);
    return () => {
      group.remove(wall, line);
      wall.geometry.dispose();
      line.geometry.dispose();
      (wall.material as THREE.MeshBasicMaterial).map?.dispose();
      (wall.material as THREE.Material).dispose();
      (line.material as THREE.Material).dispose();
    };
  }, [wall, line]);

  useEffect(() => {
    const xr = gl.xr;
    if (!xr) return;

    const applyPoints = (pts: Pt[]) => {
      pointsRef.current = pts;
      wall.geometry.dispose();
      line.geometry.dispose();
      wall.geometry = buildWallGeometry(pts);
      line.geometry = buildFloorLineGeometry(pts);
    };

    const readBounds = (space: any) => {
      const geo = space?.boundsGeometry as ArrayLike<DOMPointReadOnly> | undefined;
      if (geo && geo.length >= 3) {
        const pts: Pt[] = [];
        for (let i = 0; i < geo.length; i++) pts.push({ x: geo[i].x, z: geo[i].z });
        applyPoints(pts);
        return true;
      }
      return false;
    };

    let cancelled = false;
    let resetTarget: any = null;
    const onReset = () => {
      if (resetTarget && !readBounds(resetTarget)) {
        boundedSpaceRef.current = null;
        applyPoints(circlePoints(FALLBACK_RADIUS));
      }
    };

    const onSessionStart = () => {
      const session = xr.getSession?.();
      boundedSpaceRef.current = null;
      applyPoints(circlePoints(FALLBACK_RADIUS));
      if (!session) return;
      session
        .requestReferenceSpace("bounded-floor")
        .then((space) => {
          if (cancelled) return;
          if (readBounds(space)) {
            boundedSpaceRef.current = space;
            resetTarget = space;
            space.addEventListener("reset", onReset);
          }
        })
        .catch(() => {
          // Stationary boundary / phone: keep the 1 m safety circle
        });
    };

    const onSessionEnd = () => {
      resetTarget?.removeEventListener?.("reset", onReset);
      resetTarget = null;
      boundedSpaceRef.current = null;
    };

    xr.addEventListener("sessionstart", onSessionStart);
    xr.addEventListener("sessionend", onSessionEnd);
    if (xr.isPresenting) onSessionStart();
    return () => {
      cancelled = true;
      xr.removeEventListener("sessionstart", onSessionStart);
      xr.removeEventListener("sessionend", onSessionEnd);
      onSessionEnd();
    };
  }, [gl, wall, line]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const presenting = !!gl.xr?.isPresenting;
    group.visible = presenting;
    if (!presenting) return;

    // Align the real room boundary with the tracking space used for the camera
    const bounded = boundedSpaceRef.current;
    let aligned = false;
    if (bounded) {
      try {
        const frame = (gl.xr as any).getFrame?.() as XRFrame | undefined;
        const base = gl.xr.getReferenceSpace();
        const pose = frame && base ? frame.getPose(bounded, base) : null;
        if (pose) {
          group.matrixAutoUpdate = false;
          group.matrix.fromArray(pose.transform.matrix as unknown as number[]);
          group.matrixWorldNeedsUpdate = true;
          aligned = true;
        }
      } catch {}
    }
    if (!aligned && !group.matrixAutoUpdate) {
      group.matrix.identity();
      group.matrixWorldNeedsUpdate = true;
    }
    group.updateWorldMatrix(true, false);

    // Closest approach of head and both hands to the boundary
    const pts = pointsRef.current;
    let closest = Infinity;
    const probe = (obj: THREE.Object3D | null | undefined) => {
      if (!obj) return;
      obj.getWorldPosition(_probe);
      group.worldToLocal(_probe);
      const d = signedDistance(_probe.x, _probe.z, pts);
      if (d < closest) closest = d;
    };
    probe(camera);
    for (let i = 0; i < 2; i++) {
      const grip = gl.xr.getControllerGrip(i);
      if (grip.visible) probe(grip);
    }

    const target =
      closest <= FULL_DISTANCE
        ? 0.9
        : closest >= SHOW_DISTANCE
          ? 0
          : 0.9 * (1 - (closest - FULL_DISTANCE) / (SHOW_DISTANCE - FULL_DISTANCE));
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, target, Math.min(1, 10 * delta));

    const wallMat = wall.material as THREE.MeshBasicMaterial;
    const lineMat = line.material as THREE.LineBasicMaterial;
    wallMat.opacity = opacityRef.current;
    wall.visible = opacityRef.current > 0.01;
    _color.copy(closest < 0.05 ? DANGER : SAFE);
    wallMat.color.lerp(_color, Math.min(1, 12 * delta));
    lineMat.color.copy(wallMat.color);
  });

  return <group ref={groupRef} name="VR_GuardianBoundary" visible={false} />;
}
