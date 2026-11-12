import React from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Avatar pemain (mode orang ketiga): teknisi EV dengan helm, rompi, dan sarung tangan isolasi.
 * Seluruhnya dari kapsul / bola supaya halus, dengan siku dan lutut yang ikut menekuk saat
 * berjalan dan pose melompat saat di udara. ± 3 rb segitiga.
 */

const SKIN = "#e8b08a";
const noRaycast = () => null;

/** Satu ruas anggota badan: kapsul yang memanjang ke bawah dari titik sendinya. */
function Limb({ length, radius, color, children }: { length: number; radius: number; color: string; children?: React.ReactNode }) {
  return (
    <>
      <mesh position={[0, -length / 2, 0]} raycast={noRaycast}>
        <capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <group position={[0, -length, 0]}>{children}</group>
    </>
  );
}

export const HumanCharacter = React.forwardRef<
  THREE.Group,
  { isMovingRef: React.MutableRefObject<boolean>; jumpRef?: React.MutableRefObject<{ y: number; vy: number }> }
>(({ isMovingRef, jumpRef }, ref) => {
  const hipL = React.useRef<THREE.Group>(null);
  const hipR = React.useRef<THREE.Group>(null);
  const kneeL = React.useRef<THREE.Group>(null);
  const kneeR = React.useRef<THREE.Group>(null);
  const shoulderL = React.useRef<THREE.Group>(null);
  const shoulderR = React.useRef<THREE.Group>(null);
  const elbowL = React.useRef<THREE.Group>(null);
  const elbowR = React.useRef<THREE.Group>(null);
  const torso = React.useRef<THREE.Group>(null);
  const head = React.useRef<THREE.Group>(null);
  const phase = React.useRef(0);
  const blend = React.useRef(0); // 0 = diam, 1 = berjalan

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.getElapsedTime();
    const airborne = !!jumpRef && jumpRef.current.y > 0.02;
    const walking = isMovingRef.current && !airborne;
    blend.current = THREE.MathUtils.damp(blend.current, walking ? 1 : 0, 10, delta);
    if (walking) phase.current += delta * 9;
    const k = blend.current;
    const swing = Math.sin(phase.current);
    const k2 = Math.min(1, 12 * delta);
    const to = (g: THREE.Group | null, x: number, z = 0) => {
      if (!g) return;
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, x, k2);
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, z, k2);
    };

    if (airborne) {
      // melompat: lengan terangkat, lutut ditekuk
      to(hipL.current, -0.5);
      to(hipR.current, -0.25);
      to(kneeL.current, 0.9);
      to(kneeR.current, 0.6);
      to(shoulderL.current, -2.4, -0.25);
      to(shoulderR.current, -2.4, 0.25);
      to(elbowL.current, -0.3);
      to(elbowR.current, -0.3);
    } else {
      to(hipL.current, swing * 0.7 * k);
      to(hipR.current, -swing * 0.7 * k);
      // lutut hanya menekuk saat kaki mengayun ke belakang
      to(kneeL.current, Math.max(0, -swing) * 0.9 * k);
      to(kneeR.current, Math.max(0, swing) * 0.9 * k);
      to(shoulderL.current, -swing * 0.6 * k, -0.07);
      to(shoulderR.current, swing * 0.6 * k, 0.07);
      to(elbowL.current, -0.15 - Math.max(0, swing) * 0.5 * k);
      to(elbowR.current, -0.15 - Math.max(0, -swing) * 0.5 * k);
    }

    const g = ref && typeof ref !== "function" ? ref.current : null;
    if (g) g.position.y = 0.9 + Math.abs(Math.sin(phase.current)) * 0.05 * k;
    if (torso.current) {
      torso.current.rotation.x = 0.06 * k; // sedikit condong saat berjalan
      torso.current.scale.y = 1 + Math.sin(t * 2) * 0.012 * (1 - k); // bernapas saat diam
    }
    if (head.current) head.current.rotation.y = Math.sin(t * 0.7) * 0.12 * (1 - k);
  });

  return (
    <group ref={ref} position={[0, 0.9, 0]}>
      {/* ---------- Badan ---------- */}
      <group ref={torso}>
        {/* pinggul */}
        <mesh position={[0, 0.02, 0]} scale={[1, 0.7, 0.8]} raycast={noRaycast}>
          <sphereGeometry args={[0.2, 20, 14]} />
          <meshStandardMaterial color="#1f2937" roughness={0.75} />
        </mesh>
        {/* dada: kaus biru */}
        <mesh position={[0, 0.3, 0]} scale={[1, 1, 0.72]} raycast={noRaycast}>
          <capsuleGeometry args={[0.2, 0.26, 8, 20]} />
          <meshStandardMaterial color="#2563eb" roughness={0.7} />
        </mesh>
        {/* rompi keselamatan + pita pantul */}
        <mesh position={[0, 0.31, 0]} scale={[1.06, 0.9, 0.78]} raycast={noRaycast}>
          <capsuleGeometry args={[0.2, 0.2, 8, 20]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.6} />
        </mesh>
        {[0.2, 0.36].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.09, 0.81, 1]} raycast={noRaycast}>
            <torusGeometry args={[0.2, 0.018, 8, 28]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.25} roughness={0.4} />
          </mesh>
        ))}
        {/* leher */}
        <mesh position={[0, 0.62, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.06, 0.07, 0.1, 14]} />
          <meshStandardMaterial color={SKIN} roughness={0.7} />
        </mesh>

        {/* ---------- Kepala ---------- */}
        <group ref={head} position={[0, 0.82, 0]}>
          <mesh scale={[0.92, 1.05, 0.96]} raycast={noRaycast}>
            <sphereGeometry args={[0.17, 28, 20]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          {/* rambut di tengkuk */}
          <mesh position={[0, 0.0, -0.035]} scale={[0.95, 1.02, 0.95]} raycast={noRaycast}>
            <sphereGeometry args={[0.172, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color="#1c1917" roughness={0.9} />
          </mesh>
          {/* mata & alis */}
          {[-0.058, 0.058].map((x) => (
            <group key={x} position={[x, 0.02, 0.148]}>
              <mesh scale={[1, 1.25, 0.5]} raycast={noRaycast}>
                <sphereGeometry args={[0.02, 12, 10]} />
                <meshStandardMaterial color="#111827" roughness={0.3} />
              </mesh>
              <mesh position={[0.005, 0.008, 0.008]} raycast={noRaycast}>
                <sphereGeometry args={[0.006, 8, 6]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
          {/* senyum */}
          <mesh position={[0, -0.062, 0.146]} rotation={[0.25, 0, Math.PI]} raycast={noRaycast}>
            <torusGeometry args={[0.038, 0.007, 6, 14, Math.PI]} />
            <meshStandardMaterial color="#9f1239" roughness={0.6} />
          </mesh>
          {/* telinga */}
          {[-0.158, 0.158].map((x) => (
            <mesh key={x} position={[x, 0, 0]} scale={[0.5, 1, 0.8]} raycast={noRaycast}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <meshStandardMaterial color={SKIN} roughness={0.7} />
            </mesh>
          ))}
          {/* helm keselamatan */}
          <mesh position={[0, 0.07, 0]} scale={[1.02, 0.9, 1.06]} raycast={noRaycast}>
            <sphereGeometry args={[0.185, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#facc15" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.072, 0.03]} scale={[1.06, 1, 1.22]} raycast={noRaycast}>
            <cylinderGeometry args={[0.19, 0.2, 0.018, 28]} />
            <meshStandardMaterial color="#eab308" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 2, 0]} scale={[1, 0.6, 0.3]} raycast={noRaycast}>
            <torusGeometry args={[0.15, 0.03, 8, 20, Math.PI]} />
            <meshStandardMaterial color="#eab308" roughness={0.35} />
          </mesh>
        </group>

        {/* ---------- Lengan ---------- */}
        {(
          [
            [-1, shoulderL, elbowL],
            [1, shoulderR, elbowR],
          ] as [number, React.RefObject<THREE.Group | null>, React.RefObject<THREE.Group | null>][]
        ).map(([side, shoulder, elbow]) => (
          <group key={side} position={[side * 0.27, 0.5, 0]} ref={shoulder}>
            <mesh raycast={noRaycast}>
              <sphereGeometry args={[0.075, 14, 10]} />
              <meshStandardMaterial color="#2563eb" roughness={0.7} />
            </mesh>
            <Limb length={0.27} radius={0.062} color="#2563eb">
              <group ref={elbow}>
                <Limb length={0.24} radius={0.052} color={SKIN}>
                  {/* sarung tangan isolasi oranye */}
                  <mesh position={[0, -0.02, 0]} scale={[0.85, 1.15, 1]} raycast={noRaycast}>
                    <sphereGeometry args={[0.062, 14, 10]} />
                    <meshStandardMaterial color="#ea580c" roughness={0.6} />
                  </mesh>
                  <mesh position={[0, 0.035, 0]} raycast={noRaycast}>
                    <cylinderGeometry args={[0.058, 0.054, 0.05, 14]} />
                    <meshStandardMaterial color="#c2410c" roughness={0.6} />
                  </mesh>
                </Limb>
              </group>
            </Limb>
          </group>
        ))}
      </group>

      {/* ---------- Kaki ---------- */}
      {(
        [
          [-1, hipL, kneeL],
          [1, hipR, kneeR],
        ] as [number, React.RefObject<THREE.Group | null>, React.RefObject<THREE.Group | null>][]
      ).map(([side, hip, knee]) => (
        <group key={side} position={[side * 0.1, 0, 0]} ref={hip}>
          <Limb length={0.42} radius={0.085} color="#1f2937">
            <group ref={knee}>
              <Limb length={0.4} radius={0.07} color="#1f2937">
                {/* sepatu keselamatan */}
                <mesh position={[0, -0.015, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.72]} raycast={noRaycast}>
                  <capsuleGeometry args={[0.07, 0.12, 6, 14]} />
                  <meshStandardMaterial color="#facc15" roughness={0.5} />
                </mesh>
                <mesh position={[0, -0.062, 0.05]} raycast={noRaycast}>
                  <boxGeometry args={[0.13, 0.025, 0.25]} />
                  <meshStandardMaterial color="#0b0f17" roughness={0.9} />
                </mesh>
              </Limb>
            </group>
          </Limb>
        </group>
      ))}
    </group>
  );
});
