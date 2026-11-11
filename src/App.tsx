/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  MapControls,
  Html,
  Environment,
  Lightformer,
  Grid,
  Sky,
} from "@react-three/drei";
import { XR, createXRStore, useXR, XROrigin } from "@react-three/xr";
import * as THREE from "three";
import { HumanCharacter } from "./components/HumanCharacter";
import { VirtualJoystick, joystickState } from "./components/VirtualJoystick";
import { QuestControllerModal, QuestControllerToast, QuestLocomotion, updateQuestGamepadState, notifyQuestToast, triggerQuestHaptics } from "./components/QuestControllerManager";
import { useKeyboardKeys } from "./hooks/useKeyboardKeys";
import { UploadedObject, InteractiveObject } from "./components/UploadedObject";
import { VideoScreenObject } from "./components/VideoScreenObject";
import type { UploadedModelData } from "./components/ModelUploader";
import { AuthButton } from "./components/AuthButton";
import { VROptimizer } from "./components/VROptimizer";
import { WebXRControllerManager } from "./components/WebXRControllerManager";
import { EVEntranceScreen } from "./components/EVEntranceScreen";
import { GuardianBoundary } from "./components/GuardianBoundary";
import { TRIAL_NO_AUTH, LOCAL_ONLY } from "./lib/appConfig";
import { SampleEVCar } from "./components/SampleEVCar";
import { TestLabEnvironment } from "./components/TestLabEnvironment";
import { PhoneVRRenderer, PhoneVROverlay } from "./components/PhoneVR";
import { phoneVR, startPhoneVR, stopPhoneVR } from "./lib/phoneVR";

// Panel khusus admin dimuat belakangan supaya siswa (Quest / HP) membuka aplikasi lebih cepat
const ModelUploader = lazy(() => import("./components/ModelUploader").then((m) => ({ default: m.ModelUploader })));
const MapBackupModal = lazy(() => import("./components/MapBackupModal").then((m) => ({ default: m.MapBackupModal })));
import { Volume2 } from "lucide-react";

import {
  WorkspaceManager,
  triggerWorkspaceSave, saveWorkspaceNow,
  exportedBufferIds,
} from "./components/WorkspaceManager";
import { getWorkspaceData, getAsset } from "./lib/store";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export let globalUploadedModels: UploadedModelData[] = [];
export let globalCameraPosition = new THREE.Vector3(0, 3, 8);
export let globalCameraDirection = new THREE.Vector3(0, 0, -1);

// Detect Mobile Platform
const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

const store = createXRStore({
  controller: false,
  // Emulator bawaan tidak cocok dengan versi three.js proyek ini (error saat render), jadi dimatikan
  emulate: false,
  // "bounded-floor" memberi akses ke batas ruang (Guardian) headset; opsional agar HP tetap bisa masuk VR
  customSessionInit: {
    requiredFeatures: ["local-floor"],
    optionalFeatures: ["bounded-floor", "hand-tracking", "layers"],
  },
});

// Pre-allocated reusable objects for Player movement and collision to eliminate GC stuttering
const tempFloorRayOrigin = new THREE.Vector3();
const tempFloorRayDir = new THREE.Vector3(0, -1, 0);
const tempMoveDir = new THREE.Vector3();
const tempOldPos = new THREE.Vector3();
const tempTargetPos = new THREE.Vector3();
const tempTargetPosX = new THREE.Vector3();
const tempTargetPosZ = new THREE.Vector3();
const tempRayOrigin = new THREE.Vector3();
const tempRayDir = new THREE.Vector3();
const tempEuler = new THREE.Euler(0, 0, 0, "YXZ");
const tempQuaternion = new THREE.Quaternion();
const tempHeadPos = new THREE.Vector3();
const tempNewHeadPos = new THREE.Vector3();
const tempExpandedBox = new THREE.Box3();
const tempRay = new THREE.Ray();
const tempTargetPosVec = new THREE.Vector3();

function UserFootprintMarker({ isNearWallRef }: { isNearWallRef: React.MutableRefObject<boolean> }) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const dotMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (pulseRef.current) {
      const s = 1 + Math.sin(t * 4) * 0.12;
      pulseRef.current.scale.set(s, s, 1);
    }
    const isNear = isNearWallRef.current;
    if (ringMatRef.current && dotMatRef.current) {
      const targetColor = isNear ? "#ef4444" : "#38bdf8";
      ringMatRef.current.color.lerp(new THREE.Color(targetColor), 0.2);
      dotMatRef.current.color.lerp(new THREE.Color(isNear ? "#f87171" : "#00f0ff"), 0.2);
    }
  });

  return (
    <group position={[0, 0.015, 0]}>
      {/* 1. Center Position Dot (Titik Posisi Kaki Pengguna) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.15, 32]} />
        <meshBasicMaterial ref={dotMatRef} color="#00f0ff" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* 2. Safety Collision Boundary Ring (Lingkaran Batas Tubuh / Tabrakan) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.38, 0.44, 32]} />
        <meshBasicMaterial ref={ringMatRef} color="#38bdf8" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Pulsing Outer Alert Ring */}
      <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.48, 0.52, 32]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* 3. Forward Movement Pointer Arrow (Panah Arah Hadap) */}
      <mesh position={[0, 0.005, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.1, 0.22, 3]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function VRFloorIndicator() {
  const ringRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const isPresenting = useXR((s) => s.session != null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.y = t * 0.3;
    }
    if (pulseRef.current) {
      const s = 1 + Math.sin(t * 3) * 0.15;
      pulseRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group position={[0, 0.005, 0]}>
      {/* START POINT DOT & CENTER RETICLE (Titik Mulai VR) */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.12, 32]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* Pulsing Target Dot Ring */}
      <mesh ref={pulseRef} position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertical Light Beacon Beam at Start Point */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.15, 2.4, 16, 1, true]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Direction Crosshairs & Forward Arrow */}
      <mesh position={[0, 0.015, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.25, 3]} />
        <meshBasicMaterial color="#00ffcc" transparent opacity={0.8} />
      </mesh>

      {/* Crosshair Lines (+ Axis) */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.04, 1.2]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.04, 1.2]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* Standing Zone Ring */}
      <group ref={ringRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.6, 36]} />
          <meshBasicMaterial color="#00f0ff" side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
      </group>
    </group>
  );
}

function Player({
  viewMode,
  yaw,
  pitch,
}: {
  viewMode: "tpp" | "fpp" | "dev";
  yaw: React.MutableRefObject<number>;
  pitch: React.MutableRefObject<number>;
}) {
  const playerRef = useRef<THREE.Group>(null);
  const characterRef = useRef<THREE.Group>(null);
  const keys = useKeyboardKeys();
  const isMovingRef = useRef(false);
  const solidGroupsRef = useRef<THREE.Object3D[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const lastSolidUpdateRef = useRef(0);
  const smoothYawVelRef = useRef(0);
  const smoothVelocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const { camera, scene, gl } = useThree();

  // Use XR hook to check if in VR
  const isPresenting = useXR(
    (state) => state.session !== undefined && state.session !== null,
  );

  const [isNearWall, setIsNearWall] = useState(false);
  const isNearWallRef = useRef(false);

  // Initialize player to spawn position [0, 0, 0] on mount
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.position.set(0, 0, 0);
      playerRef.current.rotation.set(0, 0, 0);
    }
  }, []);

  // Ensure exact spawn point alignment upon entering WebXR / Meta Quest VR
  useEffect(() => {
    const handleSessionStart = () => {
      if (playerRef.current) {
        playerRef.current.position.set(0, 0, 0);
        playerRef.current.rotation.set(0, 0, 0);
      }
      yaw.current = 0;
      pitch.current = 0;
    };

    const xr = gl.xr;
    if (xr) {
      xr.addEventListener("sessionstart", handleSessionStart);
      return () => {
        xr.removeEventListener("sessionstart", handleSessionStart);
      };
    }
  }, [gl, yaw, pitch]);

  // Initialize yaw to player's current angle when transitioning to first person
  useEffect(() => {
    if (viewMode === "fpp" && playerRef.current) {
      yaw.current = playerRef.current.rotation.y;
      pitch.current = 0;
    } else if (viewMode === "dev" && playerRef.current) {
      camera.position.set(playerRef.current.position.x, 20, playerRef.current.position.z + 20);
      camera.lookAt(playerRef.current.position);
    }
  }, [viewMode, yaw, pitch, camera]);

  useFrame((state, rawDelta) => {
    if (!playerRef.current) return;
    const delta = Math.min(rawDelta, 0.05);

    let moveX = joystickState.x;
    let moveZ = -joystickState.y; // Invert joystick Y to move forward (negative Z)

    if (keys["KeyW"] || keys["ArrowUp"]) moveZ -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) moveZ += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) moveX -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) moveX += 1;

    // VR HP (Cardboard): tahan layar untuk berjalan ke arah pandangan
    if (phoneVR.active && phoneVR.walking) moveZ -= 0.4; // pelan agar tidak pusing

    // WebXR / Meta Quest 2 Controller Thumbstick & Button Inputs
    const session = state.gl.xr?.getSession();
    const questData = updateQuestGamepadState(session);

    if (questData.connected) {
      // Left Stick Movement (forward / back / strafe)
      moveX += questData.leftStick.x;
      moveZ += questData.leftStick.y;

      // Right Stick Smooth Rotation (Yaw / Turn Camera) with Deadzone & Power Curve
      if (Math.abs(questData.rightStick.x) > 0.01) {
        const rawStick = questData.rightStick.x;
        const sign = Math.sign(rawStick);
        const curved = sign * Math.pow(Math.abs(rawStick), 1.25);
        const targetTurnSpeed = curved * 2.2; // 2.2 rad/s smooth turn

        smoothYawVelRef.current = THREE.MathUtils.lerp(
          smoothYawVelRef.current,
          targetTurnSpeed,
          Math.min(1, 22 * delta)
        );
      } else {
        smoothYawVelRef.current = THREE.MathUtils.lerp(
          smoothYawVelRef.current,
          0,
          Math.min(1, 20 * delta)
        );
      }

      // Secondary movement fallback from right stick if left stick is idle
      if (Math.abs(questData.leftStick.x) < 0.05 && Math.abs(questData.leftStick.y) < 0.05 && Math.abs(questData.rightStick.y) > 0.1) {
        moveZ += questData.rightStick.y;
      }
    } else {
      smoothYawVelRef.current = 0;
    }

    // Apply Smooth Head-Centered VR Turning (Pivots directly around user eyes, no disorienting room swinging)
    if (Math.abs(smoothYawVelRef.current) > 0.0001) {
      const turnAmount = smoothYawVelRef.current * delta;
      if (isPresenting && playerRef.current) {
        camera.getWorldPosition(tempHeadPos);
        playerRef.current.rotation.y -= turnAmount;
        playerRef.current.updateMatrixWorld(true);

        camera.getWorldPosition(tempNewHeadPos);
        playerRef.current.position.x += (tempHeadPos.x - tempNewHeadPos.x);
        playerRef.current.position.z += (tempHeadPos.z - tempNewHeadPos.z);
        playerRef.current.updateMatrixWorld(true);
      } else if (viewMode === "fpp" || viewMode === "tpp") {
        yaw.current -= turnAmount;
      } else if (playerRef.current) {
        playerRef.current.rotation.y -= turnAmount;
      }
    }

    // Relative movement based on camera orientation
    const rawMoveX = moveX;
    const rawMoveZ = moveZ;
    const isInputActive = Math.abs(rawMoveX) > 0.01 || Math.abs(rawMoveZ) > 0.01;
    
    // Collect solid groups and ensure Box3 bounds are calculated once
    if (viewMode !== "dev") {
      if (state.clock.elapsedTime - lastSolidUpdateRef.current > 1.0) {
        const newSolidGroups: THREE.Object3D[] = [];
        scene.traverse((child) => {
          if (child.userData && child.userData.type === "uploaded") {
            const childState = child.userData.state;
            if (childState && childState.isSolid) {
              if (!child.userData._box3) {
                child.userData._box3 = new THREE.Box3().setFromObject(child);
              }
              newSolidGroups.push(child);
            }
          }
        });
        solidGroupsRef.current = newSolidGroups;
        lastSolidUpdateRef.current = state.clock.elapsedTime;
      }
    }
    const solidGroups = solidGroupsRef.current;

    if (viewMode === "dev" && isInputActive) {
      if (state.controls) {
        const inputLen = Math.sqrt(rawMoveX * rawMoveX + rawMoveZ * rawMoveZ);
        const inputStrength = Math.min(1.0, inputLen);
        const normX = rawMoveX / (inputLen || 1);
        const normZ = rawMoveZ / (inputLen || 1);
        
        tempEuler.setFromQuaternion(camera.quaternion, "YXZ");
        tempMoveDir.set(normX, 0, normZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), tempEuler.y);
        
        const speed = 20 * delta * inputStrength;
        const controls = state.controls as any;
        controls.target.addScaledVector(tempMoveDir, speed);
        camera.position.addScaledVector(tempMoveDir, speed);
      }
    } else if (viewMode !== "dev") {
      const playerPos = playerRef.current.position;

      // Filter nearby solid objects (within 15m) for fast collision testing
      const nearbySolid = solidGroups.filter((g) => {
        return g.position.distanceToSquared(playerPos) < 225;
      });

      // Ultra-fast floor height detection using cached Box3 bounds
      let targetFloorY = 0;
      if (nearbySolid.length > 0) {
        for (let i = 0; i < nearbySolid.length; i++) {
          const g = nearbySolid[i];
          let box = g.userData._box3 as THREE.Box3 | undefined;
          if (box) {
            if (
              playerPos.x >= box.min.x - 0.2 &&
              playerPos.x <= box.max.x + 0.2 &&
              playerPos.z >= box.min.z - 0.2 &&
              playerPos.z <= box.max.z + 0.2
            ) {
              if (playerPos.y >= box.min.y - 0.5 && playerPos.y <= box.max.y + 1.5) {
                if (box.max.y > targetFloorY) {
                  targetFloorY = box.max.y;
                }
              }
            }
          }
        }
      }
      if (Math.abs(playerRef.current.position.y - targetFloorY) > 0.0001) {
        playerRef.current.position.y = THREE.MathUtils.lerp(
          playerRef.current.position.y,
          targetFloorY,
          Math.min(1, 15 * delta)
        );
      } else {
        playerRef.current.position.y = targetFloorY;
      }

      // Smooth Locomotion with Inertial Damping
      const inputLen = Math.sqrt(rawMoveX * rawMoveX + rawMoveZ * rawMoveZ);
      const inputStrength = Math.min(1.0, inputLen);
      const normX = isInputActive ? (rawMoveX / (inputLen || 1)) : 0;
      const normZ = isInputActive ? (rawMoveZ / (inputLen || 1)) : 0;

      const targetSpeed = isInputActive ? (inputStrength * 4.5) : 0;
      const targetVelX = normX * targetSpeed;
      const targetVelZ = normZ * targetSpeed;

      smoothVelocityRef.current.x = THREE.MathUtils.lerp(
        smoothVelocityRef.current.x,
        targetVelX,
        Math.min(1, (isInputActive ? 16 : 20) * delta)
      );
      smoothVelocityRef.current.z = THREE.MathUtils.lerp(
        smoothVelocityRef.current.z,
        targetVelZ,
        Math.min(1, (isInputActive ? 16 : 20) * delta)
      );

      const curSpeed = Math.sqrt(
        smoothVelocityRef.current.x * smoothVelocityRef.current.x +
        smoothVelocityRef.current.z * smoothVelocityRef.current.z
      );

      if (curSpeed > 0.01) {
        if (isPresenting) {
          // In 360 WebXR VR mode, calculate camera's true world orientation
          camera.getWorldQuaternion(tempQuaternion);
          tempEuler.setFromQuaternion(tempQuaternion, "YXZ");
          tempMoveDir.set(smoothVelocityRef.current.x / curSpeed, 0, smoothVelocityRef.current.z / curSpeed).applyAxisAngle(new THREE.Vector3(0, 1, 0), tempEuler.y);
        } else {
          tempEuler.setFromQuaternion(camera.quaternion, "YXZ");
          tempMoveDir.set(smoothVelocityRef.current.x / curSpeed, 0, smoothVelocityRef.current.z / curSpeed).applyAxisAngle(new THREE.Vector3(0, 1, 0), tempEuler.y);
        }
        
        isMovingRef.current = true;
        const frameSpeed = curSpeed * delta;
        tempOldPos.copy(playerRef.current.position);

        // Zero-overhead collision check using expanded Box3 bounds (no recursive raycasting)
        const checkCollision = (startPos: THREE.Vector3, targetPos: THREE.Vector3) => {
          if (nearbySolid.length === 0) return false;
          for (let i = 0; i < nearbySolid.length; i++) {
            const g = nearbySolid[i];
            let box = g.userData._box3 as THREE.Box3 | undefined;
            if (!box) {
              box = new THREE.Box3().setFromObject(g);
              g.userData._box3 = box;
            }
            tempExpandedBox.copy(box).expandByScalar(0.35);
            if (tempExpandedBox.containsPoint(targetPos)) {
              return true;
            }
          }
          return false;
        };

        // Try combined movement
        tempTargetPos.copy(tempOldPos).addScaledVector(tempMoveDir, frameSpeed);
        if (!checkCollision(tempOldPos, tempTargetPos)) {
          playerRef.current.position.x = tempTargetPos.x;
          playerRef.current.position.z = tempTargetPos.z;
        } else if (viewMode === "fpp" || viewMode === "tpp" || isPresenting) {
          // Try sliding along X
          if (Math.abs(tempMoveDir.x) > 0.01) {
            const speedX = frameSpeed * Math.sign(tempMoveDir.x);
            tempTargetPosX.copy(tempOldPos);
            tempTargetPosX.x += speedX;
            if (!checkCollision(tempOldPos, tempTargetPosX)) {
              playerRef.current.position.x = tempTargetPosX.x;
            }
          }

          // Try sliding along Z
          if (Math.abs(tempMoveDir.z) > 0.01) {
            tempTargetPosZ.copy(tempOldPos);
            tempTargetPosZ.z += frameSpeed * Math.sign(tempMoveDir.z);
            if (!checkCollision(tempOldPos, tempTargetPosZ)) {
              playerRef.current.position.z = tempTargetPosZ.z;
            }
          }
        }

        // Calculate character rotation in 2D mode
        if (!isPresenting) {
          const targetRotation = Math.atan2(tempMoveDir.x, tempMoveDir.z);
          const currentRotation = playerRef.current.rotation.y;

          // Smoothly rotate character model to face movement direction
          let diff = targetRotation - currentRotation;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;

          playerRef.current.rotation.y += diff * Math.min(1, 15 * delta);
        }
      } else {
        isMovingRef.current = false;
      }
    }
    if (!isPresenting) {
      if (viewMode === "tpp") {
        playerRef.current.visible = true;
        if (state.controls) {
          const controls = state.controls as any;
          tempTargetPosVec.set(
            playerRef.current.position.x,
            playerRef.current.position.y + 1,
            playerRef.current.position.z,
          );
          controls.minDistance = 2;
          controls.maxDistance = 12;
          if (controls.target.distanceToSquared(tempTargetPosVec) > 0.00001) {
            controls.target.lerp(tempTargetPosVec, Math.min(1, 10 * delta));
          } else {
            controls.target.copy(tempTargetPosVec);
          }
        }
      } else if (viewMode === "dev") {
        playerRef.current.visible = true;
      } else if (viewMode === "fpp") {
        // fpp/first person view
        playerRef.current.visible = false;
        // Place camera inside the player head
        camera.position.set(
          playerRef.current.position.x,
          playerRef.current.position.y + 1.2,
          playerRef.current.position.z,
        );
        if (phoneVR.active && phoneVR.hasOrientation) {
          // VR HP: kepala mengikuti giroskop, stik kanan / geser tetap memutar badan
          tempQuaternion.setFromAxisAngle(tempFloorRayDir, -yaw.current);
          camera.quaternion.copy(phoneVR.quaternion).premultiply(tempQuaternion);
        } else {
          camera.rotation.set(0, 0, 0);
          camera.rotation.order = "YXZ";
          camera.rotation.y = yaw.current;
          camera.rotation.x = pitch.current;
        }
      }
    }

    if (isPresenting && playerRef.current) {
      // Di VR, rig pemain harus terlihat: di dalamnya ada tangan/controller, penanda batas ruang
      // dan penanda kaki (mode FPV 2D menyembunyikan rig ini).
      playerRef.current.visible = true;
    }

    if (playerRef.current) {
      playerRef.current.rotation.x = 0;
      playerRef.current.rotation.z = 0;

      // Check distance to nearby solid objects for proximity alert
      let nearWall = false;
      if (solidGroupsRef.current.length > 0) {
        const pPos = playerRef.current.position;
        for (let i = 0; i < solidGroupsRef.current.length; i++) {
          const g = solidGroupsRef.current[i];
          let box = g.userData._box3 as THREE.Box3 | undefined;
          if (box && box.distanceToPoint(pPos) < 0.65) {
            nearWall = true;
            break;
          }
        }
      }
      isNearWallRef.current = nearWall;
    }

    globalCameraPosition.copy(camera.position);
    camera.getWorldDirection(globalCameraDirection);
  });

  return (
    <group ref={playerRef} position={[0, 0, 0]}>
      <XROrigin>
        <GuardianBoundary />
      </XROrigin>
      <UserFootprintMarker isNearWallRef={isNearWallRef} />
      <group visible={!isPresenting && viewMode !== "fpp"}>
        <HumanCharacter ref={characterRef} isMovingRef={isMovingRef} />
      </group>
    </group>
  );
}

function SceneBridge({ onScene }: { onScene: (scene: THREE.Scene) => void }) {
  const { scene, gl, camera } = useThree();
  useEffect(() => {
    onScene(scene);
    // Hanya saat pengembangan: memudahkan pemeriksaan scene dari konsol browser
    if (import.meta.env.DEV) (window as any).__evlab = { scene, gl, camera };
  }, [scene, gl, camera, onScene]);
  return null;
}

function AdaptiveUI({
  viewMode,
  setViewMode,
  mobileMode,
  setMobileMode,
  isAdmin,
  activeMode,
  onExitMap,
  onOpenBackupModal,
  onStartPhoneVR,
  sampleCarVisible,
  onToggleSampleCar,
}: {
  viewMode: "tpp" | "fpp" | "dev";
  setViewMode: (mode: "tpp" | "fpp" | "dev") => void;
  mobileMode: boolean;
  setMobileMode: (val: boolean) => void;
  isAdmin: boolean;
  activeMode: "admin" | "guest" | null;
  onExitMap: () => void;
  onOpenBackupModal: () => void;
  onStartPhoneVR: () => Promise<{ ok: boolean; reason?: string }>;
  sampleCarVisible: boolean;
  onToggleSampleCar: () => void;
}) {
  const [xrError, setXrError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showVrModal, setShowVrModal] = useState(false);
  const [showQuestModal, setShowQuestModal] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  useEffect(() => {
    if (activeMode === "guest" && !hasAutoOpened) {
      setShowVrModal(true);
      setHasAutoOpened(true);
    }
  }, [activeMode, hasAutoOpened]);

  const startVrSession = async () => {
    setShowVrModal(false);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    try {
      setXrError(null);
      const supported =
        "xr" in navigator && (await navigator.xr?.isSessionSupported("immersive-vr").catch(() => false));
      if (!supported) {
        // HP tanpa WebXR (mis. iPhone): otomatis pakai mode VR HP layar-ganda
        if (isMobile) {
          await startPhoneVrSession();
          return;
        }
        setXrError(
          "Mode Immersive VR tidak didukung oleh browser ini. Gunakan Meta Quest Browser, atau buka di HP lalu pilih VR HP (Cardboard).",
        );
        return;
      }
      await store.enterVR();
    } catch (err: any) {
      setXrError("Gagal masuk VR: " + err.message);
    }
  };

  const startPhoneVrSession = async () => {
    setShowVrModal(false);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setXrError(null);
    const res = await onStartPhoneVR();
    if (!res.ok) setXrError("Gagal masuk VR HP: " + (res.reason || "sensor tidak tersedia"));
  };

  const toggleWelcomeSpeech = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    } else {
      window.speechSynthesis.cancel();
      const welcomeText = `Selamat datang di Laboratorium Virtual Electric Vehicle para peserta semuanya. Di Lab ini, anda akan bisa bereksplorasi dan berpetualang untuk belajar tentang Electric Vehicle. Disini terdapat dua ruang lab utama, yang pertama adalah lab untuk mengidentifikasi komponen BEV secara menyeluruh, dan lab yang kedua anda akan belajar tentang rincian masing-masing komponen BEV. Untuk menganalisis detail komponen, anda cukup memilih atau klik bagian komponen EV yang akan anda pelajari secara lebih mendalam. Anda juga dapat melihat tampilan video tentang pengenalan kendaraan listrik di layar yang ditampilkan di lab virtual. Dan yang terakhir, anda dapat mencoba untuk menjawab pertanyaan untuk mengetahui perkembangan belajar anda. Apakah anda berminat?`;
      const utterance = new SpeechSynthesisUtterance(welcomeText);
      utterance.lang = "id-ID";
      utterance.rate = 0.95;
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const closeVrModal = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setShowVrModal(false);
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-6 overflow-hidden">
      {/* Top Banner (Alerts) */}
      <div className="flex flex-col items-center gap-2 mt-16 md:mt-2 relative">
        <div className="absolute left-0 top-0 pointer-events-auto flex items-center gap-2">
          <button
            id="btn-exit-map"
            onClick={onExitMap}
            className="flex items-center gap-2 bg-neutral-800/80 hover:bg-neutral-700/80 text-white px-4 py-2 rounded-full font-medium transition-all duration-200 backdrop-blur-md shadow-lg border border-white/10 text-[13px] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            <span>Keluar Map</span>
          </button>
          <button
            id="btn-nav-backup-download"
            onClick={onOpenBackupModal}
            className="flex items-center gap-1.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 hover:text-white px-3.5 py-2 rounded-full font-bold transition-all duration-200 backdrop-blur-md shadow-lg border border-cyan-500/40 text-[12px] cursor-pointer"
            title="Unduh semua data, settingan & keterangan objek map"
          >
            <span className="text-sm">💾</span>
            <span className="hidden sm:inline">Unduh Cadangan Map</span>
            <span className="sm:hidden">Unduh Map</span>
          </button>
        </div>
        <div className="absolute right-0 top-0 pointer-events-auto">
          {isAdmin && !LOCAL_ONLY && <AuthButton />}
        </div>
        {xrError && (
          <div className="bg-red-500/90 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-xl flex items-center justify-between w-full max-w-md pointer-events-auto border border-red-400">
            <span className="text-[13px] font-medium leading-tight mr-3">
              {xrError}
            </span>
            <button
              onClick={() => setXrError(null)}
              className="font-bold text-white/70 hover:text-white px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Side-by-Side Floating Control Gaps (Leaving Center Completely Cleared) */}
      <div className="flex w-full items-end justify-between">
        {/* Left Edge: Joystick */}
        <div
          className={`transition-opacity duration-300 joystick-wrapper ${mobileMode ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
          >
            <VirtualJoystick />
          </div>
        </div>

        {/* Right Edge: Sleek Side Menu Dock */}
        <div className="flex flex-col items-end gap-3 pointer-events-auto">
          <div className="bg-neutral-950/80 backdrop-blur-xl text-white p-4 rounded-3xl shadow-2xl flex flex-col border border-white/10 w-52">
            <div className="border-b border-white/10 pb-3 mb-3">
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
                Status Kontrol
              </span>
              <h2 className="font-extrabold text-[14px] mt-0.5 whitespace-nowrap text-white">
                {viewMode === "tpp" ? "Third Person" : viewMode === "dev" ? "Developer" : "First Person"}
              </h2>
              <p className="text-[11px] text-neutral-400 mt-1">
                {mobileMode
                  ? "Gunakan virtual joystick"
                  : "Gunakan WASD & klik/tarik"}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold py-2 px-3 rounded-xl transition-all border border-white/5 text-left"
                onClick={() => setViewMode(viewMode === "tpp" ? "dev" : viewMode === "dev" ? "fpp" : "tpp")}
              >
                <span>Sudut Pandang</span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold uppercase">
                  {viewMode === "tpp" ? "TPV" : viewMode === "dev" ? "DEV" : "FPV"}
                </span>
              </button>

              <button
                className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold py-2 px-3 rounded-xl transition-all border border-white/5 text-left"
                onClick={() => setMobileMode(!mobileMode)}
              >
                <span>Metode Input</span>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold uppercase">
                  {mobileMode ? "Sentuh" : "Tombol"}
                </span>
              </button>

              <button
                id="btn-dock-backup-download"
                className="w-full flex items-center justify-between bg-gradient-to-r from-purple-950/80 to-cyan-950/80 hover:from-purple-900 hover:to-cyan-900 active:scale-95 text-xs font-bold py-2.5 px-3 rounded-xl transition-all border border-cyan-500/40 text-left text-white shadow-lg shadow-cyan-950/50 cursor-pointer group"
                onClick={onOpenBackupModal}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base">📦</span>
                  <span className="group-hover:text-cyan-200 transition-colors">Unduh Cadangan & 3D</span>
                </div>
                <span className="text-[10px] bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded font-mono font-bold border border-purple-400/30">
                  ZIP / JSON
                </span>
              </button>

              <button
                className="w-full flex items-center justify-between bg-indigo-950/80 hover:bg-indigo-900 active:scale-95 text-xs font-bold py-2.5 px-3 rounded-xl transition-all border border-indigo-500/50 text-left text-white shadow-lg shadow-indigo-950/50 cursor-pointer group"
                onClick={() => {
                  setShowQuestModal(true);
                  const st = updateQuestGamepadState();
                  triggerQuestHaptics(0.9, 250);
                  if (st.connected) {
                    notifyQuestToast(`🟢 Meta Quest Terhubung! (${st.activeControllersCount} Controller)`, "connected");
                  } else {
                    notifyQuestToast("🔄 Menyelaraskan Controller Meta Quest 2...", "sync");
                  }
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400" />
                  <span className="group-hover:text-indigo-200 transition-colors">Joystick Quest 2</span>
                </div>
                <span className="text-[10px] bg-indigo-500/40 text-indigo-100 px-2 py-0.5 rounded font-mono font-bold border border-indigo-400/30">
                  🎮 HUB SINKRON
                </span>
              </button>

              <button
                id="btn-toggle-sample-car"
                className="w-full flex items-center justify-between bg-emerald-950/80 hover:bg-emerald-900 active:scale-95 text-xs font-bold py-2.5 px-3 rounded-xl transition-all border border-emerald-500/40 text-left text-white shadow-lg cursor-pointer"
                onClick={onToggleSampleCar}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🚗</span>
                  <span>Lab Uji Kendaraan</span>
                </div>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-100 px-2 py-0.5 rounded font-mono font-bold border border-emerald-400/30">
                  {sampleCarVisible ? "TAMPIL" : "SEMBUNYI"}
                </span>
              </button>

              <button
                className="w-full flex items-center justify-between bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-extrabold py-2.5 px-3 rounded-xl text-white transition-all shadow-md text-left cursor-pointer"
                onClick={() => setShowVrModal(true)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🥽</span>
                  <span>Masuk Mode VR (360°)</span>
                </div>
                <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded font-mono font-bold">
                  WEBXR
                </span>
              </button>

              {isAdmin && (
                <button
                  className={`w-full flex items-center justify-between ${isSaving ? 'bg-emerald-800 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95'} text-xs font-extrabold py-2.5 px-3 rounded-xl text-white transition-all shadow-md text-left mt-2`}
                  onClick={async () => {
                    if (isSaving) return;
                    setIsSaving(true);
                    try {
                      await saveWorkspaceNow();
                    } catch (e) {
                      console.error(e);
                    }
                    setTimeout(() => setIsSaving(false), 1500); // UI feedback
                  }}
                >
                  <span>{isSaving ? "Menyimpan..." : "Simpan Map"}</span>
                  <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded font-mono font-bold">
                    {isSaving ? "WAIT" : "SAVE"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* VR Welcome Pop-Up Modal */}
      {showVrModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md pointer-events-auto animate-fade-in-quick">
          <div className="bg-neutral-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-white shadow-2xl flex flex-col gap-5 relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v3a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3z"/>
                    <circle cx="7" cy="12" r="1.5"/>
                    <circle cx="17" cy="12" r="1.5"/>
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
                    {isAdmin ? "Virtual Reality Lab" : "Virtual Interactive Lab"}
                  </span>
                  <h3 className="text-xl font-extrabold text-white leading-tight">
                    Panduan & Pengenalan Lab
                  </h3>
                </div>
              </div>
              <button
                onClick={closeVrModal}
                className="text-neutral-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Narration Audio Button */}
            <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-500/20 rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 ${isPlayingAudio ? '' : 'hidden'}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${isPlayingAudio ? 'bg-indigo-500' : 'bg-neutral-500'}`}></span>
                </span>
                <span className="text-xs font-semibold text-indigo-200">
                  {isPlayingAudio ? "Sedang memutar suara narasi..." : "Dengarkan suara narasi"}
                </span>
              </div>
              <button
                onClick={toggleWelcomeSpeech}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isPlayingAudio
                    ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30"
                }`}
              >
                {isPlayingAudio ? (
                  <>
                    <span>Stop Audio</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Putar Suara</span>
                  </>
                )}
              </button>
            </div>

            {/* Text Content */}
            <div className="flex flex-col gap-3 text-sm text-neutral-200 leading-relaxed font-normal bg-black/30 border border-white/5 rounded-2xl p-4">
              <p className="font-semibold text-indigo-300">
                "Selamat datang di Laboratorium Virtual Electric Vehicle para peserta semuanya"
              </p>
              <p>
                "Di Lab ini, anda akan bisa bereksplorasi dan berpetualang untuk belajar tentang Electric Vehicle"
              </p>
              <p>
                "Disini terdapat 2 ruang lab utama, yang pertama adalah lab untuk mengidentifikasi komponen BEV Secara menyeluruh, dan Lab yang ke dua anda akan belajar tentang rincian masing-masing komponen BEV"
              </p>
              <p>
                "Untuk menganalisis detail komponen, anda cukup memilih atau click bagian komponen EV yang akan anda pelajari secara lebih mendalam"
              </p>
              <p>
                "Anda juga dapat melihat tampilan video tentang pengenalan kendaraan Listrik di layar yang di tampilkan di lab virtual"
              </p>
              <p>
                "dan yang terakhir, anda dapat mencoba untuk menjawab pertanyaan untuk mengetahui perkembangan belajar anda"
              </p>
            </div>

            {/* Question Callout & Standalone Link Box */}
            <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-400/40 p-4 rounded-2xl text-center flex flex-col gap-2.5 shadow-lg">
              <h4 className="text-base font-extrabold text-white flex items-center justify-center gap-2">
                <span>🥽</span>
                <span>Panduan Masuk Mode VR 360° Immersive</span>
              </h4>
              <p className="text-xs text-indigo-200 leading-relaxed text-left">
                • <strong>Mode Browser/Laptop:</strong> Jelajahi lab 3D secara interaktif (bisa diputar 360° dengan geser mouse/layar sentuh).<br />
                • <strong>Mode Full 360° VR (Meta Quest):</strong> Buka link di bawah ini langsung menggunakan <strong>Meta Quest Browser</strong> di headset VR Anda:
              </p>

              {/* Copyable Share URL Bar */}
              <div className="bg-black/60 border border-indigo-500/30 rounded-xl p-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-indigo-300 font-mono select-all overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
                  https://ais-pre-mniqgyqn25o6qdhyy57ty7-640972652186.asia-southeast1.run.app
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      const shareUrl = "https://ais-pre-mniqgyqn25o6qdhyy57ty7-640972652186.asia-southeast1.run.app";
                      navigator.clipboard.writeText(shareUrl);
                      notifyQuestToast("Link berhasil disalin! Buka di Meta Quest Browser.");
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer"
                  >
                    📋 Salin
                  </button>
                  <button
                    onClick={() => {
                      const targetUrl = window.location.href.includes("ais-pre") 
                        ? window.location.href 
                        : "https://ais-pre-mniqgyqn25o6qdhyy57ty7-640972652186.asia-southeast1.run.app";
                      window.open(targetUrl, "_blank");
                    }}
                    className="bg-purple-600 hover:bg-purple-500 active:scale-95 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer"
                  >
                    🔗 Buka
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-center gap-3 pt-2">
              <button
                onClick={closeVrModal}
                className="w-full sm:flex-1 bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-bold py-3 px-4 rounded-xl border border-white/10 transition-all cursor-pointer text-center"
              >
                💻 Mode Browser (2D)
              </button>
              <button
                onClick={startVrSession}
                className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer text-center flex items-center justify-center gap-2"
              >
                <span>🥽 Masuk VR 360° (Meta Quest)</span>
              </button>
              {isMobile && (
                <button
                  id="btn-start-phone-vr"
                  onClick={startPhoneVrSession}
                  className="w-full bg-sky-600 hover:bg-sky-500 active:scale-95 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-lg shadow-sky-600/30 transition-all cursor-pointer text-center"
                >
                  📱 VR HP (Cardboard / VR Box)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quest Controller Hub Modal & Toast Overlay */}
      <QuestControllerModal
        isOpen={showQuestModal}
        onClose={() => setShowQuestModal(false)}
      />
      <QuestControllerToast />
    </div>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState<"tpp" | "fpp" | "dev">("fpp");
  const [mobileMode, setMobileMode] = useState(isMobile);
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const [isVRActive, setIsVRActive] = useState(false);
  const [phoneVRActive, setPhoneVRActive] = useState(false);
  const isDraggingAnyRef = useRef(false);

  const handleStartPhoneVR = useCallback(async () => {
    const res = await startPhoneVR();
    if (res.ok) {
      setViewMode("fpp");
      setPhoneVRActive(true);
    }
    return res;
  }, []);

  const handleExitPhoneVR = useCallback(() => {
    stopPhoneVR();
    setPhoneVRActive(false);
  }, []);

  useEffect(() => {
    return store.subscribe((state) => {
      setIsVRActive(state.session != null);
    });
  }, []);
  
  const handleDragChange = (dragging: boolean) => {
    isDraggingAnyRef.current = dragging;
    setIsDraggingAny(dragging);
  };

  const [uploadedModels, setUploadedModels] = useState<UploadedModelData[]>([]);
  // Contoh mobil listrik bawaan: otomatis tampil bila map masih kosong, bisa diatur manual lewat tombol
  const [sampleCarPref, setSampleCarPref] = useState<boolean | null>(null);
  const sampleCarVisible = sampleCarPref ?? uploadedModels.length === 0;
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [threeScene, setThreeScene] = useState<THREE.Scene | null>(null);
  const uploadedModelsRef = useRef<UploadedModelData[]>([]);
  useEffect(() => {
    uploadedModelsRef.current = uploadedModels;
    globalUploadedModels = uploadedModels;
    (window as any).getGlobalUploadedModels = () => uploadedModelsRef.current;
  }, [uploadedModels]);

  const [loadingModelIds, setLoadingModelIds] = useState<Set<string>>(
    new Set(),
  );
  const [libraryAssets, setLibraryAssets] = useState<
    (UploadedModelData & { bufferId?: string })[]
  >([]);
  const [user, setUser] = useState<any>(null);
  // Admin cloud yang sebenarnya (login Google) — dipakai untuk sinkronisasi ke Firebase
  const isCloudAdmin = user?.email === "ranggadino1@gmail.com";
  const isAdmin = TRIAL_NO_AUTH || isCloudAdmin;
  const [authLoaded, setAuthLoaded] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [focusedQuizUrl, setFocusedQuizUrl] = useState<string | null>(null);
  const [focusedQuizTitle, setFocusedQuizTitle] = useState<string>("");

  useEffect(() => {
    import("./lib/firebase").then(({ auth }) => {
      import("firebase/auth").then(({ onAuthStateChanged, signInAnonymously }) => {
        onAuthStateChanged(auth, (u) => {
          if (u) {
            setUser(u);
            setAuthLoaded(true);
          } else {
            signInAnonymously(auth).catch(console.error);
          }
        });
      });
    });
  }, []);

  useEffect(() => {
    if (isCloudAdmin && workspaceLoaded) {
      const runSync = async () => {
        try {
          const {
            getAssetLibraryData,
            saveAssetLibraryData,
            syncStorageAssetsToLibrary,
            getAssetURL,
          } = await import("./lib/store");
          const discovered = await syncStorageAssetsToLibrary();
          if (discovered && discovered.length > 0) {
            setLibraryAssets((prev) => {
              const newItems = discovered.filter(
                (d: any) => !prev.some((l) => l.bufferId === d.bufferId),
              );
              if (newItems.length > 0) {
                const syncedLibrary = [...prev];

                // Fetch assets asynchronously so we don't block
                const loadAssets = async () => {
                  for (const item of newItems) {
                    const srcUrl = await getAssetURL(item.bufferId);
                    if (srcUrl) {
                      setLibraryAssets((current) => {
                        // Prevent duplicates if already added
                        if (current.some((c) => c.bufferId === item.bufferId))
                          return current;
                        const updated: (UploadedModelData & {
                          bufferId?: string;
                        })[] = [
                          ...current,
                          {
                            id: item.id,
                            bufferId: item.bufferId,
                            name: item.name,
                            url: srcUrl,
                            downloadUrl: item.downloadUrl,
                            type: item.type as "glb" | "fbx",
                            position: [0, 0.5, 0] as [number, number, number],
                          },
                        ];
                        saveAssetLibraryData(
                          updated.map((x) => ({
                            id: x.id,
                            bufferId: x.bufferId,
                            name: x.name,
                            type: x.type,
                            downloadUrl: x.downloadUrl,
                          })),
                        );
                        return updated;
                      });
                    }
                  }
                };
                loadAssets();
                return prev;
              }
              return prev;
            });
          }
        } catch (e) {
          console.error("Sync error:", e);
        }
      };
      runSync();
    }
  }, [isCloudAdmin, workspaceLoaded]);

  const [appState, setAppState] = useState<"select_mode" | "scanning" | "downloading" | "ready" | "playing">("select_mode");
  const [activeMode, setActiveMode] = useState<"admin" | "guest" | null>(null);
  const [pendingModels, setPendingModels] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanTotalSize, setScanTotalSize] = useState<number>(0);
  const [scanPendingAssets, setScanPendingAssets] = useState<number>(0);
  const [intendedAdmin, setIntendedAdmin] = useState(false);
  const [showStudentCodeModal, setShowStudentCodeModal] = useState(false);
  const [studentAccessCode, setStudentAccessCode] = useState("");
  const [studentCodeError, setStudentCodeError] = useState("");

  const activeIsAdmin = isAdmin && activeMode === "admin";

  const handleOpenStudentCodeModal = () => {
    if (TRIAL_NO_AUTH) {
      // Mode uji coba: mahasiswa langsung masuk tanpa kode akses
      handleSelectGuest();
      return;
    }
    setShowStudentCodeModal(true);
    setStudentAccessCode("");
    setStudentCodeError("");
  };

  const handleStudentCodeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (studentAccessCode.trim().toLowerCase() === "rangga") {
      setStudentCodeError("");
      setShowStudentCodeModal(false);
      handleSelectGuest();
    } else {
      setStudentCodeError("Kode akses salah. Silakan coba lagi.");
    }
  };

  const handleSelectAdmin = async () => {
    if (isAdmin) {
      setActiveMode("admin");
      setAppState("scanning");
    } else {
      try {
        const { signInWithGoogle } = await import("./lib/firebase");
        await signInWithGoogle();
        setIntendedAdmin(true);
      } catch (e: any) {
        console.error("Login failed:", e);
        if (e?.code === 'auth/admin-restricted-operation') {
          alert("Gagal login. Pastikan domain ini terdaftar di 'Authorized domains' dan 'Enable client authentication' diaktifkan di Firebase Console (Authentication -> Settings).");
        } else {
          alert("Gagal login: " + (e?.message || "Error tidak diketahui"));
        }
      }
    }
  };

  useEffect(() => {
    if (intendedAdmin && appState === "select_mode") {
      if (isAdmin) {
        setActiveMode("admin");
        setAppState("scanning");
        setIntendedAdmin(false);
      } else if (user && !user.isAnonymous) {
        alert("Akses ditolak. Anda harus login dengan akun admin (ranggadino1@gmail.com).");
        import("./lib/firebase").then(({ logout }) => logout());
        setIntendedAdmin(false);
      }
    }
  }, [intendedAdmin, isAdmin, user, appState]);

  const handleSelectGuest = async () => {
    // Login anonim dijalankan di latar belakang: saat offline tidak boleh menahan masuk ke lab
    (async () => {
      try {
        const { auth } = await import("./lib/firebase");
        const { signInAnonymously } = await import("firebase/auth");
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.warn("Guest login error:", e);
      }
    })();
    setActiveMode("guest");
    setAppState("scanning");
  };

  useEffect(() => {
    if (appState === "downloading" && workspaceLoaded) {
      // Short delay to avoid visual glitch if models load extremely fast
      const timer = setTimeout(() => {
        setAppState("ready");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [appState, workspaceLoaded]);

  useEffect(() => {
    if (appState !== "scanning") return;
    
    let isCancelled = false;
    const scanWorkspace = async () => {
      setIsScanning(true);
      try {
        const { getWorkspaceData, getAssetLibraryData, getAssetSizeAndCacheStatus } = await import("./lib/store");
        const data = await getWorkspaceData();
        const libData = await getAssetLibraryData();
        
        const bufferIds = new Set<string>();
        
        if (data && Array.isArray(data)) {
          data.forEach(item => {
            if ((item.savedType === "uploaded" || item.savedType === "extracted" || !item.savedType) && item.bufferId) {
              bufferIds.add(item.bufferId);
            }
          });
        }
        
        if (libData && Array.isArray(libData)) {
          libData.forEach(item => {
            if (item.bufferId) {
              bufferIds.add(item.bufferId);
            }
          });
        }
        
        let totalSize = 0;
        let pendingCount = 0;
        
        const promises = Array.from(bufferIds).map(async (bufferId) => {
          try {
            const status = await getAssetSizeAndCacheStatus(bufferId);
            return { status, bufferId };
          } catch (e) {
            return { status: { size: 0, isCached: false }, bufferId };
          }
        });
        
        const results = await Promise.all(promises);
        
        results.forEach(res => {
          if (!res.status.isCached) {
            totalSize += res.status.size;
            pendingCount++;
          }
        });

        if (!isCancelled) {
          setScanTotalSize(totalSize);
          setScanPendingAssets(pendingCount);
          if (pendingCount === 0) {
            // Nothing to download, skip to download phase which will just load from cache
            setIsScanning(false);
            setAppState("downloading");
          } else {
            // Keep in scanning state but update UI
            setIsScanning(false);
          }
        }
      } catch (err) {
        console.error("Scan failed", err);
        if (!isCancelled) {
          setIsScanning(false);
          setAppState("downloading"); // Fallback to downloading
        }
      }
    };
    scanWorkspace();
    
    return () => { isCancelled = true; };
  }, [appState]);

  useEffect(() => {
    if (appState === "select_mode" || appState === "scanning") return;
    if (workspaceLoaded) return; // Prevent double load

    const loadWorkspace = async () => {
      try {
        const { getAssetLibraryData, syncStorageAssetsToLibrary } =
          await import("./lib/store");
        const libData = await getAssetLibraryData();
        let loadedLibrary: (UploadedModelData & { bufferId?: string })[] = [];
        if (libData && Array.isArray(libData)) {
          const { getAssetURL, getAssetDownloadURL, fetchAssetViaProxy, checkAssetInIDB } = await import("./lib/store");
          const libPromises = libData.map(async (item) => {
            let dlUrl = item.downloadUrl;
            // Backward compatibility
            const primaryId = item.bufferId || item.id;
            const fallbackId = item.id;

            if (!dlUrl) {
              dlUrl = await getAssetDownloadURL(primaryId);
              if (!dlUrl && primaryId !== fallbackId) {
                dlUrl = await getAssetDownloadURL(fallbackId);
              }
            }

            let srcUrl = await checkAssetInIDB(primaryId, item.type as "glb" | "fbx" || "glb");
            if (!srcUrl && primaryId !== fallbackId) {
              srcUrl = await checkAssetInIDB(fallbackId, item.type as "glb" | "fbx" || "glb");
            }

            if (!srcUrl && dlUrl) {
              srcUrl = await fetchAssetViaProxy(primaryId, dlUrl, item.type as "glb" | "fbx" || "glb");
              if (!srcUrl) srcUrl = dlUrl;
            } else if (!srcUrl && !dlUrl) {
              srcUrl = await getAssetURL(primaryId, item.type as "glb" | "fbx" || "glb");
              if (!srcUrl && primaryId !== fallbackId) {
                srcUrl = await getAssetURL(fallbackId, item.type as "glb" | "fbx" || "glb");
              }
            }

            if (primaryId && dlUrl) {
              exportedBufferIds.set(primaryId, dlUrl);
            }
            
            return {
              id: item.id || `restored-lib-${Date.now()}-${Math.random()}`,
              bufferId: primaryId,
              name: item.name || "Restored Model",
              url: srcUrl || "", // Use empty string if no URL found, so it renders an error state instead of being deleted
              downloadUrl: dlUrl,
              type: item.type || "glb",
              videoUrl: item.videoUrl,
              position: [0, 0.5, 0] as [number, number, number],
            };
          });
          const results = await Promise.all(libPromises);
          loadedLibrary = results.filter((item): item is NonNullable<typeof item> => item !== null);
        }

        setLibraryAssets(loadedLibrary);

        const data = await getWorkspaceData();
        let loadedModels: UploadedModelData[] = [];
        if (data && Array.isArray(data)) {
          const { getAssetURL, getAssetDownloadURL, fetchAssetViaProxy, checkAssetInIDB } = await import("./lib/store");
          
          const modelPromises = data.filter((item) => item.savedType === "uploaded" || item.savedType === "extracted" || !item.savedType).map(async (item) => {
            let dlUrl = item.downloadUrl;
            // Backward compatibility: older assets used item.id as their primary storage key.
            const primaryId = item.bufferId || item.id;
            const fallbackId = item.id;

            if (!dlUrl) {
              dlUrl = await getAssetDownloadURL(primaryId);
              if (!dlUrl && primaryId !== fallbackId) {
                 dlUrl = await getAssetDownloadURL(fallbackId);
              }
            }

            let srcUrl = await checkAssetInIDB(primaryId, item.type as "glb" | "fbx" || "glb");
            if (!srcUrl && primaryId !== fallbackId) {
              srcUrl = await checkAssetInIDB(fallbackId, item.type as "glb" | "fbx" || "glb");
            }

            if (!srcUrl && dlUrl) {
              srcUrl = await fetchAssetViaProxy(primaryId, dlUrl, item.type as "glb" | "fbx" || "glb");
              if (!srcUrl) srcUrl = dlUrl;
            } else if (!srcUrl && !dlUrl) {
              srcUrl = await getAssetURL(primaryId, item.type as "glb" | "fbx" || "glb");
              if (!srcUrl && primaryId !== fallbackId) {
                srcUrl = await getAssetURL(fallbackId, item.type as "glb" | "fbx" || "glb");
              }
            }

            if (primaryId && dlUrl) {
              exportedBufferIds.set(primaryId, dlUrl);
            }

            return {
              id: item.id || `restored-${Date.now()}-${Math.random()}`,
              bufferId: primaryId,
              name: item.name || item.customName || "Restored Model",
              url: srcUrl || "", // Use empty string if no URL found, so it renders an error state instead of being deleted
              downloadUrl: dlUrl,
              type: item.type as "glb" | "fbx" | "screen" || "glb",
              videoUrl: item.videoUrl || "",
              position: Array.isArray(item.position) && item.position.length >= 3 
                        ? item.position as [number, number, number] 
                        : [0, 0, -2] as [number, number, number],
              initialRotation: [
                item.rotationX !== undefined ? item.rotationX : (item.initialRotation?.[0] || 0),
                item.rotationY !== undefined ? item.rotationY : (item.initialRotation?.[1] || 0),
                item.rotationZ !== undefined ? item.rotationZ : (item.initialRotation?.[2] || 0),
              ] as [number, number, number],
              initialScale: item.scaleMultiplier !== undefined ? item.scaleMultiplier : (item.initialScale !== undefined ? item.initialScale : 1.0),
              isLocked: item.isLocked || false,
              isSolid: item.isSolid || false,
              isExplodable: item.isExplodable || false,
              npcKnowledge: item.npcKnowledge,
              npcBehavior: item.npcBehavior,
              npcTargetId: item.npcTargetId,
              playBuiltinAnimation: item.playBuiltinAnimation !== undefined ? item.playBuiltinAnimation : true,
              animType: item.animType || "none",
              animSpeed: item.animSpeed !== undefined ? item.animSpeed : 1.0,
              customSubNames: item.customSubNames || {},
              customSubDescriptions: item.customSubDescriptions || {},
              quizUrl: item.quizUrl || "",
            };
          });
          
          const results = await Promise.all(modelPromises);
          loadedModels = results.filter((item): item is NonNullable<typeof item> => item !== null) as UploadedModelData[];
        }
        
        setPendingModels(new Set(loadedModels.map((m) => m.id)));
        if (loadedModels.length > 0) {
          setUploadedModels(loadedModels);
        }

        // Listen for real-time changes from the admin
        const { subscribeToWorkspaceData } = await import("./lib/store");
        subscribeToWorkspaceData((newData) => {
           if (!newData || !Array.isArray(newData)) return;
           
           setUploadedModels(prev => {
              const updatedModels = [...prev];
              const modelsToKeep = new Set();
              const newItems = [];
              
              for (const item of newData) {
                 if (item.savedType !== "uploaded" && item.savedType !== "extracted" && item.savedType) continue;
                 const id = item.id;
                 if (!id) continue;
                 
                 modelsToKeep.add(id);
                 
                 const idx = updatedModels.findIndex(m => m.id === id);
                 if (idx !== -1) {
                    updatedModels[idx] = {
                       ...updatedModels[idx],
                       position: Array.isArray(item.position) && item.position.length >= 3 
                                 ? item.position as [number, number, number] 
                                 : [0, 0, -2],
                       initialRotation: [
                         item.rotationX !== undefined ? item.rotationX : (item.initialRotation?.[0] || 0),
                         item.rotationY !== undefined ? item.rotationY : (item.initialRotation?.[1] || 0),
                         item.rotationZ !== undefined ? item.rotationZ : (item.initialRotation?.[2] || 0),
                       ],
                       initialScale: item.scaleMultiplier !== undefined ? item.scaleMultiplier : (item.initialScale !== undefined ? item.initialScale : 1.0),
                       isLocked: item.isLocked || false,
                       quizUrl: item.quizUrl || "",
                       isSolid: item.isSolid || false,
                       isExplodable: item.isExplodable || false,
                       videoUrl: item.videoUrl || "",
                       npcKnowledge: item.npcKnowledge,
                       npcBehavior: item.npcBehavior,
                       npcTargetId: item.npcTargetId,
                       playBuiltinAnimation: item.playBuiltinAnimation !== undefined ? item.playBuiltinAnimation : true,
                       animType: item.animType || "none",
                       animSpeed: item.animSpeed !== undefined ? item.animSpeed : 1.0,
                       customSubNames: item.customSubNames || {},
                       customSubDescriptions: item.customSubDescriptions || {},
                    };
                 } else {
                    // Check if it's already in the process of being loaded
                    const isAlreadyLoading = prev.some(m => m.id === id);
                    if (!isAlreadyLoading) {
                        newItems.push(item);
                    }
                 }
              }
              
              if (newItems.length > 0) {
                 // Add stubs immediately to prevent duplicate loading if snapshot fires again
                 const stubs = newItems.map(item => ({
                    id: item.id || `restored-${Date.now()}-${Math.random()}`,
                    bufferId: item.bufferId || item.id,
                    name: item.name || item.customName || "Restored Model",
                    url: "", // Empty URL acts as loading stub
                    type: item.type as "glb" | "fbx" | "screen" || "glb",
                    videoUrl: item.videoUrl || "",
                    position: Array.isArray(item.position) && item.position.length >= 3 ? item.position as [number, number, number] : [0, 0, -2] as [number, number, number],
                    initialRotation: [
                      item.rotationX !== undefined ? item.rotationX : (item.initialRotation?.[0] || 0),
                      item.rotationY !== undefined ? item.rotationY : (item.initialRotation?.[1] || 0),
                      item.rotationZ !== undefined ? item.rotationZ : (item.initialRotation?.[2] || 0),
                    ] as [number, number, number],
                    initialScale: item.scaleMultiplier !== undefined ? item.scaleMultiplier : (item.initialScale !== undefined ? item.initialScale : 1.0),
                    isLocked: item.isLocked || false,
                    isSolid: item.isSolid || false,
                    isExplodable: item.isExplodable || false,
                    npcKnowledge: item.npcKnowledge,
                    npcBehavior: item.npcBehavior,
                    npcTargetId: item.npcTargetId,
                    playBuiltinAnimation: item.playBuiltinAnimation !== undefined ? item.playBuiltinAnimation : true,
                    animType: item.animType || "none",
                    animSpeed: item.animSpeed !== undefined ? item.animSpeed : 1.0,
                    customSubNames: item.customSubNames || {},
                    customSubDescriptions: item.customSubDescriptions || {},
                    quizUrl: item.quizUrl || "",
                 }));
                 
                 updatedModels.push(...stubs);
                 
                 // Trigger background load for new items
                 setTimeout(async () => {
                    const { getAssetURL, getAssetDownloadURL, fetchAssetViaProxy, checkAssetInIDB } = await import("./lib/store");
                    const loadedNews = [];
                    for (const item of newItems) {
                      let dlUrl = item.downloadUrl;
                      const primaryId = item.bufferId || item.id;
                      const fallbackId = item.id;
                      if (!dlUrl) {
                        dlUrl = await getAssetDownloadURL(primaryId);
                        if (!dlUrl && primaryId !== fallbackId) dlUrl = await getAssetDownloadURL(fallbackId);
                      }
                      let srcUrl = await checkAssetInIDB(primaryId, item.type as "glb" | "fbx" || "glb");
                      if (!srcUrl && primaryId !== fallbackId) srcUrl = await checkAssetInIDB(fallbackId, item.type as "glb" | "fbx" || "glb");
                      
                      if (!srcUrl && dlUrl) {
                        srcUrl = await fetchAssetViaProxy(primaryId, dlUrl, item.type as "glb" | "fbx" || "glb");
                        if (!srcUrl) srcUrl = dlUrl;
                      } else if (!srcUrl && !dlUrl) {
                        srcUrl = await getAssetURL(primaryId, item.type as "glb" | "fbx" || "glb");
                        if (!srcUrl && primaryId !== fallbackId) srcUrl = await getAssetURL(fallbackId, item.type as "glb" | "fbx" || "glb");
                      }
                      if (primaryId && dlUrl) exportedBufferIds.set(primaryId, dlUrl);
                      
                      loadedNews.push({ id: item.id, url: srcUrl || "", downloadUrl: dlUrl });
                    }
                    setUploadedModels(curr => curr.map(m => {
                        const loaded = loadedNews.find(ln => ln.id === m.id);
                        if (loaded) {
                           return { ...m, url: loaded.url, downloadUrl: loaded.downloadUrl };
                        }
                        return m;
                    }));
                 }, 0);
              }
              
              return updatedModels.filter(m => modelsToKeep.has(m.id) || newItems.some(n => n.id === m.id));
           });
        });

        setWorkspaceLoaded(true);
      } catch (err) {
        console.error("Failed to load workspace", err);
        setWorkspaceLoaded(true); // even on fail, we unblock
      }
    };
    loadWorkspace();
  }, [appState, workspaceLoaded]);

  // States for Screen Look Camera Rotation in FPV mode
  const pointerDown = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const lastPointer = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only capture background looks; skip if clicking any active buttons/controls or panels
    if (
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest(".joystick-wrapper") ||
      (e.target as HTMLElement).closest(".pointer-events-auto") ||
      isDraggingAnyRef.current
    )
      return;

    if (viewMode !== "fpp") return;
    pointerDown.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerDown.current || viewMode !== "fpp" || isDraggingAnyRef.current) return;
    const rawDx = e.clientX - lastPointer.current.x;
    const rawDy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };

    // Clamp single-frame pointer jumps to prevent violent camera spinning on fast swipes
    const dx = Math.max(-45, Math.min(45, rawDx));
    const dy = Math.max(-45, Math.min(45, rawDy));

    const sensitivity = 0.0025;
    yaw.current -= dx * sensitivity;
    pitch.current = Math.max(
      -Math.PI / 2 + 0.15,
      Math.min(Math.PI / 2 - 0.15, pitch.current - dy * sensitivity),
    );
  };

  const handlePointerUp = () => {
    pointerDown.current = false;
  };

  const handleAddModels = (newModels: UploadedModelData[]) => {
    setUploadedModels((prev) => [...prev, ...newModels]);
    triggerWorkspaceSave();
  };

  const handleRemoveModel = (id: string) => {
    setUploadedModels((prev) => {
      const modelToRemove = prev.find((m) => m.id === id);
      if (modelToRemove && modelToRemove.url.startsWith("blob:")) {
        URL.revokeObjectURL(modelToRemove.url.split("#")[0]);
      }
      return prev.filter((m) => m.id !== id);
    });

    triggerWorkspaceSave();
  };

  const handleDuplicateModel = (data: Partial<UploadedModelData>) => {
    const newId = `dup-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newName = `${data.name || 'Model'} (Copy)`;
    const newAsset = {
      ...data,
      id: newId,
      name: newName,
      position: [
        (data.position?.[0] || 0) + 1.0,
        data.position?.[1] || 0,
        (data.position?.[2] || 0) + 1.0,
      ],
    } as UploadedModelData;

    setUploadedModels((prev) => [...prev, newAsset]);
    
    // Also add the duplicate to the library as an independent asset
    setLibraryAssets((prev) => {
      const next = [...prev, newAsset];
      import("./lib/store").then(({ saveAssetLibraryData }) => {
        saveAssetLibraryData(
          next.map((x) => ({
            id: x.id,
            bufferId: x.bufferId,
            name: x.name,
            type: x.type,
            downloadUrl: x.downloadUrl,
          }))
        );
      });
      return next;
    });

    triggerWorkspaceSave();
  };

  const handleRenameModel = (id: string, newName: string) => {
    let targetBufferId: string | undefined;

    setUploadedModels((prev) => {
      const updated = prev.map((m) => {
        if (m.id === id) {
          targetBufferId = m.bufferId;
          return { ...m, name: newName };
        }
        return m;
      });
      
      setLibraryAssets((libPrev) => {
        let changed = false;
        const libUpdated = libPrev.map((m) => {
          if (m.id === id || (targetBufferId && m.bufferId === targetBufferId)) {
            changed = true;
            return { ...m, name: newName };
          }
          return m;
        });

        if (changed) {
          import("./lib/store").then(({ saveAssetLibraryData }) => {
            saveAssetLibraryData(
              libUpdated.map((x) => ({
                id: x.id,
                bufferId: x.bufferId,
                name: x.name,
                type: x.type,
                downloadUrl: x.downloadUrl,
              })),
            );
          });
        }
        return libUpdated;
      });

      return updated;
    });

    triggerWorkspaceSave();
  };

  const handleRenameLibraryAsset = (id: string, newName: string) => {
    let targetBufferId: string | undefined;

    setLibraryAssets((prev) => {
      let changed = false;
      const updated = prev.map((m) => {
        if (m.id === id) {
          changed = true;
          targetBufferId = m.bufferId;
          return { ...m, name: newName };
        }
        return m;
      });

      if (changed) {
        import("./lib/store").then(({ saveAssetLibraryData }) => {
          saveAssetLibraryData(
            updated.map((x) => ({
              id: x.id,
              bufferId: x.bufferId,
              name: x.name,
              type: x.type,
              downloadUrl: x.downloadUrl,
            })),
          );
        });
      }

      // Also apply to workspace cloned instances immediately using the known targetBufferId
      setUploadedModels((upPrev) =>
        upPrev.map((m) => {
          if (m.id === id || (targetBufferId && m.bufferId === targetBufferId)) {
            return { ...m, name: newName };
          }
          return m;
        }),
      );

      return updated;
    });

    triggerWorkspaceSave();
  };

  const handleRemoveLibraryAsset = (id: string) => {
    let targetBufferId: string | undefined;
    let bufferFullyDeleted = false;

    setLibraryAssets((prev) => {
      const removed = prev.find((m) => m.id === id);
      if (removed) {
        targetBufferId = removed.bufferId;
        const filtered = prev.filter((m) => m.id !== id);

        import("./lib/store").then(({ removeAsset, saveAssetLibraryData }) => {
          // Check if any OTHER asset still uses this bufferId
          if (targetBufferId) {
            const isBufferUsedElsewhere = filtered.some((m) => m.bufferId === targetBufferId);
            if (!isBufferUsedElsewhere) {
              removeAsset(targetBufferId);
            }
          }
          saveAssetLibraryData(
            filtered.map((x) => ({
              id: x.id,
              bufferId: x.bufferId,
              name: x.name,
              type: x.type,
              downloadUrl: x.downloadUrl,
            })),
          );
        });
        
        if (targetBufferId) {
           bufferFullyDeleted = !filtered.some((m) => m.bufferId === targetBufferId);
        }

        // Also remove from workspace immediately using the known variables
        setUploadedModels((upPrev) => {
          // If buffer is completely removed, we must delete all canvas instances sharing it.
          // Otherwise, just delete the specific instance (if they duplicated it, it's independent).
          const modelsToRemove = upPrev.filter((m) => 
             m.id === id || (bufferFullyDeleted && targetBufferId && m.bufferId === targetBufferId)
          );
          
          modelsToRemove.forEach((m) => {
            if (m.url && m.url.startsWith("blob:")) {
              // Only revoke if no other models remaining will use it
              const urlUsedElsewhere = upPrev.some((other) => 
                !modelsToRemove.includes(other) && other.url === m.url
              );
              if (!urlUsedElsewhere) {
                URL.revokeObjectURL(m.url.split("#")[0]);
              }
            }
          });
          return upPrev.filter((m) => !modelsToRemove.includes(m));
        });

        return filtered;
      }
      return prev;
    });

    triggerWorkspaceSave();
  };

  const handleUpdateModel = (id: string, updates: Partial<UploadedModelData>) => {
    setUploadedModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
    triggerWorkspaceSave();
  };

  const handleClearAllModels = () => {
    uploadedModels.forEach((m) => {
      if (m.url.startsWith("blob:")) {
        URL.revokeObjectURL(m.url.split("#")[0]);
      }
    });
    setUploadedModels([]);
    triggerWorkspaceSave();
  };

  
  const handleLoadStart = useCallback((id: string) => {
    setLoadingModelIds((prev) => new Set(prev).add(id));
  }, []);

  const handleLoadFinish = useCallback((id: string) => {
    setLoadingModelIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPendingModels((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      return prev;
    });
    triggerWorkspaceSave();
  }, []);

  const handleExtractMesh = async (
    mesh: THREE.Mesh,
    position: [number, number, number],
    initialScale: number = 1.0,
  ) => {
    const id = `model-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const bufferId = `asset-extracted-${id}.glb`;
    const baseName = mesh.userData.customName || mesh.name || `Extracted Part`;
    
    // Disable interactions temporarily
    handleDragChange(true);
    try {
      const exporter = new GLTFExporter();
      // Clone mesh to remove materials to be safe (or just export as is)
      const clonedMesh = mesh.clone();
      clonedMesh.position.set(0, 0, 0);
      clonedMesh.rotation.set(0, 0, 0);
      clonedMesh.scale.set(1, 1, 1);
      
      const gltfBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          clonedMesh,
          (res) => resolve(res as ArrayBuffer),
          (err) => reject(err),
          { binary: true }
        );
      });
      
      const { saveAsset, saveAssetLibraryData } = await import("./lib/store");
      const downloadUrl = await saveAsset(bufferId, gltfBuffer);
      if (downloadUrl) exportedBufferIds.set(bufferId, downloadUrl);
      
      const blobUrl = URL.createObjectURL(new Blob([gltfBuffer], { type: "model/gltf-binary" })) + "#asset.glb";
      
      const newAsset = {
        id,
        bufferId,
        name: baseName,
        url: blobUrl,
        downloadUrl,
        type: "glb" as const,
        position,
        initialScale,
        initialRotation: [0, 0, 0] as [number, number, number],
        isLocked: false,
        isSolid: false
      };
      
      setLibraryAssets(prev => {
        const next = [...prev, newAsset];
        saveAssetLibraryData(
          next.map((x) => ({
            id: x.id,
            bufferId: x.bufferId,
            name: x.name,
            type: x.type,
            downloadUrl: x.downloadUrl,
          }))
        );
        return next;
      });
      
      setUploadedModels(prev => [...prev, newAsset]);
      triggerWorkspaceSave();
      
    } catch (e) {
      console.error("Failed to extract mesh", e);
    } finally {
      handleDragChange(false);
    }
  };

  return (
    <div
      className="w-full h-[100dvh] bg-neutral-900 overflow-hidden relative font-sans select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {appState !== "select_mode" && (
        <>
          {/* Title Header - only in 2D mode */}
          {!isVRActive && !phoneVRActive && (
            <div className="absolute top-0 left-0 w-full p-6 z-10 pointer-events-none flex justify-center">
              <div className="bg-white/10 backdrop-blur-md text-white px-6 py-2.5 rounded-full border border-white/20 text-xs tracking-[0.2em] font-semibold uppercase shadow-2xl flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span>Smart Vocational untuk Electric Vehicle</span>
              </div>
            </div>
          )}

          <Canvas
            className="touch-none bg-neutral-900"
            camera={{ position: [0, 1.6, 5], fov: 60, near: 0.1, far: 500 }}
            dpr={isMobile ? 1 : [1, 1.5]}
            frameloop="always"
            performance={{ min: 0.8 }}
            gl={{
              powerPreference: "high-performance",
              antialias: true,
              alpha: false,
              stencil: false,
              depth: true,
              precision: "highp",
            }}
            onCreated={({ gl }) => {
              if (gl.xr) gl.xr.enabled = true;
            }}
          >
            <color attach="background" args={["#1e293b"]} />
            <XR store={store}>
              <SceneBridge onScene={setThreeScene} />
              {/* Modul Optimasi & Input Meta Quest */}
              <VROptimizer isPresenting={isVRActive} />
              <WebXRControllerManager />
              {phoneVRActive && !isVRActive && <PhoneVRRenderer />}

              {/* Titik Spawn Awal & Indikator Berdiri Permanen (World Spawn Station) */}
              <VRFloorIndicator />

              <ambientLight intensity={0.9} />
              <directionalLight
                position={[15, 30, 15]}
                intensity={1.3}
                castShadow={!isVRActive}
              />
              <hemisphereLight args={["#bae6fd", "#1e293b", 0.7]} />

              {!isVRActive && (
                <Sky distance={450000} sunPosition={[100, 30, 100]} inclination={0.3} azimuth={0.25} />
              )}
              {/* Pantulan lingkungan dibuat lokal (tanpa unduh HDR 1,5 MB dari CDN luar):
                  lebih ringan dan aplikasi tidak gagal tampil saat CDN tidak terjangkau. */}
              <Environment resolution={128} frames={1}>
                <color attach="background" args={["#8fa3b8"]} />
                <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 12, 1]} />
                <Lightformer form="rect" intensity={1.6} color="#dbeafe" position={[-8, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[14, 5, 1]} />
                <Lightformer form="rect" intensity={1.6} color="#fff7ed" position={[8, 2, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[14, 5, 1]} />
                <Lightformer form="rect" intensity={1.2} color="#e2e8f0" position={[0, 2, -8]} scale={[14, 5, 1]} />
                <Lightformer form="rect" intensity={1.2} color="#e2e8f0" position={[0, 2, 8]} rotation={[0, Math.PI, 0]} scale={[14, 5, 1]} />
                <Lightformer form="rect" intensity={0.4} color="#334155" position={[0, -4, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[20, 20, 1]} />
              </Environment>
              {activeIsAdmin && <WorkspaceManager />}

              <Player viewMode={viewMode} yaw={yaw} pitch={pitch} />

              {sampleCarVisible && (
                <>
                  <TestLabEnvironment />
                  <SampleEVCar showPlatform={false} />
                </>
              )}

              {/* User Uploaded Assets (GLB and FBX) */}
              {uploadedModels.map((model) => (
                model.type === "screen" ? (
                  <VideoScreenObject
                    key={model.id}
                    id={model.id}
                    viewMode={viewMode}
                    position={model.position}
                    initialRotation={model.initialRotation}
                    initialScale={model.initialScale}
                    initialLocked={model.isLocked}
                    videoUrl={model.videoUrl}
                    onUpdateModel={handleUpdateModel}
                    onRemove={handleRemoveModel}
                    onDragChange={handleDragChange}
                    isAdmin={activeIsAdmin}
                  />
                ) : (
                <UploadedObject
                  key={model.id}
                  id={model.id}
                  viewMode={viewMode}
                  bufferId={model.bufferId}
                  url={model.url}
                  downloadUrl={model.downloadUrl}
                  name={model.name}
                  type={model.type}
                  position={model.position}
                  initialRotation={model.initialRotation}
                  initialScale={model.initialScale}
                  initialTargetScale={model.targetScale}
                  initialEffectiveScale={model.effectiveScale}
                  initialWorldDimensions={model.worldDimensions}
                  initialLocked={model.isLocked}
                  initialSolid={model.isSolid}
                  initialExplodable={model.isExplodable}
                  initialNpcKnowledge={model.npcKnowledge}
                  initialNpcBehavior={model.npcBehavior}
                  initialNpcTargetId={model.npcTargetId}
                  initialPlayBuiltinAnimation={model.playBuiltinAnimation}
                  initialAnimType={model.animType}
                  initialAnimSpeed={model.animSpeed}
                  initialCustomSubNames={model.customSubNames}
                  initialCustomSubDescriptions={model.customSubDescriptions}
                  initialQuizUrl={model.quizUrl}
                  onMulaiQuiz={(url) => {
                    setFocusedQuizUrl(url);
                    setFocusedQuizTitle(model.name);
                  }}
                  onDragChange={handleDragChange}
                  onUpdateModel={handleUpdateModel}
                  onRemove={handleRemoveModel}
                  onRename={handleRenameModel}
                  onDuplicate={handleDuplicateModel}
                  onExtractMesh={handleExtractMesh}
                  onLoadStart={handleLoadStart}
                  onLoadFinish={handleLoadFinish}
                  isAdmin={activeIsAdmin}
                />
                )
              ))}

              {/* Clean Subtle Floor Grid aligned at Y = 0 */}
{!sampleCarVisible && (
                            <Grid
                position={[0, 0.001, 0]}
                args={[120, 120]}
                cellSize={1}
                cellThickness={1}
                cellColor="#334155"
                sectionSize={5}
                sectionThickness={1.5}
                sectionColor="#475569"
                fadeDistance={50}
                fadeStrength={1.5}
                infiniteGrid
              />
              )}

              {/* Floor Plane Mesh */}
              <mesh
                position={[0, -0.001, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
              >
                <planeGeometry args={[300, 300]} />
                <meshStandardMaterial color="#262626" roughness={0.7} metalness={0.2} />
              </mesh>

              {/* Enable camera OrbitControls specifically in Third Person mode and non-dragging state */}
              {viewMode === "tpp" && !isVRActive && (
                <OrbitControls
                  makeDefault
                  enabled={!isDraggingAny}
                  minPolarAngle={Math.PI / 6}
                  maxPolarAngle={Math.PI / 2 - 0.05}
                  minDistance={2}
                  maxDistance={12}
                  dampingFactor={0.05}
                />
              )}

              {/* Enable camera OrbitControls in Developer mode */}
              {viewMode === "dev" && !isVRActive && (
                <OrbitControls
                  makeDefault
                  enabled={!isDraggingAny}
                  minPolarAngle={0}
                  maxPolarAngle={Math.PI / 2}
                  minDistance={2}
                  maxDistance={100}
                  dampingFactor={0.05}
                />
              )}
            </XR>
          </Canvas>

          {phoneVRActive && !isVRActive && <PhoneVROverlay onExit={handleExitPhoneVR} />}

          {!isVRActive && !phoneVRActive && (
            <>
              {activeIsAdmin && (
                <Suspense fallback={null}>
                <ModelUploader
                  uploadedModels={uploadedModels}
                  libraryAssets={libraryAssets}
                  setLibraryAssets={setLibraryAssets}
                  onAddModels={handleAddModels}
                  onRemoveModel={handleRemoveModel}
                  onRenameModel={handleRenameModel}
                  onRenameLibraryAsset={handleRenameLibraryAsset}
                  onRemoveLibraryAsset={handleRemoveLibraryAsset}
                  onClearAll={handleClearAllModels}
                  onOpenBackupModal={() => setShowBackupModal(true)}
                />
                </Suspense>
              )}

              <AdaptiveUI
                viewMode={viewMode}
                setViewMode={setViewMode}
                mobileMode={mobileMode}
                setMobileMode={setMobileMode}
                isAdmin={activeIsAdmin}
                activeMode={activeMode}
                onExitMap={() => {
                  setActiveMode(null);
                  setAppState("select_mode");
                }}
                onOpenBackupModal={() => setShowBackupModal(true)}
                onStartPhoneVR={handleStartPhoneVR}
                sampleCarVisible={sampleCarVisible}
                onToggleSampleCar={() => setSampleCarPref(!sampleCarVisible)}
              />
            </>
          )}

          {/* Pusat Unduh & Cadangan Data Map Modal */}
          {showBackupModal && (
          <Suspense fallback={null}>
          <MapBackupModal
            isOpen={showBackupModal}
            onClose={() => setShowBackupModal(false)}
            uploadedModels={uploadedModels}
            libraryAssets={libraryAssets}
            onRestoreModels={(models) => {
              setUploadedModels(models);
            }}
            onRestoreLibraryAssets={(assets) => {
              setLibraryAssets(assets);
            }}
            scene={threeScene || undefined}
            isAdmin={activeIsAdmin}
          />
          </Suspense>
          )}
      </>
      )}

      {appState === "playing" && loadingModelIds.size > 0 && (
        <div className="fixed bottom-6 left-6 z-[9000] bg-neutral-900/90 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xl backdrop-blur-md">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-white text-sm font-medium">Mendownload {loadingModelIds.size} asset...</span>
        </div>
      )}

      {appState !== "playing" && (
        <EVEntranceScreen
          appState={appState}
          setAppState={setAppState}
          showStudentCodeModal={showStudentCodeModal}
          setShowStudentCodeModal={setShowStudentCodeModal}
          studentAccessCode={studentAccessCode}
          setStudentAccessCode={setStudentAccessCode}
          studentCodeError={studentCodeError}
          setStudentCodeError={setStudentCodeError}
          handleStudentCodeSubmit={handleStudentCodeSubmit}
          handleSelectAdmin={handleSelectAdmin}
          handleOpenStudentCodeModal={handleOpenStudentCodeModal}
          isScanning={isScanning}
          scanPendingAssets={scanPendingAssets}
          scanTotalSize={scanTotalSize}
          pendingModelsCount={pendingModels.size}
        />
      )}

      {/* Focused Google Form / Quiz Full Screen Overlay */}
      {focusedQuizUrl && (
        <div className="fixed inset-0 bg-neutral-950 z-[9999] flex flex-col pointer-events-auto select-none animate-fade-in animate-duration-300">
          {/* Top Header Bar */}
          <div className="bg-neutral-900 border-b border-white/10 px-6 py-4 flex items-center justify-between shadow-lg shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => {
                  setFocusedQuizUrl(null);
                  setFocusedQuizTitle("");
                }}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 active:scale-95 transition-all text-neutral-300 hover:text-white cursor-pointer"
                title="Kembali ke Immersive"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <div className="flex flex-col min-w-0">
                <div className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest leading-none">
                  Fokus Mode Mengerjakan Soal
                </div>
                <h2 className="text-sm font-bold text-white truncate mt-1">
                  {focusedQuizTitle || "Lembar Kerja Siswa"}
                </h2>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-300 font-sans tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                IMMERSIVE INTERACTIVE QUIZ
              </div>
              <button
                onClick={() => {
                  setFocusedQuizUrl(null);
                  setFocusedQuizTitle("");
                }}
                className="px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold font-sans tracking-wide transition-all border border-emerald-400/20 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-900/20"
              >
                Selesai & Keluar ×
              </button>
            </div>
          </div>
          
          {/* Full Frame iFrame viewport */}
          <div className="flex-1 w-full bg-neutral-900 relative">
            <iframe
              src={(() => {
                let cleanUrl = focusedQuizUrl.trim();
                if (cleanUrl.includes("docs.google.com/forms") && !cleanUrl.includes("embedded=true")) {
                  if (cleanUrl.includes("?")) {
                    cleanUrl = cleanUrl.replace(/(\?|&)usp=[^&]+/, "");
                    cleanUrl += cleanUrl.endsWith("&") || cleanUrl.endsWith("?") ? "embedded=true" : "&embedded=true";
                  } else {
                    cleanUrl += "?embedded=true";
                  }
                }
                return cleanUrl;
              })()}
              className="w-full h-full border-none bg-white"
              title="Google Form Quiz"
              allow="autoplay; camera; microphone"
            />
          </div>
        </div>
      )}
    </div>
  );
}

