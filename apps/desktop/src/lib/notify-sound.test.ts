import { describe, expect, it } from "vitest";
import { shouldNotify } from "./notify-sound";

describe("shouldNotify", () => {
  it("ilk okumada ses çalmaz", () => {
    expect(shouldNotify(null, 3)).toBe(false);
  });

  it("sayaç arttığında çalar", () => {
    expect(shouldNotify(1, 2)).toBe(true);
  });

  it("sayaç aynı kaldığında veya azaldığında çalmaz", () => {
    expect(shouldNotify(2, 2)).toBe(false);
    expect(shouldNotify(3, 1)).toBe(false);
  });
});
