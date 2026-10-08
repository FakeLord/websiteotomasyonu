import { FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("./supabase-client", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

import { callAiGateway } from "./ai-gateway-client";

const request = {
  operation: "draft_first_message",
  promptVersion: 4,
  system: "s",
  messages: [{ role: "user" as const, content: "c" }],
  jsonSchema: {},
  maxTokens: 100,
  temperature: 0.5,
};

function httpError(status: number, body: unknown): FunctionsHttpError {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("callAiGateway — hata mesajı", () => {
  beforeEach(() => invoke.mockReset());

  it("ağ geçidinin döndürdüğü gerçek nedeni gösterir (genel 'non-2xx' mesajı yerine)", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(400, { code: "VALIDATION", message: "Hiçbir AI sağlayıcısı için API anahtarı ayarlı değil (Ayarlar → API Ayarları)." }),
    });
    await expect(callAiGateway("ws", request)).rejects.toThrow(/API anahtarı ayarlı değil/);
  });

  it("gövde okunamazsa anlaşılır bir yedek mesaj verir", async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response("<html>502</html>", { status: 502 })) });
    await expect(callAiGateway("ws", request)).rejects.toThrow(/AI isteği başarısız/);
  });

  it("aynı girdide aynı önbellek anahtarını, 'yeniden oluştur'da (fresh) farklı anahtarı gönderir", async () => {
    invoke.mockResolvedValue({ data: { json: {}, cached: false }, error: null });
    await callAiGateway("ws", request);
    await callAiGateway("ws", request);
    await callAiGateway("ws", request, undefined, { fresh: true });
    await callAiGateway("ws", request, undefined, { fresh: true });
    const hashes = invoke.mock.calls.map((call) => (call[1] as { body: { inputHash: string } }).body.inputHash);
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[2]).not.toBe(hashes[0]);
    expect(hashes[3]).not.toBe(hashes[2]);
  });

  it("başarılı yanıtta JSON'u ve önbellek bilgisini döner", async () => {
    invoke.mockResolvedValue({ data: { json: { body: "x" }, cached: true }, error: null });
    await expect(callAiGateway("ws", request)).resolves.toEqual({ json: { body: "x" }, cached: true });
  });
});
