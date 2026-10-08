import { create } from "zustand";
import type { ScanLoopState } from "../workers/scan-loop";

const IDLE: ScanLoopState = { running: false, tilesDone: 0, newBusinesses: 0, current: null, budgetPaused: false, error: null };

interface ScanStore {
  scan: ScanLoopState;
  setScan: (scan: ScanLoopState) => void;
}

/** Tarama planı çalıştırıcısının bu cihazdaki durumu; "İşler" kutusu buradan okur. */
export const useScanStore = create<ScanStore>((set) => ({
  scan: IDLE,
  setScan: (scan) => set({ scan }),
}));
