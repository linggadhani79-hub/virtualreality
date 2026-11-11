// Pengganti lokal "firebase/storage": berkas disimpan di perangkat (IndexedDB).
// Bila berkas belum ada di perangkat, dipakai aset bawaan aplikasi dari /lab/assets/.
import { FILE_PREFIX, bundledFileUrl, fetchBundledFile, idbDel, idbGet, idbSet } from "./bundle";

type FileRef = { fullPath: string; name: string };

export function getStorage(..._args: unknown[]) {
  return { type: "local-storage" };
}

export function ref(_storage: unknown, path = ""): FileRef {
  return { fullPath: path, name: path.split("/").pop() || "" };
}

function notFound(path: string) {
  const err: any = new Error(`Berkas lokal tidak ditemukan: ${path}`);
  err.code = "storage/object-not-found";
  return err;
}

// store.ts sudah menyimpan isi berkas di IndexedDB sebagai "asset_<id>" sebelum "mengunggah",
// jadi di sini cukup dicatat bahwa berkas itu ada (tanpa menyimpan salinan kedua).
export async function uploadBytes(fileRef: FileRef, data: Blob | ArrayBuffer | Uint8Array, _metadata?: unknown) {
  const size = data instanceof Blob ? data.size : (data as ArrayBuffer).byteLength;
  await idbSet(FILE_PREFIX + fileRef.fullPath, { size });
  return { ref: fileRef, metadata: { size } };
}

export async function getBlob(fileRef: FileRef): Promise<Blob> {
  const marker = await idbGet(FILE_PREFIX + fileRef.fullPath).catch(() => undefined);
  if (marker) {
    const local = await idbGet(`asset_${fileRef.name}`).catch(() => undefined);
    if (local) return local instanceof Blob ? local : new Blob([local as ArrayBuffer]);
  }
  const bundled = await fetchBundledFile(fileRef.fullPath);
  if (bundled) return bundled;
  throw notFound(fileRef.fullPath);
}

export async function getMetadata(fileRef: FileRef) {
  const blob = await getBlob(fileRef);
  return { size: blob.size, name: fileRef.name, fullPath: fileRef.fullPath, timeCreated: "", updated: "" };
}

/** Tidak ada alamat unduh di mode lokal; aset bawaan dilayani langsung dari aplikasi. */
export async function getDownloadURL(fileRef: FileRef): Promise<string> {
  const local = await idbGet(FILE_PREFIX + fileRef.fullPath).catch(() => undefined);
  if (local) return "";
  const bundled = await fetchBundledFile(fileRef.fullPath);
  if (bundled) return bundledFileUrl(fileRef.fullPath);
  throw notFound(fileRef.fullPath);
}

export async function deleteObject(fileRef: FileRef) {
  await idbDel(FILE_PREFIX + fileRef.fullPath);
}

export async function listAll(_ref: FileRef) {
  return { items: [] as FileRef[], prefixes: [] as FileRef[] };
}
