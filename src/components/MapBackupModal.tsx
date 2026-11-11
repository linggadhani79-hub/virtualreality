import React, { useState, useRef } from "react";
import {
  Download,
  Upload,
  FileText,
  Box,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Compass,
  Layers,
  Sparkles,
  HelpCircle,
  FileCode,
  Globe,
  Trash2,
  RefreshCw,
  X,
  Package,
  Archive,
  FolderArchive,
  Loader2,
  FolderDown,
} from "lucide-react";
import JSZip from "jszip";
import { UploadedModelData } from "./ModelUploader";
import { saveWorkspaceNow, triggerWorkspaceSave } from "./WorkspaceManager";
import { saveWorkspaceData, saveAssetLibraryData, getAsset, fetchAssetViaProxy, saveAsset } from "../lib/store";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import * as THREE from "three";

interface MapBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploadedModels: UploadedModelData[];
  libraryAssets: (UploadedModelData & { bufferId?: string })[];
  onRestoreModels: (models: UploadedModelData[]) => void;
  onRestoreLibraryAssets: (assets: (UploadedModelData & { bufferId?: string })[]) => void;
  scene?: THREE.Scene;
  isAdmin?: boolean;
}

export function MapBackupModal({
  isOpen,
  onClose,
  uploadedModels,
  libraryAssets,
  onRestoreModels,
  onRestoreLibraryAssets,
  scene,
  isAdmin = false,
}: MapBackupModalProps) {
  const [activeTab, setActiveTab] = useState<"export" | "transforms" | "import" | "doc">("export");
  const [copiedAllTransforms, setCopiedAllTransforms] = useState(false);
  const [copiedSingleTransformId, setCopiedSingleTransformId] = useState<string | null>(null);
  const [isExportingGlb, setIsExportingGlb] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
    percent: number;
  }>({ current: 0, total: 0, currentName: "", percent: 0 });
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [isDragging, setIsDragging] = useState(false);
  const [copiedDoc, setCopiedDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Calculate statistics
  let totalPartsWithDesc = 0;
  let totalScreens = 0;
  let totalExplodable = 0;
  let totalSolid = 0;
  let models3DCount = 0;

  uploadedModels.forEach((m) => {
    if (m.type === "screen") {
      totalScreens++;
    } else {
      models3DCount++;
    }
    if (m.isExplodable) totalExplodable++;
    if (m.isSolid) totalSolid++;
    if (m.customSubDescriptions) {
      totalPartsWithDesc += Object.keys(m.customSubDescriptions).length;
    }
  });

  const getModelScaleData = (model: UploadedModelData) => {
    const sliderScale = model.initialScale ?? 1.0;
    let targetScale = model.targetScale || 1.0;
    let dims = model.worldDimensions;

    if (scene && (!model.targetScale || !model.worldDimensions)) {
      let targetObj: THREE.Object3D | null = null;
      scene.traverse((obj) => {
        if (obj.name === model.id && !targetObj) {
          targetObj = obj;
        }
      });
      if (targetObj) {
        const box = new THREE.Box3().setFromObject(targetObj);
        const size = new THREE.Vector3();
        box.getSize(size);
        dims = {
          width: parseFloat(size.x.toFixed(2)),
          height: parseFloat(size.y.toFixed(2)),
          depth: parseFloat(size.z.toFixed(2)),
        };

        let innerS = 1.0;
        targetObj.traverse((child) => {
          if (child !== targetObj && (child as any).isGroup && (child as any).scale?.x && (child as any).scale.x !== 1) {
            innerS = (child as any).scale.x;
          }
        });
        targetScale = innerS;
      }
    }

    const effectiveScale = model.effectiveScale || parseFloat((targetScale * sliderScale).toFixed(6));
    return {
      sliderScale,
      targetScale,
      effectiveScale,
      dimensions: dims || { width: 1.8, height: 1.8, depth: 1.8 },
    };
  };

  // Prepare full JSON backup package
  const generateBackupData = () => {
    const timestamp = new Date().toISOString();
    const formattedDate = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
      timeStyle: "medium",
    }).format(new Date());

    const detailedModels = uploadedModels.map((model) => {
      const sData = getModelScaleData(model);
      return {
        id: model.id,
        name: model.name,
        type: model.type,
        file: model.name ? `${model.name.replace(/[/\\?%*:|"<>]/g, "_")}.${model.type === "fbx" ? "fbx" : "glb"}` : undefined,
        bufferId: model.bufferId || `asset-${model.type}-${model.id}`,
        url: model.url,
        downloadUrl: model.downloadUrl,
        videoUrl: model.videoUrl,
        // 1. Coordinates & Orientation
        position: model.position,
        rotationDegrees: model.initialRotation || [0, 0, 0],
        initialRotation: model.initialRotation || [0, 0, 0],
        // 2. Comprehensive Scale & Size Breakdown
        sliderScaleMultiplier: sData.sliderScale,
        initialScale: sData.sliderScale,
        autoNormalizeFactor: sData.targetScale,
        targetScale: sData.targetScale,
        effectiveScale: sData.effectiveScale,
        worldDimensions: sData.dimensions,
        worldDimensionsMeters: {
          width_X: `${sData.dimensions.width}m`,
          height_Y: `${sData.dimensions.height}m`,
          depth_Z: `${sData.dimensions.depth}m`,
        },
        // 3. Ready-to-use Code Snippets for Migration
        codeSnippets: {
          threejs: `model.position.set(${model.position.join(", ")});\nmodel.scale.setScalar(${sData.effectiveScale});`,
          unity: `transform.position = new Vector3(${model.position[0]}f, ${model.position[1]}f, ${model.position[2]}f);\ntransform.localScale = Vector3.one * ${sData.effectiveScale}f;`,
        },
        // 4. Object Settings & Properties
        isLocked: !!model.isLocked,
        isSolid: !!model.isSolid,
        isExplodable: !!model.isExplodable,
        animType: model.animType || "none",
        animSpeed: model.animSpeed ?? 1.0,
        playBuiltinAnimation: !!model.playBuiltinAnimation,
        npcBehavior: model.npcBehavior || "idle",
        npcKnowledge: model.npcKnowledge || "",
        npcTargetId: model.npcTargetId,
        quizUrl: model.quizUrl || "",
        // 5. Parts Descriptions
        customSubNames: model.customSubNames || {},
        customSubDescriptions: model.customSubDescriptions || {},
      };
    });

    return {
      appName: "Smart Vocational untuk Electric Vehicle",
      appVersion: "2.5",
      exportTimestamp: timestamp,
      exportedAtFormatted: formattedDate,
      summary: {
        totalObjects: uploadedModels.length,
        totalScreens,
        totalPartsWithDescriptions: totalPartsWithDesc,
        totalLibraryAssets: libraryAssets.length,
      },
      // Both keys provided for full compatibility
      models: detailedModels,
      workspace_objects: detailedModels,
      // Library assets metadata
      library_assets: libraryAssets.map((asset) => ({
        id: asset.id,
        bufferId: asset.bufferId,
        name: asset.name,
        type: asset.type,
        downloadUrl: asset.downloadUrl,
      })),
    };
  };

  // Download Transforms & Coordinates JSON only
  const handleDownloadTransformsJSON = () => {
    try {
      const transformList = uploadedModels.map((model) => {
        const sData = getModelScaleData(model);
        return {
          id: model.id,
          name: model.name,
          type: model.type,
          position: model.position,
          rotationDegrees: model.initialRotation || [0, 0, 0],
          sliderScaleMultiplier: sData.sliderScale,
          autoNormalizeFactor: sData.targetScale,
          effectiveScale: sData.effectiveScale,
          worldDimensionsMeters: sData.dimensions,
          codeSnippets: {
            threejs: `model.position.set(${model.position.join(", ")});\nmodel.scale.setScalar(${sData.effectiveScale});`,
            unity: `transform.position = new Vector3(${model.position[0]}f, ${model.position[1]}f, ${model.position[2]}f);\ntransform.localScale = Vector3.one * ${sData.effectiveScale}f;`,
          },
          isLocked: !!model.isLocked,
          isSolid: !!model.isSolid,
          isExplodable: !!model.isExplodable,
          customSubNames: model.customSubNames || {},
          customSubDescriptions: model.customSubDescriptions || {},
        };
      });

      const exportPayload = {
        title: "Daftar Koordinat & Skala Objek Map Lab EV",
        exportedAt: new Date().toISOString(),
        totalObjects: uploadedModels.length,
        models: transformList,
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
      const fileName = `Smart_Vocational_EV_Koordinat_Skala_${dateStr}_${timeStr}.json`;

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setRestoreStatus({
        type: "success",
        msg: `✅ Berhasil mengunduh berkas ${fileName}! Berisi koordinat, skala efektif, dan keterangan seluruh objek.`,
      });
    } catch (err: any) {
      setRestoreStatus({
        type: "error",
        msg: `Gagal mengunduh file koordinat & skala: ${err.message || err}`,
      });
    }
  };

  // 1. Download JSON Backup
  const handleDownloadJSON = async () => {
    try {
      // Trigger cloud save first
      await saveWorkspaceNow();

      const backupData = generateBackupData();
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
      const fileName = `Smart_Vocational_EV_Map_Backup_${dateStr}_${timeStr}.json`;

      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setRestoreStatus({
        type: "success",
        msg: `Berhasil mengunduh cadangan lengkap: ${fileName} (${uploadedModels.length} objek & ${totalPartsWithDesc} keterangan part).`,
      });
    } catch (err: any) {
      setRestoreStatus({
        type: "error",
        msg: `Gagal membuat file cadangan: ${err.message || err}`,
      });
    }
  };

  // 2. Generate Learning Material / Technical Spec Document (.TXT)
  const generateLearningDocumentText = () => {
    const nowStr = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
      timeStyle: "medium",
    }).format(new Date());

    let text = `================================================================================\n`;
    text += `  SMART VOCATIONAL UNTUK ELECTRIC VEHICLE\n`;
    text += `  DOKUMEN SPESIFIKASI & KETERANGAN OBJEK LAB VIRTUAL\n`;
    text += `  Waktu Ekspor: ${nowStr}\n`;
    text += `================================================================================\n\n`;

    text += `RINGKASAN LAB:\n`;
    text += `• Total Objek 3D / Alat di Map : ${uploadedModels.length}\n`;
    text += `• Layar Video Interaktif      : ${totalScreens}\n`;
    text += `• Total Komponen Berpenjelasan : ${totalPartsWithDesc}\n\n`;

    text += `--------------------------------------------------------------------------------\n`;
    text += `DAFTAR DETAIL OBJEK & KETERANGAN KOMPONEN DALAM MAP\n`;
    text += `--------------------------------------------------------------------------------\n\n`;

    uploadedModels.forEach((model, idx) => {
      const scaleData = getModelScaleData(model);
      text += `[${idx + 1}] ${model.name.toUpperCase()} (Tipe: ${model.type.toUpperCase()})\n`;
      text += `    • ID Objek            : ${model.id}\n`;
      text += `    • Posisi (X,Y,Z)      : [${model.position.map((n) => n.toFixed(2)).join(", ")}]\n`;
      text += `    • Rotasi (X,Y,Z)      : [${(model.initialRotation || [0, 0, 0]).map((r) => Math.round(r)).join("°, ")}°]\n`;
      text += `    • Skala Slider VR     : ${scaleData.sliderScale.toFixed(2)}x\n`;
      text += `    • Skala Efektif Mesin : ${scaleData.effectiveScale} (Gunakan angka ini di Three.js / Unity agar ukuran 100% sama)\n`;
      text += `    • Dimensi Fisik Nyata : ${scaleData.dimensions.width}m x ${scaleData.dimensions.height}m x ${scaleData.dimensions.depth}m (P x L x T)\n`;
      text += `    • Kode Skala Migrasi  :\n`;
      text += `        Three.js : model.position.set(${model.position.join(", ")}); model.scale.setScalar(${scaleData.effectiveScale});\n`;
      text += `        Unity    : transform.position = new Vector3(${model.position[0]}f, ${model.position[1]}f, ${model.position[2]}f); transform.localScale = Vector3.one * ${scaleData.effectiveScale}f;\n`;
      text += `    • Fitur               : ${model.isExplodable ? "Bongkar/Explodable, " : ""}${model.isSolid ? "Solid (Tabrakan), " : ""}${model.isLocked ? "Terkunci" : "Dapat Digeser"}\n`;

      if (model.type === "screen" && model.videoUrl) {
        text += `    • Video Terpasang: ${model.videoUrl}\n`;
      }

      if (model.quizUrl) {
        text += `    • Tautan Kuis/Form: ${model.quizUrl}\n`;
      }

      if (model.npcKnowledge) {
        text += `    • Pengetahuan Khusus: ${model.npcKnowledge}\n`;
      }

      // Keterangan Sub-Part
      const subKeys = Object.keys(model.customSubDescriptions || {});
      const nameKeys = Object.keys(model.customSubNames || {});

      if (subKeys.length > 0 || nameKeys.length > 0) {
        text += `    \n    --- KETERANGAN SUB-KOMPONEN & PART DETAIL ---\n`;
        const allPartKeys = Array.from(new Set([...subKeys, ...nameKeys]));
        allPartKeys.forEach((partKey, pIdx) => {
          const customName = model.customSubNames?.[partKey] || partKey;
          const customDesc = model.customSubDescriptions?.[partKey] || "(Belum ada deskripsi fungsi)";
          text += `    ${pIdx + 1}. Nama Part   : ${customName}\n`;
          text += `       Kode Mesh   : ${partKey}\n`;
          text += `       Keterangan  : ${customDesc}\n`;
        });
      } else {
        text += `    • Keterangan Part : Standar (Belum ada catatan kustom)\n`;
      }

      text += `\n--------------------------------------------------------------------------------\n\n`;
    });

    return text;
  };

  // 3. Download Learning Sheet (.TXT)
  const handleDownloadDoc = () => {
    const textContent = generateLearningDocumentText();
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Keterangan_Objek_Smart_Vocational_EV_${dateStr}.txt`;

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setRestoreStatus({
      type: "success",
      msg: `Berhasil mengunduh dokumen teks keterangan objek: ${fileName}`,
    });
  };

  // 4. Download 3D Scene (.GLB)
  const handleExportGLB = async () => {
    if (!scene) {
      alert("Scene 3D belum siap untuk diekspor.");
      return;
    }
    setIsExportingGlb(true);
    setRestoreStatus({
      type: "info",
      msg: "Mengemas seluruh model 3D di map menjadi file .GLB...",
    });

    try {
      const exporter = new GLTFExporter();
      const gltfBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          scene,
          (res) => resolve(res as ArrayBuffer),
          (err) => reject(err),
          {
            binary: true,
            embedImages: true,
            onlyVisible: true,
          }
        );
      });

      const blob = new Blob([gltfBuffer], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `Smart_Vocational_EV_Scene3D_${dateStr}.glb`;

      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setRestoreStatus({
        type: "success",
        msg: `Berhasil mengekspor 3D Scene: ${fileName}`,
      });
    } catch (err: any) {
      setRestoreStatus({
        type: "error",
        msg: `Gagal mengekspor GLB: ${err.message || err}`,
      });
    } finally {
      setIsExportingGlb(false);
    }
  };

  // Helper to fetch/retrieve binary data of a model
  const fetchModelBinary = async (model: UploadedModelData): Promise<ArrayBuffer | null> => {
    // 1. Try local IndexedDB via bufferId
    if (model.bufferId) {
      try {
        const raw = await getAsset(model.bufferId);
        if (raw) {
          if (raw instanceof Blob) {
            const ab = await raw.arrayBuffer();
            if (ab && ab.byteLength > 100) return ab;
          } else if (raw instanceof ArrayBuffer && raw.byteLength > 100) {
            return raw;
          }
        }
      } catch (e) {
        console.warn("getAsset bufferId error", e);
      }
    }

    // 2. Try local IndexedDB via model.id
    if (model.id) {
      try {
        const raw = await getAsset(model.id);
        if (raw) {
          if (raw instanceof Blob) {
            const ab = await raw.arrayBuffer();
            if (ab && ab.byteLength > 100) return ab;
          } else if (raw instanceof ArrayBuffer && raw.byteLength > 100) {
            return raw;
          }
        }
      } catch (e) {
        console.warn("getAsset model.id error", e);
      }
    }

    // 3. Try fetching from URL (Blob URL or active HTTP URL)
    if (model.url && model.url.startsWith("blob:")) {
      try {
        const res = await fetch(model.url);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          if (ab && ab.byteLength > 100) return ab;
        }
      } catch (e) {
        console.warn("fetch blob url error", e);
      }
    }

    // 4. Try downloadUrl via proxy or direct
    if (model.downloadUrl) {
      const urlsToTry = [
        `/api/proxy-asset?url=${encodeURIComponent(model.downloadUrl)}`,
        model.downloadUrl,
        `https://corsproxy.io/?${encodeURIComponent(model.downloadUrl)}`,
      ];
      for (const u of urlsToTry) {
        try {
          const res = await fetch(u);
          if (res.ok) {
            const ab = await res.arrayBuffer();
            if (ab && ab.byteLength > 100) return ab;
          }
        } catch (e) {}
      }
    }

    // 5. Fallback: Export individual object from Three.js scene
    if (scene) {
      try {
        let targetObj: THREE.Object3D | null = null;
        scene.traverse((obj) => {
          if (obj.name === model.id || obj.userData?.parentUploadedId === model.id) {
            if (!targetObj) {
              let curr: THREE.Object3D | null = obj;
              while (curr && curr.parent && curr.parent !== scene) {
                if (curr.name === model.id) {
                  targetObj = curr;
                  break;
                }
                curr = curr.parent;
              }
              if (!targetObj) targetObj = obj;
            }
          }
        });

        if (targetObj) {
          const exporter = new GLTFExporter();
          const gltfBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            exporter.parse(
              targetObj!,
              (res) => resolve(res as ArrayBuffer),
              (err) => reject(err),
              { binary: true, embedImages: true }
            );
          });
          if (gltfBuffer && gltfBuffer.byteLength > 100) {
            return gltfBuffer;
          }
        }
      } catch (e) {
        console.warn("Scene export fallback error for", model.name, e);
      }
    }

    return null;
  };

  // 5. Download All 3D Models in Maps as .ZIP
  const handleExportModelsZip = async () => {
    const models3D = uploadedModels.filter((m) => m.type !== "screen");
    if (models3D.length === 0) {
      setRestoreStatus({
        type: "error",
        msg: "Tidak ada objek 3D di dalam map yang dapat dikemas ke file .ZIP.",
      });
      return;
    }

    setIsExportingZip(true);
    setZipProgress({
      current: 0,
      total: models3D.length,
      currentName: "Menyiapkan arsip ZIP...",
      percent: 5,
    });
    setRestoreStatus({
      type: "info",
      msg: `Mengemas ${models3D.length} file model 3D di map ke dalam format .ZIP...`,
    });

    try {
      const zip = new JSZip();
      const usedNamesCount: Record<string, number> = {};
      const manifestList: any[] = [];
      let successCount = 0;

      for (let i = 0; i < models3D.length; i++) {
        const model = models3D[i];
        const rawName = (model.name || `Model_${i + 1}`).trim();
        // Bersihkan nama karakter terlarang di file system
        const safeBase = rawName.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_") || `Model_${i + 1}`;
        const ext = model.type === "fbx" ? ".fbx" : ".glb";

        // Pastikan nama file unik dan terhitung persis sesuai jumlah di map
        let fileName = `${safeBase}${ext}`;
        if (usedNamesCount[safeBase] !== undefined) {
          usedNamesCount[safeBase]++;
          fileName = `${safeBase}_${usedNamesCount[safeBase]}${ext}`;
        } else {
          usedNamesCount[safeBase] = 1;
        }

        setZipProgress({
          current: i + 1,
          total: models3D.length,
          currentName: `[${i + 1}/${models3D.length}] Mengemas ${fileName}...`,
          percent: Math.round(10 + ((i) / models3D.length) * 75),
        });

        const binary = await fetchModelBinary(model);

        if (binary && binary.byteLength > 0) {
          zip.file(fileName, binary, { binary: true });
          successCount++;
          const scaleData = getModelScaleData(model);
          manifestList.push({
            file: fileName,
            name: model.name,
            id: model.id,
            type: model.type,
            position: model.position,
            rotationDegrees: model.initialRotation || [0, 0, 0],
            sliderScaleMultiplier: scaleData.sliderScale,
            autoNormalizeFactor: scaleData.targetScale,
            effectiveScale: scaleData.effectiveScale,
            worldDimensionsMeters: {
              width_X: `${scaleData.dimensions.width}m`,
              height_Y: `${scaleData.dimensions.height}m`,
              depth_Z: `${scaleData.dimensions.depth}m`,
            },
            codeSnippets: {
              threejs: `model.position.set(${model.position.join(", ")});\nmodel.scale.setScalar(${scaleData.effectiveScale});`,
              unity: `transform.position = new Vector3(${model.position[0]}f, ${model.position[1]}f, ${model.position[2]}f);\ntransform.localScale = Vector3.one * ${scaleData.effectiveScale}f;`,
            },
            scale: scaleData.sliderScale,
            isExplodable: !!model.isExplodable,
            isSolid: !!model.isSolid,
            customSubNames: model.customSubNames || {},
            customSubDescriptions: model.customSubDescriptions || {},
          });
        } else {
          console.warn(`Gagal mengambil data binary untuk model: ${model.name} (${model.id})`);
        }
      }

      if (successCount === 0) {
        throw new Error("Gagal mengambil binary model 3D. Pastikan koneksi atau model sudah termuat sempurna.");
      }

      // Tambahkan berkas manifest struktur JSON di dalam ZIP
      zip.file(
        "manifest_lab_ev.json",
        JSON.stringify(
          {
            appName: "Smart Vocational untuk Electric Vehicle",
            exportedAt: new Date().toISOString(),
            totalModelsInMap: models3D.length,
            totalPackedFiles: successCount,
            models: manifestList,
          },
          null,
          2
        )
      );

      // Tambahkan berkas panduan & keterangan part .TXT di dalam ZIP
      zip.file("README_KETERANGAN_PART.txt", generateLearningDocumentText());

      setZipProgress((prev) => ({
        ...prev,
        currentName: "Mengompresi dan membuat file .ZIP...",
        percent: 90,
      }));

      const zipBlob = await zip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        },
        (meta) => {
          setZipProgress((prev) => ({
            ...prev,
            percent: Math.min(99, Math.round(90 + (meta.percent * 0.09))),
          }));
        }
      );

      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
      const zipFileName = `Smart_Vocational_EV_3D_Models_Map_${dateStr}_${timeStr}.zip`;

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setRestoreStatus({
        type: "success",
        msg: `✅ Berhasil mengunduh ${zipFileName}! Berisi ${successCount} file .GLB sesuai jumlah dan nama objek di map.`,
      });
    } catch (err: any) {
      setRestoreStatus({
        type: "error",
        msg: `Gagal mengemas model 3D ke ZIP: ${err.message || err}`,
      });
    } finally {
      setIsExportingZip(false);
    }
  };

  // 6. Download All Bank Data (Library Assets) as .ZIP
  const handleExportLibraryZip = async () => {
    if (libraryAssets.length === 0) {
      setRestoreStatus({
        type: "error",
        msg: "Bank Data Asset masih kosong.",
      });
      return;
    }

    setIsExportingZip(true);
    setZipProgress({
      current: 0,
      total: libraryAssets.length,
      currentName: "Menyiapkan arsip Bank Data...",
      percent: 5,
    });
    setRestoreStatus({
      type: "info",
      msg: `Mengemas ${libraryAssets.length} file model di Bank Data ke dalam .ZIP...`,
    });

    try {
      const zip = new JSZip();
      const usedNamesCount: Record<string, number> = {};
      let successCount = 0;

      for (let i = 0; i < libraryAssets.length; i++) {
        const asset = libraryAssets[i];
        const rawName = (asset.name || `Asset_${i + 1}`).trim();
        const safeBase = rawName.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_") || `Asset_${i + 1}`;
        const ext = asset.type === "fbx" ? ".fbx" : ".glb";

        let fileName = `${safeBase}${ext}`;
        if (usedNamesCount[safeBase] !== undefined) {
          usedNamesCount[safeBase]++;
          fileName = `${safeBase}_${usedNamesCount[safeBase]}${ext}`;
        } else {
          usedNamesCount[safeBase] = 1;
        }

        setZipProgress({
          current: i + 1,
          total: libraryAssets.length,
          currentName: `[${i + 1}/${libraryAssets.length}] Mengemas ${fileName}...`,
          percent: Math.round(10 + ((i) / libraryAssets.length) * 75),
        });

        const binary = await fetchModelBinary(asset);
        if (binary && binary.byteLength > 0) {
          zip.file(fileName, binary, { binary: true });
          successCount++;
        }
      }

      if (successCount === 0) {
        throw new Error("Tidak ada file binary yang dapat diambil dari Bank Data.");
      }

      zip.file(
        "manifest_bank_data.json",
        JSON.stringify(
          {
            appName: "Smart Vocational untuk Electric Vehicle - Bank Data Aset",
            exportedAt: new Date().toISOString(),
            totalAssets: successCount,
            assets: libraryAssets.map((a) => ({ id: a.id, name: a.name, type: a.type })),
          },
          null,
          2
        )
      );

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      const zipFileName = `Smart_Vocational_EV_Library_Assets_${dateStr}.zip`;

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setRestoreStatus({
        type: "success",
        msg: `✅ Berhasil mengunduh ${zipFileName} berisi ${successCount} file model dari Bank Data!`,
      });
    } catch (err: any) {
      setRestoreStatus({
        type: "error",
        msg: `Gagal mengemas Bank Data ke ZIP: ${err.message || err}`,
      });
    } finally {
      setIsExportingZip(false);
    }
  };

  // Helper to normalize any imported model record
  const normalizeImportedModel = (m: any): UploadedModelData => {
    const sliderScale = typeof m.sliderScaleMultiplier === "number"
      ? m.sliderScaleMultiplier
      : typeof m.initialScale === "number"
      ? m.initialScale
      : typeof m.scale === "number"
      ? m.scale
      : 1.0;

    const targetScale = typeof m.autoNormalizeFactor === "number"
      ? m.autoNormalizeFactor
      : typeof m.targetScale === "number"
      ? m.targetScale
      : undefined;

    const effectiveScale = typeof m.effectiveScale === "number"
      ? m.effectiveScale
      : (targetScale ? parseFloat((targetScale * sliderScale).toFixed(6)) : undefined);

    let dims = m.worldDimensionsMeters || m.worldDimensions;
    if (dims && typeof dims.width_X === "string") {
      dims = {
        width: parseFloat(dims.width_X) || 1.8,
        height: parseFloat(dims.height_Y) || 1.8,
        depth: parseFloat(dims.depth_Z) || 1.8,
      };
    }

    const pos = Array.isArray(m.position) && m.position.length === 3
      ? [Number(m.position[0]) || 0, Number(m.position[1]) || 0, Number(m.position[2]) || 0] as [number, number, number]
      : [0, 0, 0] as [number, number, number];

    const rot = Array.isArray(m.rotationDegrees)
      ? [Number(m.rotationDegrees[0]) || 0, Number(m.rotationDegrees[1]) || 0, Number(m.rotationDegrees[2]) || 0] as [number, number, number]
      : Array.isArray(m.initialRotation)
      ? [Number(m.initialRotation[0]) || 0, Number(m.initialRotation[1]) || 0, Number(m.initialRotation[2]) || 0] as [number, number, number]
      : Array.isArray(m.rotation)
      ? [Number(m.rotation[0]) || 0, Number(m.rotation[1]) || 0, Number(m.rotation[2]) || 0] as [number, number, number]
      : [0, 0, 0] as [number, number, number];

    return {
      id: m.id || `obj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: m.name || "Model 3D",
      type: m.type || (m.file?.endsWith(".fbx") ? "fbx" : "glb"),
      bufferId: m.bufferId,
      url: m.url || m.downloadUrl || "",
      downloadUrl: m.downloadUrl,
      videoUrl: m.videoUrl,
      position: pos,
      initialRotation: rot,
      initialScale: sliderScale,
      targetScale: targetScale,
      effectiveScale: effectiveScale,
      worldDimensions: dims,
      isLocked: !!m.isLocked,
      isSolid: !!m.isSolid,
      isExplodable: !!m.isExplodable,
      animType: m.animType || "none",
      animSpeed: typeof m.animSpeed === "number" ? m.animSpeed : 1.0,
      playBuiltinAnimation: !!m.playBuiltinAnimation,
      npcBehavior: m.npcBehavior || "idle",
      npcKnowledge: m.npcKnowledge || "",
      npcTargetId: m.npcTargetId,
      quizUrl: m.quizUrl || "",
      customSubNames: m.customSubNames || {},
      customSubDescriptions: m.customSubDescriptions || {},
    };
  };

  // 5. Restore / Import JSON or ZIP Backup
  const processUploadedFile = async (file: File) => {
    setIsRestoring(true);
    setRestoreStatus({
      type: "info",
      msg: `Membaca dan memproses berkas ${file.name}...`,
    });

    try {
      let importedObjects: UploadedModelData[] = [];
      let importedLibrary: any[] = [];

      if (file.name.toLowerCase().endsWith(".zip")) {
        // Handle ZIP Archive
        const zip = await JSZip.loadAsync(file);
        let manifestText: string | null = null;

        const manifestFile = zip.file("manifest_lab_ev.json") || zip.file("manifest.json");
        if (manifestFile) {
          manifestText = await manifestFile.async("text");
        } else {
          const anyJson = Object.keys(zip.files).find((k) => k.toLowerCase().endsWith(".json") && !k.startsWith("__MACOSX"));
          if (anyJson) {
            manifestText = await zip.files[anyJson].async("text");
          }
        }

        if (!manifestText) {
          throw new Error("Berkas ZIP tidak memuat berkas manifest (manifest_lab_ev.json).");
        }

        const parsedManifest = JSON.parse(manifestText);
        const rawList = parsedManifest.models || parsedManifest.workspace_objects || (Array.isArray(parsedManifest) ? parsedManifest : []);

        for (const item of rawList) {
          const norm = normalizeImportedModel(item);
          const possibleNames = [
            item.file,
            `${norm.name}.glb`,
            `${norm.name}.fbx`,
            `${norm.id}.glb`,
            `${norm.id}.fbx`,
          ].filter(Boolean);

          let zipModelFile = null;
          for (const fn of possibleNames) {
            if (zip.file(fn)) {
              zipModelFile = zip.file(fn);
              break;
            }
          }

          if (zipModelFile) {
            const arrayBuffer = await zipModelFile.async("arraybuffer");
            const assetId = norm.bufferId || `imported-${norm.type}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const blob = new Blob([arrayBuffer]);
            await saveAsset(assetId, arrayBuffer);
            norm.bufferId = assetId;
            norm.url = URL.createObjectURL(blob);
          }
          importedObjects.push(norm);
        }
      } else {
        // Handle JSON file
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (Array.isArray(parsed)) {
          importedObjects = parsed.map(normalizeImportedModel);
        } else if (parsed.workspace_objects && Array.isArray(parsed.workspace_objects)) {
          importedObjects = parsed.workspace_objects.map(normalizeImportedModel);
          if (parsed.library_assets && Array.isArray(parsed.library_assets)) {
            importedLibrary = parsed.library_assets;
          }
        } else if (parsed.models && Array.isArray(parsed.models)) {
          importedObjects = parsed.models.map(normalizeImportedModel);
        } else if (parsed.items && Array.isArray(parsed.items)) {
          importedObjects = parsed.items.map(normalizeImportedModel);
        } else {
          throw new Error("Format berkas tidak sesuai. Pastikan file JSON merupakan cadangan Map Smart Vocational EV.");
        }
      }

      if (importedObjects.length === 0) {
        throw new Error("Tidak ditemukan objek 3D yang valid di dalam berkas yang diunggah.");
      }

      // Merge or replace
      let finalObjects: UploadedModelData[] = [];
      if (importMode === "replace") {
        finalObjects = importedObjects;
      } else {
        const existingIds = new Set(uploadedModels.map((m) => m.id));
        const newOnes = importedObjects.map((m) => {
          if (existingIds.has(m.id)) {
            return { ...m, id: `${m.id}-restored-${Date.now()}` };
          }
          return m;
        });
        finalObjects = [...uploadedModels, ...newOnes];
      }

      onRestoreModels(finalObjects);

      if (importedLibrary.length > 0) {
        onRestoreLibraryAssets(importedLibrary);
        await saveAssetLibraryData(importedLibrary);
      }

      await saveWorkspaceData(finalObjects);
      triggerWorkspaceSave();

      setRestoreStatus({
        type: "success",
        msg: `✅ Berhasil memulihkan ${importedObjects.length} objek ke dalam Map! Koordinat, skala, dan seluruh keterangan part telah aktif.`,
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: any) {
      setRestoreStatus({
        type: "error",
        msg: `Gagal memulihkan cadangan: ${err.message || "File rusak atau tidak valid."}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUploadedFile(file);
    }
  };

  return (
    <div
      id="map-backup-modal-overlay"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md pointer-events-auto animate-fade-in-quick"
    >
      <div
        id="map-backup-modal-container"
        className="bg-neutral-900 border border-cyan-500/30 rounded-3xl p-6 sm:p-8 max-w-2xl w-full text-white shadow-2xl flex flex-col gap-5 relative max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              <Download className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                  Cadangan & Ekspor Map
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">v2.5</span>
              </div>
              <h3 className="text-xl font-extrabold text-white leading-tight mt-1">
                Pusat Unduh Data & Keterangan Objek Map
              </h3>
            </div>
          </div>
          <button
            id="btn-close-backup-modal"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-2xl border border-white/10">
          <button
            id="tab-btn-export"
            onClick={() => setActiveTab("export")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "export"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Unduh & Ekspor</span>
          </button>
          <button
            id="tab-btn-transforms"
            onClick={() => setActiveTab("transforms")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "transforms"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Skala & Koordinat Migrasi</span>
          </button>
          <button
            id="tab-btn-doc"
            onClick={() => setActiveTab("doc")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "doc"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Dokumen Materi & Keterangan</span>
          </button>
          <button
            id="tab-btn-import"
            onClick={() => setActiveTab("import")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "import"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Pulihkan (Restore)</span>
          </button>
        </div>

        {/* Status Alert Banner */}
        {restoreStatus && (
          <div
            className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs leading-relaxed ${
              restoreStatus.type === "success"
                ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-200"
                : restoreStatus.type === "error"
                ? "bg-red-950/70 border-red-500/40 text-red-200"
                : "bg-cyan-950/70 border-cyan-500/40 text-cyan-200"
            }`}
          >
            {restoreStatus.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : restoreStatus.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5 animate-spin" />
            )}
            <div className="flex-1">{restoreStatus.msg}</div>
            <button
              onClick={() => setRestoreStatus(null)}
              className="text-neutral-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: EXPORT & DOWNLOAD */}
        {activeTab === "export" && (
          <div className="flex flex-col gap-4">
            {/* Live Data Summary Card */}
            <div className="bg-black/30 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
                  <Box className="w-4 h-4" /> Ringkasan Isi Map Saat Ini
                </span>
                <span className="bg-white/10 px-2 py-0.5 rounded text-[11px] font-mono">
                  {uploadedModels.length} Objek Aktif
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-neutral-800/60 p-3 rounded-xl border border-white/5 flex flex-col">
                  <span className="text-[10px] text-neutral-400">Total Objek 3D</span>
                  <span className="text-lg font-black text-cyan-400">{models3DCount}</span>
                </div>
                <div className="bg-neutral-800/60 p-3 rounded-xl border border-white/5 flex flex-col">
                  <span className="text-[10px] text-neutral-400">Keterangan Part</span>
                  <span className="text-lg font-black text-emerald-400">{totalPartsWithDesc}</span>
                </div>
                <div className="bg-neutral-800/60 p-3 rounded-xl border border-white/5 flex flex-col">
                  <span className="text-[10px] text-neutral-400">Layar Video EV</span>
                  <span className="text-lg font-black text-amber-400">{totalScreens}</span>
                </div>
                <div className="bg-neutral-800/60 p-3 rounded-xl border border-white/5 flex flex-col">
                  <span className="text-[10px] text-neutral-400">Bank Data Aset</span>
                  <span className="text-lg font-black text-indigo-400">{libraryAssets.length}</span>
                </div>
              </div>
            </div>

            {/* FEATURE UTAMA 1: ZIP BACKUP SEMUA MODEL 3D GLB */}
            <div className="bg-gradient-to-r from-purple-950/70 via-indigo-950/60 to-cyan-950/60 border border-purple-500/40 p-5 rounded-2xl flex flex-col gap-3 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-500/20 text-purple-300 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-purple-500/30">
                      Arsip .ZIP Model 3D
                    </span>
                    <span className="text-[11px] font-bold text-neutral-300 font-mono">
                      {models3DCount} File .GLB Siap Ekspor
                    </span>
                  </div>
                  <h4 className="text-base font-extrabold text-white flex items-center gap-2 mt-1">
                    <Package className="w-5 h-5 text-purple-400" />
                    <span>Unduh Paket Backup Model 3D (.ZIP)</span>
                  </h4>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                    Mengemas seluruh model 3D di map ke dalam <strong>1 file ZIP</strong>. Saat diekstrak, nama file dan jumlah file <code>.glb</code> akan <strong>sesuai persis dengan objek yang ada di map</strong>, dilengkapi catatan manifest posisi JSON dan dokumentasi keterangan komponen.
                  </p>
                </div>
              </div>

              {/* Progress Bar saat proses ZIP berlangsung */}
              {isExportingZip && (
                <div className="bg-black/50 border border-purple-500/30 rounded-xl p-3 flex flex-col gap-2 animate-fade-in-quick">
                  <div className="flex items-center justify-between text-xs text-neutral-200">
                    <span className="flex items-center gap-2 font-mono text-purple-300">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      {zipProgress.currentName}
                    </span>
                    <span className="font-bold text-purple-400">{zipProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full transition-all duration-200 rounded-full"
                      style={{ width: `${zipProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  id="btn-download-models-zip"
                  onClick={handleExportModelsZip}
                  disabled={isExportingZip || models3DCount === 0}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 disabled:opacity-50 text-white font-black text-xs py-3 px-4 rounded-xl shadow-lg shadow-purple-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isExportingZip ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mengemas {models3DCount} Model ke .ZIP...</span>
                    </>
                  ) : (
                    <>
                      <FolderArchive className="w-4 h-4" />
                      <span>Unduh Semua Model 3D di Map (.ZIP)</span>
                    </>
                  )}
                </button>

                {libraryAssets.length > 0 && (
                  <button
                    id="btn-download-library-zip"
                    onClick={handleExportLibraryZip}
                    disabled={isExportingZip}
                    className="bg-neutral-800 hover:bg-neutral-700 active:scale-95 disabled:opacity-50 text-white font-bold text-xs py-3 px-3.5 rounded-xl border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Unduh seluruh asset di Bank Data tersimpan dalam format .ZIP"
                  >
                    <Archive className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Arsip Bank Data (.ZIP)</span>
                  </button>
                )}
              </div>
            </div>

            {/* FEATURE 2: Full JSON Download */}
            <div className="bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border border-cyan-500/40 p-4 sm:p-5 rounded-2xl flex flex-col gap-3 shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-cyan-400" />
                    <span>Unduh Cadangan Konfigurasi Map (.JSON)</span>
                  </h4>
                  <p className="text-[11px] sm:text-xs text-neutral-300 mt-1 leading-relaxed">
                    Menyimpan <strong>semua settingan objek</strong>: koordinat posisi (X,Y,Z), rotasi, skala, status kuncian, mode tabrakan, animasi, <strong>seluruh catatan & keterangan fungsi part kendaraan listrik</strong>, link kuis, dan konfigurasi layar video.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  id="btn-download-full-json"
                  onClick={handleDownloadJSON}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-neutral-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-neutral-950" />
                  <span>Unduh File Cadangan JSON</span>
                </button>
                <button
                  id="btn-force-cloud-save"
                  onClick={async () => {
                    await saveWorkspaceNow();
                    setRestoreStatus({
                      type: "success",
                      msg: "✅ Berhasil menyinkronkan seluruh data Map ke Cloud Firestore & Local Storage!",
                    });
                  }}
                  className="bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-white font-bold text-xs py-2.5 px-4 rounded-xl border border-white/10 transition-all flex items-center gap-2 cursor-pointer"
                  title="Simpan Langsung ke Cloud Database"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Simpan Cloud</span>
                </button>
              </div>
            </div>

            {/* FEATURE 3: Secondary Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option A: Learning Sheet */}
              <div className="bg-neutral-800/50 border border-white/10 p-4 rounded-2xl flex flex-col justify-between gap-3">
                <div>
                  <h5 className="font-bold text-xs text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Dokumen Ringkasan (.TXT)</span>
                  </h5>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Dokumen tertulis rapi berisi daftar seluruh komponen EV beserta keterangan dan penjelasan fungsinya untuk materi ajar.
                  </p>
                </div>
                <button
                  id="btn-download-doc-text"
                  onClick={handleDownloadDoc}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Dokumen TXT</span>
                </button>
              </div>

              {/* Option B: 3D Scene Export */}
              <div className="bg-neutral-800/50 border border-white/10 p-4 rounded-2xl flex flex-col justify-between gap-3">
                <div>
                  <h5 className="font-bold text-xs text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    <span>Gabungan Scene 3D (.GLB)</span>
                  </h5>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Ekspor seluruh ruangan dan objek di peta menjadi 1 file mesh 3D untuk dibuka di Blender, Unity, atau CAD Viewer.
                  </p>
                </div>
                <button
                  id="btn-export-glb-scene"
                  onClick={handleExportGLB}
                  disabled={isExportingGlb}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isExportingGlb ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengemas GLB...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Ekspor Scene 3D (.GLB)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TRANSFORMS & SCALES (MIGRATION COORDINATES) */}
        {activeTab === "transforms" && (
          <div className="flex flex-col gap-4">
            {/* Explanatory Header Banner */}
            <div className="bg-gradient-to-r from-emerald-950/70 via-cyan-950/60 to-indigo-950/60 border border-emerald-500/40 p-5 rounded-2xl flex flex-col gap-3 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border border-emerald-500/30">
                      Panduan Migrasi Skala 3D
                    </span>
                    <span className="text-[11px] font-bold text-neutral-300 font-mono">
                      {uploadedModels.length} Objek Terdeteksi
                    </span>
                  </div>
                  <h4 className="text-base font-extrabold text-white flex items-center gap-2 mt-1">
                    <Compass className="w-5 h-5 text-emerald-400" />
                    <span>Salin Skala & Koordinat Persis Seperti di VR</span>
                  </h4>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                    <strong>Mengapa ukuran objek kembali ke default saat dimigrasikan?</strong><br />
                    File <code>.glb</code> mentah menyimpan ukuran asli pembuat modelnya (sering kali dalam milimeter atau ukuran raksasa). Di ruang VR ini, objek dinormalisasi secara otomatis dan dikalikan dengan skala yang Anda atur.
                    Gunakan <strong>Skala Efektif</strong> di bawah ini agar saat dipindahkan ke <strong>Three.js, Unity, Blender, atau WebXR</strong> lain, ukurannya <strong>100% sama persis dengan yang Anda lihat di ruang VR ini</strong>.
                  </p>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                <button
                  id="btn-download-transforms-json"
                  onClick={handleDownloadTransformsJSON}
                  className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-neutral-950 font-black text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-500/25"
                >
                  <Download className="w-4 h-4 text-neutral-950" />
                  <span>Unduh File JSON Skala & Koordinat</span>
                </button>

                <button
                  id="btn-copy-all-transforms-json"
                  onClick={() => {
                    const allData = uploadedModels.map((m) => {
                      const sData = getModelScaleData(m);
                      return {
                        name: m.name,
                        id: m.id,
                        type: m.type,
                        position: m.position,
                        rotationDegrees: m.initialRotation || [0, 0, 0],
                        sliderScaleMultiplier: sData.sliderScale,
                        autoNormalizeFactor: sData.targetScale,
                        effectiveScale: sData.effectiveScale,
                        worldDimensionsMeters: sData.dimensions,
                        snippets: {
                          threejs: `model.position.set(${m.position.join(", ")});\nmodel.scale.setScalar(${sData.effectiveScale});`,
                          unity: `transform.position = new Vector3(${m.position[0]}f, ${m.position[1]}f, ${m.position[2]}f);\ntransform.localScale = Vector3.one * ${sData.effectiveScale}f;`,
                        },
                      };
                    });
                    navigator.clipboard.writeText(JSON.stringify(allData, null, 2)).then(() => {
                      setCopiedAllTransforms(true);
                      setTimeout(() => setCopiedAllTransforms(false), 2500);
                    });
                  }}
                  className="bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-white font-bold text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer border border-white/10"
                >
                  {copiedAllTransforms ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Semua Skala & Transformasi Disalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-neutral-300" />
                      <span>Salin Semua Skala (JSON)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* List of Models with Detailed Transform Cards */}
            <div className="flex flex-col gap-3 max-h-[440px] overflow-y-auto pr-1">
              {uploadedModels.map((model, idx) => {
                const scaleData = getModelScaleData(model);
                const isCopiedSingle = copiedSingleTransformId === model.id;
                const threeJsCode = `model.position.set(${model.position.join(", ")});\nmodel.scale.setScalar(${scaleData.effectiveScale});`;
                const unityCode = `transform.position = new Vector3(${model.position[0]}f, ${model.position[1]}f, ${model.position[2]}f);\ntransform.localScale = Vector3.one * ${scaleData.effectiveScale}f;`;

                return (
                  <div
                    key={model.id}
                    className="bg-neutral-800/60 border border-white/10 hover:border-emerald-500/40 p-4 rounded-2xl flex flex-col gap-3 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <div>
                          <h5 className="font-bold text-sm text-white flex items-center gap-2">
                            <span>{model.name}</span>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 font-mono">
                              {model.type}
                            </span>
                          </h5>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            ID: {model.id}
                          </span>
                        </div>
                      </div>

                      {/* Quick Copy Dropdown / Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          id={`btn-copy-scale-num-${model.id}`}
                          onClick={() => {
                            navigator.clipboard.writeText(String(scaleData.effectiveScale));
                            setCopiedSingleTransformId(model.id);
                            setTimeout(() => setCopiedSingleTransformId(null), 2000);
                          }}
                          className="text-[11px] bg-white/10 hover:bg-white/20 text-emerald-300 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                          title="Salin hanya angka skala efektif ini"
                        >
                          {isCopiedSingle ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopiedSingle ? "Disalin!" : "Salin Angka Skala"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col">
                        <span className="text-[10px] text-neutral-400">Posisi [X, Y, Z]</span>
                        <span className="font-mono text-cyan-300 font-bold text-[11px] mt-0.5">
                          [{model.position.map((n) => n.toFixed(2)).join(", ")}]
                        </span>
                      </div>

                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col">
                        <span className="text-[10px] text-neutral-400">Rotasi [X, Y, Z]</span>
                        <span className="font-mono text-indigo-300 font-bold text-[11px] mt-0.5">
                          [{(model.initialRotation || [0, 0, 0]).map((r) => Math.round(r)).join("°, ")}°]
                        </span>
                      </div>

                      <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/30 flex flex-col">
                        <span className="text-[10px] text-emerald-300 font-bold">Skala Efektif (Mesin 3D)</span>
                        <span className="font-mono text-emerald-400 font-extrabold text-[12px] mt-0.5">
                          {scaleData.effectiveScale}
                        </span>
                        <span className="text-[9px] text-neutral-400 font-mono">
                          (Slider: {scaleData.sliderScale.toFixed(1)}x)
                        </span>
                      </div>

                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col">
                        <span className="text-[10px] text-neutral-400">Ukuran Fisik di VR</span>
                        <span className="font-mono text-amber-300 font-bold text-[11px] mt-0.5">
                          {scaleData.dimensions.width}m × {scaleData.dimensions.height}m × {scaleData.dimensions.depth}m
                        </span>
                      </div>
                    </div>

                    {/* Code Snippets Accordion / Box */}
                    <div className="bg-black/60 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                          Kode Siap Pakai Untuk Migrasi:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(threeJsCode);
                              setCopiedSingleTransformId(`${model.id}-three`);
                              setTimeout(() => setCopiedSingleTransformId(null), 2000);
                            }}
                            className="text-[10px] bg-white/5 hover:bg-white/15 text-neutral-300 px-2 py-0.5 rounded font-mono transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3 text-cyan-400" />
                            <span>{copiedSingleTransformId === `${model.id}-three` ? "Disalin!" : "Salin Three.js"}</span>
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(unityCode);
                              setCopiedSingleTransformId(`${model.id}-unity`);
                              setTimeout(() => setCopiedSingleTransformId(null), 2000);
                            }}
                            className="text-[10px] bg-white/5 hover:bg-white/15 text-neutral-300 px-2 py-0.5 rounded font-mono transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3 text-purple-400" />
                            <span>{copiedSingleTransformId === `${model.id}-unity` ? "Disalin!" : "Salin Unity"}</span>
                          </button>
                        </div>
                      </div>
                      <pre className="text-[10px] font-mono text-neutral-300 overflow-x-auto p-2 rounded-lg bg-neutral-900/90 border border-white/5">
                        <code>{`// Three.js:\n${threeJsCode}\n\n// Unity C#:\n${unityCode}`}</code>
                      </pre>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: LEARNING MATERIAL & DESCRIPTIONS PREVIEW */}
        {activeTab === "doc" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-300">
                Pratinjau Keterangan Komponen & Modul Belajar EV:
              </span>
              <div className="flex items-center gap-2">
                <button
                  id="btn-copy-doc-text"
                  onClick={() => {
                    navigator.clipboard.writeText(generateLearningDocumentText());
                    setCopiedDoc(true);
                    setTimeout(() => setCopiedDoc(false), 2000);
                  }}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedDoc ? "Disalin!" : "Salin Teks"}</span>
                </button>
                <button
                  id="btn-download-doc-preview-tab"
                  onClick={handleDownloadDoc}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh TXT</span>
                </button>
              </div>
            </div>

            <div className="bg-black/60 border border-white/10 rounded-2xl p-4 max-h-[340px] overflow-y-auto font-mono text-[11px] text-neutral-300 whitespace-pre-wrap select-text leading-relaxed">
              {generateLearningDocumentText()}
            </div>
          </div>
        )}

        {/* TAB 3: IMPORT & RESTORE */}
        {activeTab === "import" && (
          <div className="flex flex-col gap-4">
            <div className="bg-neutral-800/40 border border-white/10 p-5 rounded-2xl flex flex-col gap-4 shadow-xl">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Unggah & Pulihkan Data Map (.JSON / .ZIP)</span>
                </h4>
                <p className="text-xs text-neutral-300 leading-relaxed mt-1">
                  Unggah berkas <strong>.JSON</strong> (cadangan konfigurasi posisi, rotasi, skala efektif, dan keterangan part) atau paket <strong>.ZIP</strong> (koleksi model 3D beserta manifest). Sistem akan memuat objek ke koordinat dan skala yang <strong>100% sama persis</strong> seperti yang disimpan.
                </p>
              </div>

              {/* Mode Selection */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-black/50 p-3 rounded-xl border border-white/10 text-xs">
                <span className="text-neutral-400 font-bold uppercase tracking-wider text-[10px]">
                  Mode Pemulihan:
                </span>
                <label className="flex items-center gap-2 text-neutral-200 hover:text-white cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === "replace"}
                    onChange={() => setImportMode("replace")}
                    className="accent-cyan-500"
                  />
                  <span className="font-semibold">Gantikan Seluruh Isi Map (Reset & Terapkan)</span>
                </label>
                <label className="flex items-center gap-2 text-neutral-200 hover:text-white cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                    className="accent-cyan-500"
                  />
                  <span className="font-semibold">Gabungkan (Merge) dengan Objek Aktif</span>
                </label>
              </div>

              {/* File Upload / Drag-and-Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed p-8 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer text-center select-none ${
                  isDragging
                    ? "border-cyan-400 bg-cyan-900/40 scale-[1.01] shadow-[0_0_25px_rgba(6,182,212,0.3)]"
                    : "border-cyan-500/40 hover:border-cyan-400/80 bg-cyan-950/20 hover:bg-cyan-950/30"
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Upload className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <span className="text-sm font-extrabold text-white block">
                    {isDragging ? "Lepaskan Berkas di Sini untuk Mengunggah" : "Klik atau Tarik Berkas Cadangan ke Sini"}
                  </span>
                  <span className="text-xs text-cyan-300/90 font-medium block mt-1">
                    Mendukung Berkas <strong>.JSON</strong> (Koordinat, Skala & Konfigurasi) atau <strong>.ZIP</strong> (Arsip Model 3D)
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                  <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-neutral-300">
                    Smart_Vocational_EV_Map_Backup_*.json
                  </span>
                  <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-neutral-300">
                    Smart_Vocational_EV_Koordinat_Skala_*.json
                  </span>
                  <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-neutral-300">
                    Model_3D_Bank_Data_EV_*.zip
                  </span>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
                onChange={handleImportFile}
                className="hidden"
              />

              {/* Informative Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-neutral-300">
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Skala Efektif & Dimensi Presisi:</strong> Skala model dinormalisasi dan dihitung otomatis sehingga ukuran fisik objek tidak berubah menjadi default.
                  </span>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex items-start gap-2">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Keterangan Sub-Part Lengkap:</strong> Semua nama kustom dan deskripsi edukasi part mobil listrik langsung aktif pada mode inspeksi.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="border-t border-white/10 pt-3 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Smart Vocational untuk Electric Vehicle</span>
          <button
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-1.5 rounded-xl transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
