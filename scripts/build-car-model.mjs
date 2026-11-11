// Cara pakai (sekali saja, di luar build aplikasi):
//   npm i --no-save meshoptimizer sharp
//   node scripts/build-car-model.mjs <model-asli.glb> public/models/contoh-mobil-listrik.glb 0.5 2048 57 0.71 0.0001
// Argumen: rasio penyederhanaan, ukuran tekstur, iterasi penghalusan bodi, tinggi garis kaca (0-1),
// batas galat penyederhanaan.
// Mengasumsikan mobil memanjang di sumbu X, tinggi di sumbu Y, dan satu mesh bertekstur.
// Menyiapkan model mobil untuk lab:
//  1. sederhanakan mesh, 2. pisahkan 4 roda jadi node sendiri (agar bisa berputar),
//  3. haluskan bodi (Taubin) + normal halus, 4. kompres tekstur (WebP) & mesh (Meshopt).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [inp, out, ratio, tex, itersArg] = process.argv.slice(2);
const ITER = +itersArg;
const BELT = +(process.argv[7] ?? 0.71);
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +(process.argv[8] ?? 0.0004) }), prune());

const root = doc.getRoot();
const node = root.listNodes().find(n => n.getMesh());
const mesh = node.getMesh();
const prim = mesh.listPrimitives()[0];
const material = prim.getMaterial();
const pos = Float32Array.from(prim.getAttribute('POSITION').getArray());
const nor = Float32Array.from(prim.getAttribute('NORMAL').getArray());
const uv = Float32Array.from(prim.getAttribute('TEXCOORD_0').getArray());
const idx = Uint32Array.from(prim.getIndices().getArray());
const n = pos.length / 3;

// ---- warna tekstur per titik (untuk mengenali ban yang gelap) ----
const { data, info } = await sharp(Buffer.from(material.getBaseColorTexture().getImage())).resize(1024, 1024).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const lum = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const u = ((uv[i*2] % 1) + 1) % 1, v = ((uv[i*2+1] % 1) + 1) % 1;
  const o = (Math.min(1023, Math.floor(v * 1024)) * 1024 + Math.min(1023, Math.floor(u * 1024))) * 3;
  lum[i] = (0.299 * data[o] + 0.587 * data[o+1] + 0.114 * data[o+2]) / 255;
}
let ymin = Infinity, zmax = 0;
for (let i = 0; i < n; i++) { ymin = Math.min(ymin, pos[i*3+1]); zmax = Math.max(zmax, Math.abs(pos[i*3+2])); }
const pct = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---- cari pusat & jari-jari roda ----
const wheels = [];
for (const sx of [-1, 1]) {
  const xs = []; for (let i = 0; i < n; i++) if (pos[i*3+1] < ymin + 0.02 && Math.sign(pos[i*3]) === sx) xs.push(pos[i*3]);
  const cx = (pct(xs, 0.03) + pct(xs, 0.97)) / 2;
  const tops = []; for (let i = 0; i < n; i++) if (Math.abs(pos[i*3] - cx) < 0.06 && Math.abs(pos[i*3+2]) > 0.7 * zmax && lum[i] < 0.3 && pos[i*3+1] < ymin + 0.45) tops.push(pos[i*3+1]);
  const r = (pct(tops, 0.98) - ymin) / 2;
  for (const sz of [-1, 1]) wheels.push({ cx, cy: ymin + r, r, sz, name: `wheel_${sx < 0 ? 'A' : 'B'}${sz < 0 ? 'L' : 'R'}` });
  console.log('axle x', cx.toFixed(3), 'radius', r.toFixed(3));
}

// ---- klasifikasi segitiga: -1 bodi, 0..3 roda ----
const inWheel = (i, w, k = 1.035) => Math.sign(pos[i*3+2]) === w.sz && Math.abs(pos[i*3+2]) > 0.45 * zmax && Math.hypot(pos[i*3] - w.cx, pos[i*3+1] - w.cy) < w.r * k;
const triOwner = new Int8Array(idx.length / 3).fill(-1);
for (let t = 0; t < idx.length; t += 3) for (let w = 0; w < 4; w++) if (inWheel(idx[t], wheels[w]) && inWheel(idx[t+1], wheels[w]) && inWheel(idx[t+2], wheels[w])) { triOwner[t/3] = w; break; }

const buffer = root.listBuffers()[0];
const makePrim = (owner, center) => {
  const remap = new Map(); const P = [], N = [], U = [], I = [];
  for (let t = 0; t < idx.length; t += 3) { if (triOwner[t/3] !== owner) continue;
    for (let k = 0; k < 3; k++) { const v = idx[t+k]; let m = remap.get(v);
      if (m === undefined) { m = P.length / 3; remap.set(v, m); P.push(pos[v*3] - center[0], pos[v*3+1] - center[1], pos[v*3+2] - center[2]); N.push(nor[v*3], nor[v*3+1], nor[v*3+2]); U.push(uv[v*2], uv[v*2+1]); }
      I.push(m); } }
  const p = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buffer));
  return { p, tris: I.length / 3 };
};

// ---- haluskan bodi (roda & tepi lubang roda tidak digeser) ----
{
  const map = new Map(); const cid = new Uint32Array(n); let nc = 0;
  for (let i = 0; i < n; i++) { const k = `${Math.round(pos[i*3]*1e5)},${Math.round(pos[i*3+1]*1e5)},${Math.round(pos[i*3+2]*1e5)}`; let c = map.get(k); if (c === undefined) { c = nc++; map.set(k, c); } cid[i] = c; }
  const P = new Float64Array(nc * 3), W = new Float32Array(nc).fill(1);
  for (let i = 0; i < n; i++) { const c = cid[i]; P[c*3] = pos[i*3]; P[c*3+1] = pos[i*3+1]; P[c*3+2] = pos[i*3+2]; if (wheels.some(w => inWheel(i, w, 1.12))) W[c] = 0; }
  const nb = Array.from({ length: nc }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) { const a = cid[idx[t]], b = cid[idx[t+1]], c = cid[idx[t+2]];
    if (a !== b) { nb[a].add(b); nb[b].add(a); } if (b !== c) { nb[b].add(c); nb[c].add(b); } if (a !== c) { nb[a].add(c); nb[c].add(a); } }
  const adj = nb.map(s => Uint32Array.from(s));
  const step = (f) => { const Q = new Float64Array(P.length);
    for (let c = 0; c < nc; c++) { const a = adj[c]; let x = 0, y = 0, z = 0; for (const j of a) { x += P[j*3]; y += P[j*3+1]; z += P[j*3+2]; }
      const g = a.length ? f * W[c] : 0, m = a.length || 1;
      Q[c*3] = P[c*3] + g * (x / m - P[c*3]); Q[c*3+1] = P[c*3+1] + g * (y / m - P[c*3+1]); Q[c*3+2] = P[c*3+2] + g * (z / m - P[c*3+2]); }
    P.set(Q); };
  for (let it = 0; it < ITER; it++) { step(0.5); step(-0.53); }
  const Nn = new Float64Array(nc * 3);
  for (let t = 0; t < idx.length; t += 3) { const a = cid[idx[t]], b = cid[idx[t+1]], c = cid[idx[t+2]];
    const ux = P[b*3]-P[a*3], uy = P[b*3+1]-P[a*3+1], uz = P[b*3+2]-P[a*3+2], vx = P[c*3]-P[a*3], vy = P[c*3+1]-P[a*3+1], vz = P[c*3+2]-P[a*3+2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx; for (const k of [a, b, c]) { Nn[k*3] += nx; Nn[k*3+1] += ny; Nn[k*3+2] += nz; } }
  for (let i = 0; i < n; i++) { const c = cid[i]; if (W[c] === 0) continue;
    pos[i*3] = P[c*3]; pos[i*3+1] = P[c*3+1]; pos[i*3+2] = P[c*3+2];
    const l = Math.hypot(Nn[c*3], Nn[c*3+1], Nn[c*3+2]) || 1; nor[i*3] = Nn[c*3]/l; nor[i*3+1] = Nn[c*3+1]/l; nor[i*3+2] = Nn[c*3+2]/l; }
}

// ---- susun ulang: bodi + 4 roda ----
const body = makePrim(-1, [0, 0, 0]);
mesh.removePrimitive(prim); prim.dispose(); mesh.addPrimitive(body.p); mesh.setName('body'); node.setName('body');
console.log('body tris', body.tris);
wheels.forEach((w, i) => {
  const c = [w.cx, w.cy, 0];
  const { p, tris } = makePrim(i, c);
  const wn = doc.createNode(w.name).setMesh(doc.createMesh(w.name).addPrimitive(p)).setTranslation(c).setExtras({ radius: w.r });
  node.addChild(wn);
  console.log(w.name, 'tris', tris);
});
// ---- bersihkan tekstur: cat bodi putih rata, kaca gelap; detail gelap (garis pintu, lampu, gril) tetap ----
{
  const texObj = material.getBaseColorTexture();
  const src = await sharp(Buffer.from(texObj.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = src.data, w = src.info.width, h = src.info.height;
  let ymax = -Infinity; for (let i = 0; i < n; i++) ymax = Math.max(ymax, pos[i*3+1]);
  const H = ymax - ymin;
  // Rasterisasi segitiga bodi ke ruang UV: simpan tinggi relatif & arah normal tiap texel
  const hBuf = new Float32Array(w * h).fill(-1), nBuf = new Float32Array(w * h);
  for (let t = 0; t < idx.length; t += 3) {
    if (triOwner[t/3] !== -1) continue;
    const i0 = idx[t], i1 = idx[t+1], i2 = idx[t+2];
    const x0 = uv[i0*2]*w, y0 = uv[i0*2+1]*h, x1 = uv[i1*2]*w, y1 = uv[i1*2+1]*h, x2 = uv[i2*2]*w, y2 = uv[i2*2+1]*h;
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1), maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1), maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)) + 1);
    const h0 = (pos[i0*3+1] - ymin) / H, h1 = (pos[i1*3+1] - ymin) / H, h2 = (pos[i2*3+1] - ymin) / H;
    const n0 = nor[i0*3+1], n1 = nor[i1*3+1], n2 = nor[i2*3+1];
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const a = ((y1 - y2) * (px + 0.5 - x2) + (x2 - x1) * (py + 0.5 - y2)) / den, b = ((y2 - y0) * (px + 0.5 - x2) + (x0 - x2) * (py + 0.5 - y2)) / den, c = 1 - a - b;
      const eps = -0.6 / Math.sqrt(Math.abs(den) + 1);
      if (a < eps || b < eps || c < eps) continue;
      const o = py * w + px; hBuf[o] = a * h0 + b * h1 + c * h2; nBuf[o] = a * n0 + b * n1 + c * n2;
    }
  }
  const ss = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const PAINT = [236, 238, 242], GLASS = [26, 33, 44];
  for (let o = 0; o < w * h; o++) {
    if (hBuf[o] < 0) continue; // roda / di luar pulau UV: biarkan
    const i = o * 3, r = d[i] / 255, g = d[i+1] / 255, b = d[i+2] / 255;
    const lum = 0.299*r + 0.587*g + 0.114*b, sat = Math.max(r, g, b) - Math.min(r, g, b);
    const glass = ss(hBuf[o], BELT - 0.015, BELT + 0.015) * (1 - ss(nBuf[o], 0.9, 0.97));
    const neutral = 1 - ss(sat, 0.16, 0.3); // lampu berwarna tidak disentuh
    const pm = (1 - glass) * neutral * ss(lum, 0.2, 0.36);
    const gm = glass * neutral * ss(lum, 0.16, 0.3) * 0.88;
    for (let k = 0; k < 3; k++) {
      const paint = PAINT[k] * (0.93 + 0.07 * lum);
      const gl = GLASS[k] + 46 * lum;
      d[i+k] = Math.round(d[i+k] * (1 - pm - gm) + paint * pm + gl * gm);
    }
  }
  texObj.setImage(await sharp(Buffer.from(d), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()).setMimeType('image/png');
  // Peta normal & kekasaran hasil AI berisik: pakai nilai cat yang seragam
  material.setNormalTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0.3).setRoughnessFactor(0.38);
}
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+tex, +tex], quality: 96 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(out, doc);
