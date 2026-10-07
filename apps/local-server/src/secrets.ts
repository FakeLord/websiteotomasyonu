import { Entry } from "@napi-rs/keyring";
import { joinChunks, splitIntoChunks } from "@lbf/core";

/** Masaüstü uygulamasıyla aynı servis adı: iki kabuk aynı kayıtları paylaşır. */
export const KEYRING_SERVICE = "com.hostlysisletme.localbusinessfinder";

/** Tek bir (≤ 2560 bayt) işletim sistemi credential'ı. */
export interface CredentialBackend {
  get(name: string): string | null;
  set(name: string, value: string): void;
  /** Kayıt yoksa false döner, hata fırlatmaz. */
  delete(name: string): boolean;
}

export interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/**
 * Büyük değerleri (Supabase oturumu) `{key}__0`, `{key}__1`… parçalarına ve
 * `{key}__chunks` sayacına böler — Rust `commands/secrets.rs` ile aynı şema.
 * Yarım yazılmış/bozuk kayıt okunduğunda null döner (oturum yeniden açılır).
 */
export function createChunkedStore(backend: CredentialBackend): SecretStore {
  const metaKey = (key: string) => `${key}__chunks`;
  const chunkKey = (key: string, index: number) => `${key}__${index}`;
  const readCount = (key: string): number | null => {
    const raw = backend.get(metaKey(key));
    if (raw === null) return null;
    const count = Number(raw);
    return Number.isInteger(count) && count > 0 ? count : null;
  };

  return {
    get(key) {
      const count = readCount(key);
      if (count === null) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = backend.get(chunkKey(key, i));
        if (part === null) return null;
        parts.push(part);
      }
      return joinChunks(parts);
    },
    set(key, value) {
      const chunks = splitIntoChunks(value);
      const oldCount = readCount(key) ?? 0;
      chunks.forEach((chunk, i) => backend.set(chunkKey(key, i), chunk));
      for (let i = chunks.length; i < oldCount; i += 1) backend.delete(chunkKey(key, i));
      backend.set(metaKey(key), String(chunks.length));
    },
    delete(key) {
      const count = readCount(key) ?? 0;
      for (let i = 0; i < count; i += 1) backend.delete(chunkKey(key, i));
      backend.delete(metaKey(key));
    },
  };
}

/** Windows Credential Manager (macOS/Linux'ta ilgili sistem kasası) üzerinden gerçek depolama. */
export function createKeyringBackend(service: string = KEYRING_SERVICE): CredentialBackend {
  return {
    get: (name) => new Entry(service, name).getPassword() ?? null,
    set: (name, value) => new Entry(service, name).setPassword(value),
    delete: (name) => new Entry(service, name).deleteCredential(),
  };
}
