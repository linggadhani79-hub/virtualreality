import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { playVRClickSound, playVRHoverSound } from "../lib/vrAudio";
import { triggerQuestHaptics } from "./QuestControllerManager";

interface ControllerState {
  controller: THREE.XRTargetRaySpace;
  grip: THREE.XRGripSpace;
  handedness: "left" | "right" | "unknown";
  connected: boolean;
  gamepad: Gamepad | null;
  line: THREE.Line;
  beamGlow: THREE.Mesh;
  reticle: THREE.Group;
  controllerModel: THREE.Group;
  hoveredObject: THREE.Object3D | null;
  hoveredInteractable: THREE.Object3D | null;
  wasHovering: boolean;
}

// Pre-allocated reusable math structures to completely eliminate Garbage Collection stutter
const _tempMatrix = new THREE.Matrix4();
const _tempRayOrigin = new THREE.Vector3();
const _tempRayDirection = new THREE.Vector3();
const _tempHitPoint = new THREE.Vector3();
const _tempScale = new THREE.Vector3(1, 1, 1);

// Build lightweight, stylish 3D Quest Controller Visual Representation
function createControllerVisual(handedness: "left" | "right"): THREE.Group {
  const group = new THREE.Group();
  group.name = `VR_ControllerModel_${handedness}`;

  const isLeft = handedness === "left";
  const mirrorX = isLeft ? -1 : 1;

  // 1. Ergonomic Handle Grip
  const handleGeo = new THREE.CylinderGeometry(0.016, 0.019, 0.12, 16);
  handleGeo.rotateX(Math.PI / 12);
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.2,
  });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0, -0.04, 0.01);
  group.add(handle);

  // 2. Top Faceplate
  const faceGeo = new THREE.CylinderGeometry(0.026, 0.024, 0.012, 16);
  faceGeo.rotateX(Math.PI / 8);
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
    metalness: 0.3,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(0, 0.015, -0.01);
  group.add(face);

  // 3. Thumbstick with Glowing Accent
  const stickBaseGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.008, 12);
  const stickTopGeo = new THREE.SphereGeometry(0.008, 12, 8);
  stickTopGeo.scale(1, 0.4, 1);
  const stickMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });
  const stick = new THREE.Group();
  const stickBase = new THREE.Mesh(stickBaseGeo, handleMat);
  const stickTop = new THREE.Mesh(stickTopGeo, stickMat);
  stickTop.position.y = 0.005;
  stick.add(stickBase);
  stick.add(stickTop);
  stick.position.set(mirrorX * 0.008, 0.022, -0.012);
  stick.rotation.x = -Math.PI / 10;
  group.add(stick);

  // 4. Action Buttons (A/B or X/Y)
  const btnGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.004, 10);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });
  const btn1 = new THREE.Mesh(btnGeo, btnMat);
  btn1.position.set(-mirrorX * 0.009, 0.023, -0.006);
  btn1.rotation.x = -Math.PI / 8;
  const btn2 = new THREE.Mesh(btnGeo, btnMat);
  btn2.position.set(-mirrorX * 0.009, 0.021, -0.016);
  btn2.rotation.x = -Math.PI / 8;
  group.add(btn1);
  group.add(btn2);

  // 5. Index Trigger underneath
  const triggerGeo = new THREE.BoxGeometry(0.012, 0.02, 0.018);
  const trigger = new THREE.Mesh(triggerGeo, handleMat);
  trigger.position.set(0, 0.005, -0.035);
  trigger.rotation.x = Math.PI / 6;
  group.add(trigger);

  // 6. Signature VR Tracking Halo / Ring
  const ringGeo = new THREE.TorusGeometry(0.042, 0.004, 8, 24, Math.PI * 1.5);
  ringGeo.rotateX(Math.PI / 3);
  ringGeo.rotateZ(mirrorX * Math.PI / 6);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(mirrorX * 0.005, 0.02, -0.02);
  group.add(ring);

  // 7. Glowing LED Status Indicator
  const ledGeo = new THREE.SphereGeometry(0.002, 8, 8);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.set(0, 0.025, 0.005);
  group.add(led);

  // Prevent raycaster from hitting the controller itself
  group.traverse((child) => {
    child.userData.isLaserHelper = true;
    child.name = `VR_Helper_${handedness}`;
  });

  return group;
}

export function WebXRControllerManager() {
  const { gl, scene, camera } = useThree();
  const controllersRef = useRef<ControllerState[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const candidateObjectsRef = useRef<THREE.Object3D[]>([]);
  const lastCandidateRefreshRef = useRef(0);

  // High-contrast Palette
  const IDLE_COLOR = new THREE.Color("#00f0ff"); // Cyan
  const HOVER_COLOR = new THREE.Color("#fbbf24"); // Gold
  const LOCKON_COLOR = new THREE.Color("#10b981"); // Emerald

  useEffect(() => {
    if (!gl.xr) return;

    const onSessionStart = () => {
      const session = gl.xr.getSession?.();
      if (!session) return;

      // Lock to highest stable refresh rate (90Hz -> fallback 72Hz)
      try {
        const supported = (session as any).supportedFrameRates as number[] | undefined;
        if (supported && typeof (session as any).updateTargetFrameRate === "function") {
          if (supported.includes(90)) {
            (session as any).updateTargetFrameRate(90).catch(() => {});
          } else if (supported.includes(72)) {
            (session as any).updateTargetFrameRate(72).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("[WebXRControllerManager] updateTargetFrameRate error:", e);
      }

      // Quest Fixed Foveated Rendering
      try {
        if (typeof (gl.xr as any).setFoveation === "function") {
          (gl.xr as any).setFoveation(1.0);
        }
      } catch (e) {
        console.warn("[WebXRControllerManager] setFoveation error:", e);
      }

      // Optimal framebuffer scale for high framerate
      try {
        if (typeof (gl.xr as any).setFramebufferScaleFactor === "function") {
          (gl.xr as any).setFramebufferScaleFactor(0.95);
        }
      } catch {}
    };

    gl.xr.addEventListener("sessionstart", onSessionStart);
    if (gl.xr.isPresenting) {
      onSessionStart();
    }

    const controllerStates: ControllerState[] = [];

    // Setup Dual Controllers (Index 0 and Index 1)
    for (let i = 0; i < 2; i++) {
      const controller = gl.xr.getController(i);
      const grip = gl.xr.getControllerGrip(i);
      const initialHand: "left" | "right" = i === 0 ? "right" : "left";

      // 1. Core Laser Beam (Line)
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -4.5),
      ]);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: IDLE_COLOR,
        transparent: true,
        opacity: 0.85,
        linewidth: 3,
        depthWrite: false,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.name = `VR_LaserLine_${i}`;
      line.userData.isLaserHelper = true;
      line.visible = false;
      controller.add(line);

      // 2. Volumetric Glow Cylinder for thick high-visibility laser in VR
      const glowGeo = new THREE.CylinderGeometry(0.003, 0.003, 4.5, 8);
      glowGeo.rotateX(Math.PI / 2);
      glowGeo.translate(0, 0, -2.25);
      const glowMat = new THREE.MeshBasicMaterial({
        color: IDLE_COLOR,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      const beamGlow = new THREE.Mesh(glowGeo, glowMat);
      beamGlow.name = `VR_BeamGlow_${i}`;
      beamGlow.userData.isLaserHelper = true;
      beamGlow.visible = false;
      controller.add(beamGlow);

      // 3. Precision Hit Reticle Ring + Dot
      const reticleGroup = new THREE.Group();
      reticleGroup.name = `VR_Reticle_${i}`;
      reticleGroup.userData.isLaserHelper = true;
      reticleGroup.visible = false;

      const ringGeometry = new THREE.RingGeometry(0.02, 0.032, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: IDLE_COLOR,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      reticleGroup.add(ringMesh);

      const dotGeometry = new THREE.CircleGeometry(0.008, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({
        color: IDLE_COLOR,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
      reticleGroup.add(dotMesh);

      scene.add(reticleGroup);

      // 4. Visual 3D Controller Model attached to grip space
      const controllerModel = createControllerVisual(initialHand);
      controllerModel.visible = false;
      grip.add(controllerModel);

      // CRUCIAL: Add controllers & grips to the scene so Three.js WebXR updates their world matrices!
      scene.add(controller);
      scene.add(grip);

      const stateItem: ControllerState = {
        controller,
        grip,
        handedness: initialHand,
        connected: false,
        gamepad: null,
        line,
        beamGlow,
        reticle: reticleGroup,
        controllerModel,
        hoveredObject: null,
        hoveredInteractable: null,
        wasHovering: false,
      };

      // Event Listeners
      const handleConnected = (event: any) => {
        stateItem.connected = true;
        const hand = (event.data?.handedness as "left" | "right") || initialHand;
        stateItem.handedness = hand;
        stateItem.gamepad = event.data?.gamepad || null;

        stateItem.line.visible = true;
        stateItem.beamGlow.visible = true;
        stateItem.reticle.visible = true;
        stateItem.controllerModel.visible = true;
      };

      const handleDisconnected = () => {
        stateItem.connected = false;
        stateItem.gamepad = null;
        stateItem.line.visible = false;
        stateItem.beamGlow.visible = false;
        stateItem.reticle.visible = false;
        stateItem.controllerModel.visible = false;
        stateItem.hoveredObject = null;
        stateItem.hoveredInteractable = null;
      };

      const handleSelect = () => {
        // Haptic feedback pulse on active controller
        if (stateItem.gamepad) {
          const gp = stateItem.gamepad as any;
          if (gp.hapticActuators && gp.hapticActuators[0]) {
            try {
              gp.hapticActuators[0].pulse(0.9, 70);
            } catch {}
          } else {
            triggerQuestHaptics(0.9, 70, stateItem.handedness === "left" ? "left" : "right");
          }
        } else {
          triggerQuestHaptics(0.9, 70);
        }

        const target = stateItem.hoveredInteractable || stateItem.hoveredObject;
        if (target) {
          playVRClickSound();

          const simulatedEvent = {
            object: target,
            point: _tempHitPoint.clone(),
            distance: 0,
            controllerIndex: i,
            handedness: stateItem.handedness,
            stopPropagation: () => {},
            nativeEvent: {},
          };

          // 1. Direct userData.onClick
          if (typeof target.userData?.onClick === "function") {
            try {
              target.userData.onClick(simulatedEvent);
            } catch (err) {
              console.error("[WebXRControllerManager] onClick error:", err);
            }
          }

          // 2. Direct userData.onSelect
          if (typeof target.userData?.onSelect === "function") {
            try {
              target.userData.onSelect(simulatedEvent);
            } catch (err) {
              console.error("[WebXRControllerManager] onSelect error:", err);
            }
          }

          // 3. Dispatch to parent ancestors
          let parent: THREE.Object3D | null = target.parent;
          while (parent && parent !== scene) {
            if (typeof parent.userData?.onClick === "function") {
              try {
                parent.userData.onClick(simulatedEvent);
              } catch (err) {
                console.error("[WebXRControllerManager] parent onClick error:", err);
              }
              break;
            }
            if (typeof parent.userData?.onSelect === "function") {
              try {
                parent.userData.onSelect(simulatedEvent);
              } catch (err) {
                console.error("[WebXRControllerManager] parent onSelect error:", err);
              }
              break;
            }
            parent = parent.parent;
          }

          // 4. Dispatch synthetic pointer events
          try {
            (target as any).dispatchEvent({ type: "click", ...simulatedEvent });
            (target as any).dispatchEvent({ type: "pointerdown", ...simulatedEvent });
            (target as any).dispatchEvent({ type: "pointerup", ...simulatedEvent });
          } catch {}
        }
      };

      controller.addEventListener("connected", handleConnected);
      controller.addEventListener("disconnected", handleDisconnected);
      controller.addEventListener("select", handleSelect);

      controllerStates.push(stateItem);
    }

    controllersRef.current = controllerStates;

    return () => {
      gl.xr.removeEventListener("sessionstart", onSessionStart);
      controllerStates.forEach(({ controller, grip, line, beamGlow, reticle, controllerModel }) => {
        controller.remove(line);
        controller.remove(beamGlow);
        grip.remove(controllerModel);
        scene.remove(controller);
        scene.remove(grip);
        scene.remove(reticle);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        beamGlow.geometry.dispose();
        (beamGlow.material as THREE.Material).dispose();
      });
      controllersRef.current = [];
    };
  }, [gl, scene]);

  // Fast helper: Ascend hierarchy to find interactable trigger
  const findInteractable = (obj: THREE.Object3D | null): THREE.Object3D | null => {
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
  };

  // Pre-filter candidate interactable objects periodically (every 0.5s) to avoid 90Hz scene traversals
  const updateCandidateObjects = (clockTime: number) => {
    if (clockTime - lastCandidateRefreshRef.current < 0.5) return;
    lastCandidateRefreshRef.current = clockTime;

    const list: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (!child.visible) return;
      if (child.userData?.isLaserHelper || child.name?.startsWith("VR_")) return;
      if (child.type === "Line" || child.type === "LineSegments") return;
      if (child instanceof THREE.Mesh) {
        list.push(child);
      }
    });
    candidateObjectsRef.current = list;
  };

  // High-performance useFrame loop with zero garbage generation
  useFrame((state) => {
    if (!gl.xr || !gl.xr.isPresenting) {
      controllersRef.current.forEach((c) => {
        if (c.line.visible) c.line.visible = false;
        if (c.beamGlow.visible) c.beamGlow.visible = false;
        if (c.reticle.visible) c.reticle.visible = false;
        if (c.controllerModel.visible) c.controllerModel.visible = false;
      });
      return;
    }

    updateCandidateObjects(state.clock.elapsedTime);

    const candidates = candidateObjectsRef.current;
    const activeCam = (gl.xr?.isPresenting && (gl.xr as any).getCamera)
      ? ((gl.xr as any).getCamera() || camera)
      : camera;
    (raycasterRef.current as any).camera = activeCam;
    raycasterRef.current.near = 0.05;
    raycasterRef.current.far = 12.0;

    for (let idx = 0; idx < controllersRef.current.length; idx++) {
      const c = controllersRef.current[idx];
      if (!c.connected) {
        c.line.visible = false;
        c.beamGlow.visible = false;
        c.reticle.visible = false;
        c.controllerModel.visible = false;
        continue;
      }

      c.line.visible = true;
      c.beamGlow.visible = true;
      c.reticle.visible = true;
      c.controllerModel.visible = true;

      // Extract controller ray origin and forward direction
      _tempMatrix.identity().extractRotation(c.controller.matrixWorld);
      _tempRayOrigin.setFromMatrixPosition(c.controller.matrixWorld);
      _tempRayDirection.set(0, 0, -1).applyMatrix4(_tempMatrix).normalize();

      raycasterRef.current.set(_tempRayOrigin, _tempRayDirection);

      let hits: THREE.Intersection[] = [];
      try {
        hits = raycasterRef.current.intersectObjects(candidates, false);
      } catch {
        hits = [];
      }

      let hitDistance = 4.5;
      let isHoveringInteractable = false;

      if (hits.length > 0) {
        const firstHit = hits[0];
        hitDistance = Math.min(firstHit.distance, 10.0);
        _tempHitPoint.copy(firstHit.point);

        c.hoveredObject = firstHit.object;
        const interactable = findInteractable(firstHit.object);
        c.hoveredInteractable = interactable;

        if (interactable) {
          isHoveringInteractable = true;
        }

        // Position reticle ring right at the surface hit point
        c.reticle.position.copy(firstHit.point);
        c.reticle.lookAt(activeCam.position);
      } else {
        c.hoveredObject = null;
        c.hoveredInteractable = null;

        _tempHitPoint.copy(_tempRayOrigin).addScaledVector(_tempRayDirection, hitDistance);
        c.reticle.position.copy(_tempHitPoint);
        c.reticle.lookAt(activeCam.position);
      }

      // Update laser line & volumetric beam scale
      const linePositions = c.line.geometry.attributes.position as THREE.BufferAttribute;
      linePositions.setXYZ(1, 0, 0, -hitDistance);
      linePositions.needsUpdate = true;

      c.beamGlow.scale.set(1, hitDistance / 4.5, 1);

      // Dynamic Color & Lock-on Feedback
      const lineMat = c.line.material as THREE.LineBasicMaterial;
      const glowMat = c.beamGlow.material as THREE.MeshBasicMaterial;
      const ringMat = (c.reticle.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      const dotMat = (c.reticle.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;

      if (isHoveringInteractable) {
        const isButton = c.hoveredInteractable?.userData?.isVRButton;
        const targetColor = isButton ? LOCKON_COLOR : HOVER_COLOR;

        lineMat.color.copy(targetColor);
        lineMat.opacity = 0.95;
        glowMat.color.copy(targetColor);
        glowMat.opacity = 0.45;

        ringMat.color.copy(targetColor);
        dotMat.color.copy(targetColor);
        _tempScale.set(1.4, 1.4, 1.4);
        c.reticle.scale.copy(_tempScale);

        if (!c.wasHovering) {
          playVRHoverSound();
          if (c.gamepad) {
            const gp = c.gamepad as any;
            if (gp.hapticActuators && gp.hapticActuators[0]) {
              try {
                gp.hapticActuators[0].pulse(0.25, 20);
              } catch {}
            }
          }
          c.wasHovering = true;
        }
      } else {
        lineMat.color.copy(IDLE_COLOR);
        lineMat.opacity = 0.65;
        glowMat.color.copy(IDLE_COLOR);
        glowMat.opacity = 0.25;

        ringMat.color.copy(IDLE_COLOR);
        dotMat.color.copy(IDLE_COLOR);
        _tempScale.set(1.0, 1.0, 1.0);
        c.reticle.scale.copy(_tempScale);

        c.wasHovering = false;
      }
    }
  });

  return null;
}

