import type * as THREE from "three";

/**
 * Tabrakan sederhana untuk pemain: daftar kotak (tembok, etalase, peralatan) yang tidak boleh
 * ditembus, dari sisi mana pun. Diisi oleh lingkungan yang sedang tampil; null = bebas.
 *
 * Pemain dianggap lingkaran berjari-jari RADIUS. Bila langkah baru masuk ke sebuah kotak, gerakan
 * pada salah satu sumbu dibatalkan sehingga pemain "meluncur" di sepanjang permukaannya.
 */
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

export const worldBounds: { current: null | { boxes: Box[]; limit: Box } } = { current: null };

/** Kotak dari titik tengah + setengah ukuran. */
export const boxAt = (x: number, z: number, hx: number, hz = hx): Box => ({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });

const RADIUS = 0.35;
let lastX = 0;
let lastZ = 0;
let hasLast = false;

function blocked(boxes: Box[], x: number, z: number) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x > b.minX - RADIUS && x < b.maxX + RADIUS && z > b.minZ - RADIUS && z < b.maxZ + RADIUS) return true;
  }
  return false;
}

/** Menahan posisi pemain agar tidak menembus tembok / aset. Dipanggil tiap frame. */
export function clampToWorld(pos: THREE.Vector3) {
  const w = worldBounds.current;
  if (!w) {
    hasLast = false;
    return;
  }
  pos.x = Math.min(w.limit.maxX, Math.max(w.limit.minX, pos.x));
  pos.z = Math.min(w.limit.maxZ, Math.max(w.limit.minZ, pos.z));
  // lompatan jauh (pindah tempat / mulai ulang) tidak dianggap berjalan
  if (!hasLast || Math.hypot(pos.x - lastX, pos.z - lastZ) > 2) {
    hasLast = true;
  } else if (blocked(w.boxes, pos.x, pos.z) && !blocked(w.boxes, lastX, lastZ)) {
    if (!blocked(w.boxes, pos.x, lastZ)) pos.z = lastZ;
    else if (!blocked(w.boxes, lastX, pos.z)) pos.x = lastX;
    else {
      pos.x = lastX;
      pos.z = lastZ;
    }
  }
  lastX = pos.x;
  lastZ = pos.z;
}
