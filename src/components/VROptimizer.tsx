import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface VROptimizerProps {
  isPresenting?: boolean;
}

export const VROptimizer: React.FC<VROptimizerProps> = ({ isPresenting }) => {
  const { gl, scene } = useThree();
  const prevPixelRatio = useRef(1);

  useEffect(() => {
    const handleSessionStart = () => {
      const session = gl.xr?.getSession?.();
      if (!session) return;

      // 1. Store and set optimal pixel ratio for VR (VR displays already have high native resolution)
      prevPixelRatio.current = gl.getPixelRatio();
      gl.setPixelRatio(1.0);

      // 2. Set 90Hz / 72Hz Target Framerate on Quest
      if (typeof (session as any).updateTargetFrameRate === 'function') {
        const supported = (session as any).supportedFrameRates;
        if (supported && supported.includes(90)) {
          (session as any).updateTargetFrameRate(90).catch(() => {});
        } else if (supported && supported.includes(72)) {
          (session as any).updateTargetFrameRate(72).catch(() => {});
        }
      }

      // 3. Fixed Foveated Rendering for Quest 2/3/Pro (Massive GPU fill-rate boost)
      try {
        const baseLayer = (session as any).renderState?.baseLayer;
        if (baseLayer && "fixedFoveation" in baseLayer) {
          baseLayer.fixedFoveation = 1.0;
        }
        if (typeof (gl.xr as any).setFoveation === 'function') {
          (gl.xr as any).setFoveation(1.0);
        }
      } catch (e) {
        console.warn("[VROptimizer] Foveation setting not supported:", e);
      }

      // 4. Optimal framebuffer scale factor
      try {
        if (typeof (gl.xr as any).setFramebufferScaleFactor === 'function') {
          (gl.xr as any).setFramebufferScaleFactor(0.95);
        }
      } catch {}

      // 5. Disable shadow maps in WebGL renderer during VR for maximum fill-rate
      gl.shadowMap.enabled = false;
      gl.shadowMap.autoUpdate = false;

      // 6. Disable shadows on scene lights and meshes
      scene.traverse((object) => {
        if (object instanceof THREE.Light) {
          object.castShadow = false;
        }
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = false;
        }
      });
    };

    const handleSessionEnd = () => {
      gl.shadowMap.enabled = true;
      gl.shadowMap.autoUpdate = true;
      gl.setPixelRatio(prevPixelRatio.current || window.devicePixelRatio || 1);
    };

    if (gl.xr) {
      gl.xr.addEventListener("sessionstart", handleSessionStart);
      gl.xr.addEventListener("sessionend", handleSessionEnd);
      if (gl.xr.isPresenting || isPresenting) {
        handleSessionStart();
      }
    }

    return () => {
      if (gl.xr) {
        gl.xr.removeEventListener("sessionstart", handleSessionStart);
        gl.xr.removeEventListener("sessionend", handleSessionEnd);
      }
    };
  }, [gl, scene, isPresenting]);

  return null;
};

