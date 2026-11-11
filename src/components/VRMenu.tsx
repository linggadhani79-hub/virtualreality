import * as THREE from 'three';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { triggerQuestHaptics } from './QuestControllerManager';

interface VRButtonProps {
  position?: [number, number, number];
  text: string;
  onClick: (e: any) => void;
  color?: string;
  icon?: string;
  scale?: number;
  width?: number;
  height?: number;
}

export function VRButton({
  position = [0, 0, 0],
  text,
  onClick,
  color = "#4f46e5",
  icon,
  scale = 1,
  width = 1.4,
  height = 0.45,
}: VRButtonProps) {
  const [hovered, setHovered] = useState(false);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const activeColor = hovered ? '#6366f1' : color;

      // Clear background
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw rounded rectangle background
      const radius = 36;
      const margin = 8;
      const w = canvas.width - margin * 2;
      const h = canvas.height - margin * 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(margin, margin, w, h, radius);
      } else {
        ctx.rect(margin, margin, w, h);
      }

      // Fill background
      ctx.fillStyle = activeColor;
      ctx.fill();

      // Stroke border for 3D visibility
      ctx.lineWidth = 8;
      ctx.strokeStyle = hovered ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
      ctx.stroke();

      // Draw crisp text
      const displayText = icon ? `${icon} ${text}` : text;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Text shadow for high contrast inside VR
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;

      ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [text, color, icon, hovered]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <group position={position} scale={scale}>
      <mesh
        userData={{
          isVRButton: true,
          isInteractableMesh: true,
          onClick: (e: any) => {
            onClick(e);
          },
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={texture}
          transparent={true}
          side={THREE.DoubleSide}
          depthTest={true}
        />
      </mesh>
    </group>
  );
}

interface VRInfoCard3DProps {
  position?: [number, number, number];
  title: string;
  description?: string;
  scale?: number;
  width?: number;
  height?: number;
}

export function VRInfoCard3D({
  position = [0, 0, 0],
  title,
  description = "",
  scale = 1,
  width = 2.0,
  height = 0.9,
}: VRInfoCard3DProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Card background
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 28);
      } else {
        ctx.rect(10, 10, canvas.width - 20, canvas.height - 20);
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fill();

      // Border
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      // Title
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`⚡ ${title}`, 36, 64);

      // Divider line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(36, 88);
      ctx.lineTo(canvas.width - 36, 88);
      ctx.stroke();

      // Description with word wrapping
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '24px sans-serif';
      const words = (description || "Komponen Kendaraan Listrik Interaktif.").split(' ');
      let line = '';
      let y = 125;
      const maxWidth = canvas.width - 72;
      const lineHeight = 32;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, 36, y);
          line = words[n] + ' ';
          y += lineHeight;
          if (y > canvas.height - 30) break;
        } else {
          line = testLine;
        }
      }
      if (y <= canvas.height - 30) {
        ctx.fillText(line, 36, y);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [title, description]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <group position={position} scale={scale}>
      <mesh
        userData={{ isInteractableMesh: true }}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={texture}
          transparent={true}
          side={THREE.DoubleSide}
          depthTest={true}
        />
      </mesh>
    </group>
  );
}

export const VRControllersAndLasers: React.FC = () => {
  const { gl, scene, camera } = useThree();
  const controllersRef = useRef<{ c0: THREE.Group; c1: THREE.Group } | null>(null);
  const tempMatrix = useRef(new THREE.Matrix4());
  const raycaster = useRef(new THREE.Raycaster());

  useEffect(() => {
    const xr = gl.xr;
    if (!xr) return;

    // Laser material and geometry
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -4.5),
    ]);
    const laserMat0 = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });
    const laserMat1 = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });

    const laser0 = new THREE.Line(laserGeo, laserMat0);
    const laser1 = new THREE.Line(laserGeo, laserMat1);
    laser0.userData.isLaser = true;
    laser1.userData.isLaser = true;

    const c0 = xr.getController(0);
    const c1 = xr.getController(1);

    c0.add(laser0);
    c1.add(laser1);

    controllersRef.current = { c0, c1 };

    // Select/Click Trigger Event
    const handleSelect = (event: any) => {
      const controller = event.target as THREE.Group;
      if (!controller) return;

      tempMatrix.current.identity().extractRotation(controller.matrixWorld);
      raycaster.current.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.current.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix.current);

      // Safe camera setup
      const activeCam = (gl.xr?.isPresenting && (gl.xr as any).getCamera)
        ? ((gl.xr as any).getCamera() || camera)
        : camera;
      (raycaster.current as any).camera = activeCam;

      let intersects: THREE.Intersection[] = [];
      try {
        intersects = raycaster.current.intersectObjects(scene.children, true);
      } catch {
        intersects = [];
      }

      for (const hit of intersects) {
        if (hit.object.userData?.isLaser) continue;
        let curr: THREE.Object3D | null = hit.object;
        while (curr) {
          if (curr.userData && typeof curr.userData.onClick === "function") {
            triggerQuestHaptics(0.9, 80);
            curr.userData.onClick({ object: hit.object, point: hit.point, stopPropagation: () => {} });
            return;
          }
          curr = curr.parent;
        }
      }
    };

    c0.addEventListener("select", handleSelect);
    c1.addEventListener("select", handleSelect);

    return () => {
      c0.removeEventListener("select", handleSelect);
      c1.removeEventListener("select", handleSelect);
      c0.remove(laser0);
      c1.remove(laser1);
    };
  }, [gl, scene, camera]);

  // Frame Loop for Dynamic Laser Color Feedback (Hover)
  useFrame(() => {
    if (!controllersRef.current || !gl.xr || !gl.xr.isPresenting) return;
    const { c0, c1 } = controllersRef.current;

    const activeCam = (gl.xr?.isPresenting && (gl.xr as any).getCamera)
      ? ((gl.xr as any).getCamera() || camera)
      : camera;
    (raycaster.current as any).camera = activeCam;

    [c0, c1].forEach((controller) => {
      const line = controller.children.find((c) => c instanceof THREE.Line) as THREE.Line;
      if (!line) return;

      tempMatrix.current.identity().extractRotation(controller.matrixWorld);
      raycaster.current.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.current.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix.current);

      let intersects: THREE.Intersection[] = [];
      try {
        intersects = raycaster.current.intersectObjects(scene.children, true);
      } catch {
        intersects = [];
      }

      let foundInteractable = false;

      for (const hit of intersects) {
        if (hit.object.userData?.isLaser) continue;
        let curr: THREE.Object3D | null = hit.object;
        while (curr) {
          if (curr.userData && (curr.userData.onClick || curr.userData.isInteractableMesh || curr.userData.isVRButton)) {
            foundInteractable = true;
            break;
          }
          curr = curr.parent;
        }
        if (foundInteractable) break;
      }

      const mat = line.material as THREE.LineBasicMaterial;
      if (foundInteractable) {
        mat.color.setHex(0xfbbf24); // Gold lock-on
        mat.opacity = 0.95;
      } else {
        mat.color.setHex(0x00f0ff); // Cyan idle
        mat.opacity = 0.5;
      }
    });
  });

  return null;
};

