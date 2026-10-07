import { describe, expect, it } from "vitest";
import { createChunkedStore, type CredentialBackend } from "./secrets";

function memoryBackend(): CredentialBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (name) => data.get(name) ?? null,
    set: (name, value) => void data.set(name, value),
    delete: (name) => data.delete(name),
  };
}

describe("createChunkedStore (Rust secrets.rs ile aynı şema)", () => {
  it("olmayan anahtar için null döner", () => {
    expect(createChunkedStore(memoryBackend()).get("yok")).toBeNull();
  });

  it("kısa değeri tek parça + sayaç olarak yazar ve geri okur", () => {
    const backend = memoryBackend();
    const store = createChunkedStore(backend);
    store.set("sb-session", "kısa");
    expect([...backend.data.keys()].sort()).toEqual(["sb-session__0", "sb-session__chunks"]);
    expect(backend.data.get("sb-session__chunks")).toBe("1");
    expect(store.get("sb-session")).toBe("kısa");
  });

  it("2560 bayt sınırını aşan değeri parçalar ve aynen geri birleştirir", () => {
    const backend = memoryBackend();
    const store = createChunkedStore(backend);
    const value = JSON.stringify({ access_token: "x".repeat(3000), refresh_token: "ş".repeat(1500) });
    store.set("oturum", value);
    expect(Number(backend.data.get("oturum__chunks"))).toBeGreaterThan(1);
    for (const [name, part] of backend.data) {
      if (!name.endsWith("__chunks")) expect(part.length).toBeLessThanOrEqual(1200);
    }
    expect(store.get("oturum")).toBe(value);
  });

  it("daha kısa bir değerle üzerine yazınca artan parçaları siler", () => {
    const backend = memoryBackend();
    const store = createChunkedStore(backend);
    store.set("k", "a".repeat(4000));
    expect(backend.data.has("k__3")).toBe(true);
    store.set("k", "kısa");
    expect([...backend.data.keys()].sort()).toEqual(["k__0", "k__chunks"]);
    expect(store.get("k")).toBe("kısa");
  });

  it("bir parça eksikse (bozuk kayıt) null döner", () => {
    const backend = memoryBackend();
    const store = createChunkedStore(backend);
    store.set("k", "a".repeat(3000));
    backend.data.delete("k__1");
    expect(store.get("k")).toBeNull();
  });

  it("silince tüm parçaları ve sayacı kaldırır; olmayanı silmek hata vermez", () => {
    const backend = memoryBackend();
    const store = createChunkedStore(backend);
    store.set("k", "a".repeat(3000));
    store.delete("k");
    expect(backend.data.size).toBe(0);
    expect(() => store.delete("hiç-yoktu")).not.toThrow();
  });

  it("diğer anahtarları etkilemez", () => {
    const backend = memoryBackend();
    const store = createChunkedStore(backend);
    store.set("a", "1");
    store.set("b", "2");
    store.delete("a");
    expect(store.get("b")).toBe("2");
  });
});
