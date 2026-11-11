import React, { useRef, useState, useEffect } from 'react';

export const joystickState = { x: 0, y: 0 };

export const VirtualJoystick = () => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    setActive(true);
    updateJoystick(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!active) return;
    e.stopPropagation();
    updateJoystick(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
    setActive(false);
    setPosition({ x: 0, y: 0 });
    joystickState.x = 0;
    joystickState.y = 0;
  };

  const updateJoystick = (e: React.PointerEvent) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), rect.width / 2);
    const angle = Math.atan2(dy, dx);
    
    const newX = Math.cos(angle) * distance;
    const newY = Math.sin(angle) * distance;
    
    setPosition({ x: newX, y: newY });
    
    joystickState.x = newX / (rect.width / 2);
    joystickState.y = -newY / (rect.width / 2);
  };

  useEffect(() => {
    const handleUp = () => {
      setActive(false);
      setPosition({ x: 0, y: 0 });
      joystickState.x = 0;
      joystickState.y = 0;
    };
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, []);

  return (
    <div 
      ref={baseRef}
      className="w-32 h-32 bg-white/10 border-2 border-white/20 rounded-full flex items-center justify-center backdrop-blur-md touch-none relative"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div 
        className="w-12 h-12 bg-white/70 rounded-full shadow-lg absolute"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      />
    </div>
  );
};
