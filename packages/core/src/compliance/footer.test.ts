import { describe, expect, it } from "vitest";
import { appendComplianceFooter, buildComplianceFooter } from "./footer";

const base = { legalName: "Acme Studio", postalAddress: "1 Main St, Austin TX", countryCode: "US" } as const;

describe("buildComplianceFooter", () => {
  it("includes identity, postal address, commercial notice (US) and opt-out line in English", () => {
    const footer = buildComplianceFooter({ ...base, language: "en" });
    expect(footer).toContain("Acme Studio");
    expect(footer).toContain("1 Main St, Austin TX");
    expect(footer).toContain("This is a commercial message.");
    expect(footer).toContain('reply with "unsubscribe"');
  });

  it("writes the opt-out line in Turkish and skips the commercial notice outside the US", () => {
    const footer = buildComplianceFooter({ language: "tr", legalName: "Acme", postalAddress: "", countryCode: "TR" });
    expect(footer).toContain("çıkmak istiyorum");
    expect(footer).not.toContain("ticari bir iletidir");
  });

  it("omits empty identity lines", () => {
    const footer = buildComplianceFooter({ language: "en", legalName: " ", postalAddress: "", countryCode: "GB" });
    expect(footer.split("\n").filter(Boolean)).toHaveLength(2);
  });
});

describe("appendComplianceFooter", () => {
  it("appends once and is idempotent", () => {
    const once = appendComplianceFooter("Hello there", { ...base, language: "en" });
    expect(once.startsWith("Hello there\n\n--\n")).toBe(true);
    expect(appendComplianceFooter(once, { ...base, language: "en" })).toBe(once);
  });
});

describe("unsubscribeUrl (ADR 0023)", () => {
  it("bağlantı verilince alt bilgiye tıklama satırı eklenir; yanıtla çık satırı kalır", () => {
    const url = "https://proje.supabase.co/functions/v1/unsubscribe?t=abc&lang=en";
    const footer = buildComplianceFooter({ ...base, language: "en", unsubscribeUrl: url });
    expect(footer).toContain(`To unsubscribe, click: ${url}`);
    expect(footer).toContain('reply with "unsubscribe"');
    const tr = buildComplianceFooter({ ...base, language: "tr", unsubscribeUrl: url });
    expect(tr).toContain(`Listeden çıkmak için tıklayın: ${url}`);
  });

  it("bağlantı yoksa satır eklenmez", () => {
    expect(buildComplianceFooter({ ...base, language: "en" })).not.toContain("click:");
    expect(buildComplianceFooter({ ...base, language: "en", unsubscribeUrl: null })).not.toContain("click:");
  });
});
