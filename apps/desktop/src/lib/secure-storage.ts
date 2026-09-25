import { invoke } from "@tauri-apps/api/core";

/**
 * supabase-js oturum saklama sözleşmesi (async getItem/setItem/removeItem),
 * Rust `keyring` komutları üzerinden Windows Credential Manager'a yazar.
 * localStorage KULLANILMAZ (SPEC.md → F, P.2).
 */
export const secureStorage = {
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
