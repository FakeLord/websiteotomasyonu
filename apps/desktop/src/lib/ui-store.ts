import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

/**
 * Global UI durumu iskeleti (Zustand). Faz ilerledikçe filtre/seçim durumu
 * gibi başka global state'ler burada veya benzer store'larda tutulur.
 */
export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
