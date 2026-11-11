import * as THREE from "three";

/**
 * Shared mutable state for "VR HP" (Cardboard-style) mode.
 * Read every frame inside the render loop, so it deliberately lives outside React.
 */
export const phoneVR = {
  active: false,
  /** true once the first gyroscope sample has arrived */
  hasOrientation: false,
  /** head orientation from the gyroscope, already heading-calibrated */
  quaternion: new THREE.Quaternion(),
  /** screen is being held: walk forward */
  walking: false,
  /** set by a short tap; consumed by the gaze cursor as an immediate "select" */
  tapRequested: false,
};

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90deg around X
const qHeading = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const tmpEuler = new THREE.Euler(0, 0, 0, "YXZ");

let headingOffset: number | null = null;
let listening = false;

function screenAngle(): number {
  const a = (screen.orientation && typeof screen.orientation.angle === "number")
    ? screen.orientation.angle
    : ((window as any).orientation as number) || 0;
  return THREE.MathUtils.degToRad(a);
}

function onDeviceOrientation(e: DeviceOrientationEvent) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  const alpha = THREE.MathUtils.degToRad(e.alpha);
  const beta = THREE.MathUtils.degToRad(e.beta);
  const gamma = THREE.MathUtils.degToRad(e.gamma);

  euler.set(beta, alpha, -gamma, "YXZ");
  const q = phoneVR.quaternion;
  q.setFromEuler(euler);
  q.multiply(q1);
  q.multiply(q0.setFromAxisAngle(zee, -screenAngle()));

  // Calibrate so that the direction the phone faces when VR starts is "forward" in the lab
  if (headingOffset === null) {
    tmpEuler.setFromQuaternion(q, "YXZ");
    headingOffset = -tmpEuler.y;
  }
  qHeading.setFromAxisAngle(yAxis, headingOffset);
  q.premultiply(qHeading);
  phoneVR.hasOrientation = true;
}

/** Must be called from a user gesture (iOS asks for motion permission). */
export async function startPhoneVR(): Promise<{ ok: boolean; reason?: string }> {
  const DOE = (window as any).DeviceOrientationEvent;
  if (!DOE) return { ok: false, reason: "Perangkat ini tidak memiliki sensor gerak (giroskop)." };

  if (typeof DOE.requestPermission === "function") {
    try {
      const res = await DOE.requestPermission();
      if (res !== "granted") return { ok: false, reason: "Izin sensor gerak ditolak." };
    } catch {
      return { ok: false, reason: "Izin sensor gerak tidak dapat diminta." };
    }
  }

  headingOffset = null;
  phoneVR.hasOrientation = false;
  phoneVR.walking = false;
  phoneVR.tapRequested = false;
  if (!listening) {
    window.addEventListener("deviceorientation", onDeviceOrientation, true);
    listening = true;
  }
  phoneVR.active = true;

  // Fullscreen + landscape + keep the screen awake. Best-effort and never blocking:
  // some browsers leave these promises pending, which must not stop VR from starting.
  void (async () => {
    try {
      const el: any = document.documentElement;
      if (!document.fullscreenElement) {
        await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
      }
    } catch {}
    try {
      await (screen.orientation as any)?.lock?.("landscape");
    } catch {}
  })();
  void (async () => {
    try {
      wakeLock = await (navigator as any).wakeLock?.request?.("screen");
    } catch {}
  })();

  return { ok: true };
}

let wakeLock: any = null;

export function stopPhoneVR() {
  phoneVR.active = false;
  phoneVR.hasOrientation = false;
  phoneVR.walking = false;
  phoneVR.tapRequested = false;
  if (listening) {
    window.removeEventListener("deviceorientation", onDeviceOrientation, true);
    listening = false;
  }
  try {
    (screen.orientation as any)?.unlock?.();
  } catch {}
  try {
    if (document.fullscreenElement) document.exitFullscreen?.();
  } catch {}
  try {
    wakeLock?.release?.();
  } catch {}
  wakeLock = null;
}

/** Re-centre the view: the direction currently faced becomes "forward". */
export function recenterPhoneVR() {
  headingOffset = null;
}
