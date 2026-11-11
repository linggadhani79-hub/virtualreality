// Pengganti lokal "firebase/firestore": dokumen disimpan di perangkat (IndexedDB).
// Bila dokumen belum pernah disimpan, dipakai data bawaan aplikasi dari /lab/*.json.
import { DOC_PREFIX, fetchBundledDoc, idbDel, idbGet, idbSet } from "./bundle";

type DocRef = { path: string };

export function getFirestore(..._args: unknown[]) {
  return { type: "local-firestore" };
}

export function doc(_db: unknown, ...segments: string[]): DocRef {
  return { path: segments.join("/") };
}

function snapshot(data: any) {
  return {
    exists: () => data !== undefined && data !== null,
    data: () => data,
    metadata: { hasPendingWrites: false, fromCache: true },
  };
}

async function read(ref: DocRef) {
  let data = await idbGet(DOC_PREFIX + ref.path).catch(() => undefined);
  if (data === undefined) data = await fetchBundledDoc(ref.path);
  return data;
}

export async function getDoc(ref: DocRef) {
  return snapshot(await read(ref));
}

export async function setDoc(ref: DocRef, data: any, options?: { merge?: boolean }) {
  let next = data;
  if (options?.merge) {
    const prev = (await idbGet(DOC_PREFIX + ref.path).catch(() => undefined)) || {};
    next = { ...prev, ...data };
  }
  await idbSet(DOC_PREFIX + ref.path, next);
}

export async function deleteDoc(ref: DocRef) {
  await idbDel(DOC_PREFIX + ref.path);
}

/** Tidak ada klien lain di mode lokal: cukup kirim keadaan saat ini satu kali. */
export function onSnapshot(ref: DocRef, onNext: (snap: ReturnType<typeof snapshot>) => void, onError?: (e: unknown) => void) {
  let active = true;
  read(ref)
    .then((data) => {
      if (active) onNext(snapshot(data));
    })
    .catch((e) => onError?.(e));
  return () => {
    active = false;
  };
}
