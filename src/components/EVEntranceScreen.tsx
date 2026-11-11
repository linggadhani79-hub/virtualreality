import React, { useState } from "react";
import {
  Zap,
  BatteryCharging,
  Car,
  Cpu,
  Layers,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  ArrowRight,
  KeyRound,
  Download,
  CheckCircle2,
  RefreshCw,
  Gauge,
  Radio,
  Sliders,
  ChevronRight,
  Lock,
} from "lucide-react";

interface EVEntranceScreenProps {
  appState: "select_mode" | "scanning" | "downloading" | "ready" | "playing";
  setAppState: (state: "select_mode" | "scanning" | "downloading" | "ready" | "playing") => void;
  showStudentCodeModal: boolean;
  setShowStudentCodeModal: (show: boolean) => void;
  studentAccessCode: string;
  setStudentAccessCode: (code: string) => void;
  studentCodeError: string;
  setStudentCodeError: (err: string) => void;
  handleStudentCodeSubmit: (e?: React.FormEvent) => void;
  handleSelectAdmin: () => void;
  handleOpenStudentCodeModal: () => void;
  isScanning: boolean;
  scanPendingAssets: number;
  scanTotalSize: number;
  pendingModelsCount: number;
}

export function EVEntranceScreen({
  appState,
  setAppState,
  showStudentCodeModal,
  setShowStudentCodeModal,
  studentAccessCode,
  setStudentAccessCode,
  studentCodeError,
  setStudentCodeError,
  handleStudentCodeSubmit,
  handleSelectAdmin,
  handleOpenStudentCodeModal,
  isScanning,
  scanPendingAssets,
  scanTotalSize,
  pendingModelsCount,
}: EVEntranceScreenProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "specs">("overview");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050811]/95 backdrop-blur-xl overflow-y-auto p-4 sm:p-6 text-white selection:bg-cyan-500 selection:text-black">
      {/* Dynamic Background Glowing Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-cyan-500/20 via-blue-600/10 to-transparent blur-3xl rounded-full" />
        <div className="absolute -bottom-[20%] left-1/4 w-[600px] h-[400px] bg-emerald-500/10 blur-3xl rounded-full" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-indigo-500/10 blur-3xl rounded-full" />
        
        {/* Cyber Grid Lines */}
        <div 
          className="absolute inset-0 opacity-[0.07]" 
          style={{
            backgroundImage: `linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="relative z-10 max-w-4xl w-full my-auto flex flex-col items-center">
        
        {/* Top EV Brand Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 text-[11px] font-semibold tracking-wider uppercase shadow-[0_0_20px_rgba(6,182,212,0.25)] mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <Zap className="w-3.5 h-3.5" />
          <span>Smart Vocational untuk Electric Vehicle</span>
          <span className="text-cyan-600 font-bold">•</span>
          <span className="text-cyan-300 font-mono text-[10px]">WEBXR 360°</span>
        </div>

        {/* Main Card Container */}
        <div className="w-full bg-[#0a0f1d]/90 border border-white/10 rounded-3xl p-6 sm:p-8 md:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl relative overflow-hidden">
          
          {/* Subtle Electric Accent Bars */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-2xl pointer-events-none rounded-full" />

          {/* Mode Selection Stage */}
          {appState === "select_mode" && (
            showStudentCodeModal ? (
              /* Student Access Code Verification */
              <form onSubmit={handleStudentCodeSubmit} className="max-w-md mx-auto flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center mb-4 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
                  <KeyRound className="w-8 h-8 text-cyan-400" />
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Kode Akses Mahasiswa EV
                </h2>
                <p className="text-neutral-400 text-sm mt-2 max-w-sm">
                  Masukkan kode akses terdaftar untuk masuk ke area praktikum Smart Vocational untuk Electric Vehicle.
                </p>

                <div className="w-full mt-6 text-left">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Kode Akses
                    </label>
                  </div>

                  <div className="relative">
                    <input
                      type="password"
                      value={studentAccessCode}
                      onChange={(e) => {
                        setStudentAccessCode(e.target.value);
                        if (studentCodeError) setStudentCodeError("");
                      }}
                      placeholder="Masukkan kode akses mahasiswa..."
                      autoFocus
                      className="w-full px-4 py-3.5 pl-11 rounded-2xl bg-neutral-900/90 border border-cyan-500/30 text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 text-base font-mono tracking-wider transition-all"
                    />
                    <KeyRound className="w-5 h-5 text-cyan-400/60 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>

                  {studentCodeError && (
                    <div className="mt-2 text-rose-400 text-xs font-medium bg-rose-950/40 border border-rose-500/30 px-3 py-2 rounded-xl flex items-center gap-2 animate-shake">
                      <span>⚠️</span> {studentCodeError}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 w-full mt-6">
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold py-3.5 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] cursor-pointer active:scale-[0.99]"
                  >
                    <GraduationCap className="w-5 h-5" />
                    <span>Masuk Praktikum Mahasiswa</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStudentCodeModal(false);
                      setStudentCodeError("");
                    }}
                    className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white font-medium py-3 px-4 rounded-2xl transition-all text-sm cursor-pointer border border-white/5"
                  >
                    Kembali ke Beranda
                  </button>
                </div>
              </form>
            ) : (
              /* Electric Vehicle Lab Main Entrance View */
              <div className="flex flex-col gap-8">
                
                {/* Hero Header Section */}
                <div className="text-center max-w-2xl mx-auto">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 mb-4 shadow-[0_0_30px_rgba(6,182,212,0.25)]">
                    <Car className="w-8 h-8 text-cyan-400" />
                  </div>
                  <h1 id="hero-title-smart-vocational" className="text-3xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-400 tracking-tight leading-tight">
                    Smart Vocational
                    <br />
                    untuk Electric Vehicle
                  </h1>
                  <p className="text-neutral-300 text-sm sm:text-base mt-3 leading-relaxed font-normal">
                    Ruang praktikum virtual immersive untuk eksplorasi komponen kendaraan listrik (EV), motor traksi, baterai pack, serta analisis CAD & video pembelajaran interaktif.
                  </p>
                </div>

                {/* 4 Interactive Feature Highlights */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-cyan-500/40 p-3.5 rounded-2xl transition-all flex flex-col items-center text-center group">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Zap className="w-5 h-5 text-cyan-400" />
                    </div>
                    <span className="text-xs font-bold text-white">EV Powertrain</span>
                    <span className="text-[10px] text-neutral-400 mt-0.5">Motor & Inverter 3-Fasa</span>
                  </div>

                  <div className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-emerald-500/40 p-3.5 rounded-2xl transition-all flex flex-col items-center text-center group">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <BatteryCharging className="w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-xs font-bold text-white">Battery Pack</span>
                    <span className="text-[10px] text-neutral-400 mt-0.5">BMS & Modul Sel EV</span>
                  </div>

                  <div className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-indigo-500/40 p-3.5 rounded-2xl transition-all flex flex-col items-center text-center group">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Layers className="w-5 h-5 text-indigo-400" />
                    </div>
                    <span className="text-xs font-bold text-white">Bongkar CAD</span>
                    <span className="text-[10px] text-neutral-400 mt-0.5">Explode & Inspect Mesh</span>
                  </div>

                  <div className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-purple-500/40 p-3.5 rounded-2xl transition-all flex flex-col items-center text-center group">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Radio className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="text-xs font-bold text-white">Meta Quest VR</span>
                    <span className="text-[10px] text-neutral-400 mt-0.5">Navigasi 6-DOF & Ray</span>
                  </div>
                </div>

                {/* Primary Action Mode Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Student Mode Card */}
                  <div className="relative group bg-gradient-to-b from-cyan-950/40 to-neutral-900/80 border border-cyan-500/30 hover:border-cyan-400/80 rounded-2xl p-6 transition-all duration-300 flex flex-col justify-between shadow-[0_4px_25px_rgba(6,182,212,0.15)] hover:shadow-[0_4px_35px_rgba(6,182,212,0.3)]">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold tracking-wider uppercase border border-cyan-500/30">
                          <GraduationCap className="w-3.5 h-3.5" />
                          Mahasiswa / Praktikan
                        </span>
                        <span className="text-[10px] text-cyan-400/80 font-mono flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Memerlukan Akses
                        </span>
                      </div>
                      <h3 className="text-xl font-extrabold text-white group-hover:text-cyan-200 transition-colors">
                        Mode Pembelajaran EV
                      </h3>
                      <p className="text-neutral-400 text-xs mt-1.5 leading-relaxed">
                        Masuk untuk menjelajah lab kendaraan listrik, membedah komponen, mengerjakan kuis evaluasi, dan memutar materi video interaktif.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenStudentCodeModal}
                      className="mt-5 w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/60 cursor-pointer active:scale-[0.98]"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>Masuk Mode Mahasiswa</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Admin / Instructor Mode Card */}
                  <div className="relative group bg-gradient-to-b from-indigo-950/30 to-neutral-900/80 border border-white/10 hover:border-indigo-500/60 rounded-2xl p-6 transition-all duration-300 flex flex-col justify-between shadow-lg">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold tracking-wider uppercase border border-indigo-500/30">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Instruktur / Admin
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">Google Login</span>
                      </div>
                      <h3 className="text-xl font-extrabold text-white group-hover:text-indigo-200 transition-colors">
                        Mode Studio & Editor
                      </h3>
                      <p className="text-neutral-400 text-xs mt-1.5 leading-relaxed">
                        Kelola aset 3D, atur tata letak komponen kendaraan listrik, hubungkan tautan Google Form soal evaluasi, dan simpan workspace ke Cloud.
                      </p>
                    </div>

                    <button
                      onClick={handleSelectAdmin}
                      className="mt-5 w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/10 active:scale-[0.98]"
                    >
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      <span>Masuk Mode Admin</span>
                    </button>
                  </div>

                </div>

                {/* Bottom System Status Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-[11px] text-neutral-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Sistem 3D Engine Siap
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      Pemeriksaan Shaders EV Aktif
                    </span>
                  </div>
                  <div className="text-neutral-500 font-mono">
                    Smart Vocational EV v2.5
                  </div>
                </div>

              </div>
            )
          )}

          {/* Scanning Assets Stage */}
          {appState === "scanning" && (
            <div className="py-6 flex flex-col items-center text-center max-w-md mx-auto">
              {isScanning ? (
                <>
                  <div className="relative mb-5">
                    <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                    <Car className="w-6 h-6 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">Memindai Komponen Lab EV</h3>
                  <p className="text-neutral-400 text-sm mt-2 leading-relaxed">
                    Sedang memeriksa kelengkapan file 3D komponen kendaraan listrik, tekstur, dan ruang laboratorium virtual...
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                    <Download className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">Sinkronisasi Aset EV</h3>
                  <p className="text-neutral-300 text-sm mt-2 leading-relaxed">
                    Terdapat <span className="text-cyan-400 font-bold">{scanPendingAssets}</span> komponen kendaraan listrik yang perlu diunduh.
                  </p>
                  <div className="my-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 font-mono text-xs text-neutral-300">
                    Ukuran Data: <span className="text-cyan-300 font-bold">{(scanTotalSize / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                  <button
                    onClick={() => setAppState("downloading")}
                    className="w-full mt-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] cursor-pointer"
                  >
                    Mulai Unduh Komponen EV
                  </button>
                </>
              )}
            </div>
          )}

          {/* Downloading Assets Stage */}
          {appState === "downloading" && (
            <div className="py-6 flex flex-col items-center text-center max-w-md mx-auto">
              <div className="relative mb-5">
                <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <Zap className="w-6 h-6 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Mengunduh Ruang Lab EV</h3>
              <p className="text-neutral-400 text-sm mt-2 leading-relaxed">
                Mohon tunggu, model 3D kendaraan listrik dan modul pembelajaran sedang disiapkan...
              </p>
              <div className="mt-3 px-4 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
                {pendingModelsCount > 0 ? `Tersisa ${pendingModelsCount} modul komponen...` : 'Menyusun pencahayaan & collision mesh...'}
              </div>
            </div>
          )}

          {/* Ready to Enter Stage */}
          {appState === "ready" && (
            <div className="py-6 flex flex-col items-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Lab EV Siap Digunakan!</h3>
              <p className="text-neutral-300 text-sm mt-2 leading-relaxed">
                Semua modul kendaraan listrik, kontroler VR, dan simulasi interaktif telah dimuat secara optimal.
              </p>
              <button
                onClick={() => setAppState("playing")}
                className="w-full mt-5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-[0_0_25px_rgba(16,185,129,0.5)] cursor-pointer active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5 text-yellow-300" />
                <span>Masuk ke Laboratorium EV Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>

        {/* Footer Credit / Guidance */}
        <div className="mt-4 text-center text-xs text-neutral-400 font-medium">
          Dukung headset Meta Quest 2 / 3 / Pro & Desktop Browser 3D
        </div>

      </div>
    </div>
  );
}
