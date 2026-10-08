import { describe, expect, it } from "vitest";
import { isOpportunity, type OpportunityInput } from "./opportunity";

const base: OpportunityInput = { websiteStatus: "NO_WEBSITE", stage: "NEW", doNotContact: false, businessStatus: "OPERATIONAL" };

describe("isOpportunity", () => {
  it.each(["NO_WEBSITE", "BROKEN_WEBSITE", "LOW_QUALITY_WEBSITE"])("%s fırsattır", (websiteStatus) => {
    expect(isOpportunity({ ...base, websiteStatus })).toBe(true);
  });

  it("iyi sitesi olan fırsat değildir", () => {
    expect(isOpportunity({ ...base, websiteStatus: "GOOD_WEBSITE" })).toBe(false);
  });

  it("analiz edilmemiş işletme fırsat sayılmaz", () => {
    expect(isOpportunity({ ...base, websiteStatus: null })).toBe(false);
  });

  it("daha önce yazılmış işletme fırsat listesinden çıkar", () => {
    expect(isOpportunity({ ...base, stage: "CONTACTED" })).toBe(false);
    expect(isOpportunity({ ...base, stage: "OUTREACH_READY" })).toBe(true);
  });

  it("aranmasın işaretli işletme fırsat değildir", () => {
    expect(isOpportunity({ ...base, doNotContact: true })).toBe(false);
  });

  it("kapanmış işletme fırsat değildir; durumu bilinmeyen sayılır", () => {
    expect(isOpportunity({ ...base, businessStatus: "CLOSED_PERMANENTLY" })).toBe(false);
    expect(isOpportunity({ ...base, businessStatus: "CLOSED_TEMPORARILY" })).toBe(false);
    expect(isOpportunity({ ...base, businessStatus: null })).toBe(true);
  });
});
