import { create } from "zustand";
import type { NotchConfigParams } from "../features/notch/params";
import { initialPhaseState, type PhaseState } from "../features/notch/phaseMachine";
import type { Size } from "../features/notch/notchGeometry";

/** Notch window state: config (settings stand-in), environment and the phase machine's state. */
export interface NotchStore {
  config: NotchConfigParams;
  windowSize: Size;
  /** Windows "Animation effects" off (from Rust), on top of prefers-reduced-motion. */
  nativeReduceMotion: boolean;
  /** Hidden while a D3D full screen app runs, or an auto-hide taskbar covers the notch. */
  hidden: boolean;
  /** Monitor index for the notch (display preference); null = primary. */
  monitor: number | null;
  phase: PhaseState;
  setConfig: (c: Partial<NotchConfigParams>) => void;
  setWindowSize: (s: Size) => void;
  setNativeReduceMotion: (v: boolean) => void;
  setHidden: (v: boolean) => void;
  setMonitor: (m: number | null) => void;
  setPhase: (p: PhaseState) => void;
}

export const useNotchStore = create<NotchStore>((set) => ({
  config: {
    edge: "right",
    size: "medium",
    pill: "line",
    outline: false,
    pins: 5,
    phase: null,
    reduce: false,
    backdrop: false,
  },
  windowSize: { width: 900, height: 800 },
  nativeReduceMotion: false,
  hidden: false,
  monitor: null,
  phase: initialPhaseState,
  setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
  setWindowSize: (windowSize) => set({ windowSize }),
  setNativeReduceMotion: (nativeReduceMotion) => set({ nativeReduceMotion }),
  setHidden: (hidden) => set({ hidden }),
  setMonitor: (monitor) => set({ monitor }),
  setPhase: (phase) => set({ phase }),
}));
