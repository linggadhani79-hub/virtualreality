import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { globalUploadedModels } from "../App";
import { saveWorkspaceData } from "../lib/store";

let exportWorkspaceGlobal: () => Promise<void>;
let saveTimeout: any = null;
export const exportedBufferIds = new Map<string, string | undefined>();

export function WorkspaceManager() {
  useEffect(() => {
    const handleForceSave = () => {
      saveWorkspaceNow();
    };
    window.addEventListener('force-workspace-save', handleForceSave);
    return () => window.removeEventListener('force-workspace-save', handleForceSave);
  }, []);

  const { scene } = useThree();

  useEffect(() => {
    exportWorkspaceGlobal = async () => { 
      console.log("exportWorkspaceGlobal started");
      const exportList: any[] = [];

      const models = typeof (window as any).getGlobalUploadedModels === 'function' 
        ? (window as any).getGlobalUploadedModels() 
        : globalUploadedModels;
        
      for (const model of models) {
        // preserve all model properties
        const rawExportItem = {
          ...model,
          // ensure bufferId is present
          bufferId: model.bufferId || `asset-${model.type}-${model.id}`,
          // if it has a blob url but no download url, we mark it extracted (not applicable here usually)
          savedType: "uploaded",
        } as any;
        
        const exportItem = JSON.parse(JSON.stringify(rawExportItem));
        exportList.push(exportItem);
        if (exportItem.type === 'screen') {
          console.log('Saving screen:', exportItem.videoUrl);
        }
      }

      try {
        await saveWorkspaceData(exportList);
      } catch (err) {
        console.error("Failed to save workspace", err);
      }
    };
  }, [scene]);

  return null;
}

export const saveWorkspaceNow = async () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  if (exportWorkspaceGlobal) {
    await exportWorkspaceGlobal();
  }
};

export const triggerWorkspaceSave = async () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  return new Promise<void>((resolve) => {
    saveTimeout = setTimeout(async () => {
      try {
        if (exportWorkspaceGlobal) {
          await exportWorkspaceGlobal();
        }
      } catch (err) {
        console.warn("Background save failed:", err);
      }
      resolve();
    }, 2500); // Wait 2.5 seconds after last trigger to actually save
  });
};
