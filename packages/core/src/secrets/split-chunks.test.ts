import { describe, expect, it } from "vitest";
import { SECRET_CHUNK_UNITS, joinChunks, splitIntoChunks } from "./split-chunks";

describe("splitIntoChunks (Windows Credential Manager 2560 bayt sınırı)", () => {
  it("boş değer için tek boş parça döner", () => {
    expect(splitIntoChunks("", 2000)).toEqual([""]);
  });

  it("kısa değer tek parça kalır", () => {
    expect(splitIntoChunks("hello", 2000)).toEqual(["hello"]);
  });

  it("sınırı aşan değeri parçalara böler ve birleşince aynı değer çıkar", () => {
    const value = "a".repeat(4500);
    const chunks = splitIntoChunks(value, 2000);
    expect(chunks.map((c) => c.length)).toEqual([2000, 2000, 500]);
    expect(joinChunks(chunks)).toBe(value);
  });

  it("tam katlarda sondaki boş parça oluşmaz", () => {
    expect(splitIntoChunks("a".repeat(4000), 2000)).toHaveLength(2);
  });

  it("sürrogat çiftlerini (emoji) ortadan bölmez", () => {
    const value = "😀".repeat(1001); // 2002 UTF-16 birimi
    const chunks = splitIntoChunks(value, 2000);
    expect(joinChunks(chunks)).toBe(value);
    for (const chunk of chunks) {
      expect([...chunk].every((c) => c === "😀")).toBe(true);
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  it("varsayılan parça boyutu 2560 baytın (1280 UTF-16 birimi) altında güvenli paydadır", () => {
    expect(SECRET_CHUNK_UNITS).toBe(1200);
    expect(splitIntoChunks("ş".repeat(5000)).every((c) => c.length <= SECRET_CHUNK_UNITS)).toBe(true);
  });
});
