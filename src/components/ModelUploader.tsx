import React, { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import {
  Upload,
  Download,
  X,
  FileMinus,
  Sparkles,
  Box,
  Trash2,
  Save,
  Edit2,
  Check,
  Lock,
  Tv,
} from "lucide-react";
import { saveWorkspaceNow } from "./WorkspaceManager";
import { saveAsset, saveAssetLibraryData } from "../lib/store";
import { auth } from "../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { globalCameraPosition, globalCameraDirection } from "../App";

export interface UploadedModelData {
  id: string;
  bufferId?: string;
  name: string;
  url: string;
  downloadUrl?: string;
  type: "glb" | "fbx" | "screen";
  videoUrl?: string;
  position: [number, number, number];
  initialRotation?: [number, number, number];
  initialScale?: number;
  isLocked?: boolean;
  isSolid?: boolean;
  isExplodable?: boolean;
  npcKnowledge?: string;
  npcBehavior?: "idle" | "forward" | "backward" | "left" | "right" | "wander" | "approach";
  npcTargetId?: string;
  playBuiltinAnimation?: boolean;
  animType?: "none" | "spinY" | "spinX" | "spinZ" | "float" | "pulse";
  animSpeed?: number;
  customSubNames?: Record<string, string>;
  customSubDescriptions?: Record<string, string>;
  quizUrl?: string;
  targetScale?: number;
  effectiveScale?: number;
  worldDimensions?: { width: number; height: number; depth: number };
}

interface ModelUploaderProps {
  uploadedModels: UploadedModelData[];
  libraryAssets: (UploadedModelData & { bufferId?: string })[];
  setLibraryAssets: (
    assets: (UploadedModelData & { bufferId?: string })[],
  ) => void;
  onAddModels: (newModels: UploadedModelData[]) => void;
  onRemoveModel: (id: string) => void;
  onRenameModel?: (id: string, newName: string) => void;
  onRenameLibraryAsset?: (id: string, newName: string) => void;
  onRemoveLibraryAsset?: (id: string) => void;
  onClearAll: () => void;
  onOpenBackupModal?: () => void;
}

export function ModelUploader({
  uploadedModels,
  libraryAssets,
  setLibraryAssets,
  onAddModels,
  onRemoveModel,
  onRenameModel,
  onRenameLibraryAsset,
  onRemoveLibraryAsset,
  onClearAll,
  onOpenBackupModal,
}: ModelUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setIsAdmin(u?.email === "ranggadino1@gmail.com");
    });
    return () => unsubscribe();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAdmin) return; // Disallow dragging if not logged in

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFiles = async (files: FileList) => {
    if (!isAdmin) {
      alert("⚠️ Anda harus login terlebih dahulu untuk upload asset 3D.");
      return;
    }
    const newModels: UploadedModelData[] = [];
    const newLibraryAssets: (UploadedModelData & { bufferId?: string })[] = [];

    setIsProcessingFiles(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filename = file.name.toLowerCase();
        const baseName = file.name.replace(/\.[^/.]+$/, ""); // Strip extension for clean display
        let type: "glb" | "fbx" | null = null;

        if (filename.endsWith(".glb")) {
          type = "glb";
        } else if (filename.endsWith(".fbx")) {
          type = "fbx";
        }

        if (type) {
          setProcessingStatus(`Memproses ${file.name}...`);
          // Prevent duplicate file upload based on name
        const isDuplicate = libraryAssets.some(
          (asset) => asset.name.toLowerCase() === baseName.toLowerCase(),
        );
        if (isDuplicate) {
          alert(
            `File dengan nama "${file.name}" sudah ada di storage. Silakan gunakan model yang sudah tersimpan atau ganti nama file.`,
          );
          continue;
        }

        let bufferId;
        let downloadUrl = undefined;
        let processedBuffer: ArrayBuffer | undefined = undefined;
        try {
          let arrayBuffer = await file.arrayBuffer();
          
          if (type === "glb") {
            setProcessingStatus(`Mengkompresi ekstrem (Draco) ${file.name}...`);
            try {
              const formData = new FormData();
              formData.append("model", new Blob([arrayBuffer], { type: "application/octet-stream" }), file.name);
              const optimizeRes = await fetch("/api/optimize-model", {
                method: "POST",
                body: formData,
              });
              if (optimizeRes.ok) {
                arrayBuffer = await optimizeRes.arrayBuffer();
                console.log(`Optimized ${file.name} from ${file.size} to ${arrayBuffer.byteLength} bytes.`);
              } else {
                console.warn("Failed to optimize model, using original.");
              }
            } catch (e) {
              console.warn("Error calling optimize API:", e);
            }
          }
          
          processedBuffer = arrayBuffer;

          bufferId = file.name;
          setProcessingStatus(`Menyimpan ${file.name} ke storage...`);
          downloadUrl = await saveAsset(bufferId, processedBuffer);
        } catch (e) {
          console.error("Failed to upload file to storage immediately", e);
        }

        // Create an ObjectURL for direct client rendering
        const url = processedBuffer
          ? URL.createObjectURL(new Blob([processedBuffer])) +
            (type === "glb" ? "#asset.glb" : "#asset.fbx")
          : URL.createObjectURL(file) +
            (type === "glb" ? "#asset.glb" : "#asset.fbx");

        // Spawn in front of the camera
        const spawnDistance = 2.0;
        const randomX = globalCameraPosition.x + globalCameraDirection.x * spawnDistance + (Math.random() - 0.5) * 1.0;
        const randomZ = globalCameraPosition.z + globalCameraDirection.z * spawnDistance + (Math.random() - 0.5) * 1.0;
        const spawnY = globalCameraPosition.y > 0 ? Math.max(0.5, globalCameraPosition.y - 1.0) : 0.5;

        const id =
          bufferId || `model-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const newModel = {
          id,
          bufferId,
          name: baseName, // Strip extension for clean display
          url,
          downloadUrl,
          type,
          position: [randomX, spawnY, randomZ] as [number, number, number],
        };
        newModels.push(newModel);

        if (bufferId) {
          newLibraryAssets.push({ ...newModel, bufferId });
        }
      }
    }

    if (newModels.length > 0) {
      if (newLibraryAssets.length > 0) {
        const updatedLib = [...libraryAssets, ...newLibraryAssets];
        setLibraryAssets(updatedLib);
        await saveAssetLibraryData(
          updatedLib.map((x) => ({
            id: x.id,
            bufferId: x.bufferId,
            name: x.name,
            type: x.type,
            downloadUrl: x.downloadUrl,
          })),
        );
      }
      onAddModels(newModels);
    }
    } finally {
      setIsProcessingFiles(false);
      setProcessingStatus("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="absolute top-20 right-6 z-30 flex flex-col items-end pointer-events-auto">
      {/* Upload Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl transition-all font-bold text-xs border border-white/20 select-none"
      >
        <Box className="w-4 h-4" />
        {isOpen ? "Tutup Panel Panel Asset" : "Upload Asset 3D"}
        <span className="bg-white/20 text-[10px] px-2 py-0.5 rounded-full">
          {uploadedModels.length}
        </span>
      </button>

      {/* Floating Panel Drawer */}
      {isOpen && (
        <div className="mt-3 bg-neutral-950/90 backdrop-blur-xl border border-white/15 w-80 text-white rounded-3xl p-5 shadow-2xl flex flex-col gap-4 animate-fade-in-quick">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 className="font-extrabold text-[14px]">
                Bank Data Asset
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Penyimpanan Asset Global (.glb/.fbx)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    const btn = document.getElementById("save-btn");
                    if (btn) btn.innerText = "Menyimpan...";
                    await saveWorkspaceNow();
                    if (btn) btn.innerText = "💾 Tersimpan!";
                    setTimeout(() => {
                      if (btn) btn.innerText = "Simpan Workspace";
                    }, 2000);
                  } catch (e: any) {
                    alert("Gagal menyimpan: " + (e.message || "Unknown error"));
                    const btn = document.getElementById("save-btn");
                    if (btn) btn.innerText = "Gagal Simpan";
                    setTimeout(() => {
                      if (btn) btn.innerText = "Simpan Workspace";
                    }, 2000);
                  }
                }}
                id="save-btn"
                className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 rounded px-2 py-1 transition-all"
              >
                Simpan Workspace
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drag & Drop Box */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={!isProcessingFiles ? onButtonClick : undefined}
            className={`w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center gap-2 ${
              !isAdmin || isProcessingFiles
                ? "border-neutral-500/30 bg-neutral-500/5 cursor-not-allowed"
                : dragActive
                  ? "border-indigo-500 bg-indigo-500/10 scale-[0.98]"
                  : "border-white/10 hover:border-white/25 bg-white/5 hover:bg-white/[0.08] cursor-pointer"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".glb,.fbx"
              onChange={handleChange}
              disabled={!isAdmin || isProcessingFiles}
            />
            {isProcessingFiles ? (
              <>
                <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                  <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-[12px] font-bold text-indigo-300">
                  Mohon Tunggu...
                </p>
                <p className="text-[10px] text-neutral-400">
                  {processingStatus}
                </p>
              </>
            ) : !isAdmin ? (
              <>
                <div className="p-3 bg-red-500/10 rounded-xl text-red-400">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="text-[12px] font-bold text-red-300">
                  Login Diperlukan
                </p>
                <p className="text-[10px] text-neutral-400">
                  Silakan login dengan Google di pojok kanan atas untuk upload
                  asset.
                </p>
              </>
            ) : (
              <>
                <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-[12px] font-bold text-neutral-200">
                  Klik atau Seret file ke sini
                </p>
                <p className="text-[10px] text-neutral-400">
                  Drag file dari komputer (.glb / .fbx)
                </p>
              </>
            )}
          </div>

          {isAdmin && (
            <button
              onClick={() => {
                const newModel: UploadedModelData = {
                  id: `screen-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                  name: "Layar Video (Screen)",
                  url: "",
                  type: "screen",
                  videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
                  position: [
                    globalCameraPosition.x + globalCameraDirection.x * 2,
                    globalCameraPosition.y,
                    globalCameraPosition.z + globalCameraDirection.z * 2,
                  ],
                  initialScale: 2.5,
                  initialRotation: [0, 0, 0],
                  isLocked: false,
                  isSolid: true,
                };
                onAddModels([newModel]);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded-xl border border-blue-500/30 transition-all font-bold text-[11px] uppercase tracking-wide cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5" />
              Tambahkan Layar Video
            </button>
          )}

          {/* Backup & Download Button */}
          {onOpenBackupModal && (
            <button
              id="btn-uploader-open-backup-modal"
              onClick={onOpenBackupModal}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600/30 to-cyan-600/30 hover:from-purple-600/45 hover:to-cyan-600/45 text-white rounded-xl border border-cyan-500/40 transition-all font-bold text-[11px] tracking-wide cursor-pointer shadow-sm"
              title="Unduh semua model 3D (.ZIP) dan konfigurasi map (.JSON)"
            >
              <Download className="w-3.5 h-3.5 text-cyan-300" />
              <span>📦 Unduh Backup 3D (.ZIP) & Data (.JSON)</span>
            </button>
          )}

          {/* Uploaded List */}
          {(libraryAssets.length > 0) && (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Bank Data Tersimpan ({libraryAssets.length})
                </span>
                {isAdmin && (
                  <button
                    onClick={onClearAll}
                    className="text-red-400 hover:text-red-300 text-[10px] font-bold flex items-center gap-1 hover:underline"
                  >
                    <Trash2 className="w-3 h-3" /> Bersihkan Scene
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {libraryAssets.map((model) => (
                  <div
                    key={model.id}
                    className="flex flex-col p-2 bg-neutral-900/60 rounded-xl border border-white/5"
                  >
                    <div className="flex items-center justify-between w-full">
                      {editingModelId === model.id ? (
                        <div className="flex items-center gap-2 w-full pr-1">
                          <input
                            type="text"
                            autoFocus
                            value={editingModelName}
                            onChange={(e) =>
                              setEditingModelName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (onRenameLibraryAsset) {
                                  onRenameLibraryAsset(
                                    model.id,
                                    editingModelName,
                                  );
                                }
                                setEditingModelId(null);
                              } else if (e.key === "Escape") {
                                setEditingModelId(null);
                              }
                            }}
                            className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-0.5 text-[11px] text-white focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={() => {
                              if (onRenameLibraryAsset) {
                                onRenameLibraryAsset(
                                  model.id,
                                  editingModelName,
                                );
                              }
                              setEditingModelId(null);
                            }}
                            className="text-green-400 hover:text-green-300 p-0.5 rounded hover:bg-white/5"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 truncate max-w-[65%]">
                            <div className="w-2 h-2 rounded-full bg-indigo-400" />
                            <span
                              className={`text-[11px] font-semibold truncate text-neutral-100 ${
                                isAdmin
                                  ? "cursor-pointer hover:underline"
                                  : "cursor-default"
                              }`}
                              onClick={() => {
                                if (!isAdmin) return;
                                setEditingModelId(model.id);
                                setEditingModelName(model.name);
                              }}
                            >
                              {model.name}
                            </span>
                            <span className="text-[8px] opacity-70 bg-white/15 px-1 py-0.2 rounded font-mono">
                              {model.type.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                const spawnDistance = 2.0;
                                const spawnX = globalCameraPosition.x + globalCameraDirection.x * spawnDistance + (Math.random() - 0.5) * 1.0;
                                const spawnZ = globalCameraPosition.z + globalCameraDirection.z * spawnDistance + (Math.random() - 0.5) * 1.0;
                                const spawnY = globalCameraPosition.y > 0 ? Math.max(0.5, globalCameraPosition.y - 1.0) : 0.5;
                                onAddModels([
                                  {
                                    ...model,
                                    id: `model-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                                    position: [spawnX, spawnY, spawnZ],
                                  },
                                ]);
                              }}
                              className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold hover:bg-indigo-500/40 border border-indigo-500/30 transition-all font-mono"
                              title="Tambahkan ke Scene"
                            >
                              +SCENE
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingModelId(model.id);
                                    setEditingModelName(model.name);
                                  }}
                                  className="text-neutral-400 hover:text-blue-400 p-1 rounded hover:bg-white/5 transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (onRemoveLibraryAsset) {
                                      onRemoveLibraryAsset(model.id);
                                    }
                                  }}
                                  className="text-neutral-400 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
