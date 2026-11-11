import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

export async function optimizeCADModelForVR(
  model: THREE.Object3D, 
  onProgress?: (msg: string) => void
): Promise<THREE.Object3D> {
  const clonedModel = model.clone();
  clonedModel.updateMatrixWorld(true);

  let totalPolygons = 0;
  let removedParts = 0;
  const meshes: THREE.Mesh[] = [];

  // 1. Gather all meshes and calculate total volume/size to find "internal/small" parts
  const parentBox = new THREE.Box3().setFromObject(clonedModel);
  const parentSize = parentBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(parentSize.x, parentSize.y, parentSize.z);
  
  // A threshold for "small parts" (e.g., less than 2% of the total size)
  const smallThreshold = maxDim * 0.02;

  clonedModel.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
      if (child.geometry.index) {
        totalPolygons += child.geometry.index.count / 3;
      } else if (child.geometry.attributes.position) {
        totalPolygons += child.geometry.attributes.position.count / 3;
      }
    }
  });

  onProgress?.(`Found ${meshes.length} parts, ~${Math.round(totalPolygons).toLocaleString()} polygons. Filtering...`);

  // 2. Filter small parts and prepare for simplification
  const meshesToKeep: THREE.Mesh[] = [];
  
  for (const mesh of meshes) {
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const meshMaxDim = Math.max(size.x, size.y, size.z);

    // If it's extremely small relative to the main object, it's likely a tiny screw or internal component
    if (meshMaxDim < smallThreshold) {
      mesh.removeFromParent();
      removedParts++;
      continue;
    }
    
    meshesToKeep.push(mesh);
  }

  onProgress?.(`Removed ${removedParts} tiny parts. Simplifying geometry...`);

  // 3. Decimation (Simplifying Polygons)
  const modifier = new SimplifyModifier();
  
  // We want to reduce polygons by 50% for high-poly objects
  let processed = 0;
  // Use a short timeout to not freeze the UI entirely for each mesh
  for (const mesh of meshesToKeep) {
    let geo = mesh.geometry;
    
    // Simplification works best on indexed geometry, if it's not indexed, try to convert it (basic attempt)
    // Three.js SimplifyModifier requires indexed geometry.
    if (!geo.index && geo.attributes.position) {
       // We skip non-indexed or too small geometries to avoid breaking them
       if (geo.attributes.position.count < 1000) {
         processed++;
         continue;
       }
    }

    try {
      const vertexCount = geo.attributes.position.count;
      // Only simplify if it's heavy (e.g., > 3000 vertices)
      if (vertexCount > 3000) {
        const targetCount = Math.floor(vertexCount * 0.5); // 50% reduction
        const simplifiedGeo = modifier.modify(geo, targetCount);
        mesh.geometry = simplifiedGeo;
        geo.dispose(); // clean up old geometry
      }
    } catch (e) {
      console.warn("Failed to simplify a mesh", e);
    }
    
    processed++;
    if (processed % 10 === 0) {
       await new Promise(resolve => setTimeout(resolve, 0)); // yield to render thread
    }
  }

  onProgress?.(`Optimizing materials & pivots...`);

  // 4. Material Baking (Convert to Basic/Lambert to save shader costs) & Pivot centering
  meshesToKeep.forEach(mesh => {
    // Disable shadows
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    
    // Replace standard/physical materials with a cheaper alternative like MeshLambertMaterial
    // Lambert calculates lighting per-vertex instead of per-pixel (PBR), huge save for VR.
    if (mesh.material) {
      const convertMaterial = (mat: any) => {
        const newMat = new THREE.MeshLambertMaterial({
          color: mat.color || 0xcccccc,
          map: mat.map || null,
          side: mat.side !== undefined ? mat.side : THREE.FrontSide,
          transparent: mat.transparent || false,
          opacity: mat.opacity !== undefined ? mat.opacity : 1.0,
          alphaTest: mat.alphaTest || 0,
        });
        return newMat;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(convertMaterial);
      } else {
        mesh.material = convertMaterial(mesh.material);
      }
    }
  });

  // 5. Center the pivot globally
  const finalBox = new THREE.Box3().setFromObject(clonedModel);
  const center = finalBox.getCenter(new THREE.Vector3());
  
  // Shift all children so the parent origin is at the bottom-center
  clonedModel.children.forEach(child => {
    child.position.x -= center.x;
    child.position.y -= finalBox.min.y; // bottom
    child.position.z -= center.z;
  });

  onProgress?.(`Optimization Complete!`);
  return clonedModel;
}
