import { describe, expect, it } from "vitest";
import { importBusinessInputSchema, transitionStageInputSchema } from "./business";

describe("importBusinessInputSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = importBusinessInputSchema.parse({ name: "ABC Diş Kliniği", source: "MANUAL" });
    expect(result.source).toBe("MANUAL");
  });

  it("rejects an empty name", () => {
    expect(() => importBusinessInputSchema.parse({ name: "", source: "MANUAL" })).toThrow();
  });

  it("rejects a missing source", () => {
    expect(() => importBusinessInputSchema.parse({ name: "ABC" })).toThrow();
  });

  it("accepts the global location fields", () => {
    const result = importBusinessInputSchema.parse({
      name: "Congress Ave Dental",
      source: "GOOGLE_PLACES",
      countryCode: "US",
      region: "TX",
      postalCode: "78701",
      timezone: "America/Chicago",
      language: "en",
    });
    expect(result.countryCode).toBe("US");
    expect(result.timezone).toBe("America/Chicago");
  });

  it("rejects a malformed country code, timezone or language", () => {
    const base = { name: "X", source: "MANUAL" as const };
    expect(() => importBusinessInputSchema.parse({ ...base, countryCode: "usa" })).toThrow();
    expect(() => importBusinessInputSchema.parse({ ...base, countryCode: "us" })).toThrow();
    expect(() => importBusinessInputSchema.parse({ ...base, timezone: "Not A Zone" })).toThrow();
    expect(() => importBusinessInputSchema.parse({ ...base, language: "English" })).toThrow();
  });
});

describe("transitionStageInputSchema", () => {
  it("accepts a valid transition payload", () => {
    const result = transitionStageInputSchema.parse({
      businessId: "11111111-1111-1111-1111-111111111111",
      toStage: "QUALIFIED",
      expectedVersion: 1,
    });
    expect(result.toStage).toBe("QUALIFIED");
  });

  it("rejects an invalid stage", () => {
    expect(() =>
      transitionStageInputSchema.parse({
        businessId: "11111111-1111-1111-1111-111111111111",
        toStage: "MADE_UP",
        expectedVersion: 1,
      }),
    ).toThrow();
  });
});
