import type * as THREE from "three";

/**
 * Batas dunia sederhana untuk pemain: persegi panjang (dinding) dengan satu bukaan pintu.
 * Diisi oleh lingkungan yang sedang tampil; null = tanpa batas.
 */
export const worldBounds: {
  current: null | {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** bukaan pintu pada dinding maxZ */
    door?: { minX: number; maxX: number };
  };
} = { current: null };

const MARGIN = 0.45;

/** Menahan posisi pemain di dalam dinding (boleh keluar lewat pintu). */
export function clampToWorld(pos: THREE.Vector3) {
  const b = worldBounds.current;
  if (!b) return;
  const inDoorway = !!b.door && pos.x > b.door.minX + MARGIN && pos.x < b.door.maxX - MARGIN;
  const outside = pos.z > b.maxZ - MARGIN;
  if (outside && inDoorway) {
    // di ambang / luar pintu: hanya batasi agar tidak menembus kusen
    if (pos.z < b.maxZ + MARGIN) {
      pos.x = Math.min(b.door!.maxX - MARGIN, Math.max(b.door!.minX + MARGIN, pos.x));
    }
    return;
  }
  if (pos.z > b.maxZ + MARGIN) return; // sudah di luar gedung
  pos.x = Math.min(b.maxX - MARGIN, Math.max(b.minX + MARGIN, pos.x));
  pos.z = Math.min(b.maxZ - MARGIN, Math.max(b.minZ + MARGIN, pos.z));
}
