import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Pemuat GLB bersama (kompresi Meshopt, decoder ikut di aplikasi — tidak ada unduhan dari CDN).
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<THREE.Group>>();

/** Memuat GLB sekali per alamat; pemanggil berikutnya memakai hasil yang sama. */
export function loadGlb(url: string): Promise<THREE.Group> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/**
 * Skala model sehingga sisi terpanjangnya = `size` meter, tengahkan pada sumbu X/Z dan letakkan
 * dasarnya di y = 0. Mengembalikan faktor skala yang dipakai.
 */
export function fitModel(root: THREE.Object3D, size: number): number {
  root.position.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const dim = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size / Math.max(dim.x, dim.y, dim.z);
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  return scale;
}

/** Laser VR tidak perlu menguji jutaan segitiga: matikan raycast pada mesh model. */
export function disableRaycast(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.raycast = () => {};
  });
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
