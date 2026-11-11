import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { playVRClickSound, playVRHoverSound } from "../lib/vrAudio";
import { triggerQuestHaptics } from "./QuestControllerManager";
import { useXR } from "@react-three/xr";
import { collectRaycastCandidates, dispatchVRSelect, findInteractable as findInteractableIn } from "../lib/vrInteract";

interface ControllerState {
  controller: THREE.XRTargetRaySpace;
  grip: THREE.XRGripSpace;
  handedness: "left" | "right" | "unknown";
  modelHand: "left" | "right";
  isTrackedHand: boolean;
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

type FingerRig = { joints: THREE.Object3D[]; kind: "index" | "grip" | "thumb" };

/**
 * Tangan VR (tanpa gambar controller). Dipasang pada "grip space" controller, jadi posisinya
 * selalu sama dengan controller yang dipegang, dan jarinya mengikuti tombol:
 * telunjuk = trigger, tiga jari lain = grip, jempol = stik / tombol A·B·X·Y.
 *
 * Arah lokal (tangan kanan; tangan kiri dicerminkan pada sumbu X): jari menunjuk ke -Z,
 * telapak menghadap -X, jempol di atas (+Y), pergelangan ke arah +Z.
 */
function createControllerVisual(handedness: "left" | "right"): THREE.Group {
  const group = new THREE.Group();
  group.name = `VR_ControllerModel_${handedness}`;

  const isLeft = handedness === "left";
  const mirrorX = isLeft ? -1 : 1;
  // Manset kiri = biru, kanan = oranye, supaya mudah dibedakan di dalam VR
  const accent = isLeft ? 0x38bdf8 : 0xfb923c;

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ec, roughness: 0.62, metalness: 0 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, roughness: 0.7, metalness: 0 });
  const cuffMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.1 });
  const bandMat = new THREE.MeshBasicMaterial({ color: accent });

  const hand = new THREE.Group();
  const PX = mirrorX * 0.03; // bidang telapak

  // Telapak: kotak membulat + bantalan pangkal jempol & sisi kelingking
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.092, 0.088, 4, 0.0145), skinMat);
  palm.position.set(PX, -0.04, 0.006);
  hand.add(palm);
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.021, 14, 10), padMat);
  thenar.scale.set(0.75, 1, 1.35);
  thenar.position.set(PX - mirrorX * 0.007, -0.012, 0.022);
  hand.add(thenar);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), padMat);
  heel.scale.set(0.7, 1.25, 1.3);
  heel.position.set(PX - mirrorX * 0.006, -0.062, 0.024);
  hand.add(heel);

  // Pergelangan + manset sarung tangan
  const wristGeo = new THREE.CylinderGeometry(0.031, 0.034, 0.06, 18);
  wristGeo.rotateX(Math.PI / 2);
  const wrist = new THREE.Mesh(wristGeo, skinMat);
  wrist.scale.set(0.62, 1, 1);
  wrist.position.set(PX, -0.042, 0.072);
  hand.add(wrist);
  const cuffGeo = new THREE.CylinderGeometry(0.036, 0.039, 0.05, 18);
  cuffGeo.rotateX(Math.PI / 2);
  const cuff = new THREE.Mesh(cuffGeo, cuffMat);
  cuff.scale.set(0.66, 1, 1);
  cuff.position.set(PX, -0.042, 0.118);
  hand.add(cuff);
  const bandGeo = new THREE.TorusGeometry(0.0375, 0.004, 6, 22);
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.scale.set(0.66, 1, 1);
  band.position.set(PX, -0.042, 0.094);
  hand.add(band);

  // Satu jari = rantai ruas kapsul; tiap ruas memanjang ke -Z dari sendinya
  const fingers: FingerRig[] = [];
  const buildFinger = (lengths: number[], radius: number, kind: FingerRig["kind"]) => {
    const joints: THREE.Object3D[] = [];
    let parent: THREE.Object3D | null = null;
    let root: THREE.Object3D | null = null;
    lengths.forEach((len, i) => {
      const joint = new THREE.Group();
      const r = radius * (1 - i * 0.1);
      const geo = new THREE.CapsuleGeometry(r, len, 4, 10);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, -len / 2);
      joint.add(new THREE.Mesh(geo, skinMat));
      if (parent) {
        joint.position.set(0, 0, -lengths[i - 1]);
        parent.add(joint);
      } else {
        root = joint;
      }
      parent = joint;
      joints.push(joint);
    });
    fingers.push({ joints, kind });
    return root as unknown as THREE.Object3D;
  };

  const fingerYs = [-0.004, -0.027, -0.05, -0.071];
  const fingerLens = [0.04, 0.044, 0.04, 0.031];
  const fingerRadii = [0.0088, 0.009, 0.0085, 0.0076];
  const fan = [0.07, 0.0, -0.06, -0.14]; // jari sedikit mengipas
  for (let f = 0; f < 4; f++) {
    const len = fingerLens[f];
    const mount = new THREE.Group();
    mount.position.set(PX, fingerYs[f], -0.036);
    mount.rotation.x = fan[f];
    mount.add(buildFinger([len, len * 0.64, len * 0.5], fingerRadii[f], f === 0 ? "index" : "grip"));
    hand.add(mount);
  }

  // Jempol: di atas telapak, mengarah ke depan-dalam
  const thumbMount = new THREE.Group();
  thumbMount.position.set(PX - mirrorX * 0.008, 0.004, 0.018);
  thumbMount.add(buildFinger([0.036, 0.028], 0.0108, "thumb"));
  hand.add(thumbMount);

  group.add(hand);
  group.userData.fingers = fingers;
  group.userData.mirrorX = mirrorX;
  group.userData.pose = { trigger: 0, grip: 0, thumb: 0 };
  applyFingerCurl(group, 0, 0, 0, 1);

  // Prevent raycaster from hitting the hand itself
  group.traverse((child) => {
    child.userData.isLaserHelper = true;
    child.name = `VR_Helper_${handedness}`;
  });

  return group;
}

/**
 * Tekuk jari mengikuti tombol controller (nilai 0–1). `blend` < 1 menghaluskan gerakan
 * antar-frame supaya jari tidak meloncat.
 */
function applyFingerCurl(model: THREE.Group, trigger: number, grip: number, thumb: number, blend = 1) {
  const fingers = model.userData.fingers as FingerRig[] | undefined;
  const pose = model.userData.pose as { trigger: number; grip: number; thumb: number } | undefined;
  if (!fingers || !pose) return;
  pose.trigger += (trigger - pose.trigger) * blend;
  pose.grip += (grip - pose.grip) * blend;
  pose.thumb += (thumb - pose.thumb) * blend;
  const mirrorX = (model.userData.mirrorX as number) || 1;
  for (let i = 0; i < fingers.length; i++) {
    const f = fingers[i];
    if (f.kind === "thumb") {
      const v = pose.thumb;
      // lepas: jempol terangkat; menyentuh stik/tombol: turun dan menekuk ke dalam
      f.joints[0].rotation.set(0.5 - 0.42 * v, mirrorX * (0.5 + 0.35 * v), 0);
      f.joints[1].rotation.set(0, mirrorX * (0.15 + 0.6 * v), 0);
      continue;
    }
    const v = f.kind === "index" ? pose.trigger : pose.grip;
    // Putaran positif pada +Y mengayun -Z ke arah -X (tangan kanan menekuk ke telapak)
    const rest = f.kind === "index" ? 0.1 : 0.32;
    f.joints[0].rotation.y = mirrorX * (rest + (1.25 - rest) * v);
    f.joints[1].rotation.y = mirrorX * (rest * 1.3 + 1.25 * v);
    f.joints[2].rotation.y = mirrorX * (rest * 1.1 + 0.85 * v);
  }
}

/** Seberapa "aktif" jempol: menyentuh / menekan stik atau tombol muka, atau stik digerakkan. */
function thumbActivity(gp: Gamepad): number {
  let v = 0;
  for (let i = 2; i < gp.buttons.length; i++) {
    const b = gp.buttons[i];
    if (!b) continue;
    if (b.pressed) v = 1;
    else if (b.touched) v = Math.max(v, 0.75);
  }
  for (let i = 0; i < gp.axes.length; i++) v = Math.max(v, Math.min(1, Math.abs(gp.axes[i]) * 1.5));
  return v;
}

export function WebXRControllerManager() {
  const { gl, scene, camera } = useThree();
  // The player rig (XROrigin). Controllers must live inside it, otherwise the hands
  // stay behind at the spawn point when the player walks or turns with the thumbstick.
  const xrOrigin = useXR((s) => s.origin);
  const xrOriginRef = useRef<THREE.Object3D | undefined>(undefined);
  xrOriginRef.current = xrOrigin as THREE.Object3D | undefined;
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
        modelHand: initialHand,
        isTrackedHand: false,
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
        // Hand-tracking (no controller held): the XR runtime draws the real hand instead
        stateItem.isTrackedHand = !!event.data?.hand && !event.data?.gamepad;

        // Rebuild the visual when the real handedness differs from the slot's guess,
        // so the left controller always shows a left hand and vice versa.
        if (hand !== stateItem.modelHand && (hand === "left" || hand === "right")) {
          grip.remove(stateItem.controllerModel);
          stateItem.controllerModel = createControllerVisual(hand);
          stateItem.modelHand = hand;
          grip.add(stateItem.controllerModel);
        }

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

          dispatchVRSelect(target, _tempHitPoint, scene, {
            controllerIndex: i,
            handedness: stateItem.handedness,
          });
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
        controller.removeFromParent();
        grip.removeFromParent();
        scene.remove(reticle);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        beamGlow.geometry.dispose();
        (beamGlow.material as THREE.Material).dispose();
      });
      controllersRef.current = [];
    };
  }, [gl, scene]);

  const findInteractable = (obj: THREE.Object3D | null) => findInteractableIn(obj, scene);

  // Pre-filter candidate interactable objects periodically (every 0.5s) to avoid 90Hz scene traversals
  const updateCandidateObjects = (clockTime: number) => {
    if (clockTime - lastCandidateRefreshRef.current < 0.5) return;
    lastCandidateRefreshRef.current = clockTime;
    candidateObjectsRef.current = collectRaycastCandidates(scene);
  };

  // High-performance useFrame loop with zero garbage generation
  useFrame((state, delta) => {
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

    // Keep controllers inside the player rig so they follow thumbstick locomotion
    const rig = xrOriginRef.current || scene;
    for (let idx = 0; idx < controllersRef.current.length; idx++) {
      const c = controllersRef.current[idx];
      if (c.controller.parent !== rig) {
        rig.add(c.controller);
        rig.add(c.grip);
      }
    }

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

      // Jari mengikuti tombol controller yang sedang ditekan / disentuh
      const blend = 1 - Math.exp(-22 * Math.min(delta, 0.05));
      if (c.gamepad) {
        const b = c.gamepad.buttons;
        applyFingerCurl(c.controllerModel, b[0]?.value || 0, b[1]?.value || 0, thumbActivity(c.gamepad), blend);
      } else {
        applyFingerCurl(c.controllerModel, 0, 0, 0, blend);
      }

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

