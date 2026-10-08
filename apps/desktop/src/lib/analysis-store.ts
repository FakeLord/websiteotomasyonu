import { create } from "zustand";
import type { AnalysisQueueState } from "../workers/analysis-queue";

const IDLE: AnalysisQueueState = { running: false, done: 0, total: 0, failed: 0, firstError: null, blockedBy: null };

export interface AnalysisProblem {
  failed: number;
  firstError: string | null;
}

interface AnalysisStore {
  queue: AnalysisQueueState;
  /**
   * Son sorun (başarısız işletmeler veya okuma/kilit hatası). Kuyruk dakikada bir yeniden çalışıp durumunu
   * sıfırladığı için ayrı tutulur; aksi halde hata bir dakika içinde ekrandan kaybolurdu. Yeniden denemede temizlenir.
   */
  problem: AnalysisProblem | null;
  setQueue: (queue: AnalysisQueueState) => void;
  clearProblem: () => void;
}

/** Arka plan website analizinin durumu; üst çubuk göstergesi ve sayfalar buradan okur. */
export const useAnalysisStore = create<AnalysisStore>((set) => ({
  queue: IDLE,
  problem: null,
  setQueue: (queue) =>
    set((state) => ({
      queue,
      problem: queue.failed > 0 || queue.firstError ? { failed: queue.failed, firstError: queue.firstError } : state.problem,
    })),
  clearProblem: () => set({ problem: null }),
}));
