import * as THREE from "three";

/**
 * Shared interaction helpers used by both the Quest laser pointers and the
 * phone-VR gaze cursor, so every input method triggers objects the same way.
 */

/** Meshes worth raycasting against (skips laser helpers, lines and hidden objects). */
export function collectRaycastCandidates(scene: THREE.Scene): THREE.Object3D[] {
  const list: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (!child.visible) return;
    if (child.userData?.isLaserHelper || child.name?.startsWith("VR_")) return;
    if (child.type === "Line" || child.type === "LineSegments") return;
    if (child instanceof THREE.Mesh) list.push(child);
  });
  return list;
}

/** Walk up the hierarchy to the nearest object that reacts to a click. */
export function findInteractable(obj: THREE.Object3D | null, scene: THREE.Scene): THREE.Object3D | null {
  let curr = obj;
  while (curr && curr !== scene) {
    if (
      curr.userData?.isInteractableMesh ||
      curr.userData?.isVRButton ||
      typeof curr.userData?.onClick === "function" ||
      typeof curr.userData?.onSelect === "function" ||
      curr.userData?.isExplodable ||
      curr.userData?.type === "uploaded" ||
      curr.userData?.type === "screen"
    ) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

/** Fire the click handlers of `target` (and the nearest ancestor that has one). */
export function dispatchVRSelect(
  target: THREE.Object3D,
  point: THREE.Vector3,
  scene: THREE.Scene,
  extra: Record<string, unknown> = {},
) {
  const simulatedEvent = {
    object: target,
    point: point.clone(),
    distance: 0,
    stopPropagation: () => {},
    nativeEvent: {},
    ...extra,
  };

  const call = (fn: unknown, label: string) => {
    if (typeof fn !== "function") return false;
    try {
      fn(simulatedEvent);
    } catch (err) {
      console.error(`[vrInteract] ${label} error:`, err);
    }
    return true;
  };

  call(target.userData?.onClick, "onClick");
  call(target.userData?.onSelect, "onSelect");

  let parent: THREE.Object3D | null = target.parent;
  while (parent && parent !== scene) {
    if (call(parent.userData?.onClick, "parent onClick")) break;
    if (call(parent.userData?.onSelect, "parent onSelect")) break;
    parent = parent.parent;
  }

  try {
    (target as any).dispatchEvent({ type: "click", ...simulatedEvent });
    (target as any).dispatchEvent({ type: "pointerdown", ...simulatedEvent });
    (target as any).dispatchEvent({ type: "pointerup", ...simulatedEvent });
  } catch {}
}
