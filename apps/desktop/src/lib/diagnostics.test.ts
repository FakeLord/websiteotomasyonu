import { describe, expect, it } from "vitest";
import { buildDiagnostics, redactSecrets, type DiagnosticsInput } from "./diagnostics";

const base: DiagnosticsInput = {
  appVersion: "0.1.0",
  now: new Date("2026-10-11T10:00:00Z"),
  userAgent: "test-agent",
  language: "tr-TR",
  online: true,
  backendHost: "abc.supabase.co",
  role: "ADMIN",
  analysis: { running: false, done: 10, total: 10, error: null },
  scan: { running: false, tilesDone: 4, budgetPaused: false, error: null },
  drafts: { running: false, done: 3, failed: 1, stopped: null, error: null },
};

describe("redactSecrets", () => {
  it("anahtar ve belirteçleri maskeler", () => {
    expect(redactSecrets("hata nvapi-AbC_123-xyz geldi")).toBe("hata nvapi-*** geldi");
    expect(redactSecrets("sk-abcdefghijkl1234")).toBe("sk-***");
    expect(redactSecrets("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123 son")).toBe("token jwt-*** son");
    expect(redactSecrets("z".repeat(40))).toBe("z".repeat(40));
    expect(redactSecrets("0123456789abcdef0123456789abcdef")).toBe("hex-***");
  });

  it("null'ı korur ve uzun metni keser", () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets("x ".repeat(400))?.length).toBe(300);
  });
});

describe("buildDiagnostics", () => {
  it("işlerin durumunu içerir ve hata metinlerini maskeler", () => {
    const json = JSON.parse(
      buildDiagnostics({ ...base, drafts: { ...base.drafts, error: "401 nvapi-SECRETKEY123" } }),
    ) as { appVersion: string; jobs: { drafts: { error: string; failed: number } } };
    expect(json.appVersion).toBe("0.1.0");
    expect(json.jobs.drafts.failed).toBe(1);
    expect(json.jobs.drafts.error).toBe("401 nvapi-***");
  });

  it("e-posta veya işletme alanı üretmez", () => {
    const text = buildDiagnostics(base);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/password|secret|apikey/i);
  });
});
