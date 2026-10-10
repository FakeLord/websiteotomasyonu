import { create } from "zustand";
import type { DraftLoopState } from "../workers/draft-loop";

const IDLE: DraftLoopState = { running: false, done: 0, failed: 0, current: null, stopped: null, error: null };

interface DraftStore {
  draft: DraftLoopState;
  setDraft: (draft: DraftLoopState) => void;
}

/** Taslak kuyruğu çalıştırıcısının bu cihazdaki durumu; "İşler" kutusu buradan okur. */
export const useDraftStore = create<DraftStore>((set) => ({
  draft: IDLE,
  setDraft: (draft) => set({ draft }),
}));
