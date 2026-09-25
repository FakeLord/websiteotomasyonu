import { describe, expect, it } from "vitest";
import { normalizePhone } from "./normalize-phone";

describe("normalizePhone", () => {
  it("normalizes a TR mobile number to E.164 and flags it as mobile", () => {
    const result = normalizePhone("0532 123 45 67");
    expect(result?.e164).toBe("+905321234567");
    expect(result?.isMobile).toBe(true);
  });

  it("normalizes an already-international number", () => {
    const result = normalizePhone("+90 532 123 45 67");
    expect(result?.e164).toBe("+905321234567");
  });

  it("does not flag a landline number as mobile", () => {
    const result = normalizePhone("0212 123 45 67");
    expect(result?.isMobile).toBe(false);
  });

  it("returns null for invalid input", () => {
    expect(normalizePhone("not a phone")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizePhone("   ")).toBeNull();
  });
});
