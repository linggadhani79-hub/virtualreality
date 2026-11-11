/**
 * Tingkat kualitas aset 3D.
 *
 *  - "hq"   : detail penuh — bawaan di PC / laptop.
 *  - "lite" : mesh & tekstur lebih ringan — bawaan di Meta Quest dan HP supaya gerakan tetap mulus
 *             (di VR setiap benda digambar dua kali, sekali untuk tiap mata).
 *
 * Pengguna bisa memaksa salah satunya lewat tombol "Kualitas Aset" (disimpan di perangkat).
 */
export type QualityTier = "hq" | "lite";

const KEY = "evlab_quality";

function isStandaloneDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /OculusBrowser|Quest|Pico|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function readChoice(): QualityTier | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "hq" || v === "lite" ? v : null;
  } catch {
    return null;
  }
}

export const qualityTier: QualityTier = readChoice() ?? (isStandaloneDevice() ? "lite" : "hq");

/** Simpan pilihan lalu muat ulang agar model dengan tingkat baru dipakai. */
export function setQualityTier(tier: QualityTier) {
  try {
    localStorage.setItem(KEY, tier);
  } catch {}
  location.reload();
}

/** "mobil" → "/models/mobil-hq.glb" atau "/models/mobil-lite.glb" */
export function modelUrl(name: string): string {
  return `/models/${name}-${qualityTier}.glb`;
}
