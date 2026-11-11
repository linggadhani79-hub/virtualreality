// Bantuan untuk mode lokal: data disimpan di perangkat (IndexedDB), dan bila belum ada,
// diambil dari berkas bawaan aplikasi di folder /lab (ikut tersimpan offline oleh service worker).
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";

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
