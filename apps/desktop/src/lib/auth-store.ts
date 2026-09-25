import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase-client";

interface AuthState {
  session: Session | null;
  initialized: boolean;
  init: () => void;
}

let initStarted = false;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  initialized: false,
  init: () => {
    if (initStarted) return;
    initStarted = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        set({ session: data.session, initialized: true });
      })
      .catch(() => {
        set({ session: null, initialized: true });
      });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, initialized: true });
    });
  },
}));
