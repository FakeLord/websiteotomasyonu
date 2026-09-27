import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface UiState {
  city: string;
  setCity: (city: string) => void;
  jarvisOpen: boolean;
  setJarvisOpen: (open: boolean) => void;
  jarvisPrompt: string | null;
  askJarvis: (prompt: string) => void;
  consumeJarvisPrompt: () => string | null;
}

// localStorage erişimi gizli pencere/engelli site verisi durumunda atabilir;
// bu yalnızca kişisel bir kolaylık (seçili şehir), kaybolursa varsayılana döner.
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
      city: "İstanbul",
      setCity: (city) => set({ city }),
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
    { name: "lbf.ui", storage: safeStorage, partialize: (state) => ({ city: state.city }) },
  ),
);
