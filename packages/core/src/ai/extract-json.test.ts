import { describe, expect, it } from "vitest";
import { extractJsonObject } from "./extract-json";

describe("extractJsonObject", () => {
  it("parses a bare JSON object", () => {
    expect(extractJsonObject('{"body":"Merhaba"}')).toEqual({ body: "Merhaba" });
  });

  it("parses JSON wrapped in a fenced code block", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"body":"x","used_facts":[]}\n```')).toEqual({
      body: "x",
      used_facts: [],
    });
  });

  it("finds the object inside surrounding prose, respecting braces inside strings", () => {
    const text = 'Sure! {"body":"a {b} c","n":{"k":1}} Hope it helps.';
    expect(extractJsonObject(text)).toEqual({ body: "a {b} c", n: { k: 1 } });
  });

  it("skips an invalid leading brace and returns the next valid object", () => {
    expect(extractJsonObject('{not json} then {"ok":true}')).toEqual({ ok: true });
  });

  it("returns null for plain text or top-level arrays", () => {
    expect(extractJsonObject("Merhaba, size yardımcı olabilirim.")).toBeNull();
    expect(extractJsonObject("[1,2,3]")).toBeNull();
  });
});
