// Bantuan untuk mode lokal: data disimpan di perangkat (IndexedDB), dan bila belum ada,
// diambil dari berkas bawaan aplikasi di folder /lab (ikut tersimpan offline oleh service worker).
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys, delMany as idbDelMany } from "idb-keyval";

export const DOC_PREFIX = "localdoc:";
export const FILE_PREFIX = "localfile:";

export { idbGet, idbSet, idbDel };

/** /lab/workspaces_global.json, /lab/workspaces_library.json */
export async function fetchBundledDoc(path: string): Promise<any | undefined> {
  try {
    const res = await fetch(`/lab/${path.replace(/\//g, "_")}.json`, { cache: "no-cache" });
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("json")) return undefined; // fallback halaman SPA, bukan data
    return await res.json();
  } catch {
    return undefined;
  }
}

/** "assets/<id>" → /lab/assets/<id> */
export function bundledFileUrl(path: string): string {
  return `/lab/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function fetchBundledFile(path: string): Promise<Blob | undefined> {
  try {
    const res = await fetch(bundledFileUrl(path));
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") || "";
    if (type.includes("text/html")) return undefined; // fallback halaman SPA, bukan aset
    return await res.blob();
  } catch {
    return undefined;
  }
}

const LOCAL_MODE_FLAG = "local_mode_initialised_v1";
let cleanup: Promise<void> | null = null;

/**
 * Sekali saja per perangkat: hapus sisa data dari masa aplikasi masih memakai database cloud
 * (salinan map lama, pustaka aset lama, dan berkas model yang dulu diunduh dari Firebase).
 * Tanpa ini, map lama akan muncul lagi dan mencoba mengambil model dari server yang sudah tidak dipakai.
 */
export function clearLegacyCloudData(): Promise<void> {
  if (!cleanup) {
    cleanup = (async () => {
      try {
        if (await idbGet(LOCAL_MODE_FLAG)) return;
        const all = await idbKeys();
        const stale = all.filter(
          (k) => typeof k === "string" && (k.startsWith("workspace") || k.startsWith("asset_")),
        );
        if (stale.length) await idbDelMany(stale);
        await idbSet(LOCAL_MODE_FLAG, Date.now());
      } catch (e) {
        console.warn("Pembersihan data lama gagal:", e);
      }
    })();
  }
  return cleanup;
}
