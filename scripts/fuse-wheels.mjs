// Satukan kembali roda yang sudah dipotong ke dalam bodi (satu mesh), supaya bisa dipotong ulang
// dengan scripts/split-fused-wheels.mjs:  node scripts/fuse-wheels.mjs <mobil-hq.glb> <keluaran.glb>
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const src = await io.read(process.argv[2]);
const mul = (m, p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const rot = (m, v) => { const x=m[0]*v[0]+m[4]*v[1]+m[8]*v[2], y=m[1]*v[0]+m[5]*v[1]+m[9]*v[2], z=m[2]*v[0]+m[6]*v[1]+m[10]*v[2]; const l=Math.hypot(x,y,z)||1; return [x/l,y/l,z/l]; };
const P = [], N = [], U = [], I = [];
let material;
for (const node of src.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    material ??= prim.getMaterial();
    const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ua = prim.getAttribute('TEXCOORD_0');
    const base = P.length / 3, e3 = [0,0,0], e2 = [0,0];
    for (let i = 0; i < pa.getCount(); i++) {
      P.push(...mul(m, pa.getElement(i, e3)));
      N.push(...(na ? rot(m, na.getElement(i, e3)) : [0, 1, 0]));
      U.push(...(ua ? ua.getElement(i, e2) : [0, 0]));
    }
    const idx = prim.getIndices().getArray();
    for (let k = 0; k < idx.length; k++) I.push(base + idx[k]);
  }
}
const doc = new Document(); const buf = doc.createBuffer();
const tex = material.getBaseColorTexture();
const mat = doc.createMaterial('bodi').setRoughnessFactor(material.getRoughnessFactor()).setMetallicFactor(material.getMetallicFactor());
if (tex) mat.setBaseColorTexture(doc.createTexture().setImage(tex.getImage()).setMimeType(tex.getMimeType()));
const prim = doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
  .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
  .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)).setBuffer(buf))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buf));
doc.createScene().addChild(doc.createNode('bodi').setMesh(doc.createMesh('bodi').addPrimitive(prim)));
const NIO = new NodeIO();
await NIO.write(process.argv[3], doc);
console.log('titik', P.length / 3, 'segitiga', I.length / 3);
