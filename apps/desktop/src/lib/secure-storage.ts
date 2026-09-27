import { invoke } from "@tauri-apps/api/core";

/**
 * supabase-js oturum saklama sözleşmesi (async getItem/setItem/removeItem),
 * Rust `keyring` komutları üzerinden Windows Credential Manager'a yazar.
 * localStorage KULLANILMAZ (SPEC.md → F, P.2).
 */
const keyringStorage = {
  async getItem(key: string): Promise<string | null> {
    return invoke<string | null>("secret_get", { key });
  },
  async setItem(key: string, value: string): Promise<void> {
    await invoke("secret_set", { key, value });
  },
  async removeItem(key: string): Promise<void> {
    await invoke("secret_delete", { key });
  },
};

// Yalnızca `vite` dev sunucusu düz tarayıcıda açıldığında (Tauri yokken, UI
// önizlemesi için) oturum sekmeye özel sessionStorage'da tutulur. Üretim build'i
// her zaman Tauri içinde çalışır ve Windows Credential Manager kullanır.
const devBrowserStorage = {
  async getItem(key: string): Promise<string | null> {
    return sessionStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    sessionStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    sessionStorage.removeItem(key);
  },
};

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const secureStorage = isTauri || !import.meta.env.DEV ? keyringStorage : devBrowserStorage;
