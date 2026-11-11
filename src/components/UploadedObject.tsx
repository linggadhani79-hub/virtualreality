import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Html, TransformControls, Line } from "@react-three/drei";
import { motion } from "motion/react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { triggerWorkspaceSave } from "./WorkspaceManager";
import { Edit2, Check, Lock, Unlock, Copy, Shield, MessageSquare, Volume2, FileText, Trash2, ChevronDown, ChevronUp, Wrench, Loader2 } from "lucide-react";
import { NPCChatBubble } from "./NPCChatBubble";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { joystickState } from "./VirtualJoystick";
import { useKeyboardKeys } from "../hooks/useKeyboardKeys";

// Pre-allocated reusable vectors for useFrame loop to prevent Garbage Collection lag
const tempTargetPos = new THREE.Vector3();
const tempTargetScale = new THREE.Vector3();
const tempAwayDir = new THREE.Vector3();
const tempLabelPos = new THREE.Vector3();

interface UploadedObjectProps {
  id: string;
  bufferId?: string;
  url: string;
  name: string;
  downloadUrl?: string;
  type: "glb" | "fbx";
  position: [number, number, number];
  initialRotation?: [number, number, number];
  initialScale?: number;
  initialLocked?: boolean;
  initialSolid?: boolean;
  initialExplodable?: boolean;
  initialNpcKnowledge?: string;
  initialNpcBehavior?: "idle" | "forward" | "backward" | "left" | "right" | "wander" | "approach" | "patrol";
  initialNpcTargetId?: string;
  initialPlayBuiltinAnimation?: boolean;
  initialAnimType?: "none" | "spinY" | "spinX" | "spinZ" | "float" | "pulse";
  initialAnimSpeed?: number;
  initialCustomSubNames?: Record<string, string>;
  initialCustomSubDescriptions?: Record<string, string>;
  initialQuizUrl?: string;
  initialTargetScale?: number;
  initialEffectiveScale?: number;
  initialWorldDimensions?: { width: number; height: number; depth: number };
  onMulaiQuiz?: (url: string) => void;
  onDragChange: (dragging: boolean) => void;
  onUpdateModel?: (id: string, updates: any) => void;
  onRemove: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  onDuplicate?: (data: any) => void;
  onExtractMesh?: (
    mesh: THREE.Mesh,
    srcPosition: [number, number, number],
    initialScale?: number,
  ) => void;
  onLoadStart?: (id: string) => void;
  onLoadFinish?: (id: string) => void;
  isAdmin?: boolean;
  viewMode?: "tpp" | "fpp" | "dev";
}

const SettingsTextArea = ({ 
  value, 
  onSave, 
  className, 
  placeholder 
}: { 
  value: string; 
  onSave: (val: string) => void; 
  className?: string; 
  placeholder?: string; 
}) => {
  const [localVal, setLocalVal] = useState(value);
  
  useEffect(() => {
    setLocalVal(value);
  }, [value]);
  
  return (
    <textarea
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        onSave(localVal);
      }}
      className={className}
      placeholder={placeholder}
    />
  );
};

const SettingsInput = ({ 
  value, 
  onSave, 
  className, 
  placeholder 
}: { 
  value: string; 
  onSave: (val: string) => void; 
  className?: string; 
  placeholder?: string; 
}) => {
  const [localVal, setLocalVal] = useState(value);
  
  useEffect(() => {
    setLocalVal(value);
  }, [value]);
  
  return (
    <input
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        onSave(localVal);
      }}
      className={className}
      placeholder={placeholder}
    />
  );
};

import { VRButton, VRInfoCard3D } from "./VRMenu";

export function UploadedObject({
  id,
  bufferId,
  url,
  name,
  downloadUrl,
  type,
  position,
  initialRotation = [0, 0, 0],
  initialScale = 1.0,
  initialLocked = false,
  initialSolid = false,
  initialExplodable = false,
  initialNpcKnowledge = "",
  initialNpcBehavior = "idle",
  initialNpcTargetId = null,
  initialPlayBuiltinAnimation = true,
  initialAnimType = "none",
  initialAnimSpeed = 1.0,
  initialCustomSubNames = {},
  initialCustomSubDescriptions = {},
  initialQuizUrl = "",
  initialTargetScale = 1.0,
  initialEffectiveScale,
  initialWorldDimensions,
  onMulaiQuiz,
  onDragChange,
  onUpdateModel,
  onRemove,
  onRename,
  onDuplicate,
  onExtractMesh,
  onLoadStart,
  onLoadFinish,
  isAdmin = false,
  viewMode = "tpp",
}: UploadedObjectProps) {
  const isVRActive = useXR((state) => !!state.session);
  const { camera, scene } = useThree();
  const keys = useKeyboardKeys();
  const [model, setModel] = useState<THREE.Group | THREE.Object3D | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scaleMultiplier, setScaleMultiplier] = useState(initialScale);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState("");
  const [rotationX, setRotationX] = useState(initialRotation[0]);
  const [rotationY, setRotationY] = useState(initialRotation[1]);
  const [rotationZ, setRotationZ] = useState(initialRotation[2]);
  const [isLocked, setIsLocked] = useState(initialLocked);
  const [isSolid, setIsSolid] = useState(initialSolid);
  const [isExplodable, setIsExplodable] = useState(initialExplodable);
  const [customSubNames, setCustomSubNames] = useState<Record<string, string>>(initialCustomSubNames);
  const [customSubDescriptions, setCustomSubDescriptions] = useState<Record<string, string>>(initialCustomSubDescriptions);
  const [npcKnowledge, setNpcKnowledge] = useState(initialNpcKnowledge);
  const [npcBehavior, setNpcBehavior] = useState(initialNpcBehavior);
  const [npcTargetId, setNpcTargetId] = useState(initialNpcTargetId);
  const [pendingPatrol, setPendingPatrol] = useState(initialNpcTargetId || "");
  const [npcNearbyMsg, setNpcNearbyMsg] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [quizUrl, setQuizUrl] = useState(initialQuizUrl);
  const [autoNormalizeScale, setAutoNormalizeScale] = useState<number>(initialTargetScale || 1.0);
  const [rawMeshDimensions, setRawMeshDimensions] = useState<{ x: number; y: number; z: number } | null>(
    initialWorldDimensions ? { x: initialWorldDimensions.width, y: initialWorldDimensions.height, z: initialWorldDimensions.depth } : null
  );
  const [isCopiedScale, setIsCopiedScale] = useState(false);

  const cachedMeshesRef = useRef<THREE.Mesh[]>([]);
  const needsResetRef = useRef<boolean>(true);

  useEffect(() => {
    if (model) {
      const list: THREE.Mesh[] = [];
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          list.push(child);
          child.userData.isInteractableMesh = true;
          child.userData.parentUploadedId = id;
          child.userData.stableId = child.userData.stableId || child.uuid;
          child.userData.onClick = (e: any) => {
            setSelectedMesh(child);
            setSelectedSubUuid(child.uuid);
            setSelectedSubStableId(child.userData.stableId || child.uuid);
            setSelectedSubName(getSubMeshName(child));
            setActive(true);
          };
        }
      });
      cachedMeshesRef.current = list;
      needsResetRef.current = true;
    }
  }, [model, id]);

  useEffect(() => {
    setQuizUrl(initialQuizUrl);
  }, [initialQuizUrl]);

  useEffect(() => {
    if (loading) {
      onLoadStart?.(id);
    } else {
      onLoadFinish?.(id);
    }
    return () => {
      onLoadFinish?.(id);
    };
  }, [loading, id, onLoadStart, onLoadFinish]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(name);
  const [alwaysShowLabel, setAlwaysShowLabel] = useState(false);

  useEffect(() => {
    if (groupRef.current && model) {
      // Temporarily set scale to 1 to measure exact depth correctly
      const currentScale = groupRef.current.scale.clone();
      groupRef.current.scale.setScalar(1);
      groupRef.current.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(groupRef.current);
      const worldPos = new THREE.Vector3();
      groupRef.current.getWorldPosition(worldPos);

      // Calculate dynamic local height relative to object's absolute pivot position
      boundingHeight.current = box.max.y - worldPos.y;

      const center = new THREE.Vector3();
      box.getCenter(center);
      const worldTopCenter = new THREE.Vector3(center.x, box.max.y, center.z);
      groupRef.current.worldToLocal(worldTopCenter);
      labelLocalPos.current.copy(worldTopCenter);

      // Restore
      groupRef.current.scale.copy(currentScale);
      groupRef.current.updateMatrixWorld(true);
    }
  }, [rotationX, rotationY, rotationZ, model]);

  useEffect(() => {
    setEditNameValue(name);
  }, [name]);

  // States for sub-components (meshes)
  const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);
  const [selectedSubUuid, setSelectedSubUuid] = useState<string | null>(null);
  const [selectedSubStableId, setSelectedSubStableId] = useState<string | null>(null);
  const [selectedSubName, setSelectedSubName] = useState<string | null>(null);
  const [editingSubUuid, setEditingSubUuid] = useState<string | null>(null);
  const [editSubNameValue, setEditSubNameValue] = useState("");
  const [editingSubDescUuid, setEditingSubDescUuid] = useState<string | null>(null);
  const [editSubDescValue, setEditSubDescValue] = useState("");
  const [subMeshesList, setSubMeshesList] = useState<
    { uuid: string; name: string }[]
  >([]);
  const [hiddenUuids, setHiddenUuids] = useState<string[]>([]);
  const [isExploded, setIsExploded] = useState(false);

  useEffect(() => {
    needsResetRef.current = true;
  }, [isExploded, selectedMesh, model]);

  const originalColorsRef = useRef<{
    [uuid: string]: THREE.Color | THREE.Color[];
  }>({});

  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const patrolPoints = useMemo(() => {
    if (npcBehavior === "patrol" && npcTargetId) {
       const pts = npcTargetId.split(";").map(p => {
           const coords = p.split(",").map(n => parseFloat(n.trim()));
           return new THREE.Vector3(coords[0], 0.1, coords[1]);
       }).filter(v => !isNaN(v.x) && !isNaN(v.z));
       if (pts.length > 0) {
           return [...pts, pts[0]];
       }
       return pts;
    }
    return [];
  }, [npcBehavior, npcTargetId]);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale" | "none">("translate");
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  const [animType, setAnimType] = useState<
    "none" | "spinY" | "spinX" | "spinZ" | "float" | "pulse"
  >(initialAnimType);
  const [animSpeed, setAnimSpeed] = useState(initialAnimSpeed);
  const animGroupRef = useRef<THREE.Group>(null);
  const highlightLabelRef = useRef<THREE.Group>(null);
  
  const [hasBuiltinAnimation, setHasBuiltinAnimation] = useState(false);
  const [playBuiltinAnimation, setPlayBuiltinAnimation] = useState(initialPlayBuiltinAnimation);

  const [isDragging, setIsDragging] = useState(false);
  const [objPos, setObjPos] = useState<[number, number, number]>(position);

  // Sync props to state (useful for realtime Firestore updates)
  useEffect(() => {
    if (!isDragging && !active) {
      setObjPos(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1], position[2]]);

  useEffect(() => {
    if (!isDragging && !active) {
      setScaleMultiplier(initialScale);
      setRotationX(initialRotation[0]);
      setRotationY(initialRotation[1]);
      setRotationZ(initialRotation[2]);
      setIsLocked(initialLocked);
      setIsSolid(initialSolid);
      setIsExplodable(initialExplodable);
      setNpcKnowledge(initialNpcKnowledge);
      setNpcBehavior(initialNpcBehavior);
      setNpcTargetId(initialNpcTargetId);
      setPlayBuiltinAnimation(initialPlayBuiltinAnimation);
      setAnimType(initialAnimType);
      setAnimSpeed(initialAnimSpeed);
      setCustomSubNames(initialCustomSubNames);
      setCustomSubDescriptions(initialCustomSubDescriptions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialScale, initialRotation[0], initialRotation[1], initialRotation[2],
    initialLocked, initialSolid, initialExplodable, initialNpcKnowledge, initialNpcBehavior,
    initialNpcTargetId, initialPlayBuiltinAnimation, initialAnimType, initialAnimSpeed, initialCustomSubNames, initialCustomSubDescriptions
  ]);


  // Save when local state changes during active editing
  useEffect(() => {
    if (onUpdateModel) {
      const currentTargetScale = autoNormalizeScale || (model ? model.scale.x : 1.0);
      const effectiveScale = currentTargetScale * scaleMultiplier;
      const worldDimensions = rawMeshDimensions ? {
        width: parseFloat((rawMeshDimensions.x * effectiveScale).toFixed(3)),
        height: parseFloat((rawMeshDimensions.y * effectiveScale).toFixed(3)),
        depth: parseFloat((rawMeshDimensions.z * effectiveScale).toFixed(3)),
      } : undefined;

      onUpdateModel(id, {
        initialScale: scaleMultiplier,
        initialRotation: [rotationX, rotationY, rotationZ],
        position: objPos,
        isLocked,
        isSolid,
        isExplodable,
        npcBehavior,
        npcTargetId,
        playBuiltinAnimation,
        animType,
        animSpeed,
        customSubNames,
        customSubDescriptions,
        targetScale: currentTargetScale,
        effectiveScale,
        worldDimensions,
      });
    }
  }, [
    scaleMultiplier, rotationX, rotationY, rotationZ, objPos[0], objPos[1], objPos[2],
    isLocked, isSolid, isExplodable, npcBehavior, npcTargetId, playBuiltinAnimation, animType, animSpeed,
    autoNormalizeScale, rawMeshDimensions, JSON.stringify(customSubNames), JSON.stringify(customSubDescriptions)
  ]);

  const handleCopyScale = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentTargetScale = autoNormalizeScale || (model ? model.scale.x : 1.0);
    const finalEffectiveScale = parseFloat((currentTargetScale * scaleMultiplier).toFixed(6));

    let dimX = 1, dimY = 1, dimZ = 1;
    if (rawMeshDimensions) {
      dimX = parseFloat((rawMeshDimensions.x * finalEffectiveScale).toFixed(3));
      dimY = parseFloat((rawMeshDimensions.y * finalEffectiveScale).toFixed(3));
      dimZ = parseFloat((rawMeshDimensions.z * finalEffectiveScale).toFixed(3));
    } else if (groupRef.current) {
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const s = new THREE.Vector3();
      box.getSize(s);
      dimX = parseFloat(s.x.toFixed(3));
      dimY = parseFloat(s.y.toFixed(3));
      dimZ = parseFloat(s.z.toFixed(3));
    }

    const scalePayload = {
      modelName: name,
      modelId: id,
      type: type,
      position: objPos,
      rotationDegrees: [Math.round(rotationX), Math.round(rotationY), Math.round(rotationZ)],
      sliderMultiplier: scaleMultiplier,
      autoNormalizeFactor: parseFloat(currentTargetScale.toFixed(6)),
      effectiveScale: finalEffectiveScale,
      worldDimensionsMeters: {
        width_X: `${dimX}m`,
        height_Y: `${dimY}m`,
        depth_Z: `${dimZ}m`
      },
      codeSnippets: {
        threejs: `// Three.js: Atur skala objek hasil gltf.scene:\nscene.position.set(${objPos[0]}, ${objPos[1]}, ${objPos[2]});\nscene.rotation.set(${THREE.MathUtils.degToRad(rotationX).toFixed(3)}, ${THREE.MathUtils.degToRad(rotationY).toFixed(3)}, ${THREE.MathUtils.degToRad(rotationZ).toFixed(3)});\nscene.scale.setScalar(${finalEffectiveScale});`,
        unity: `// Unity C#:\ntransform.position = new Vector3(${objPos[0]}f, ${objPos[1]}f, ${objPos[2]}f);\ntransform.eulerAngles = new Vector3(${Math.round(rotationX)}f, ${Math.round(rotationY)}f, ${Math.round(rotationZ)}f);\ntransform.localScale = Vector3.one * ${finalEffectiveScale}f;`
      }
    };

    const textToCopy = JSON.stringify(scalePayload, null, 2);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setIsCopiedScale(true);
        setTimeout(() => setIsCopiedScale(false), 2500);
      }).catch(() => {
        prompt("Salin data skala objek ini:", textToCopy);
      });
    } else {
      prompt("Salin data skala objek ini:", textToCopy);
    }
  };

  const dragPlane = useRef(new THREE.Plane());
  const planeNormal = useRef(new THREE.Vector3(0, 1, 0));
  const intersection = useRef(new THREE.Vector3());
  const dragOffset = useRef(new THREE.Vector3());
  const boundingHeight = useRef(1.5);
  const labelLocalPos = useRef(new THREE.Vector3(0, 1.5, 0));

  const startPointerRef = useRef({ x: 0, y: 0, z: 0 });
  const isPointerDownRef = useRef(false);
  const hasDraggedRef = useRef(false);

  // Cursor styling
  useEffect(() => {
    if (isAdmin && hovered && !loading && !error) {
      document.body.style.cursor = isDragging ? "grabbing" : "grab";
    } else {
      document.body.style.cursor = "auto";
    }
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered, isDragging, loading, error, isAdmin]);

  const getSubMeshName = (mesh: THREE.Mesh) => {
    const stableId = mesh.userData.stableId || mesh.uuid;
    if (customSubNames[stableId]) return customSubNames[stableId];
    return mesh.name || `Sub Mesh [id: ${mesh.id}]`;
  };

  // Extract child mesh sub-components from loaded 3D model
  const extractSubMeshes = (obj: THREE.Object3D, currentNames?: Record<string, string>) => {
    const list: { uuid: string; name: string }[] = [];
    const namesToUse = currentNames || customSubNames;
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const stableId = child.userData.stableId || child.uuid;
        list.push({
          uuid: child.uuid,
          name: namesToUse[stableId] || child.name || `Sub Mesh [id: ${child.id}]`,
        });
      }
    });
    setSubMeshesList(list);
  };

  const selectMeshByUuid = (uuid: string | null) => {
    if (!uuid) {
      setSelectedMesh(null);
      setSelectedSubUuid(null);
      setSelectedSubStableId(null);
      setSelectedSubName(null);
      return;
    }
    if (!model) return;
    let found: THREE.Mesh | null = null;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.uuid === uuid) {
        found = child;
      }
    });
    if (found) {
      setSelectedMesh(found);
      setSelectedSubUuid(uuid);
      setSelectedSubStableId((found as THREE.Mesh).userData.stableId || uuid);
      setSelectedSubName(getSubMeshName(found));
    }
  };

  const toggleExplode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!model) return;
    
    const newState = !isExploded;
    setIsExploded(newState);

    // Ensure original positions and scales are saved
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.userData.originalPosition) {
          child.userData.originalPosition = child.position.clone();
          child.userData.originalScale = child.scale.clone();
        }
      }
    });

    if (newState) {
      model.updateMatrixWorld(true);
      const modelBox = new THREE.Box3().setFromObject(model);
      const modelCenter = new THREE.Vector3();
      modelBox.getCenter(modelCenter);

      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const childBox = new THREE.Box3().setFromObject(child);
          const childCenter = new THREE.Vector3();
          childBox.getCenter(childCenter);
          
          const offset = childCenter.clone().sub(modelCenter);
          
          // Identify squeezed components (small horizontal distance from center)
          const horizontalDistSq = offset.x * offset.x + offset.z * offset.z;
          
          // Add random jitter to prevent perfect stacking
          offset.x += (Math.random() - 0.5) * 0.1;
          offset.y += (Math.random() - 0.5) * 0.1;
          offset.z += (Math.random() - 0.5) * 0.1;

          if (offset.lengthSq() < 0.001) {
              offset.set((Math.random() - 0.5) * 0.5, 1.0, (Math.random() - 0.5) * 0.5);
          }
          
          // Emphasize vertical separation for components near the center
          if (horizontalDistSq < 0.2) {
            // Force middle components to go upwards to avoid clipping through the bottom
            offset.y = Math.abs(offset.y) + 0.3;
            // Add a bit more horizontal push for these inner components
            offset.x += offset.x >= 0 ? 0.2 : -0.2;
            offset.z += offset.z >= 0 ? 0.2 : -0.2;
          } else {
            // Emphasize z-axis (front/back) and x-axis spread for outer components
            offset.z *= 1.5;
            offset.x *= 1.5;
          }
          
          // Slight upward bias for all exploded components
          offset.y += 0.1;
          offset.normalize();

          const targetWorldPos = new THREE.Vector3();
          // Find real original world pos
          const currentPos = child.position.clone();
          child.position.copy(child.userData.originalPosition);
          child.updateMatrixWorld(true);
          child.getWorldPosition(targetWorldPos);
          
          // Increase expansion distance for better separation
          const expansionDist = horizontalDistSq < 0.2 ? 0.4 : 0.7;
          targetWorldPos.add(offset.multiplyScalar(expansionDist)); // moderate expansion
          
          if (child.parent) {
            child.parent.worldToLocal(targetWorldPos);
          }
          child.userData.explodedPosition = targetWorldPos;
          child.userData.explodeDirection = offset.clone();
          
          // Restore
          child.position.copy(currentPos);
        }
      });
    }
  };

  // Selection effect
  useEffect(() => {
    // We intentionally removed the emissive blue glow effect here.
    // It causes uploaded models to appear "blue" or "glitched" since modifying emissive
    // on user-uploaded assets with dark colors overwhelms the base material.
    // The control panel UI is sufficient to indicate which sub-component is selected.
  }, [selectedMesh, selectedSubUuid, model]);

  // Save on scale or rotation change
  useEffect(() => {
    if (!loading && isAdmin) {
      triggerWorkspaceSave();
    }
  }, [scaleMultiplier, rotationX, rotationY, rotationZ, loading, isAdmin, isLocked, isSolid, isExplodable, npcKnowledge, npcBehavior, npcTargetId, playBuiltinAnimation, animType, animSpeed, quizUrl]);

  // Load the 3D model
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const cleanupModel = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
    };

    const resolveAndLoad = async () => {
      let resolvedUrl = url;
      let isFreshBlob = false;

      // 1. Try resolving via IDB if bufferId is available
      if (bufferId) {
        try {
          const { getAssetURL, fetchAssetViaProxy, checkAssetInIDB } = await import("../lib/store");
          let cachedUrl = await checkAssetInIDB(bufferId, type);
          
          if (!cachedUrl && downloadUrl) {
            cachedUrl = await fetchAssetViaProxy(bufferId, downloadUrl, type);
          } else if (!cachedUrl && !downloadUrl) {
            cachedUrl = await getAssetURL(bufferId, type);
          }

          if (cachedUrl) {
            resolvedUrl = cachedUrl;
            isFreshBlob = true;
          }
        } catch (err) {
          console.warn("Failed to get asset URL from store:", err);
        }
      }

      // 2. If the URL is still a blob URL but it's from a restored workspace, it might be stale.
      if (!isFreshBlob && (!resolvedUrl || resolvedUrl.startsWith("blob:")) && downloadUrl) {
        resolvedUrl = downloadUrl + (type === "glb" ? "#asset.glb" : "#asset.fbx");
      }

      if (!active) return;

      if (!resolvedUrl) {
        setError("URL model tidak valid");
        setLoading(false);
        return;
      }

      if (type === "glb") {
        const gLoader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(
          "https://www.gstatic.com/draco/v1/decoders/",
        );
        gLoader.setDRACOLoader(dracoLoader);

        const handleSuccess = (gltf: any) => {
          if (!active) return;
          const scene = gltf.scene;

          // Disable shadows and add stableId
          let meshIdx = 0;
          scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = false;
              child.receiveShadow = false;
              child.userData.stableId = child.name ? `${child.name}_${meshIdx}` : `mesh_${meshIdx}`;
              meshIdx++;
            }
          });

          // Standardize scaling and center pivot point on ground
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3();
          box.getSize(size);

          const maxDim = Math.max(size.x, size.y, size.z);
          // If wide/horizontal layout (like cars, vehicles, beds), use target size of ~4 units
          // Otherwise standard items remain around ~1.8 units (closely matching the character size)
          const isWideOrLong = size.x > size.y * 1.5 || size.z > size.y * 1.5;
          const baseTargetSize = isWideOrLong ? 4.2 : 1.8;

          const targetScale = baseTargetSize / (maxDim || 1);
          scene.scale.setScalar(targetScale);
          setAutoNormalizeScale(targetScale);
          setRawMeshDimensions({ x: size.x, y: size.y, z: size.z });

          // Position bottom at y=0
          const center = new THREE.Vector3();
          box.getCenter(center);
          scene.position.set(
            -center.x * targetScale,
            -box.min.y * targetScale,
            -center.z * targetScale,
          );

          // Record high bound for floating HTML UI positioning
          boundingHeight.current = size.y * targetScale;

          if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(scene);
            gltf.animations.forEach((clip: THREE.AnimationClip) => {
              mixer.clipAction(clip).play();
            });
            mixerRef.current = mixer;
            setHasBuiltinAnimation(true);
          }

          extractSubMeshes(scene);
          setModel(scene);
          setLoading(false);
        };

        const loadGLBWithFallbacks = (urls: string[], currentIndex: number) => {
          if (currentIndex >= urls.length) {
            if (active) {
              setLoading(false);
            }
            return;
          }

          if (!active) return;

          console.log(
            `Mencoba memuat GLB dari URL (${currentIndex + 1}/${urls.length}):`,
            urls[currentIndex].substring(0, 100) + "...",
          );

          gLoader.load(
            urls[currentIndex],
            handleSuccess,
            undefined,
            (err: any) => {
              console.warn(
                `Gagal memuat GLB pada percobaan ${currentIndex + 1}:`,
                err,
              );
              if (currentIndex === urls.length - 1) {
                const errMsg =
                  err?.message ||
                  (typeof err === "string" ? err : JSON.stringify(err)) ||
                  "Unknown error";
                if (active) {
                  setError(`Gagal memuat GLB: ${errMsg}`);
                }
              }
              loadGLBWithFallbacks(urls, currentIndex + 1);
            },
          );
        };

        const fallbackUrls: string[] = [];
        if (resolvedUrl && resolvedUrl.startsWith("blob:")) {
          fallbackUrls.push(resolvedUrl);
        }

        const targetRemoteUrl = downloadUrl || (typeof resolvedUrl === "string" && resolvedUrl.startsWith("http") ? resolvedUrl : null);
        if (targetRemoteUrl) {
          let cleanUrl = targetRemoteUrl;
          if (cleanUrl.includes("corsproxy.io/?")) {
            cleanUrl = decodeURIComponent(cleanUrl.split("corsproxy.io/?")[1]);
          }
          fallbackUrls.push(`/api/proxy-asset?url=${encodeURIComponent(cleanUrl)}`);
          fallbackUrls.push(cleanUrl);
        }

        if (bufferId?.includes("porsche") || name?.toLowerCase().includes("porsche")) {
          const porscheFallbackUrl = "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0135626792.firebasestorage.app/o/assets%2Fev_sport_car_move_02.glb?alt=media&token=b8c40d7d-d25c-4f4d-9d3b-0c45fd3c503a";
          fallbackUrls.push(`/api/proxy-asset?url=${encodeURIComponent(porscheFallbackUrl)}`);
          fallbackUrls.push(porscheFallbackUrl);
        }

        if (targetRemoteUrl) {
          fallbackUrls.push(`https://corsproxy.io/?${encodeURIComponent(targetRemoteUrl)}`);
        }

        if (fallbackUrls.length === 0 && resolvedUrl) {
          fallbackUrls.push(resolvedUrl);
        }

        loadGLBWithFallbacks(fallbackUrls, 0);
      } else if (type === "fbx") {
        const fLoader = new FBXLoader();
        const handleSuccess = (fbx: any) => {
          if (!active) return;
          // Disable shadows and add stableId
          let meshIdx = 0;
          fbx.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = false;
              child.receiveShadow = false;
              child.userData.stableId = child.name ? `${child.name}_${meshIdx}` : `mesh_${meshIdx}`;
              meshIdx++;
            }
          });

          // Standardize scaling and center pivot point on ground
          const box = new THREE.Box3().setFromObject(fbx);
          const size = new THREE.Vector3();
          box.getSize(size);

          const maxDim = Math.max(size.x, size.y, size.z);
          // If wide/horizontal layout (like cars, vehicles, beds), use target size of ~4 units
          // Otherwise standard items remain around ~1.8 units (closely matching the character size)
          const isWideOrLong = size.x > size.y * 1.5 || size.z > size.y * 1.5;
          const baseTargetSize = isWideOrLong ? 4.2 : 1.8;

          const targetScale = baseTargetSize / (maxDim || 1);
          fbx.scale.setScalar(targetScale);
          setAutoNormalizeScale(targetScale);
          setRawMeshDimensions({ x: size.x, y: size.y, z: size.z });

          const center = new THREE.Vector3();
          box.getCenter(center);
          fbx.position.set(
            -center.x * targetScale,
            -box.min.y * targetScale,
            -center.z * targetScale,
          );

          // Record height for floating HTML UI positioning
          boundingHeight.current = size.y * targetScale;

          if (fbx.animations && fbx.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(fbx);
            fbx.animations.forEach((clip: THREE.AnimationClip) => {
              mixer.clipAction(clip).play();
            });
            mixerRef.current = mixer;
            setHasBuiltinAnimation(true);
          }

          extractSubMeshes(fbx);
          setModel(fbx);
          setLoading(false);
        };

        const loadFBXWithFallbacks = (urls: string[], currentIndex: number) => {
          if (currentIndex >= urls.length) {
            if (active) {
              setLoading(false);
            }
            return;
          }

          if (!active) return;

          console.log(
            `Mencoba memuat FBX dari URL (${currentIndex + 1}/${urls.length}):`,
            urls[currentIndex].substring(0, 100) + "...",
          );

          fLoader.load(
            urls[currentIndex],
            handleSuccess,
            undefined,
            (err: any) => {
              console.warn(
                `Gagal memuat FBX pada percobaan ${currentIndex + 1}:`,
                err,
              );
              if (currentIndex === urls.length - 1) {
                const errMsg =
                  err?.message ||
                  (typeof err === "string" ? err : JSON.stringify(err)) ||
                  "Unknown error";
                if (active) {
                  setError(`Gagal memuat FBX: ${errMsg}`);
                }
              }
              loadFBXWithFallbacks(urls, currentIndex + 1);
            },
          );
        };

        const fallbackUrls: string[] = [];
        if (resolvedUrl && resolvedUrl.startsWith("blob:")) {
          fallbackUrls.push(resolvedUrl);
        }

        const targetRemoteUrl = downloadUrl || (typeof resolvedUrl === "string" && resolvedUrl.startsWith("http") ? resolvedUrl : null);
        if (targetRemoteUrl) {
          let cleanUrl = targetRemoteUrl;
          if (cleanUrl.includes("corsproxy.io/?")) {
            cleanUrl = decodeURIComponent(cleanUrl.split("corsproxy.io/?")[1]);
          }
          fallbackUrls.push(`/api/proxy-asset?url=${encodeURIComponent(cleanUrl)}`);
          fallbackUrls.push(cleanUrl);
          fallbackUrls.push(`https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`);
        }

        if (fallbackUrls.length === 0 && resolvedUrl) {
          fallbackUrls.push(resolvedUrl);
        }

        loadFBXWithFallbacks(fallbackUrls, 0);
      }
    };

    resolveAndLoad();

    return () => {
      active = false;
      if (model) {
        cleanupModel(model);
      }
    };
  }, [url, type, downloadUrl, bufferId]);

  // State for wander behavior
  const wanderTarget = useRef(new THREE.Vector3());
  const wanderTime = useRef(0);
  const isWalking = useRef(false);

  useFrame((state, delta) => {
    if (mixerRef.current && playBuiltinAnimation) {
      mixerRef.current.update(delta);
    }
    
    if (model && (isExploded || needsResetRef.current)) {
      const meshes = cachedMeshesRef.current;
      const lerpSpeed = Math.min(1, delta * 8);
      let stillMoving = false;

      for (let i = 0; i < meshes.length; i++) {
        const child = meshes[i];
        if (!child.userData.originalPosition) continue;

        if (isExploded) {
          if (selectedMesh) {
            if (selectedMesh === child && child.userData.explodedPosition && child.userData.explodeDirection) {
              tempTargetPos.copy(child.userData.explodedPosition).addScaledVector(child.userData.explodeDirection, 0.2);
              tempTargetScale.copy(child.userData.originalScale).multiplyScalar(1.2);
            } else if (child.userData.explodedPosition && child.userData.explodeDirection && selectedMesh.userData.explodedPosition) {
              tempAwayDir.copy(child.userData.explodedPosition).sub(selectedMesh.userData.explodedPosition);
              if (tempAwayDir.lengthSq() < 0.001) {
                tempAwayDir.copy(child.userData.explodeDirection);
              } else {
                tempAwayDir.normalize();
              }
              tempTargetPos.copy(child.userData.explodedPosition).addScaledVector(tempAwayDir, 0.8);
              tempTargetScale.copy(child.userData.originalScale);
            } else {
              tempTargetPos.copy(child.userData.originalPosition);
              tempTargetScale.copy(child.userData.originalScale);
            }
          } else {
            if (child.userData.explodedPosition) {
              tempTargetPos.copy(child.userData.explodedPosition);
              tempTargetScale.copy(child.userData.originalScale);
            } else {
              tempTargetPos.copy(child.userData.originalPosition);
              tempTargetScale.copy(child.userData.originalScale);
            }
          }
        } else {
          tempTargetPos.copy(child.userData.originalPosition);
          tempTargetScale.copy(child.userData.originalScale);
        }

        child.position.lerp(tempTargetPos, lerpSpeed);
        child.scale.lerp(tempTargetScale, lerpSpeed);

        if (!isExploded && child.position.distanceToSquared(child.userData.originalPosition) > 0.0001) {
          stillMoving = true;
        }
      }

      if (!isExploded && !stillMoving) {
        needsResetRef.current = false;
      }
    }

    if (isExploded && selectedMesh && highlightLabelRef.current) {
      selectedMesh.getWorldPosition(tempLabelPos);
      if (groupRef.current) {
        groupRef.current.worldToLocal(tempLabelPos);
      }
      tempLabelPos.y += 0.3 / Math.max(0.1, scaleMultiplier);
      if (highlightLabelRef.current.position.distanceToSquared(tempLabelPos) > 0.00001) {
        highlightLabelRef.current.position.lerp(tempLabelPos, Math.min(1, delta * 10));
      } else {
        highlightLabelRef.current.position.copy(tempLabelPos);
      }
      highlightLabelRef.current.visible = true;
    } else if (highlightLabelRef.current) {
      highlightLabelRef.current.visible = false;
    }

    if (animGroupRef.current) {
      if (animType === "spinY") {
        animGroupRef.current.rotation.y += delta * animSpeed;
      } else if (animType === "spinX") {
        animGroupRef.current.rotation.x += delta * animSpeed;
      } else if (animType === "spinZ") {
        animGroupRef.current.rotation.z += delta * animSpeed;
      } else if (animType === "float") {
        animGroupRef.current.position.y =
          Math.sin(state.clock.elapsedTime * animSpeed) * 0.2;
      } else if (animType === "pulse") {
        const s = 1 + Math.sin(state.clock.elapsedTime * animSpeed * 2) * 0.1;
        animGroupRef.current.scale.set(s, s, s);
      } else {
        animGroupRef.current.rotation.set(0, 0, 0);
        animGroupRef.current.position.set(0, 0, 0);
        animGroupRef.current.scale.set(1, 1, 1);
      }
    }
  });

  const handlePointerDown = (e: any) => {
    if (loading || error) return;
    // Prevent dragging triggered when playing with scale slider
    if (e.target && typeof e.target.closest === "function") {
      if (e.target.closest(".scale-slider-container")) return;
    }

    e.stopPropagation();

    if (!isAdmin || isLocked) {
      // Just track pointer down so we can support tapping, but do NOT engage drag/OrbitControls disabled
      isPointerDownRef.current = true;
      hasDraggedRef.current = false;
      startPointerRef.current = { x: e.point.x, y: e.point.y, z: e.point.z };
      return;
    }

    isPointerDownRef.current = true;
    hasDraggedRef.current = false;
    startPointerRef.current = { x: e.point.x, y: e.point.y, z: e.point.z };
  };

  const handlePointerMove = (e: any) => {
    if (!isPointerDownRef.current) return;
    e.stopPropagation();

    if (!hasDraggedRef.current) {
      const dx = e.point.x - (startPointerRef.current.x || 0);
      const dy = e.point.y - (startPointerRef.current.y || 0);
      const dz = e.point.z - (startPointerRef.current.z || 0);
      const distanceSq = dx * dx + dy * dy + dz * dz;

      if (distanceSq > 0.001) {
        hasDraggedRef.current = true;
      }
    }

    if (!isAdmin || isLocked) {
      return;
    }
  };
  const handlePointerUp = (e: any) => {
    if (!isPointerDownRef.current) return;
    e.stopPropagation();

    const wasDragging = hasDraggedRef.current;
    
    isPointerDownRef.current = false;
    hasDraggedRef.current = false;

    if (isAdmin && wasDragging) {
      if (groupRef.current) {
        setObjPos([
          groupRef.current.position.x,
          groupRef.current.position.y,
          groupRef.current.position.z,
        ]);
        if (onUpdateModel) {
          onUpdateModel(id, { position: [groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z] });
        }
      }
      setIsDragging(false);
      triggerWorkspaceSave();
    } else if (!wasDragging) {
      // Clean tap! Select object
      const hasGuestInteraction = isExplodable || npcKnowledge.trim().length > 0;
      if (isAdmin || hasGuestInteraction) {
        const clickedMesh = e.object;
        if (clickedMesh && clickedMesh instanceof THREE.Mesh) {
          setSelectedMesh(clickedMesh);
          setSelectedSubUuid(clickedMesh.uuid);
          setSelectedSubStableId(clickedMesh.userData.stableId || clickedMesh.uuid);
          setSelectedSubName(getSubMeshName(clickedMesh));
          if (isExploded) {
            setActive(false);
          } else {
            setActive(true);
          }
        } else {
          // Toggle the entire main panel if they didn't click a specific mesh
          if (isExploded) {
            setActive(false);
          } else {
            setActive((prev) => !prev);
          }
        }
      }
    }
    
    if (isAdmin) {
      onDragChange(false);
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };
  useEffect(() => {
    if (groupRef.current) {
      Object.assign(groupRef.current.userData, {
        isExportable: true,
        type: "uploaded",
        state: {
          id,
          bufferId,
          name,
          url,
          downloadUrl,
          type,
          position: objPos,
          initialScale: scaleMultiplier,
          initialRotation: [rotationX, rotationY, rotationZ],
          isLocked,
          isSolid,
          npcKnowledge,
          npcBehavior,
          npcTargetId,
          playBuiltinAnimation,
          animType,
          animSpeed,
          quizUrl,
        },
        getMesh: () => model,
      });
    }
  });

  const handleOptimizeVR = async () => {
    if (!model || isOptimizing) return;
    setIsOptimizing(true);
    setOptimizeProgress("Memulai optimasi...");
    try {
      const { optimizeCADModelForVR } = await import("../lib/optimizer");
      // Yield to let UI update
      await new Promise(r => setTimeout(r, 50));
      const optimizedModel = await optimizeCADModelForVR(model, (msg) => {
        setOptimizeProgress(msg);
      });
      setModel(optimizedModel);
      setOptimizeProgress("Berhasil dioptimasi untuk VR!");
      setTimeout(() => setOptimizeProgress(""), 3000);
    } catch (err) {
      console.error("Optimization failed:", err);
      setOptimizeProgress("Gagal optimasi.");
      setTimeout(() => setOptimizeProgress(""), 3000);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <>
      {patrolPoints.length > 0 && (
         <Line
           points={patrolPoints}
           color="lime"
           lineWidth={2}
           dashed={true}
           dashScale={10}
           dashSize={0.5}
           gapSize={0.5}
         />
      )}
      {active && isAdmin && !isLocked && transformMode !== "none" && (
        <TransformControls
          object={groupRef}
          mode={transformMode}
          onChange={() => {
            if (transformMode === "translate" && groupRef.current) {
              // Snap to floor if close, and hard clamp to prevent going below
              if (Math.abs(groupRef.current.position.y) < 0.15) {
                groupRef.current.position.y = 0;
              } else if (groupRef.current.position.y < 0) {
                groupRef.current.position.y = 0;
              }
            }
          }}
          onMouseDown={() => {
            onDragChange(true);
          }}
          onMouseUp={() => {
            onDragChange(false);
            if (groupRef.current) {
              const p = groupRef.current.position;
              const updates: any = {};
              if (transformMode === "translate") {
                 setObjPos([p.x, p.y, p.z]);
                 updates.position = [p.x, p.y, p.z];
              }
              if (transformMode === "rotate") {
                 const rx = THREE.MathUtils.radToDeg(groupRef.current.rotation.x);
                 const ry = THREE.MathUtils.radToDeg(groupRef.current.rotation.y);
                 const rz = THREE.MathUtils.radToDeg(groupRef.current.rotation.z);
                 setRotationX(rx);
                 setRotationY(ry);
                 setRotationZ(rz);
                 updates.initialRotation = [rx, ry, rz];
              }
              if (transformMode === "scale") {
                 setScaleMultiplier(groupRef.current.scale.x);
                 updates.initialScale = groupRef.current.scale.x;
              }
              if (onUpdateModel && Object.keys(updates).length > 0) {
                 onUpdateModel(id, updates);
              }
              setTimeout(() => triggerWorkspaceSave(), 100);
            }
          }}
        />
      )}
      <group
        name={id}
        ref={groupRef}
        rotation={[
          THREE.MathUtils.degToRad(rotationX),
          THREE.MathUtils.degToRad(rotationY),
          THREE.MathUtils.degToRad(rotationZ),
        ]}
      position={objPos}
      scale={scaleMultiplier}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
        {/* Visual representation depending on loading, error or fully loaded model */}
        {loading && (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color="#6366f1"
              opacity={0.5}
              transparent
              wireframe
            />
            <Html position={[0, 1.3, 0]} center>
              <div className="bg-black/95 text-xs text-white px-2 py-1 rounded border border-white/25 flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                Memuat model...
              </div>
            </Html>
          </mesh>
        )}

        {error && (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#ef4444" opacity={0.6} transparent />
            <Html position={[0, 1.3, 0]} center>
              <div className="bg-red-950/95 text-white text-xs px-2 py-1 rounded border border-red-500/50 flex items-center gap-1.5 whitespace-nowrap">
                ⚠️ {error}
              </div>
            </Html>
          </mesh>
        )}

        {model && (
          <group ref={animGroupRef}>
            <primitive object={model} />
            <group ref={highlightLabelRef}>
              {(isExploded || active) && selectedMesh && selectedSubName && !isVRActive && (
                <Html center zIndexRange={[100, 0]}>
                  <div className="bg-amber-500/90 text-white px-2.5 py-1.5 rounded-lg shadow-lg shadow-amber-500/20 border border-amber-300 animate-fade-in-quick max-w-xs flex flex-col gap-1 select-none pointer-events-auto">
                    <div className="text-[10px] font-bold whitespace-nowrap flex justify-between items-center gap-2">
                      <span>🎯 {selectedSubName}</span>
                      {customSubDescriptions[selectedSubStableId || selectedSubUuid || ""] && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const text = customSubDescriptions[selectedSubStableId || selectedSubUuid || ""];
                            if (text) {
                               const synth = window.speechSynthesis;
                               synth.cancel();
                               const utterance = new SpeechSynthesisUtterance(text);
                               utterance.lang = "id-ID";
                               synth.speak(utterance);
                            }
                          }}
                          className="bg-white/20 hover:bg-white/40 p-1 rounded transition-colors text-white cursor-pointer pointer-events-auto"
                          title="Putar Audio Keterangan"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {customSubDescriptions[selectedSubStableId || selectedSubUuid || ""] && (
                      <div className="text-[9px] leading-tight text-white/90 whitespace-pre-wrap mt-1 pb-0.5" style={{ wordBreak: 'break-word', pointerEvents: 'auto' }}>
                        {customSubDescriptions[selectedSubStableId || selectedSubUuid || ""]}
                      </div>
                    )}
                  </div>
                </Html>
              )}
            </group>
          </group>
        )}

      {isVRActive && !loading && (
        <group position={[labelLocalPos.current.x, labelLocalPos.current.y + 0.4 / scaleMultiplier, labelLocalPos.current.z]}>
          {/* Active Sub-mesh Inspector Card in VR */}
          {selectedSubName && (
            <VRInfoCard3D
              position={[0, 0.7, 0]}
              title={selectedSubName}
              description={customSubDescriptions[selectedSubStableId || selectedSubUuid || ""] || "Pilih dan klik komponen untuk melihat informasi detail."}
              scale={0.9}
            />
          )}

          {/* Action Buttons in VR */}
          <group position={[0, 0, 0]}>
            {isExplodable && subMeshesList.length > 0 && (
              <VRButton 
                position={[0, 0, 0]} 
                text={isExploded ? "Pasang" : "Bongkar"} 
                color={isExploded ? "#f59e0b" : "#6366f1"}
                onClick={toggleExplode} 
              />
            )}
            {quizUrl && quizUrl.trim().length > 0 && (
              <VRButton 
                position={[0, isExplodable && subMeshesList.length > 0 ? -0.55 : 0, 0]} 
                text="Mulai Kuis" 
                color="#059669"
                onClick={() => onMulaiQuiz && onMulaiQuiz(quizUrl)} 
              />
            )}
          </group>
        </group>
      )}

      {/* 3D Label & Remove Button when Hovered/Active/Exploded (hidden in VR mode to prevent matrix projection drift) */}
      {!isVRActive && ((isAdmin && hovered) || isDragging || active || alwaysShowLabel || isChatOpen || isExploded || isExplodable || (quizUrl && quizUrl.trim().length > 0)) &&
        !loading &&
        (!isLocked || active || isChatOpen || isExploded || isExplodable || (quizUrl && quizUrl.trim().length > 0)) && (
          <>
            {(!isChatOpen) && (
              <Html
                position={[
                  labelLocalPos.current.x,
                  labelLocalPos.current.y + 0.2 / scaleMultiplier,
                  labelLocalPos.current.z,
                ]}
                center
                zIndexRange={[100, 0]}
              >
                <div
                  className="flex flex-col items-center gap-2 pointer-events-auto select-none scale-100 transition-all"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onPointerMove={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {((isAdmin && hovered) || isDragging || active || alwaysShowLabel || isChatOpen || isExploded) && (
                    <div className="px-3 py-1.5 bg-neutral-950/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 flex items-center gap-2 max-w-xs transition-all duration-200 pointer-events-none">
                      <span className="text-[11px] uppercase tracking-wider font-extrabold text-white truncate max-w-[105px]">
                        {name}
                      </span>
                      {scaleMultiplier !== 1.0 && (
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">
                          {scaleMultiplier.toFixed(1)}x
                        </span>
                      )}
                      <span className="text-[9px] text-neutral-400 ml-1">
                        {hovered && !active && "(Klik)"}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-1">
                    {/* Only show bongkar button if explodable and has submeshes */}
                    {isExplodable && subMeshesList.length > 0 && (
                      <button
                        onClick={toggleExplode}
                        className={`text-[10px] py-1.5 px-3 rounded-full font-bold transition-all cursor-pointer border shadow-lg flex items-center gap-1.5 ${
                          isExploded
                            ? "bg-amber-500/90 text-white border-amber-400 hover:bg-amber-500"
                            : "bg-indigo-500/90 text-white border-indigo-400 hover:bg-indigo-500"
                        }`}
                      >
                        {isExploded ? "🧩 Pasang" : "💥 Bongkar"}
                      </button>
                    )}
                        
                    {/* Show AI Chat button if there is knowledge and it's active */}
                    {active && npcKnowledge.trim().length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsChatOpen(true);
                        }}
                        className="bg-indigo-500/90 hover:bg-indigo-500 text-white border border-indigo-400 px-3 py-1.5 rounded-full transition-all cursor-pointer font-bold text-[10px] shadow-lg flex items-center gap-1.5"
                        title="Tanya Jawab AI"
                      >
                        <MessageSquare className="w-3 h-3" /> AI Chat
                      </button>
                    )}

                    {/* Show Mulai Kuis button if there is quizUrl - shown permanently */}
                    {quizUrl && quizUrl.trim().length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onMulaiQuiz) onMulaiQuiz(quizUrl);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 px-3 py-1.5 rounded-full transition-all cursor-pointer font-bold text-[10px] shadow-lg flex items-center gap-1.5"
                        title="Mulai Mengerjakan Soal (Google Form)"
                      >
                        <FileText className="w-3 h-3" />
                        Mulai Kuis
                      </button>
                    )}
                  </div>
                  {active && !isAdmin && (
                     <button
                     onClick={(e) => {
                       e.stopPropagation();
                       setActive(false);
                       selectMeshByUuid(null);
                     }}
                     className="bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 px-3 py-1.5 rounded-full transition-all cursor-pointer font-bold text-[10px] mt-1 shadow-md border border-white/10"
                     title="Tutup"
                   >
                     ✕ Tutup
                   </button>
                  )}
                </div>
              </Html>
            )}

            {isChatOpen && createPortal(
              <motion.div
                drag
                dragMomentum={false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed top-24 sm:top-32 right-4 sm:right-24 z-[999] pointer-events-auto select-auto w-[calc(100vw-32px)] sm:w-80 shadow-2xl cursor-grab active:cursor-grabbing max-w-full"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="cursor-auto">
                  <NPCChatBubble objectName={name} knowledge={npcKnowledge} onClose={() => setIsChatOpen(false)} />
                </div>
              </motion.div>,
              document.body
            )}

            {isAdmin && active && !isChatOpen && createPortal(
              <div
                className="fixed top-16 sm:top-24 right-4 sm:right-8 lg:right-12 xl:right-64 z-50 pointer-events-auto flex flex-col gap-2 max-h-[85vh] sm:max-h-[calc(100vh-120px)] overflow-y-auto max-w-[calc(100vw-32px)] pb-8"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >{active ? (
                /* Comprehensive Control Panel when Active */
                <div className="bg-neutral-950/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-3.5 w-full sm:w-[380px] md:w-[480px] text-white flex flex-col gap-4 scale-100 animate-fade-in-quick select-none my-auto">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      {isEditingName && isAdmin ? (
                        <div className="flex items-center gap-1.5 w-full">
                          <input
                            autoFocus
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setIsEditingName(false);
                                if (onRename) onRename(id, editNameValue);
                              } else if (e.key === "Escape") {
                                setIsEditingName(false);
                                setEditNameValue(name);
                              }
                            }}
                            className="text-[12px] font-extrabold text-white bg-white/5 border border-white/10 hover:border-white/30 focus:border-indigo-500 rounded px-1.5 py-1 w-full uppercase tracking-wide outline-none transition-all"
                          />
                          <button
                            onClick={() => {
                              setIsEditingName(false);
                              if (onRename) onRename(id, editNameValue);
                            }}
                            className="text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-white/5 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 w-full group">
                          <h4
                            className={`text-[12px] font-extrabold text-white truncate uppercase tracking-wide ${isAdmin ? "cursor-pointer hover:underline" : ""}`}
                            onClick={() => { if (isAdmin) setIsEditingName(true); }}
                          >
                            {name}
                          </h4>
                          {isAdmin && (
                            <button
                              onClick={() => setIsEditingName(true)}
                              className="text-neutral-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-neutral-400 font-mono">
                          Format: {type.toUpperCase()}
                        </span>
                        {isSolid && (
                          <span className="text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 rounded font-mono font-bold tracking-wider">
                            SOLID
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAdmin && onDuplicate && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate({
                              name,
                              url,
                              type,
                              bufferId,
                              downloadUrl,
                              position: objPos,
                              initialRotation: [
                                rotationX,
                                rotationY,
                                rotationZ,
                              ],
                              initialScale: scaleMultiplier,
                              isLocked: false,
                              isSolid,
                              npcKnowledge,
                              npcBehavior,
                              npcTargetId,
                              playBuiltinAnimation,
                              animType,
                              animSpeed,
                            });
                          }}
                          className="bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white border border-blue-500/30 p-1.5 rounded-lg transition-all cursor-pointer"
                          title="Duplikat Model"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSolid(!isSolid);
                            }}
                            className={`${isSolid ? "bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 border-emerald-500/30" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700"} hover:text-white border p-1.5 rounded-lg transition-all cursor-pointer`}
                            title={isSolid ? "Matikan Solid (Bisa Ditembus)" : "Aktifkan Solid (Tidak Tembus)"}
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsLocked(!isLocked);
                            }}
                            className={`${isLocked ? "bg-amber-500/20 hover:bg-amber-500 text-amber-300 border-amber-500/30" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700"} hover:text-white border p-1.5 rounded-lg transition-all cursor-pointer`}
                            title={isLocked ? "Buka Kunci Posisi" : "Kunci Posisi"}
                          >
                            {isLocked ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : (
                              <Unlock className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsChatOpen(true);
                        }}
                        className="bg-indigo-500/20 hover:bg-indigo-500 text-indigo-300 hover:text-white border border-indigo-500/30 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="Tanya Jawab AI"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(id);
                          }}
                          className="bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 p-1.5 rounded-lg transition-all cursor-pointer"
                          title="Hapus Model"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSettingsExpanded(!isSettingsExpanded);
                          }}
                          className="bg-white/10 hover:bg-white/20 active:scale-95 text-white p-1.5 rounded-lg transition-all cursor-pointer"
                          title={isSettingsExpanded ? "Sembunyikan Pengaturan" : "Tampilkan Pengaturan"}
                        >
                          {isSettingsExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronUp className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActive(false);
                          selectMeshByUuid(null);
                        }}
                        className="bg-white/10 hover:bg-white/20 active:scale-95 text-white px-2 py-1.5 rounded-lg transition-all cursor-pointer hover:text-indigo-400 font-bold text-xs"
                        title="Tutup Panel 编辑"
                      >
                        ✕ Tutup
                      </button>
                    </div>
                  </div>

                  {isAdmin && isSettingsExpanded && (
                  <>
                  {/* Toggle Always Show Label */}
                  <div className="flex flex-col gap-2">
                    <label
                      className="flex items-center gap-2 px-1 cursor-pointer w-max"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={alwaysShowLabel}
                        onChange={(e) => {
                          e.stopPropagation();
                          setAlwaysShowLabel(e.target.checked);
                        }}
                        className="accent-indigo-500 cursor-pointer"
                      />
                      <span className="text-[10px] text-neutral-300 font-medium tracking-wide">
                        Tampilkan label nama permanen
                      </span>
                    </label>
                    <label
                      className="flex items-center gap-2 px-1 pb-1 cursor-pointer w-max"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isExplodable}
                        onChange={(e) => {
                          e.stopPropagation();
                          setIsExplodable(e.target.checked);
                          setTimeout(() => triggerWorkspaceSave(), 100);
                        }}
                        className="accent-amber-500 cursor-pointer"
                      />
                      <span className="text-[10px] text-neutral-300 font-medium tracking-wide">
                        Bisa dibongkar komponennya (Explodable)
                      </span>
                    </label>
                  </div>

                  <div
                    className={
                      isLocked
                        ? "opacity-30 pointer-events-none relative transition-opacity grid grid-cols-1 sm:grid-cols-2 gap-3"
                        : "transition-opacity grid grid-cols-1 sm:grid-cols-2 gap-3"
                    }
                  >
                                        {/* Posisi Y (Ketinggian) */}
                    <div className="flex flex-col gap-1.5 scale-slider-container bg-white/5 p-2 rounded-xl border border-white/10">
                      <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-neutral-300">Tinggi (Y):</span>
                        <span className="font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/20">
                          {objPos[1].toFixed(2)}m
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newY = Math.max(0, objPos[1] - 0.5);
                            setObjPos([objPos[0], newY, objPos[2]]);
                            if (groupRef.current) groupRef.current.position.y = newY;
                            if (onUpdateModel) onUpdateModel(id, { position: [objPos[0], newY, objPos[2]] });
                            setTimeout(() => triggerWorkspaceSave(), 100);
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center rounded-lg font-bold text-xs"
                          title="Turunkan"
                        >
                          ▼
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="20"
                          step="0.1"
                          value={objPos[1]}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newY = parseFloat(e.target.value);
                            setObjPos([objPos[0], newY, objPos[2]]);
                            if (groupRef.current) groupRef.current.position.y = newY;
                            if (onUpdateModel) onUpdateModel(id, { position: [objPos[0], newY, objPos[2]] });
                          }}
                          onPointerUp={() => setTimeout(() => triggerWorkspaceSave(), 100)}
                          className="w-full accent-cyan-500 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newY = Math.min(20, objPos[1] + 0.5);
                            setObjPos([objPos[0], newY, objPos[2]]);
                            if (groupRef.current) groupRef.current.position.y = newY;
                            if (onUpdateModel) onUpdateModel(id, { position: [objPos[0], newY, objPos[2]] });
                            setTimeout(() => triggerWorkspaceSave(), 100);
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center rounded-lg font-bold text-xs"
                          title="Naikkan"
                        >
                          ▲
                        </button>
                      </div>
                    </div>
                    
                  {!isLocked && (
                    <div className="flex flex-col gap-1.5 bg-white/5 p-2 rounded-xl border border-white/10">
                      <span className="text-[11px] font-bold text-neutral-300">Garis Sumbu (Axis):</span>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setTransformMode(transformMode === "translate" ? "none" : "translate"); }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${transformMode === "translate" ? "bg-indigo-600 text-white border-indigo-400/50" : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700"}`}
                        >
                          Pindah
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setTransformMode(transformMode === "rotate" ? "none" : "rotate"); }}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${transformMode === "rotate" ? "bg-indigo-600 text-white border-indigo-400/50" : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700"}`}
                        >
                          Putar
                        </button>
                      </div>
                    </div>
                  )}

                    {/* Scale Multiplier Slider Control */}
                    <div className="flex flex-col gap-1.5 scale-slider-container bg-white/5 p-2 rounded-xl border border-white/10">
                      <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-neutral-300">Skala Ukuran:</span>
                        <span className="font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/20">
                          {scaleMultiplier.toFixed(1)}x
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setScaleMultiplier((prev) =>
                              Math.max(
                                0.1,
                                parseFloat((prev - 0.1).toFixed(1)),
                              ),
                            );
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center rounded-lg font-bold text-xs"
                          title="Kecilkan"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="0.2"
                          max="5.0"
                          step="0.1"
                          value={scaleMultiplier}
                          onChange={(e) => {
                            e.stopPropagation();
                            setScaleMultiplier(parseFloat(e.target.value));
                          }}
                          className="w-full accent-indigo-500 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setScaleMultiplier((prev) =>
                              Math.min(
                                6.0,
                                parseFloat((prev + 0.1).toFixed(1)),
                              ),
                            );
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center rounded-lg font-bold text-xs"
                          title="Besarkan"
                        >
                          +
                        </button>
                      </div>

                      {/* Detail Skala Efektif & Tombol Salin untuk Migrasi */}
                      {(() => {
                        const currentTargetScale = autoNormalizeScale || (model ? model.scale.x : 1.0);
                        const finalEffectiveScale = parseFloat((currentTargetScale * scaleMultiplier).toFixed(6));
                        let dimText = "";
                        if (rawMeshDimensions) {
                          const dx = (rawMeshDimensions.x * finalEffectiveScale).toFixed(2);
                          const dy = (rawMeshDimensions.y * finalEffectiveScale).toFixed(2);
                          const dz = (rawMeshDimensions.z * finalEffectiveScale).toFixed(2);
                          dimText = `${dx}m × ${dy}m × ${dz}m`;
                        } else if (groupRef.current) {
                          const box = new THREE.Box3().setFromObject(groupRef.current);
                          const s = new THREE.Vector3();
                          box.getSize(s);
                          dimText = `${s.x.toFixed(2)}m × ${s.y.toFixed(2)}m × ${s.z.toFixed(2)}m`;
                        }

                        return (
                          <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10 mt-1">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400 bg-black/40 px-2 py-1.5 rounded-lg border border-white/5 font-mono">
                              <span title="Ukuran fisik 3D sebenarnya di ruang VR">
                                Dimensi: <strong className="text-cyan-300">{dimText || "1.8m"}</strong>
                              </span>
                              <span title="Skala 3D sebenarnya (Three.js/Unity)">
                                Skala 3D: <strong className="text-emerald-400">{finalEffectiveScale}</strong>
                              </span>
                            </div>

                            <button
                              id={`btn-copy-scale-${id}`}
                              onClick={handleCopyScale}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-gradient-to-r from-emerald-600/30 to-cyan-600/30 hover:from-emerald-600/50 hover:to-cyan-600/50 active:scale-95 text-emerald-200 hover:text-white rounded-lg border border-emerald-500/30 text-[10px] font-bold transition-all cursor-pointer shadow-sm"
                              title="Salin nilai skala efektif & cuplikan kode migrasi Three.js / Unity"
                            >
                              {isCopiedScale ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>✅ Skala & Transformasi Disalin!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>📋 Salin Nilai Skala (Untuk Migrasi)</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Vertical Rotation Slider Control */}
                    <div className="flex flex-col gap-1.5 scale-slider-container bg-white/5 p-2 rounded-xl border border-white/10">
                      <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-neutral-300">
                          Rotasi Vertikal:
                        </span>
                        <span className="font-mono text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/20">
                          {Math.round(rotationX)}°
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRotationX((prev) => (prev - 15 + 360) % 360);
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center rounded-lg font-bold text-neutral-200"
                          title="Putar Atas (-15°)"
                        >
                          ▲
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="359"
                          step="1"
                          value={Math.round(rotationX)}
                          onChange={(e) => {
                            e.stopPropagation();
                            setRotationX(parseInt(e.target.value));
                          }}
                          className="w-full accent-indigo-500 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRotationX((prev) => (prev + 15) % 360);
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center rounded-lg font-bold text-neutral-200"
                          title="Putar Bawah (+15°)"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="flex gap-1 justify-between mt-0.5">
                        {[0, 90, 180, 270].map((angle) => (
                          <button
                            key={`x-${angle}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRotationX(angle);
                            }}
                            className={`flex-1 text-[9px] font-mono py-0.5 rounded transition-all ${
                              Math.round(rotationX) === angle
                                ? "bg-indigo-600 text-white font-bold border border-indigo-400/30"
                                : "bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/5"
                            }`}
                          >
                            {angle === 270 ? "-90" : angle}°
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Horizontal Rotation Slider Control */}
                    <div className="flex flex-col gap-1.5 scale-slider-container mt-1">
                      <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-neutral-300">
                          Rotasi Horizontal:
                        </span>
                        <span className="font-mono text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/20">
                          {Math.round(rotationY)}°
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRotationY((prev) => (prev - 15 + 360) % 360);
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center rounded-lg font-bold text-neutral-200"
                          title="Putar Kiri (-15°)"
                        >
                          ↺
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="359"
                          step="1"
                          value={Math.round(rotationY)}
                          onChange={(e) => {
                            e.stopPropagation();
                            setRotationY(parseInt(e.target.value));
                          }}
                          className="w-full accent-indigo-500 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRotationY((prev) => (prev + 15) % 360);
                          }}
                          className="w-7 h-7 bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center rounded-lg font-bold text-neutral-200"
                          title="Putar Kanan (+15°)"
                        >
                          ↻
                        </button>
                      </div>
                      <div className="flex gap-1 justify-between mt-0.5">
                        {[0, 90, 180, 270].map((angle) => (
                          <button
                            key={`y-${angle}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRotationY(angle);
                            }}
                            className={`flex-1 text-[9px] font-mono py-0.5 rounded transition-all ${
                              Math.round(rotationY) === angle
                                ? "bg-indigo-600 text-white font-bold border border-indigo-400/30"
                                : "bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/5"
                            }`}
                          >
                            {angle === 270 ? "-90" : angle}°
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Animation Config */}
                    <div className="flex flex-col gap-1.5 scale-slider-container mt-1 pt-1.5 border-t border-white/10">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[11px] font-bold text-neutral-300">Animasi Bawaan:</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlayBuiltinAnimation((p) => !p);
                              setTimeout(() => triggerWorkspaceSave(), 100);
                            }}
                            className={`text-[9px] font-bold px-2 py-1 rounded transition-all ${
                              playBuiltinAnimation
                                ? "bg-green-600 text-white shadow-md"
                                : "bg-white/10 hover:bg-white/20 text-neutral-300"
                            }`}
                          >
                            {playBuiltinAnimation ? "Aktif" : "Mati"}
                          </button>
                        </div>
                      
                      <div className="flex justify-between items-center text-[11px] font-bold">
                        <span className="text-neutral-300">Animasi Transformasi:</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: "none", label: "Mati" },
                          { id: "spinY", label: "Spin Y" },
                          { id: "spinX", label: "Spin X" },
                          { id: "spinZ", label: "Spin Z" },
                          { id: "float", label: "Float" },
                          { id: "pulse", label: "Pulse" },
                        ].map((anim) => (
                          <button
                            key={anim.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAnimType(anim.id as any);
                              setTimeout(() => triggerWorkspaceSave(), 100);
                            }}
                            className={`text-[9px] font-bold py-1 rounded transition-all ${
                              animType === anim.id
                                ? "bg-blue-600 text-white shadow-md"
                                : "bg-white/10 hover:bg-white/20 text-neutral-300"
                            }`}
                          >
                            {anim.label}
                          </button>
                        ))}
                      </div>
                      {animType !== "none" && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-neutral-400 font-bold whitespace-nowrap">
                            Kecepatan:
                          </span>
                          <input
                            type="range"
                            min="0.1"
                            max="5.0"
                            step="0.1"
                            value={animSpeed}
                            onChange={(e) => {
                              e.stopPropagation();
                              setAnimSpeed(parseFloat(e.target.value));
                            }}
                            onPointerUp={() => setTimeout(() => triggerWorkspaceSave(), 100)}
                            className="w-full accent-blue-500 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      )}
                    </div>

                    {/* Direct Presets */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest">
                        Presets Ukuran
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0.5, 1.0, 2.0, 3.5].map((preset) => (
                          <button
                            key={preset}
                            onClick={(e) => {
                              e.stopPropagation();
                              setScaleMultiplier(preset);
                            }}
                            className={`text-[10px] font-mono py-1 rounded-md transition-all ${
                              scaleMultiplier === preset
                                ? "bg-indigo-600 text-white font-bold border border-indigo-400/30"
                                : "bg-white/5 hover:bg-white/10 text-neutral-300"
                            }`}
                          >
                            {preset}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                      <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mt-1">
                        Informasi NPC (Chatbot Statis)
                      </span>
                      <SettingsTextArea
                        value={npcKnowledge}
                        onSave={(val) => {
                          setNpcKnowledge(val);
                          if (onUpdateModel) {
                            onUpdateModel(id, { npcKnowledge: val });
                          }
                          setTimeout(() => triggerWorkspaceSave(), 100);
                        }}
                        className="bg-neutral-900 border border-white/10 rounded-lg p-2 text-[10px] text-white min-h-[60px] resize-y focus:outline-none focus:border-indigo-500"
                        placeholder="Ketikkan informasi atau Q&A di sini...\nMisal:\nT: Apa ini?\nJ: Ini adalah mobil."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
                      <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mt-1">
                        Link Google Form (Kuis / Soal)
                      </span>
                      <SettingsInput
                        value={quizUrl}
                        onSave={(val) => {
                          setQuizUrl(val);
                          if (onUpdateModel) {
                            onUpdateModel(id, { quizUrl: val });
                          }
                          setTimeout(() => triggerWorkspaceSave(), 100);
                        }}
                        className="bg-neutral-900 border border-white/10 rounded-lg p-2 text-[10px] text-white focus:outline-none focus:border-indigo-500"
                        placeholder="Tempel link Google Form di sini..."
                      />
                    </div>
                    
                    {/* VR CAD Optimizer */}
                    <div className="flex flex-col gap-2 border-t border-indigo-500/30 pt-3 mt-1 bg-indigo-950/20 p-2 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          Optimasi VR (CAD)
                        </span>
                        <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1.5 rounded-full border border-indigo-500/30 font-bold">BETA</span>
                      </div>
                      <p className="text-[9px] text-indigo-200/70 leading-tight">
                        Fitur ini akan memangkas poligon (decimation) dan menggabungkan material agar model lebih lancar di headset standalone (Quest).
                      </p>
                      {optimizeProgress && (
                        <div className="text-[9px] text-emerald-400 animate-pulse font-mono bg-black/40 px-2 py-1 rounded">
                          {optimizeProgress}
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOptimizeVR();
                        }}
                        disabled={isOptimizing}
                        className={`w-full flex items-center justify-center gap-1.5 ${isOptimizing ? 'bg-indigo-600/50 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95'} text-white text-[10px] font-bold py-2 rounded-lg transition-all border border-indigo-400/30`}
                      >
                        {isOptimizing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Memproses...
                          </>
                        ) : (
                          <>
                            <Wrench className="w-3.5 h-3.5" />
                            Mulai Optimasi Sekarang
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  </>
                  )}
                  {(!isAdmin || isSettingsExpanded) && (
                  <>
                    {/* Sub-component Inspector & Selection */}
                    <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2 scale-slider-container">
                      <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest">
                        Sub-Komponen ({subMeshesList.length})
                      </span>

                      {subMeshesList.length > 0 ? (
                        <>
                          <select
                          value={selectedSubUuid || ""}
                          onChange={(e) => {
                            e.stopPropagation();
                            selectMeshByUuid(e.target.value || null);
                          }}
                          className="w-full bg-white/5 border border-white/10 hover:border-white/20 rounded-lg py-1 px-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option
                            value=""
                            className="bg-neutral-900 text-neutral-400"
                          >
                            -- Klik bagian objek / Pilih list --
                          </option>
                          {subMeshesList.map((mesh) => (
                            <option
                              key={mesh.uuid}
                              value={mesh.uuid}
                              className="bg-neutral-900 text-white truncate text-[11px]"
                            >
                              {mesh.name}
                            </option>
                          ))}
                        </select>
                        </>
                      ) : (
                        <span className="text-[10px] text-neutral-500 italic">
                          Tidak ada sub-komponen terdeteksi
                        </span>
                      )}

                      {selectedMesh && selectedSubUuid && (
                        <div className="flex flex-col gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-2.5 mt-1 transition-all">
                          <div className="flex items-center justify-between text-[10px] text-neutral-300 font-bold truncate">
                            {editingSubUuid === selectedSubUuid ? (
                                <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={editSubNameValue}
                                    onChange={(e) => setEditSubNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const targetId = selectedSubStableId || selectedSubUuid;
                                        if (!targetId) return;
                                        const newNames = { ...customSubNames, [targetId]: editSubNameValue.trim() };
                                        setCustomSubNames(newNames);
                                        setSelectedSubName(editSubNameValue.trim());
                                        if (model) extractSubMeshes(model, newNames);
                                        setEditingSubUuid(null);
                                        if (onUpdateModel) onUpdateModel(id, { customSubNames: newNames });
                                        setTimeout(() => triggerWorkspaceSave(), 100);
                                      }
                                    }}
                                    className="bg-black/50 text-white px-2 py-1 rounded border border-indigo-500/50 flex-1 outline-none focus:border-indigo-400"
                                    autoFocus
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const targetId = selectedSubStableId || selectedSubUuid;
                                      if (!targetId) return;
                                      const newNames = { ...customSubNames, [targetId]: editSubNameValue.trim() };
                                      setCustomSubNames(newNames);
                                      setSelectedSubName(editSubNameValue.trim());
                                      if (model) extractSubMeshes(model, newNames);
                                      setEditingSubUuid(null);
                                      if (onUpdateModel) onUpdateModel(id, { customSubNames: newNames });
                                      setTimeout(() => triggerWorkspaceSave(), 100);
                                    }}
                                    className="p-1 bg-green-500/20 hover:bg-green-500/40 text-green-400 rounded"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSubUuid(null);
                                    }}
                                    className="p-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded"
                                  >
                                    ✕
                                  </button>
                                </div>
                            ) : (
                              <>
                                <span
                                  className="truncate max-w-[130px] text-indigo-300 flex-1"
                                  title={selectedSubName || ""}
                                >
                                  🎯 {selectedSubName}
                                </span>
                                {isAdmin && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditSubNameValue(selectedSubName || "");
                                      setEditingSubUuid(selectedSubUuid);
                                    }}
                                    className="p-1 text-indigo-400 hover:text-indigo-300 mx-1"
                                    title="Ganti Nama"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                )}
                                <span className="text-[8px] opacity-75 font-mono px-1 py-0.5 rounded bg-indigo-500/25">
                                  AKTIF
                                </span>
                              </>
                            )}
                          </div>

                          {/* Sub-mesh actions: Hide/Show & Change Color */}
                          {isAdmin ? (
                            <>
                              <div className="mt-1">
                                {editingSubDescUuid === selectedSubUuid ? (
                                  <div className="flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                    <textarea
                                      value={editSubDescValue}
                                      onChange={(e) => setEditSubDescValue(e.target.value)}
                                      className="bg-black/50 text-white px-2 py-1 rounded border border-indigo-500/50 w-full outline-none focus:border-indigo-400 text-xs min-h-[60px]"
                                      placeholder="Deskripsi/Fungsi Objek..."
                                      autoFocus
                                    />
                                    <div className="flex justify-end gap-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const targetId = selectedSubStableId || selectedSubUuid;
                                          if (!targetId) return;
                                          const newDescs = { ...customSubDescriptions, [targetId]: editSubDescValue.trim() };
                                          setCustomSubDescriptions(newDescs);
                                          setEditingSubDescUuid(null);
                                          if (onUpdateModel) onUpdateModel(id, { customSubDescriptions: newDescs });
                                          setTimeout(() => triggerWorkspaceSave(), 100);
                                        }}
                                        className="px-2 py-1 bg-green-500/20 hover:bg-green-500/40 text-green-400 rounded text-[10px] font-bold"
                                      >
                                        Simpan
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingSubDescUuid(null);
                                        }}
                                        className="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-[10px] font-bold"
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1 w-full mt-1">
                                    <div className="text-[10px] text-indigo-200/70 font-bold uppercase tracking-wider flex justify-between items-center">
                                      <span>Keterangan Fungsi</span>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditSubDescValue(customSubDescriptions[selectedSubStableId || selectedSubUuid || ""] || "");
                                          setEditingSubDescUuid(selectedSubUuid);
                                        }}
                                        className="text-indigo-400 hover:text-indigo-300"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                    {customSubDescriptions[selectedSubStableId || selectedSubUuid || ""] ? (
                                      <div className="text-xs text-white/90 bg-black/30 p-2 rounded border border-white/5 whitespace-pre-wrap">
                                        {customSubDescriptions[selectedSubStableId || selectedSubUuid || ""]}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-white/30 italic">Belum ada keterangan.</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 justify-between">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!selectedMesh) return;
                                    const isCurrentlyVisible =
                                      selectedMesh.visible;
                                    selectedMesh.visible = !isCurrentlyVisible;
                                    // Update list to trigger render
                                    setHiddenUuids((prev) => {
                                      if (isCurrentlyVisible)
                                        return [...prev, selectedMesh.uuid];
                                      return prev.filter(
                                        (id) => id !== selectedMesh.uuid,
                                      );
                                    });
                                  }}
                                  className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-all w-full flex items-center justify-center gap-1 cursor-pointer ${
                                    hiddenUuids.includes(selectedSubUuid)
                                      ? "bg-red-500/25 hover:bg-red-500/40 text-red-300 border border-red-500/30"
                                      : "bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/30"
                                  }`}
                                >
                                  {hiddenUuids.includes(selectedSubUuid)
                                    ? "👁️ Tampilkan"
                                    : "👁️ Sembunyikan"}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      !selectedMesh ||
                                      !originalColorsRef.current[
                                        selectedMesh.uuid
                                      ]
                                    )
                                      return;
                                    const orig =
                                      originalColorsRef.current[
                                        selectedMesh.uuid
                                      ];
                                    const materials = Array.isArray(
                                      selectedMesh.material,
                                    )
                                      ? selectedMesh.material
                                      : [selectedMesh.material];
                                    if (Array.isArray(orig)) {
                                      materials.forEach((mat, idx) => {
                                        if (
                                          mat &&
                                          "color" in mat &&
                                          orig[idx]
                                        ) {
                                          (mat.color as THREE.Color).copy(
                                            orig[idx] as THREE.Color,
                                          );
                                        }
                                      });
                                    } else {
                                      materials.forEach((mat) => {
                                        if (mat && "color" in mat) {
                                          (mat.color as THREE.Color).copy(
                                            orig as THREE.Color,
                                          );
                                        }
                                      });
                                    }
                                    // Trigger minor update
                                    setRotationY((p) => p + 0.0001);
                                  }}
                                  disabled={
                                    !originalColorsRef.current[selectedSubUuid]
                                  }
                                  className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-all w-full cursor-pointer bg-white/5 border border-white/10 text-neutral-300 ${
                                    originalColorsRef.current[selectedSubUuid]
                                      ? "hover:bg-white/10 active:scale-95"
                                      : "opacity-50 cursor-not-allowed"
                                  }`}
                                >
                                  Reset Warna
                                </button>
                              </div>

                              {/* Color presets grid to paint the subcomponent */}
                              <div className="flex flex-col gap-1 mt-1">
                                <span className="text-[8px] uppercase tracking-wider font-extrabold text-neutral-400">
                                  Ubah Warna Sub
                                </span>
                                <div className="grid grid-cols-7 gap-1">
                                  {[
                                    { name: "Merah", hex: "#ef4444" },
                                    { name: "Hijau", hex: "#10b981" },
                                    { name: "Biru", hex: "#3b82f6" },
                                    { name: "Kuning", hex: "#f59e0b" },
                                    { name: "Ungu", hex: "#a855f7" },
                                    { name: "Putih", hex: "#ffffff" },
                                  ].map((c) => (
                                    <button
                                      key={c.hex}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!selectedMesh) return;
                                        const materials = Array.isArray(
                                          selectedMesh.material,
                                        )
                                          ? selectedMesh.material
                                          : [selectedMesh.material];

                                        if (
                                          !originalColorsRef.current[
                                            selectedMesh.uuid
                                          ]
                                        ) {
                                          if (
                                            Array.isArray(selectedMesh.material)
                                          ) {
                                            originalColorsRef.current[
                                              selectedMesh.uuid
                                            ] = selectedMesh.material.map(
                                              (m) =>
                                                "color" in m
                                                  ? (
                                                      m.color as THREE.Color
                                                    ).clone()
                                                  : new THREE.Color(1, 1, 1),
                                            );
                                          } else {
                                            originalColorsRef.current[
                                              selectedMesh.uuid
                                            ] =
                                              "color" in selectedMesh.material
                                                ? (
                                                    selectedMesh.material
                                                      .color as THREE.Color
                                                  ).clone()
                                                : new THREE.Color(1, 1, 1);
                                          }
                                        }

                                        materials.forEach((mat) => {
                                          if (mat && "color" in mat) {
                                            (mat.color as THREE.Color).set(
                                              c.hex,
                                            );
                                          }
                                        });
                                        // Trigger minor update to re-render
                                        setRotationY((p) => p + 0.0001);
                                      }}
                                      style={{ backgroundColor: c.hex }}
                                      className="w-full h-4 rounded-md border border-white/20 hover:scale-110 active:scale-95 transition-all cursor-pointer shadow-sm"
                                      title={c.name}
                                    />
                                  ))}
                                  <label
                                    className="w-full h-4 rounded-md border border-white/20 hover:scale-110 active:scale-95 transition-all cursor-pointer shadow-sm flex items-center justify-center bg-gradient-to-r from-red-500 via-green-500 to-blue-500 overflow-hidden relative"
                                    title="Warna Kustom"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="color"
                                      className="absolute scale-150 opacity-0 cursor-pointer w-full h-full p-0 m-0"
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        if (!selectedMesh) return;
                                        const hex = e.target.value;
                                        const materials = Array.isArray(
                                          selectedMesh.material,
                                        )
                                          ? selectedMesh.material
                                          : [selectedMesh.material];

                                        if (
                                          !originalColorsRef.current[
                                            selectedMesh.uuid
                                          ]
                                        ) {
                                          if (
                                            Array.isArray(selectedMesh.material)
                                          ) {
                                            originalColorsRef.current[
                                              selectedMesh.uuid
                                            ] = selectedMesh.material.map(
                                              (m) =>
                                                "color" in m
                                                  ? (
                                                      m.color as THREE.Color
                                                    ).clone()
                                                  : new THREE.Color(1, 1, 1),
                                            );
                                          } else {
                                            originalColorsRef.current[
                                              selectedMesh.uuid
                                            ] =
                                              "color" in selectedMesh.material
                                                ? (
                                                    selectedMesh.material
                                                      .color as THREE.Color
                                                  ).clone()
                                                : new THREE.Color(1, 1, 1);
                                          }
                                        }

                                        materials.forEach((mat) => {
                                          if (mat && "color" in mat) {
                                            (mat.color as THREE.Color).set(hex);
                                          }
                                        });
                                        setRotationY((p) => p + 0.0001);
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            </>
                          ) : null}

                          {/* Sub-mesh actions: Remove / Detach */}
                          {isAdmin ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!selectedMesh) return;

                                if (selectedMesh.parent) {
                                  selectedMesh.parent.remove(selectedMesh);
                                }

                                // Temporarily restore group scale to standard multiplier to get true world coords
                                const originalScale =
                                  groupRef.current!.scale.clone();
                                groupRef.current!.scale.setScalar(
                                  scaleMultiplier,
                                );
                                groupRef.current!.updateMatrixWorld(true);

                                selectedMesh.geometry.computeBoundingBox();
                                // 1. Calculate true absolute world center of the mesh
                                const localCenter = new THREE.Vector3();
                                if (selectedMesh.geometry.boundingBox) {
                                  selectedMesh.geometry.boundingBox.getCenter(
                                    localCenter,
                                  );
                                }

                                // Ensure group correctly reflects scaleMultiplier to measure exact world placement
                                groupRef.current!.scale.setScalar(
                                  scaleMultiplier,
                                );
                                groupRef.current!.updateMatrixWorld(true);

                                const scaledWorldCenter = localCenter.clone();
                                selectedMesh.localToWorld(scaledWorldCenter);

                                // 2. Set group scale to 1.0 so we capture the pure, unscaled matrix (since ExtractedObject applies scaleMultiplier natively)
                                groupRef.current!.scale.setScalar(1.0);
                                groupRef.current!.updateMatrixWorld(true);

                                const unscaledWorldCenter = localCenter.clone();
                                selectedMesh.localToWorld(unscaledWorldCenter);

                                // 3. Clone mesh without mutating geometry
                                const clonedMesh = selectedMesh.clone();

                                // 4. Extract pure unscaled world components natively
                                // Ensure matrices are fully updated
                                selectedMesh.updateMatrixWorld(true);

                                // Bake the exact world transform into the geometry so the GLB is perfectly 1:1
                                clonedMesh.geometry = clonedMesh.geometry.clone();
                                clonedMesh.geometry.applyMatrix4(selectedMesh.matrixWorld);
                                
                                // Center the geometry around origin and use its true center as spawn position
                                clonedMesh.geometry.computeBoundingBox();
                                const box = clonedMesh.geometry.boundingBox!;
                                const trueWorldCenter = box.getCenter(new THREE.Vector3());
                                clonedMesh.geometry.center();

                                // Reset mesh transform to pure origin/identity
                                clonedMesh.position.set(0, 0, 0);
                                clonedMesh.quaternion.identity();
                                clonedMesh.scale.set(1, 1, 1);

                                // Ensure matrix auto-update handles everything normally
                                clonedMesh.matrixAutoUpdate = true;
                                clonedMesh.updateMatrix();

                                // 5. Clean up relations
                                clonedMesh.removeFromParent();
                                clonedMesh.castShadow = false;
                                clonedMesh.receiveShadow = false;
                                clonedMesh.frustumCulled = false;

                                // Fix materials to prevent visibility glitches and ensure double-sided drawing
                                if (clonedMesh.material) {
                                  if (Array.isArray(clonedMesh.material)) {
                                    clonedMesh.material =
                                      clonedMesh.material.map((m) => {
                                        const nm = m.clone();
                                        nm.side = THREE.DoubleSide;
                                        return nm;
                                      });
                                  } else {
                                    clonedMesh.material =
                                      clonedMesh.material.clone();
                                    clonedMesh.material.side = THREE.DoubleSide;
                                  }
                                }

                                if (onExtractMesh) {
                                  onExtractMesh(
                                    clonedMesh,
                                    [
                                      trueWorldCenter.x,
                                      trueWorldCenter.y,
                                      trueWorldCenter.z,
                                    ],
                                    1.0,
                                  );
                                }

                                // 6. Completely detach original from the main group object
                                selectedMesh.removeFromParent();

                                // Restore group scale
                                groupRef.current!.scale.copy(originalScale);
                                groupRef.current!.updateMatrixWorld(true);

                                // Remove from sub-meshes list
                                setSubMeshesList((prev) =>
                                  prev.filter(
                                    (m) => m.uuid !== selectedMesh.uuid,
                                  ),
                                );
                                selectMeshByUuid(null);
                              }}
                              className="text-[10px] mt-1.5 px-2.5 py-1 rounded-md font-bold transition-all w-full flex items-center justify-center gap-1 cursor-pointer bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30"
                            >
                              🗑️ Copot / Pindahkan Sub-Komponen Ke Luar
                            </button>
                          ) : (
                            <div className="text-[10px] text-neutral-400 italic bg-white/5 border border-white/10 rounded-lg p-2.5 text-center mt-1 select-none flex items-center justify-center gap-1.5 leading-normal">
                              <Lock className="w-3 h-3 text-neutral-500 shrink-0" />
                              <span>
                                Login diperlukan untuk memisahkan bagian
                                sub-mesh
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  {/* Reset button & dismiss guide info */}
                  <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/10 text-[9px] text-neutral-400">
                    {isAdmin ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setScaleMultiplier(1.0);
                        }}
                        className="hover:text-white hover:underline cursor-pointer"
                      >
                        Reset Skala
                      </button>
                    ) : (
                      <div />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(false);
                        selectMeshByUuid(null);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white/95 text-[9px] font-bold px-2.5 py-1 rounded-md transition-all cursor-pointer hover:text-white border border-indigo-400/20"
                    >
                      Selesai & Tutup ×
                    </button>
                  </div>
                  </>
                  )}
                </div>
              ) : null}
              </div>,
              document.body
            )}
          </>
        )}
    </group>
    </>
  );
}

export const InteractiveObject: React.FC<{ model: THREE.Group; onSelect?: (e: any) => void }> = ({ model, onSelect }) => {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;

    // Pasang metadata pada setiap mesh agar dapat di-klik laser VR
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.userData.isInteractableMesh = true;
        child.userData.onClick = (event: any) => {
          console.log("Mesh diklik via VR Laser:", child.name || child.uuid);
          if (onSelect) onSelect(event);
        };
      }
    });

    // Pasang listener di root container juga
    groupRef.current.userData = {
      isInteractableMesh: true,
      onClick: (e: any) => {
        const clickedMesh = e?.object;
        console.log("Root Object Diklik. Target sub-mesh:", clickedMesh?.name);
        if (onSelect) onSelect(e);
      },
    };
  }, [model, onSelect]);

  return (
    <primitive
      ref={groupRef}
      object={model}
      onClick={(e: any) => {
        e.stopPropagation();
        groupRef.current?.userData?.onClick?.(e);
      }}
    />
  );
};

