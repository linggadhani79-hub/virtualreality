// Menyiapkan model komponen (baterai, sasis, unit penggerak, …) untuk etalase lab.
// Jalankan di luar build aplikasi:
//   npm i --no-save meshoptimizer sharp
//   node scripts/build-part-model.mjs <asli.glb> public/models/<nama>-hq.glb   400000 2048
//   node scripts/build-part-model.mjs <asli.glb> public/models/<nama>-lite.glb 110000 1024
// Argumen: jumlah segitiga sasaran, ukuran tekstur (px), batas galat penyederhanaan (bawaan 0.002;
// naikkan mis. 0.05 untuk model pemandangan yang terdiri dari banyak kepingan kecil).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, meshopt, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out, trisArg, texArg, errArg] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const count = () => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
const before = count();
await doc.transform(dedup(), weld());
const ratio = Math.min(1, +trisArg / before);
if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: +(errArg ?? 0.002), lockBorder: false }));
// Model berisi ribuan kepingan lepas (daun pohon, rumput) tidak bisa diturunkan penyederhana biasa:
// pakai penyederhana kasar (berbasis kisi) untuk sisanya.
if (count() > +trisArg * 1.5) {
  const scale = +trisArg / count();
  for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const indices = prim.getIndices(), position = prim.getAttribute('POSITION');
    const src = new Uint32Array(indices.getArray());
    const pos = new Float32Array(position.getCount() * 3), el = [0, 0, 0];
    for (let i = 0; i < position.getCount(); i++) pos.set(position.getElement(i, el), i * 3);
    const target = Math.floor((src.length * scale) / 3) * 3;
    const [dst] = MeshoptSimplifier.simplifySloppy(src, pos, 3, null, target, 1);
    indices.setArray(dst);
    compactPrimitive(prim);
  }
}
await doc.transform(prune());
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+texArg, +texArg], quality: 90 }));
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }));
await io.write(out, doc);
console.log(out, 'segitiga', before, '→', count());
