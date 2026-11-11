import { db, storage, auth } from "./firebase";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  getBlob,
} from "firebase/storage";
import { set as idbSet, get as idbGet, del as idbDel } from "idb-keyval";

export let isFirestoreQuotaExceeded = false;
export let isIdbQuotaExceeded = false;
export let isStorageUnauthorized = false;

export async function saveAsset(id: string, data: ArrayBuffer | Blob): Promise<string | undefined> {
  try {
    await idbSet(`asset_${id}`, data);
  } catch (err) {
    if (err instanceof Error && err.name === "QuotaExceededError") {
      isIdbQuotaExceeded = true;
      console.warn("IndexedDB quota exceeded.");
    } else {
      console.warn("IndexedDB save failed:", err);
    }
  }

  const blob = data instanceof Blob ? data : new Blob([data]);

  try {
    const assetRef = ref(storage, `assets/${id}`);
    await uploadBytes(assetRef, blob, { contentType: "application/octet-stream" });
    const downloadUrl = await getDownloadURL(assetRef);
    isStorageUnauthorized = false; // Reset if successful
    return downloadUrl;
  } catch (err: any) {
    console.warn("Failed to save asset to Storage:", err);
    if (err?.code === "storage/unauthorized") {
      isStorageUnauthorized = true;
      alert(
        "⚠️ Firebase Storage ditolak (unauthorized). Silakan pastikan Anda sudah login.",
      );
    } else {
      alert("⚠️ Gagal menyimpan ke Firebase Storage: " + err.message);
    }
    return undefined;
  }
}

export async function getAsset(
  id: string,
): Promise<ArrayBuffer | Blob | undefined> {
  // Always try IDB first because if we fallback we want the latest local changes
  try {
    const localBlob = await idbGet(`asset_${id}`);
    if (localBlob) return localBlob;
  } catch (e) {}

  if (isStorageUnauthorized) return undefined;

  try {
    const assetRef = ref(storage, `assets/${id}`);
    const blob = await getBlob(assetRef);
    
    // Cache the downloaded blob into IndexedDB for future fast access
    try {
      await idbSet(`asset_${id}`, blob);
    } catch (e) {
      console.warn("Failed to cache downloaded asset to IDB", e);
    }
    
    return blob;
  } catch (err) {
    try {
      const assetRef2 = ref(storage, `assets/${id}.glb`);
      const blob = await getBlob(assetRef2);
      
      try {
        await idbSet(`asset_${id}`, blob);
      } catch (e) {
        console.warn("Failed to cache downloaded asset to IDB", e);
      }
      
      return blob;
    } catch (err2) {
      console.warn(
        "Could not retrieve asset from Storage (might not exist):",
        err,
        err2,
      );
      return undefined;
    }
  }
}

export async function checkAssetInIDB(id: string, type: "glb" | "fbx" = "glb"): Promise<string | undefined> {
  try {
    const localBlob = await idbGet(`asset_${id}`);
    if (localBlob) {
      if (localBlob instanceof Blob) {
        return URL.createObjectURL(localBlob) + (type === "glb" ? '#asset.glb' : '#asset.fbx');
      } else {
        return URL.createObjectURL(new Blob([localBlob], { type: "application/octet-stream" })) + (type === "glb" ? '#asset.glb' : '#asset.fbx');
      }
    }
  } catch (e) {}
  return undefined;
}

export async function getAssetURL(id: string, type: "glb" | "fbx" = "glb"): Promise<string | undefined> {
  const assetBlob = await getAsset(id);
  
  if (assetBlob) {
    if (assetBlob instanceof Blob) {
      return URL.createObjectURL(assetBlob) + (type === "glb" ? '#asset.glb' : '#asset.fbx');
    } else {
      return URL.createObjectURL(new Blob([assetBlob], { type: "application/octet-stream" })) + (type === "glb" ? '#asset.glb' : '#asset.fbx');
    }
  }

  return undefined;
}

export async function getAssetSizeAndCacheStatus(id: string): Promise<{ size: number, isCached: boolean }> {
  try {
    const cached = await idbGet(`asset_${id}`);
    if (cached) {
      const size = cached instanceof Blob ? cached.size : (cached as ArrayBuffer).byteLength;
      return { size, isCached: true };
    }
    
    // If not cached, get from Firebase Storage
    const { getMetadata } = await import("firebase/storage");
    try {
      const assetRef = ref(storage, `assets/${id}`);
      const meta = await getMetadata(assetRef);
      return { size: meta.size, isCached: false };
    } catch (e) {
      try {
        const assetRef2 = ref(storage, `assets/${id}.glb`);
        const meta = await getMetadata(assetRef2);
        return { size: meta.size, isCached: false };
      } catch (e2) {
        try {
           const assetRef3 = ref(storage, `assets/${id}.fbx`);
           const meta = await getMetadata(assetRef3);
           return { size: meta.size, isCached: false };
        } catch (e3) {
           return { size: 0, isCached: false };
        }
      }
    }
  } catch (err) {
    return { size: 0, isCached: false };
  }
}

export async function getAssetDownloadURL(id: string): Promise<string | undefined> {
  try {
    const assetRef = ref(storage, `assets/${id}`);
    const url = await getDownloadURL(assetRef);
    return url;
  } catch (err) {
    try {
      const assetRef2 = ref(storage, `assets/${id}.glb`);
      const url = await getDownloadURL(assetRef2);
      return url;
    } catch (err2) {
      console.warn("Could not get download URL:", err, err2);
      return undefined;
    }
  }
}

export async function fetchAssetViaProxy(id: string, downloadUrl: string, type: "glb" | "fbx" = "glb"): Promise<string | undefined> {
  // Check if we already have it
  const localBlob = await idbGet(`asset_${id}`);
  if (localBlob) {
    const text = await (localBlob instanceof Blob ? localBlob : new Blob([localBlob])).slice(0, 100).text();
    if (text.trim().startsWith('<')) {
      console.warn("Found corrupted HTML in IDB for asset", id, "deleting...");
      await idbDel(`asset_${id}`);
    } else {
      return URL.createObjectURL(localBlob instanceof Blob ? localBlob : new Blob([localBlob], { type: "application/octet-stream" })) + (type === "glb" ? '#asset.glb' : '#asset.fbx');
    }
  }

  const urlsToTry = [
    `/api/proxy-asset?url=${encodeURIComponent(downloadUrl)}`,
    downloadUrl,
  ];

  if (id.includes("porsche") || downloadUrl.includes("porsche")) {
    const porscheAlt = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0135626792.firebasestorage.app/o/assets%2Fev_sport_car_move_02.glb?alt=media&token=b8c40d7d-d25c-4f4d-9d3b-0c45fd3c503a";
    urlsToTry.push(`/api/proxy-asset?url=${encodeURIComponent(porscheAlt)}`);
    urlsToTry.push(porscheAlt);
  }

  urlsToTry.push(
    `https://corsproxy.io/?${encodeURIComponent(downloadUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(downloadUrl)}`
  );

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout
      
      const response = await fetch(url, { signal: controller.signal });
      
      if (!response.ok) {
        clearTimeout(timeoutId);
        continue;
      }
      
      const blob = await response.blob();
      clearTimeout(timeoutId);
      
      const textPreview = await blob.slice(0, 100).text();
      if (textPreview.trim().startsWith('<')) {
        console.warn("Proxy returned HTML instead of model, skipping this URL:", url);
        continue;
      }
      
      // Cache it
      try {
        await idbSet(`asset_${id}`, blob);
      } catch (e) {
        console.warn("Failed to cache via proxy:", e);
      }
      
      return URL.createObjectURL(blob) + (type === "glb" ? '#asset.glb' : '#asset.fbx');
    } catch (e) {
      console.warn("Proxy fetch failed for URL:", url, e);
    }
  }
  
  return undefined;
}

export async function removeAsset(id: string) {
  try {
    await idbDel(`asset_${id}`);
  } catch (e) {}

  if (!isStorageUnauthorized) {
    try {
      const assetRef = ref(storage, `assets/${id}`);
      await deleteObject(assetRef);
    } catch (err) {
      try {
        const assetRef2 = ref(storage, `assets/${id}.glb`);
        await deleteObject(assetRef2);
      } catch (err2) {
        console.warn(
          "Could not remove asset from Storage (might not exist):",
          err,
          err2,
        );
      }
    }
  }
}

export async function saveWorkspaceData(data: any) {
  // Strip undefined values deeply before saving to Firestore
  const cleanData = JSON.parse(JSON.stringify(data));
  
  try {
    const localPromise = idbSet("workspace_local", cleanData);
    const globalPromise = idbSet("workspace_global", cleanData); // keep legacy key updated too just in case
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("IDB timeout")), 5000));
    await Promise.race([Promise.all([localPromise, globalPromise]), timeoutPromise]);
  } catch (e) {
    console.error("Failed to save workspace to IDB", e);
  }

  if (!isFirestoreQuotaExceeded) {
    try {
      const setDocPromise = setDoc(doc(db, "workspaces", "global"), {
        items: cleanData,
        updatedAt: new Date().toISOString(),
      });
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("Firestore timeout")), 15000));
      await Promise.race([setDocPromise, timeoutPromise]);
      return;
    } catch (err: any) {
      if (err?.code === "resource-exhausted") {
        isFirestoreQuotaExceeded = true;
        console.warn(
          "Firestore quota exceeded while saving workspace data. Falling back to IDB.",
        );
      } else {
        console.error("Firestore save error:", err);
      }
    }
  }
}

export function subscribeToWorkspaceData(callback: (data: any) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  
  if (!isFirestoreQuotaExceeded) {
    import("firebase/firestore").then(({ onSnapshot, doc }) => {
      unsubscribe = onSnapshot(doc(db, "workspaces", "global"), (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data().items;
          idbSet("workspace_local", data).catch(() => {});
          callback(data);
        }
      });
    });
  }
  
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}

export async function getWorkspaceData(): Promise<any> {
  if (!isFirestoreQuotaExceeded) {
    try {
      const d = await getDoc(doc(db, "workspaces", "global"));
      if (d.exists()) {
        const data = d.data().items;
        idbSet("workspace_local", data).catch(() => {});
        return data;
      }
    } catch (err: any) {
      console.warn("Firestore fetch failed, falling back to local:", err);
      if (err?.code === "resource-exhausted") {
        isFirestoreQuotaExceeded = true;
      }
    }
  }

  // Fallback to local
  try {
    const localData = await idbGet("workspace_local");
    if (localData) return localData;
  } catch (e) {}

  return null;
}

export async function saveAssetLibraryData(data: any) {
  const cleanData = JSON.parse(JSON.stringify(data));
  try {
    const localPromise = idbSet("workspace_library_local", cleanData);
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("IDB timeout")), 5000));
    await Promise.race([localPromise, timeoutPromise]);
  } catch (e) {}

  if (!isFirestoreQuotaExceeded) {
    try {
      const setDocPromise = setDoc(doc(db, "workspaces", "library"), {
        items: cleanData,
        updatedAt: new Date().toISOString(),
      });
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("Firestore timeout")), 15000));
      await Promise.race([setDocPromise, timeoutPromise]);
    } catch (err: any) {
      if (err?.code === "resource-exhausted") {
        isFirestoreQuotaExceeded = true;
      }
    }
  }
}

export async function getAssetLibraryData(): Promise<any> {
  if (!isFirestoreQuotaExceeded) {
    try {
      const d = await getDoc(doc(db, "workspaces", "library"));
      if (d.exists()) {
        const data = d.data().items;
        idbSet("workspace_library_local", data).catch(() => {});
        return data;
      }
    } catch (err: any) {
      console.warn("Firestore fetch failed, falling back to local:", err);
      if (err?.code === "resource-exhausted") {
        isFirestoreQuotaExceeded = true;
      }
    }
  }

  // Fallback to local
  try {
    const localData = await idbGet("workspace_library_local");
    if (localData) return localData;
  } catch (e) {}

  return null;
}

export async function clearWorkspace() {
  try {
    await idbDel("workspace_local");
  } catch (e) {}

  if (!isFirestoreQuotaExceeded) {
    try {
      await deleteDoc(doc(db, "workspaces", "global"));
    } catch (err: any) {
      if (err?.code === "resource-exhausted") isFirestoreQuotaExceeded = true;
    }
  }
}

export async function syncStorageAssetsToLibrary() {
  if (isStorageUnauthorized || !auth.currentUser) return;
  try {
    const { listAll, getMetadata } = await import("firebase/storage");
    const listRef = ref(storage, "assets/");
    const res = await listAll(listRef);

    // Convert to library format
    const discoveredAssets = [];
    for (const itemRef of res.items) {
      if (itemRef.name.endsWith(".glb") || itemRef.name.endsWith(".fbx") || itemRef.name.includes("lib-")) {
        const bufferId = itemRef.name; // Keep exact name for bufferId to fetch correctly
        const type = itemRef.name.endsWith(".fbx") ? "fbx" : "glb";

        let customName = itemRef.name.replace(/\.(glb|fbx)$/, "");
        try {
          const meta = await getMetadata(itemRef);
          if (meta.customMetadata && meta.customMetadata.originalName) {
            customName = meta.customMetadata.originalName;
          }
        } catch (e) {}

        discoveredAssets.push({
          id: bufferId,
          bufferId,
          name: customName,
          type,
        });
      }
    }
    return discoveredAssets;
  } catch (err: any) {
    console.warn("Could not list storage assets:", err);
    if (err?.code === "storage/unauthorized") {
      isStorageUnauthorized = true;
    }
  }
  return [];
}
