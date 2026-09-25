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
