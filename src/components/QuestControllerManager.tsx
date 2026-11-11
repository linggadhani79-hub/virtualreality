import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Gamepad as GamepadIcon, CheckCircle2, AlertCircle, RefreshCw, Zap, Radio, ChevronRight, HelpCircle } from "lucide-react";

export interface QuestGamepadState {
  connected: boolean;
  activeControllersCount?: number;
  leftStick: { x: number; y: number };
  rightStick: { x: number; y: number };
  buttons: {
    triggerL: number;
    triggerR: number;
    gripL: number;
    gripR: number;
    a: boolean;
    b: boolean;
    x: boolean;
    y: boolean;
    thumbstickL?: boolean;
    thumbstickR?: boolean;
    thumbL?: boolean;
    thumbR?: boolean;
  };
  names?: string[];
  lastUpdated?: number;
}

export type QuestGamepadData = QuestGamepadState;

// Global shared state for ultra-fast frame-by-frame reading in R3F useFrame loop without React re-renders
export const questGamepadGlobal: QuestGamepadData = {
  connected: false,
  activeControllersCount: 0,
  leftStick: { x: 0, y: 0 },
  rightStick: { x: 0, y: 0 },
  buttons: {
    a: false,
    b: false,
    x: false,
    y: false,
    triggerL: 0,
    triggerR: 0,
    gripL: 0,
    gripR: 0,
    thumbstickL: false,
    thumbstickR: false,
    thumbL: false,
    thumbR: false,
  },
  names: [],
  lastUpdated: Date.now(),
};

export const getQuestGamepadState = (): QuestGamepadState => questGamepadGlobal;

// Function to trigger haptic feedback on all available Quest controllers
export const triggerQuestHaptics = (
  intensity = 0.8,
  duration = 60,
  hand: "left" | "right" | "both" = "both"
) => {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return false;
  let triggered = false;
  try {
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        const gpHand = (gp as any).hand;
        const matchesHand = hand === "both" || gpHand === hand;
        if (!matchesHand) continue;

        // 1. WebXR hapticActuators API
        if ((gp as any).hapticActuators && (gp as any).hapticActuators.length > 0) {
          try {
            (gp as any).hapticActuators[0].pulse(intensity, duration);
            triggered = true;
          } catch {
            // ignore error
          }
        }
        // 2. Standard Gamepad Vibration Actuator
        if (gp.vibrationActuator) {
          try {
            gp.vibrationActuator.playEffect("dual-rumble", {
              startDelay: 0,
              duration: duration,
              weakMagnitude: intensity,
              strongMagnitude: intensity,
            });
            triggered = true;
          } catch {
            // ignore error
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return triggered;
};

// Global Toast Notification Manager for Quest 2 Connection State
type ToastCallback = (msg: string, type: "connected" | "disconnected" | "sync") => void;
const toastSubscribers: Set<ToastCallback> = new Set();

export const notifyQuestToast = (msg: string, type: "connected" | "disconnected" | "sync" = "connected") => {
  toastSubscribers.forEach((cb) => cb(msg, type));
};

// Main Helper to poll and update gamepad values
export const updateQuestGamepadState = (xrSession?: any) => {
  let foundControllers = 0;
  const names: string[] = [];

  let lx = 0, ly = 0;
  let rx = 0, ry = 0;
  let btnA = false, btnB = false, btnX = false, btnY = false;
  let trigL = 0, trigR = 0, grpL = 0, grpR = 0;
  let thmL = false, thmR = false;

  const deadzoneLeft = 0.15;
  const deadzoneRight = 0.20;
  const applyDeadzone = (val: number, dz: number = 0.15) => (Math.abs(val) < dz ? 0 : (val - Math.sign(val) * dz) / (1 - dz));

  // 1. Read WebXR InputSources if in active XR session
  if (xrSession && xrSession.inputSources) {
    for (const source of xrSession.inputSources) {
      if (source && source.gamepad) {
        const gp = source.gamepad;
        foundControllers++;
        const handedness = source.handedness || "unknown";
        names.push(`Meta Quest Touch (${handedness})`);

        const axes = gp.axes || [];
        const btns = gp.buttons || [];

        const dz = handedness === "right" ? deadzoneRight : deadzoneLeft;
        let sx = 0, sy = 0;
        if (axes.length >= 4) {
          sx = applyDeadzone(axes[2], dz);
          sy = applyDeadzone(axes[3], dz);
          if (sx === 0 && sy === 0 && (Math.abs(axes[0]) > dz || Math.abs(axes[1]) > dz)) {
            sx = applyDeadzone(axes[0], dz);
            sy = applyDeadzone(axes[1], dz);
          }
        } else if (axes.length >= 2) {
          sx = applyDeadzone(axes[0], dz);
          sy = applyDeadzone(axes[1], dz);
        }

        if (handedness === "left") {
          lx = sx;
          ly = sy;
          if (btns.length > 0) trigL = btns[0]?.value || 0;
          if (btns.length > 1) grpL = btns[1]?.value || 0;
          if (btns.length > 3) thmL = btns[3]?.pressed || false;
          if (btns.length > 4) btnX = btns[4]?.pressed || false;
          if (btns.length > 5) btnY = btns[5]?.pressed || false;
        } else if (handedness === "right") {
          rx = sx;
          ry = sy;
          if (btns.length > 0) trigR = btns[0]?.value || 0;
          if (btns.length > 1) grpR = btns[1]?.value || 0;
          if (btns.length > 3) thmR = btns[3]?.pressed || false;
          if (btns.length > 4) btnA = btns[4]?.pressed || false;
          if (btns.length > 5) btnB = btns[5]?.pressed || false;
        } else {
          if (lx === 0 && ly === 0) {
            lx = sx;
            ly = sy;
          } else {
            rx = sx;
            ry = sy;
          }
        }
      }
    }
  }

  // 2. Read standard HTML5 Gamepad API
  if (typeof navigator !== "undefined" && navigator.getGamepads) {
    try {
      const rawGamepads = navigator.getGamepads();
      for (let i = 0; i < rawGamepads.length; i++) {
        const gp = rawGamepads[i];
        if (!gp || !gp.connected) continue;

        foundControllers++;
        const nameStr = gp.id || `Controller #${i + 1}`;
        if (!names.includes(nameStr)) names.push(nameStr);

        const axes = gp.axes || [];
        const btns = gp.buttons || [];
        const idLower = nameStr.toLowerCase();

        const isLeft = idLower.includes("left");
        const isRight = idLower.includes("right");

        if (isLeft) {
          if (axes.length >= 2) {
            lx = applyDeadzone(axes[axes.length >= 4 ? 2 : 0], deadzoneLeft);
            ly = applyDeadzone(axes[axes.length >= 4 ? 3 : 1], deadzoneLeft);
          }
          if (btns.length > 0) trigL = btns[0]?.value || 0;
          if (btns.length > 1) grpL = btns[1]?.value || 0;
          if (btns.length > 3) thmL = btns[3]?.pressed || false;
          if (btns.length > 4) btnX = btns[4]?.pressed || false;
          if (btns.length > 5) btnY = btns[5]?.pressed || false;
        } else if (isRight) {
          if (axes.length >= 2) {
            rx = applyDeadzone(axes[axes.length >= 4 ? 2 : 0], deadzoneRight);
            ry = applyDeadzone(axes[axes.length >= 4 ? 3 : 1], deadzoneRight);
          }
          if (btns.length > 0) trigR = btns[0]?.value || 0;
          if (btns.length > 1) grpR = btns[1]?.value || 0;
          if (btns.length > 3) thmR = btns[3]?.pressed || false;
          if (btns.length > 4) btnA = btns[4]?.pressed || false;
          if (btns.length > 5) btnB = btns[5]?.pressed || false;
        } else {
          // Standard layout
          if (axes.length >= 2 && lx === 0 && ly === 0) {
            lx = applyDeadzone(axes[0], deadzoneLeft);
            ly = applyDeadzone(axes[1], deadzoneLeft);
          }
          if (axes.length >= 4 && rx === 0 && ry === 0) {
            rx = applyDeadzone(axes[2], deadzoneRight);
            ry = applyDeadzone(axes[3], deadzoneRight);
          }
          if (btns.length > 0 && !btnA) btnA = btns[0]?.pressed || false;
          if (btns.length > 1 && !btnB) btnB = btns[1]?.pressed || false;
          if (btns.length > 2 && !btnX) btnX = btns[2]?.pressed || false;
          if (btns.length > 3 && !btnY) btnY = btns[3]?.pressed || false;
          if (btns.length > 6 && trigL === 0) trigL = btns[6]?.value || 0;
          if (btns.length > 7 && trigR === 0) trigR = btns[7]?.value || 0;
          if (btns.length > 4 && grpL === 0) grpL = btns[4]?.value || 0;
          if (btns.length > 5 && grpR === 0) grpR = btns[5]?.value || 0;
          if (btns.length > 10 && !thmL) thmL = btns[10]?.pressed || false;
          if (btns.length > 11 && !thmR) thmR = btns[11]?.pressed || false;
        }
      }
    } catch {
      // ignore
    }
  }

  const wasConnected = questGamepadGlobal.connected;
  const isNowConnected = foundControllers > 0;

  // Check state transition to trigger notifications
  if (!wasConnected && isNowConnected) {
    notifyQuestToast(`🎮 Controller Meta Quest Terhubung! (${foundControllers} aktif)`, "connected");
    triggerQuestHaptics(0.9, 250);
  } else if (wasConnected && !isNowConnected) {
    notifyQuestToast("🔴 Controller Meta Quest Terputus.", "disconnected");
  }

  // Update global mutable store
  questGamepadGlobal.connected = isNowConnected;
  questGamepadGlobal.activeControllersCount = foundControllers;
  questGamepadGlobal.leftStick = { x: lx, y: ly };
  questGamepadGlobal.rightStick = { x: rx, y: ry };
  questGamepadGlobal.buttons = {
    a: btnA,
    b: btnB,
    x: btnX,
    y: btnY,
    triggerL: trigL,
    triggerR: trigR,
    gripL: grpL,
    gripR: grpR,
    thumbL: thmL,
    thumbR: thmR,
  };
  questGamepadGlobal.names = names;
  questGamepadGlobal.lastUpdated = Date.now();

  return questGamepadGlobal;
};

// UI Modal component for Quest Controller Pairing & Interactive Diagnostics
export function QuestControllerModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<QuestGamepadData>(questGamepadGlobal);
  const [isVibrating, setIsVibrating] = useState(false);
  const [vibeSuccess, setVibeSuccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      const updated = updateQuestGamepadState();
      setData({ ...updated });
    }, 50); // 20 FPS UI diagnostic update

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectClick = () => {
    // Force poll
    const res = updateQuestGamepadState();
    setData({ ...res });

    // Test haptic pulse
    setIsVibrating(true);
    const ok = triggerQuestHaptics(0.9, 300);
    setVibeSuccess(ok);
    setTimeout(() => {
      setIsVibrating(false);
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-neutral-950/85 backdrop-blur-md pointer-events-auto animate-fade-in-quick">
      <div className="bg-neutral-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 max-w-xl w-full text-white shadow-2xl flex flex-col gap-5 relative max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <GamepadIcon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white leading-tight">
                Hub Koneksi Controller Quest 2
              </h3>
              <p className="text-xs text-neutral-400">
                Aktivasi Joystick & Pemetaan Tombol Meta Quest 2
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Status Indicator Banner */}
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
            data.connected
              ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
              : "bg-amber-950/40 border-amber-500/50 text-amber-300"
          }`}
        >
          <div className="flex items-center gap-3">
            {data.connected ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">
                {data.connected
                  ? `Terhubung (${data.activeControllersCount} Controller)`
                  : "Belum Ada Controller Terkoneksi"}
              </p>
              <p className="text-[11px] text-neutral-300 mt-0.5">
                {data.connected
                  ? data.names.join(" • ") || "Meta Quest Touch Controller Active"
                  : "Tekan sembarang tombol pada Quest 2 controller untuk mengaktifkannya."}
              </p>
            </div>
          </div>

          <button
            onClick={handleConnectClick}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVibrating ? "animate-spin" : ""}`} />
            <span>Pindai / Getar</span>
          </button>
        </div>

        {vibeSuccess !== null && (
          <div className="text-[11px] text-center text-indigo-300 bg-indigo-950/50 border border-indigo-500/30 px-3 py-1.5 rounded-lg">
            {vibeSuccess
              ? "⚡ Haptic Pulse dikirim ke Controller Quest 2!"
              : "ℹ️ Sinyal Pindai dikirim. Silakan tekan tombol A/B/Trigger di Quest 2 untuk memicu browser."}
          </div>
        )}

        {/* Interactive Joystick & Buttons Diagnostic Map */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
          <p className="text-xs font-bold text-neutral-300 flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-400" />
            <span>Uji Realtime Joystick & Tombol</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left Controller Panel */}
            <div className="bg-neutral-800/60 border border-white/10 rounded-xl p-3 flex flex-col items-center gap-3">
              <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                🎮 Left Controller (Jalan)
              </p>

              {/* Joystick Visual Indicator */}
              <div className="relative w-20 h-20 bg-neutral-900 rounded-full border-2 border-indigo-500/40 flex items-center justify-center shadow-inner">
                {/* Crosshairs */}
                <div className="absolute w-full h-[1px] bg-white/10" />
                <div className="absolute h-full w-[1px] bg-white/10" />
                {/* Stick Ball */}
                <div
                  className="w-6 h-6 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/50 transition-all duration-75 border border-indigo-200"
                  style={{
                    transform: `translate(${data.leftStick.x * 28}px, ${data.leftStick.y * 28}px)`,
                  }}
                />
              </div>

              <div className="text-[10px] font-mono text-neutral-400">
                X: {data.leftStick.x.toFixed(2)} | Y: {data.leftStick.y.toFixed(2)}
              </div>

              {/* Left Buttons Badges */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.x
                      ? "bg-emerald-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Tombol X
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.y
                      ? "bg-emerald-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Tombol Y
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.triggerL > 0.1
                      ? "bg-indigo-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Trigger L ({Math.round(data.buttons.triggerL * 100)}%)
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.gripL > 0.1
                      ? "bg-indigo-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Grip L ({Math.round(data.buttons.gripL * 100)}%)
                </span>
              </div>
            </div>

            {/* Right Controller Panel */}
            <div className="bg-neutral-800/60 border border-white/10 rounded-xl p-3 flex flex-col items-center gap-3">
              <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                🎮 Right Controller (Belok / Look)
              </p>

              {/* Joystick Visual Indicator */}
              <div className="relative w-20 h-20 bg-neutral-900 rounded-full border-2 border-indigo-500/40 flex items-center justify-center shadow-inner">
                {/* Crosshairs */}
                <div className="absolute w-full h-[1px] bg-white/10" />
                <div className="absolute h-full w-[1px] bg-white/10" />
                {/* Stick Ball */}
                <div
                  className="w-6 h-6 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/50 transition-all duration-75 border border-indigo-200"
                  style={{
                    transform: `translate(${data.rightStick.x * 28}px, ${data.rightStick.y * 28}px)`,
                  }}
                />
              </div>

              <div className="text-[10px] font-mono text-neutral-400">
                X: {data.rightStick.x.toFixed(2)} | Y: {data.rightStick.y.toFixed(2)}
              </div>

              {/* Right Buttons Badges */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.a
                      ? "bg-emerald-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Tombol A
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.b
                      ? "bg-emerald-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Tombol B
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.triggerR > 0.1
                      ? "bg-indigo-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Trigger R ({Math.round(data.buttons.triggerR * 100)}%)
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    data.buttons.gripR > 0.1
                      ? "bg-indigo-500 text-white scale-105"
                      : "bg-white/10 text-neutral-400"
                  }`}
                >
                  Grip R ({Math.round(data.buttons.gripR * 100)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Step by Step Guide for User */}
        <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <span>Cara Menghubungkan Meta Quest 2:</span>
          </p>
          <ol className="text-[11px] text-neutral-300 space-y-1.5 pl-5 list-decimal">
            <li>
              Nyalakan Meta Quest 2 dan pastikan terhubung via{" "}
              <strong className="text-white">Meta Quest Browser</strong>,{" "}
              <strong className="text-white">Oculus Link</strong>, atau Bluetooth.
            </li>
            <li>
              Tekan sembarang tombol (<strong className="text-emerald-400">A / B / Trigger</strong>) pada Touch Controller agar browser mendeteksi input gamepad.
            </li>
            <li>
              Gunakan <strong className="text-indigo-300">Joystick Kiri</strong> untuk berjalan dan <strong className="text-indigo-300">Joystick Kanan</strong> untuk memutar sudut pandang/kamera.
            </li>
          </ol>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all text-sm cursor-pointer text-center flex items-center justify-center gap-2"
        >
          <span>Selesai & Lanjutkan Eksplorasi</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Top-level Toast Notification Overlay for Controller Connection Events
export function QuestControllerToast() {
  const [toast, setToast] = useState<{
    id: number;
    msg: string;
    type: "connected" | "disconnected" | "sync";
  } | null>(null);

  useEffect(() => {
    const handleToast = (msg: string, type: "connected" | "disconnected" | "sync") => {
      setToast({ id: Date.now(), msg, type });
    };

    toastSubscribers.add(handleToast);

    // Register Native Browser Gamepad Events
    const handleConnect = (e: GamepadEvent) => {
      console.log("Gamepad connected:", e.gamepad);
      updateQuestGamepadState();
      notifyQuestToast(
        `🟢 Controller Terdeteksi: ${e.gamepad.id || "Meta Quest Touch"}`,
        "connected"
      );
      triggerQuestHaptics(0.9, 300);
    };

    const handleDisconnect = (e: GamepadEvent) => {
      console.log("Gamepad disconnected:", e.gamepad);
      updateQuestGamepadState();
      notifyQuestToast(
        `🔴 Controller Terputus: ${e.gamepad.id || "Meta Quest Touch"}`,
        "disconnected"
      );
    };

    if (typeof window !== "undefined") {
      window.addEventListener("gamepadconnected", handleConnect);
      window.addEventListener("gamepaddisconnected", handleDisconnect);
    }

    // Interval sync poll
    const syncInterval = setInterval(() => {
      updateQuestGamepadState();
    }, 1000);

    return () => {
      toastSubscribers.delete(handleToast);
      if (typeof window !== "undefined") {
        window.removeEventListener("gamepadconnected", handleConnect);
        window.removeEventListener("gamepaddisconnected", handleDisconnect);
      }
      clearInterval(syncInterval);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100000] pointer-events-auto transition-all animate-bounce-short">
      <div
        className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl text-sm font-bold text-white transition-all ${
          toast.type === "connected"
            ? "bg-emerald-950/90 border-emerald-500/80 text-emerald-100 shadow-emerald-950/80"
            : toast.type === "disconnected"
            ? "bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-rose-950/80"
            : "bg-indigo-950/90 border-indigo-500/80 text-indigo-100 shadow-indigo-950/80"
        }`}
      >
        <GamepadIcon
          className={`w-5 h-5 shrink-0 ${
            toast.type === "connected"
              ? "text-emerald-400 animate-pulse"
              : toast.type === "disconnected"
              ? "text-rose-400"
              : "text-indigo-400 animate-spin"
          }`}
        />
        <span>{toast.msg}</span>
        <button
          onClick={() => setToast(null)}
          className="ml-2 text-white/60 hover:text-white transition-colors cursor-pointer text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export interface QuestLocomotionProps {
  moveSpeed?: number;
  turnSpeed?: number;
  onSelect?: () => void;
}

export const QuestLocomotion: React.FC<QuestLocomotionProps> = ({
  moveSpeed = 3.2,
  turnSpeed = 2.0,
  onSelect,
}) => {
  const { camera } = useThree();
  const lastSelectTimeRef = useRef(0);
  const moveVector = useRef(new THREE.Vector3());
  const forwardVector = useRef(new THREE.Vector3());
  const rightVector = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const st = updateQuestGamepadState();
    if (!st.connected) return;

    // 1. Locomotion (Left Thumbstick)
    if (Math.abs(st.leftStick.x) > 0.05 || Math.abs(st.leftStick.y) > 0.05) {
      camera.getWorldDirection(forwardVector.current);
      forwardVector.current.y = 0;
      forwardVector.current.normalize();

      rightVector.current.crossVectors(forwardVector.current, camera.up).normalize();

      moveVector.current.set(0, 0, 0);
      moveVector.current.addScaledVector(forwardVector.current, -st.leftStick.y * moveSpeed * delta);
      moveVector.current.addScaledVector(rightVector.current, st.leftStick.x * moveSpeed * delta);

      camera.position.add(moveVector.current);
    }

    // 2. Smooth Turning (Right Thumbstick)
    if (Math.abs(st.rightStick.x) > 0.1) {
      const angle = -st.rightStick.x * turnSpeed * delta;
      camera.rotation.y += angle;
    }

    // 3. Trigger / Button Click
    const isTriggerPressed = (st.buttons.triggerR > 0.6 || st.buttons.triggerL > 0.6 || st.buttons.a);
    if (isTriggerPressed && Date.now() - lastSelectTimeRef.current > 300) {
      lastSelectTimeRef.current = Date.now();
      triggerQuestHaptics(0.7, 50);
      if (onSelect) onSelect();
    }
  });

  return null;
};

