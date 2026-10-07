import { platform } from "./platform";

/**
 * supabase-js oturum saklama sözleşmesi (async getItem/setItem/removeItem).
 * Oturum, kabuğa göre Windows Credential Manager'a yazılır: masaüstünde Rust
 * `keyring` komutlarıyla, tarayıcı modunda yerel sunucu üzerinden (ADR 0009).
 * Tarayıcının localStorage/sessionStorage'ı KULLANILMAZ (SPEC.md → F, P.2).
 */
export const secureStorage = {
  getItem: (key: string): Promise<string | null> => platform.secrets.get(key),
  setItem: (key: string, value: string): Promise<void> => platform.secrets.set(key, value),
  removeItem: (key: string): Promise<void> => platform.secrets.delete(key),
};
