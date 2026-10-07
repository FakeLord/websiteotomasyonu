import { describe, expect, it, vi } from "vitest";
import { createWebPlatform } from "./web";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } });
}

describe("createWebPlatform", () => {
  it("her isteği aynı origin'e, JSON gövde ve x-lbf başlığıyla POST eder", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ value: "gizli" }));
    const platform = createWebPlatform(fetchImpl);

    await expect(platform.secrets.get("sb-session")).resolves.toBe("gizli");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/secrets/get");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-lbf"]).toBe("1");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ key: "sb-session" });
    expect(init.credentials).toBe("same-origin");
  });

  it("kayıt yoksa null döner", async () => {
    const platform = createWebPlatform(vi.fn().mockResolvedValue(jsonResponse({ value: null })));
    await expect(platform.secrets.get("yok")).resolves.toBeNull();
  });

  it("sendEmail Message-ID döner ve gövdeyi {smtp, message} olarak gönderir", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ messageId: "<abc@ajans.com>" }));
    const platform = createWebPlatform(fetchImpl);
    const smtp = { host: "h", port: 587, username: "u", password: "p", from_name: "A", from_email: "a@ajans.com" };
    const message = { to_email: "x@y.com", subject: "s", body: "b", in_reply_to: null };

    await expect(platform.sendEmail(smtp, message)).resolves.toBe("<abc@ajans.com>");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/email/send");
    expect(JSON.parse(init.body as string)).toEqual({ smtp, message });
  });

  it("sunucu hata dönerse mesajını Error olarak fırlatır", async () => {
    const platform = createWebPlatform(vi.fn().mockResolvedValue(jsonResponse({ error: "IMAP girişi başarısız" }, { status: 502 })));
    await expect(
      platform.imapFetch({ host: "h", port: 993, username: "u", password: "p" }, { since_uid: null, since_date: "1-Oct-2026", limit: 5 }),
    ).rejects.toThrow("IMAP girişi başarısız");
  });

  it("sunucuya ulaşılamazsa anlaşılır bir hata verir", async () => {
    const platform = createWebPlatform(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(platform.fetchPage("https://ornek.com")).rejects.toThrow(/yerel sunucu/i);
  });

  it("JSON olmayan hata yanıtında durum koduyla hata verir", async () => {
    const platform = createWebPlatform(vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));
    await expect(platform.secrets.delete("k")).rejects.toThrow(/502/);
  });
});
