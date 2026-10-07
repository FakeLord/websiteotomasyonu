import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ALL_MARKETS, migratePersistedUiState, normalizeMarket, type Market } from "./market";

interface UiState {
  /** Üst çubuktaki pazar filtresi (ülke → şehir); boş = tüm pazarlar. */
  market: Market;
  setMarket: (market: Market) => void;
  jarvisOpen: boolean;
  setJarvisOpen: (open: boolean) => void;
  jarvisPrompt: string | null;
  askJarvis: (prompt: string) => void;
  consumeJarvisPrompt: () => string | null;
}

// localStorage erişimi gizli pencere/engelli site verisi durumunda atabilir;
// bu yalnızca kişisel bir kolaylık (seçili pazar), kaybolursa varsayılana döner.
const safeStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* yok say */
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* yok say */
    }
  },
}));

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      market: ALL_MARKETS,
      setMarket: (market) => set({ market: normalizeMarket(market) }),
      jarvisOpen: false,
      setJarvisOpen: (open) => set({ jarvisOpen: open }),
      jarvisPrompt: null,
      askJarvis: (prompt) => set({ jarvisOpen: true, jarvisPrompt: prompt }),
      consumeJarvisPrompt: () => {
        const prompt = get().jarvisPrompt;
        if (prompt) set({ jarvisPrompt: null });
        return prompt;
      },
    }),
    {
      name: "lbf.ui",
      storage: safeStorage,
      version: 2,
      // v1: Türkiye'ye sabit tek şehir ({ city }); v2: ülke → şehir pazarı.
      migrate: (persisted) => migratePersistedUiState(persisted),
      partialize: (state) => ({ market: state.market }),
    },
  ),
);
