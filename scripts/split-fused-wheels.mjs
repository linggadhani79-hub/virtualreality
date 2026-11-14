// Memisahkan 4 roda dari model mobil yang rodanya MENYATU dengan bodi (satu mesh), supaya roda
// bisa berputar. Untuk model yang rodanya sudah berupa bagian mesh tersendiri pakai
// scripts/build-car-model.mjs (hasilnya lebih rapi).
//
//   npm i --no-save meshoptimizer sharp
//   node scripts/split-fused-wheels.mjs <asli.glb> public/models/<nama>-hq.glb   200000 2048
//   node scripts/split-fused-wheels.mjs <asli.glb> public/models/<nama>-lite.glb  50000 1024
//   (mobil klasik berspatbor rapat) ... 60000 1024 0.078 0.36 tetap 0.8
//
// Argumen: jumlah segitiga sasaran, ukuran tekstur, lalu (opsional) jari-jari roda dan lebar roda
// sebagai pecahan panjang / lebar mobil bila tebakan otomatis meleset.
// Mengasumsikan mobil memanjang di sumbu X dan tinggi di sumbu Y. Roda menjadi node "wheel_*"
// dengan titik pusat di porosnya dan `extras.radius`; putar pada sumbu Z.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out, trisArg, texArg, rArg, wArg, modeArg, discArg] = process.argv.slice(2);
// modeArg 'tetap': pakai poros & jari-jari dari argumen apa adanya (tanpa penyesuaian otomatis).
// discArg: bagian jari-jari yang ikut berputar (mis. 0.8 = hanya pelek + dinding ban; telapak ban
// tetap di bodi). Dipakai untuk mobil yang spatbornya menutup rapat ban (mobil klasik), supaya
// spatbor tidak ikut terpotong dan berputar.
const DISC = discArg ? +discArg : 1;
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const root = doc.getRoot();
const total = root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
// Roda dipotong pada resolusi penuh dulu (tepi potongan halus), baru semuanya disederhanakan
// dengan tepi dikunci supaya garis potong tidak bergerigi.
await doc.transform(dedup(), weld());

const node = root.listNodes().find((n) => n.getMesh());
const mesh = node.getMesh();
const prim = mesh.listPrimitives()[0];
const material = prim.getMaterial();
const names = prim.listSemantics();
const attrs = names.map((s) => ({ s, acc: prim.getAttribute(s), arr: prim.getAttribute(s).getArray(), size: prim.getAttribute(s).getElementSize() }));
const posA = prim.getAttribute('POSITION');
const n = posA.getCount();
const pos = new Float32Array(n * 3); { const e = [0, 0, 0]; for (let i = 0; i < n; i++) pos.set(posA.getElement(i, e), i * 3); }
const idx = Uint32Array.from(prim.getIndices().getArray());

let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], pos[i * 3 + d]); mx[d] = Math.max(mx[d], pos[i * 3 + d]); }
const len = mx[0] - mn[0], zmax = Math.max(mx[2], -mn[2]);

// Poros: di atas titik-titik terendah (tapak ban) pada tiap separuh mobil
const axleX = (sign) => { let s = 0, c = 0; for (let i = 0; i < n; i++) if (Math.sign(pos[i * 3]) === sign && pos[i * 3 + 1] < mn[1] + 0.004 * len) { s += pos[i * 3]; c++; } return s / c; };
// Jari-jari: setengah panjang ban pada ketinggian poros, dicari dengan menyapu jari-jari sampai
// lingkaran menyentuh titik terendah dan tepi ban
const guessR = (cx) => {
  // titik sisi luar di sekitar poros: jarak terjauh ke depan/belakang pada ketinggian yang sama dengan pusat
  let best = 0;
  for (let r = 0.06 * len; r < 0.16 * len; r += 0.001 * len) {
    const cy = mn[1] + r; let hits = 0;
    for (let i = 0; i < n; i++) { if (Math.abs(pos[i * 3 + 2]) < 0.8 * zmax) continue; const d = Math.hypot(pos[i * 3] - cx, pos[i * 3 + 1] - cy); if (Math.abs(d - r) < 0.0015 * len) hits++; }
    if (hits > best) { best = hits; guessR.r = r; }
  }
  return guessR.r;
};
// Tebakan otomatis bisa ditimpa (model dengan spatbor besar, mis. mobil klasik):
//   WHEEL_CX="-0.735,0.539" WHEEL_CY=-0.198 WHEEL_R=0.149 (satuan model)
const env = process.env;
const centers = env.WHEEL_CX ? env.WHEEL_CX.split(",").map(Number) : [-1, 1].map((sign) => axleX(sign));
const r = env.WHEEL_R ? +env.WHEEL_R : rArg ? +rArg * len : (guessR(centers[0]) + guessR(centers[1])) / 2;
const cy = env.WHEEL_CY ? +env.WHEEL_CY.split(",")[0] : mn[1] + r;
const zin = zmax * (1 - (wArg ? +wArg : 0.36)); // batas dalam roda
console.log('poros x', centers.map((v) => v.toFixed(3)), 'jari-jari', r.toFixed(3), 'pusat y', cy.toFixed(3), 'batas dalam |z| >', zin.toFixed(3));

const wheels = [];
// WHEEL_CY boleh dua nilai (poros depan,belakang) bila tinggi pusat roda berbeda
const cys = env.WHEEL_CY && env.WHEEL_CY.includes(",") ? env.WHEEL_CY.split(",").map(Number) : null;
centers.forEach((cx, ci) => { for (const sz of [-1, 1]) wheels.push({ cx, sz, ...(cys ? { cy: cys[ci], r } : {}), name: `wheel_${cx < 0 ? 'A' : 'B'}${sz < 0 ? 'L' : 'R'}` }); });
const inWheel = (i, w) => Math.sign(pos[i * 3 + 2]) === w.sz && Math.abs(pos[i * 3 + 2]) > zin && Math.hypot(pos[i * 3] - w.cx, pos[i * 3 + 1] - cy) < r * 1.015;
const owner = new Int8Array(idx.length / 3).fill(-1);
// segitiga ikut roda bila titik tengahnya di dalam silinder roda
const triIn = (t, w) => {
  const a = idx[t], b = idx[t + 1], c = idx[t + 2];
  const x = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, y = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, z = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
  if (Math.sign(z) !== w.sz || Math.abs(z) <= zin) return false;
  const rad = Math.hypot(x - w.cx, y - (w.cy ?? cy)) / (w.r ?? r);
  // Di sisi dalam roda, lingkar luarnya adalah lapisan spatbor yang ikut terpotong: bila ikut roda
  // ia menjadi serpihan bergerigi yang berputar. Bagian itu dibiarkan diam di bodi.
  const inner = Math.abs(z) < zin + (zmax - zin) * 0.3;
  return rad < (inner ? 0.9 : 1.01) * DISC;
};
const assign = () => { owner.fill(-1); for (let t = 0; t < idx.length; t += 3) for (let w = 0; w < 4; w++) if (triIn(t, wheels[w])) { owner[t / 3] = w; break; } };
assign();
// Titik putar tiap roda = tengah lingkar bannya sendiri (bukan tebakan poros bersama); poros yang
// meleset beberapa milimeter saja membuat roda tampak oleng saat berputar. Ban diukur dari titik
// terluar (|z| besar) supaya lengkung spatbor yang ikut terpotong tidak menggeser hasilnya.
for (let pass = 0; pass < (modeArg === 'tetap' ? 0 : 2); pass++) {
  wheels.forEach((w, wi) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let t = 0; t < idx.length; t += 3) {
      if (owner[t / 3] !== wi) continue;
      for (let k = 0; k < 3; k++) { const v = idx[t + k]; if (Math.abs(pos[v * 3 + 2]) < zmax * 0.9) continue; x0 = Math.min(x0, pos[v * 3]); x1 = Math.max(x1, pos[v * 3]); y0 = Math.min(y0, pos[v * 3 + 1]); y1 = Math.max(y1, pos[v * 3 + 1]); }
    }
    if (x1 > x0) { w.cx = (x0 + x1) / 2; w.cy = (y0 + y1) / 2; w.r = Math.max(x1 - x0, y1 - y0) / 2; }
  });
  assign();
}
wheels.forEach((w) => console.log(w.name, 'pusat', w.cx.toFixed(4), (w.cy ?? cy).toFixed(4), 'jari-jari', (w.r ?? r).toFixed(4)));

// ---- Pecah halus segitiga yang dilewati garis potong ----
// Tanpa ini tepi roda mengikuti segitiga model (bergerigi) dan menyisakan lubang/serpihan. Segitiga
// yang titik-titiknya berada di wilayah berbeda (roda vs bodi) dibelah empat berulang kali, lalu
// tiap keping ikut wilayah titik tengahnya: tepi potong menjadi lingkaran yang rapi.
const regionAt = (x, y, z) => {
  for (let w = 0; w < 4; w++) {
    const wh = wheels[w];
    if (Math.sign(z) !== wh.sz || Math.abs(z) <= zin) continue;
    const rad = Math.hypot(x - wh.cx, y - (wh.cy ?? cy)) / (wh.r ?? r);
    const inner = Math.abs(z) < zin + (zmax - zin) * 0.3;
    if (rad < (inner ? 0.9 : 1.01) * DISC) return w;
  }
  return -1;
};
const A = attrs.map((a) => {
  const data = []; const e = new Array(a.size);
  for (let i = 0; i < n; i++) data.push(...a.acc.getElement(i, e));
  return { s: a.s, type: a.acc.getType(), size: a.size, data };
});
const PI = A.findIndex((a) => a.s === 'POSITION');
const vpos = (v) => [A[PI].data[v * 3], A[PI].data[v * 3 + 1], A[PI].data[v * 3 + 2]];
const vreg = (v) => { const p = vpos(v); return regionAt(p[0], p[1], p[2]); };
const midpoint = (u, v) => {
  const id = A[PI].data.length / 3;
  for (const a of A) for (let k = 0; k < a.size; k++) a.data.push((a.data[u * a.size + k] + a.data[v * a.size + k]) / 2);
  const ni = A.findIndex((a) => a.s === 'NORMAL');
  if (ni >= 0) { const d = A[ni].data; const l = Math.hypot(d[id * 3], d[id * 3 + 1], d[id * 3 + 2]) || 1; d[id * 3] /= l; d[id * 3 + 1] /= l; d[id * 3 + 2] /= l; }
  return id;
};
const DEPTH = +(env.WHEEL_SUBDIV || 4);
const outIdx = [];
const split = (a, b, c, depth) => {
  const ra = vreg(a), rb = vreg(b), rc = vreg(c);
  if (depth >= DEPTH || (ra === rb && rb === rc)) { outIdx.push(a, b, c); return; }
  const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
  split(a, ab, ca, depth + 1); split(ab, b, bc, depth + 1); split(ca, bc, c, depth + 1); split(ab, bc, ca, depth + 1);
};
for (let t = 0; t < idx.length; t += 3) split(idx[t], idx[t + 1], idx[t + 2], 0);
const own = new Int8Array(outIdx.length / 3);
for (let t = 0; t < outIdx.length; t += 3) {
  const p0 = vpos(outIdx[t]), p1 = vpos(outIdx[t + 1]), p2 = vpos(outIdx[t + 2]);
  own[t / 3] = regionAt((p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3);
}
// Keping kecil yang terpisah dari roda (ujung spatbor/apron yang kebetulan masuk lingkaran)
// dikembalikan ke bodi: hanya bagian roda yang tersambung yang ikut berputar.
{
  const key = (v) => { const p = vpos(v); return `${Math.round(p[0] * 2e4)},${Math.round(p[1] * 2e4)},${Math.round(p[2] * 2e4)}`; };
  for (let w = 0; w < 4; w++) {
    const tris = []; for (let t = 0; t < own.length; t++) if (own[t] === w) tris.push(t);
    const ids = new Map(); const par = [];
    const idOf = (k) => { let i = ids.get(k); if (i === undefined) { i = par.length; ids.set(k, i); par.push(i); } return i; };
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const triRoot = tris.map((t) => { const a = idOf(key(outIdx[t * 3])), b = idOf(key(outIdx[t * 3 + 1])), c = idOf(key(outIdx[t * 3 + 2])); par[find(a)] = find(b); par[find(b)] = find(c); return a; });
    const size = new Map(); tris.forEach((t, k) => { const r0 = find(triRoot[k]); size.set(r0, (size.get(r0) || 0) + 1); });
    const biggest = Math.max(0, ...size.values());
    let dropped = 0;
    tris.forEach((t, k) => { if (size.get(find(triRoot[k])) < biggest * 0.04) { own[t] = -1; dropped++; } });
    if (dropped) console.log(wheels[w].name, 'keping lepas dikembalikan ke bodi:', dropped, 'segitiga');
  }
}
console.log('segitiga setelah dipecah di garis potong:', idx.length / 3, '→', outIdx.length / 3);

const buffer = root.listBuffers()[0];
const makePrim = (who, center) => {
  const remap = new Map(); const data = A.map(() => []); const I = [];
  for (let t = 0; t < outIdx.length; t += 3) {
    if (own[t / 3] !== who) continue;
    for (let k = 0; k < 3; k++) {
      const v = outIdx[t + k]; let m = remap.get(v);
      if (m === undefined) {
        m = remap.size; remap.set(v, m);
        A.forEach((a, ai) => { const e = a.data.slice(v * a.size, v * a.size + a.size); if (a.s === 'POSITION') { e[0] -= center[0]; e[1] -= center[1]; e[2] -= center[2]; } data[ai].push(...e); });
      }
      I.push(m);
    }
  }
  const p = doc.createPrimitive().setMaterial(material).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buffer));
  A.forEach((a, ai) => p.setAttribute(a.s, doc.createAccessor().setType(a.type).setArray(new Float32Array(data[ai])).setBuffer(buffer)));
  return { p, tris: I.length / 3 };
};

const body = makePrim(-1, [0, 0, 0]);
const wheelPrims = wheels.map((w) => makePrim(wheels.indexOf(w), [w.cx, w.cy ?? cy, 0]));
mesh.removePrimitive(prim); prim.dispose(); mesh.addPrimitive(body.p); mesh.setName('body'); node.setName('body');
console.log('bodi', body.tris, 'segitiga');
wheels.forEach((w, i) => {
  node.addChild(doc.createNode(w.name).setMesh(doc.createMesh(w.name).addPrimitive(wheelPrims[i].p)).setTranslation([w.cx, w.cy ?? cy, 0]).setExtras({ radius: w.r ?? r, inner: zin + (zmax - zin) * 0.12 }));
  console.log(w.name, wheelPrims[i].tris, 'segitiga');
});

await doc.transform(prune());
if (+trisArg < total) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: +trisArg / total, error: 0.002, lockBorder: true }));
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+texArg, +texArg], quality: 90 }));
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }));
await io.write(out, doc);
