import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const HumanCharacter = React.forwardRef<THREE.Group, { isMovingRef: React.MutableRefObject<boolean> }>(({ isMovingRef }, ref) => {
  const leftLegRef = React.useRef<THREE.Mesh>(null);
  const rightLegRef = React.useRef<THREE.Mesh>(null);
  const leftArmRef = React.useRef<THREE.Mesh>(null);
  const rightArmRef = React.useRef<THREE.Mesh>(null);
  const headRef = React.useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    if (isMovingRef.current) {
      const speed = 10;
      const legAngle = Math.sin(time * speed) * 0.6;
      const armAngle = -Math.sin(time * speed) * 0.6;
      const bounce = Math.abs(Math.sin(time * speed)) * 0.1;
      if (leftLegRef.current) leftLegRef.current.rotation.x = legAngle;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -legAngle;
      if (leftArmRef.current) leftArmRef.current.rotation.x = armAngle;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -armAngle;
      if (ref && typeof ref !== 'function' && ref.current) {
        ref.current.position.y = bounce + 0.9; // Base height + bounce
      }
      if (headRef.current) headRef.current.rotation.y = Math.sin(time * speed * 0.5) * 0.1;
    } else {
      // Idle pose
      const lerpSpeed = Math.min(1, 10 * delta);
      if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0, lerpSpeed);
      if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, lerpSpeed);
      if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, lerpSpeed);
      if (rightArmRef.current) rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, lerpSpeed);
      if (ref && typeof ref !== 'function' && ref.current) {
         ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, 0.9, lerpSpeed);
      }
      const idleBreathing = Math.sin(time * 2) * 0.02;
      if (headRef.current) headRef.current.position.y = 0.8 + idleBreathing;
    }
  });

  return (
    <group ref={ref} position={[0, 0.9, 0]}>
      {/* Body */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
      
      {/* Head */}
      <mesh ref={headRef} position={[0, 0.8, 0]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial color="#fca5a5" />
      </mesh>

      {/* Backpack / Detail */}
      <mesh position={[0, 0.3, -0.2]}>
        <boxGeometry args={[0.3, 0.4, 0.15]} />
        <meshStandardMaterial color="#1e40af" />
      </mesh>

      {/* Left Arm */}
      <group position={[-0.35, 0.55, 0]} ref={leftArmRef}>
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.15]} />
          <meshStandardMaterial color="#fca5a5" />
        </mesh>
      </group>

      {/* Right Arm */}
      <group position={[0.35, 0.55, 0]} ref={rightArmRef}>
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.15]} />
          <meshStandardMaterial color="#fca5a5" />
        </mesh>
      </group>

      {/* Left Leg */}
      <group position={[-0.15, 0, 0]} ref={leftLegRef}>
        <mesh position={[0, -0.4, 0]}>
          <boxGeometry args={[0.18, 0.8, 0.18]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </group>

      {/* Right Leg */}
      <group position={[0.15, 0, 0]} ref={rightLegRef}>
        <mesh position={[0, -0.4, 0]}>
          <boxGeometry args={[0.18, 0.8, 0.18]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </group>
    </group>
  );
});
