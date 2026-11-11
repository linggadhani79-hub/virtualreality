// Menggelapkan kaca mobil: tekstur asli menggambar "isi kabin" di kaca samping sehingga tampak
// tembus dan kotor. Skrip ini mengecat semua kaca menjadi hitam mengilap, tanpa mengubah bentuk
// maupun cat bodi. Dijalankan langsung pada berkas hasil build-car-model.mjs:
//   npm i --no-save meshoptimizer sharp
//   node scripts/darken-car-glass.mjs public/models/mobil-hq.glb
//   node scripts/darken-car-glass.mjs public/models/mobil-lite.glb
// Kaca dikenali dari letaknya (di atas garis pinggang mobil) dan warnanya (bukan cat putih,
// bukan lampu berwarna). Mengasumsikan mobil memanjang di sumbu X (depan = X negatif), tinggi di Y.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const file = process.argv[2];
const debug = process.argv[3];
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(file);
const node = doc.getRoot().listNodes().find((n) => n.getMesh() && !n.getName().startsWith('wheel_'));
const prim = node.getMesh().listPrimitives()[0];
const material = prim.getMaterial();
const P = prim.getAttribute('POSITION'), U = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
const n = P.getCount();
const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
const t3 = [0, 0, 0], t2 = [0, 0];
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
for (let i = 0; i < n; i++) {
  P.getElement(i, t3); U.getElement(i, t2);
  pos.set(t3, i * 3); uv.set(t2, i * 2);
  x0 = Math.min(x0, t3[0]); x1 = Math.max(x1, t3[0]); y0 = Math.min(y0, t3[1]); y1 = Math.max(y1, t3[1]);
}

const base = material.getBaseColorTexture();
const src = await sharp(Buffer.from(base.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const w = src.info.width, h = src.info.height, d = src.data;

// Rasterisasi segitiga bodi ke ruang UV: tinggi & posisi memanjang (0–1) tiap texel
const hBuf = new Float32Array(w * h).fill(-1), xBuf = new Float32Array(w * h);
const idx = I.getArray();
for (let t = 0; t < idx.length; t += 3) {
  const a = idx[t], b = idx[t + 1], c = idx[t + 2];
  const ax = uv[a * 2] * w, ay = uv[a * 2 + 1] * h, bx = uv[b * 2] * w, by = uv[b * 2 + 1] * h, cx = uv[c * 2] * w, cy = uv[c * 2 + 1] * h;
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(den) < 1e-9) continue;
  const ha = (pos[a * 3 + 1] - y0) / (y1 - y0), hb = (pos[b * 3 + 1] - y0) / (y1 - y0), hc = (pos[c * 3 + 1] - y0) / (y1 - y0);
  const xa = (pos[a * 3] - x0) / (x1 - x0), xb = (pos[b * 3] - x0) / (x1 - x0), xc = (pos[c * 3] - x0) / (x1 - x0);
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
  const eps = -0.8 / Math.sqrt(Math.abs(den) + 1);
  for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
    const l1 = ((by - cy) * (px + 0.5 - cx) + (cx - bx) * (py + 0.5 - cy)) / den;
    const l2 = ((cy - ay) * (px + 0.5 - cx) + (ax - cx) * (py + 0.5 - cy)) / den;
    const l3 = 1 - l1 - l2;
    if (l1 < eps || l2 < eps || l3 < eps) continue;
    const o = py * w + px;
    hBuf[o] = l1 * ha + l2 * hb + l3 * hc; xBuf[o] = l1 * xa + l2 * xb + l3 * xc;
  }
}

const ss = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mask = new Float32Array(w * h);
for (let o = 0; o < w * h; o++) {
  if (hBuf[o] < 0) continue;
  const r = d[o * 3] / 255, g = d[o * 3 + 1] / 255, b = d[o * 3 + 2] / 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
  const xf = xBuf[o];
  // garis pinggang naik sedikit ke arah belakang; kap mesin & lampu belakang tidak disentuh
  const belt = 0.6 + 0.07 * Math.min(1, Math.max(0, (xf - 0.3) / 0.5));
  const zone = ss(hBuf[o], belt, belt + 0.03) * ss(xf, 0.25, 0.28) * (1 - ss(xf, 0.86, 0.89));
  mask[o] = zone * (1 - ss(lum, 0.52, 0.72)) * (1 - ss(sat, 0.16, 0.3));
}

const paint = async (texture, apply, fmtOf) => {
  if (!texture) return;
  const img = await sharp(Buffer.from(texture.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tw = img.info.width, th = img.info.height, td = img.data;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const m = mask[Math.min(h - 1, Math.floor((y / th) * h)) * w + Math.min(w - 1, Math.floor((x / tw) * w))];
    if (m > 0) apply(td, (y * tw + x) * 3, m);
  }
  const s = sharp(Buffer.from(td), { raw: { width: tw, height: th, channels: 3 } });
  const mime = texture.getMimeType();
  texture.setImage(mime === 'image/webp' ? await s.webp({ quality: 92 }).toBuffer() : mime === 'image/png' ? await s.png().toBuffer() : await s.jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toBuffer());
};
const mix = (td, i, m, rgb) => { for (let k = 0; k < 3; k++) td[i + k] = Math.round(td[i + k] * (1 - m) + rgb[k] * m); };
await paint(base, (td, i, m) => mix(td, i, m, [7, 9, 13]));
// glTF: G = kekasaran, B = logam → kaca licin, bukan logam
await paint(material.getMetallicRoughnessTexture(), (td, i, m) => mix(td, i, m, [td[i], 26, 0]));
await paint(material.getNormalTexture(), (td, i, m) => mix(td, i, m, [128, 128, 255]));

if (debug) await sharp(Buffer.from(Uint8Array.from(mask, (v) => v * 255)), { raw: { width: w, height: h, channels: 1 } }).png().toFile(debug);
await io.write(file, doc);
console.log(file, 'kaca digelapkan');
