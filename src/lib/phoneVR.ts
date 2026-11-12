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
  /** performance.now() sampai kapan langkah kaki terakhir masih "mendorong" pemain maju */
  stepUntil: 0,
  /** jumlah langkah terdeteksi & jumlah bacaan akselerometer (untuk indikator di layar) */
  steps: 0,
  motionEvents: 0,
  /** laju jalan (m/dtk) hasil irama langkah; berlaku selama stepUntil belum lewat */
  walkSpeed: 0,
  /** laju pemain saat ini (m/dtk), diisi perender; dipakai peredup tepi pandangan */
  speedNow: 0,
};

// ---- Deteksi langkah (pedometer sederhana) ----
// HP tidak tahu posisinya di ruangan, tetapi setiap langkah kaki membuat hentakan pada
// akselerometer. Tiap hentakan dihitung sebagai satu langkah maju ke arah pandangan, sehingga
// pemakai yang berjalan (atau jalan di tempat) ikut berjalan di dalam lab.
//
// Kekuatan hentakan sangat berbeda antar-HP dan cara memegang (di tangan lebih lemah daripada di
// kacamata VR), jadi ambangnya menyesuaikan diri: sebagian dari guncangan rata-rata yang sedang
// terjadi, dengan batas bawah kecil agar HP yang diam tidak dihitung.
const STRIDE = 0.7; // meter per langkah
let baseline = 9.81; // rata-rata lambat (gravitasi + bias sensor)
let energy = 0; // rata-rata |guncangan|
let above = false;
let lastStepAt = 0;
function onDeviceMotion(e: DeviceMotionEvent) {
  // Sebagian HP hanya mengisi salah satu dari dua bacaan ini
  const g = e.accelerationIncludingGravity;
  const a = e.acceleration;
  const src = g && g.x != null && g.y != null && g.z != null ? g : a && a.x != null && a.y != null && a.z != null ? a : null;
  if (!src) return;
  phoneVR.motionEvents++;
  const mag = Math.hypot(src.x!, src.y!, src.z!);
  baseline += (mag - baseline) * 0.04;
  const bump = mag - baseline;
  energy += (Math.abs(bump) - energy) * 0.05;
  const threshold = Math.max(0.55, energy * 1.25);
  const now = performance.now();
  // satu langkah = guncangan naik melewati ambang (dihitung sekali per puncak)
  if (!above && bump > threshold && now - lastStepAt > 250) {
    above = true;
    const gap = now - lastStepAt;
    lastStepAt = now;
    phoneVR.steps++;
    // Laju mengikuti irama langkah nyata: irama (langkah/detik) x panjang langkah rata-rata,
    // sehingga jarak di lab kira-kira sama dengan jarak yang ditempuh kaki. Dibatasi 0,5–1,5 m/dtk
    // (jalan santai) dan diperhalus agar tidak berubah mendadak dari langkah ke langkah.
    const rhythmic = gap < 1600;
    const cadence = rhythmic ? 1000 / gap : 1.3;
    const speed = Math.min(1.5, Math.max(0.5, cadence * STRIDE));
    phoneVR.walkSpeed = rhythmic && phoneVR.walkSpeed > 0 ? phoneVR.walkSpeed * 0.6 + speed * 0.4 : speed * 0.8;
    // gerak berlanjut sedikit lebih lama dari jeda antar-langkah, lalu berhenti bila langkah berhenti
    phoneVR.stepUntil = now + (rhythmic ? Math.min(1100, gap * 1.35) : 650);
  } else if (above && bump < threshold * 0.4) {
    above = false;
  }
}
let motionListening = false;

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

  // Akselerometer untuk deteksi langkah (iOS meminta izin terpisah; ditolak pun VR tetap jalan)
  const DME = (window as any).DeviceMotionEvent;
  if (DME) {
    try {
      const ok = typeof DME.requestPermission === "function" ? (await DME.requestPermission()) === "granted" : true;
      if (ok && !motionListening) {
        window.addEventListener("devicemotion", onDeviceMotion, true);
        motionListening = true;
      }
    } catch {}
  }
  phoneVR.stepUntil = 0;
  phoneVR.steps = 0;
  phoneVR.motionEvents = 0;
  phoneVR.walkSpeed = 0;
  phoneVR.speedNow = 0;
  above = false;
  energy = 0;

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
  if (motionListening) {
    window.removeEventListener("devicemotion", onDeviceMotion, true);
    motionListening = false;
  }
  phoneVR.stepUntil = 0;
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

// Hanya saat pengembangan: memudahkan pengujian otomatis
if (import.meta.env.DEV && typeof window !== "undefined") (window as any).__phoneVR = phoneVR;
