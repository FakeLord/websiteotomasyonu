import { describe, expect, it } from "vitest";
import { buildJarvisSystemPrompt, leadFilterToSearchParams, sanitizeJarvisReply } from "./jarvis";

describe("sanitizeJarvisReply", () => {
  it("keeps a plain answer without action", () => {
    expect(sanitizeJarvisReply({ answer: "Bugün 3 follow-up var.", action: null })).toEqual({
      answer: "Bugün 3 follow-up var.",
      action: null,
    });
  });

  it("returns null when the answer is missing or empty", () => {
    expect(sanitizeJarvisReply({ action: null })).toBeNull();
    expect(sanitizeJarvisReply({ answer: "   " })).toBeNull();
    expect(sanitizeJarvisReply("text")).toBeNull();
  });

  it("keeps a whitelisted navigate path and drops unknown ones", () => {
    expect(sanitizeJarvisReply({ answer: "a", action: { type: "navigate", path: "/reports", label: "Raporlar" } })?.action).toEqual({
      type: "navigate",
      path: "/reports",
      label: "Raporlar",
    });
    expect(sanitizeJarvisReply({ answer: "a", action: { type: "navigate", path: "https://evil.example" } })?.action).toBeNull();
  });

  it("sanitizes lead filters: clamps score, drops unknown enum values", () => {
    const reply = sanitizeJarvisReply({
      answer: "İşte liste",
      action: {
        type: "open_leads",
        filter: { district: " Kadıköy ", category: "Diş Kliniği", minScore: 180, stage: "HACKED", websiteStatus: "NO_WEBSITE", extra: 1 },
      },
    });
    expect(reply?.action).toEqual({
      type: "open_leads",
      label: "Leadleri aç",
      filter: { district: "Kadıköy", category: "Diş Kliniği", minScore: 100, websiteStatus: "NO_WEBSITE" },
    });
  });

  it("ignores unknown action types", () => {
    expect(sanitizeJarvisReply({ answer: "a", action: { type: "send_message" } })?.action).toBeNull();
  });
});

describe("leadFilterToSearchParams", () => {
  it("serializes only present fields", () => {
    expect(leadFilterToSearchParams({ district: "Kadıköy", minScore: 80, websiteStatus: "NO_WEBSITE" })).toBe(
      "district=Kad%C4%B1k%C3%B6y&minScore=80&website=NO_WEBSITE",
    );
  });
});

describe("buildJarvisSystemPrompt", () => {
  it("embeds the context and forbids mutations", () => {
    const prompt = buildJarvisSystemPrompt({
      today: "2026-09-27",
      summary: { newLeads: 5 },
      last7Days: {},
      previous7Days: {},
      topLeads: [],
      dueFollowUps: [],
      openHandoffs: [],
      knownCategories: ["Diş Kliniği"],
      knownDistricts: ["Kadıköy"],
    });
    expect(prompt).toContain('"newLeads":5');
    expect(prompt).toContain("Hiçbir veriyi değiştiremezsin");
  });
});
