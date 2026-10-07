import { describe, expect, it } from "vitest";
import { formatPhoneInternational, normalizePhone } from "./normalize-phone";

describe("normalizePhone — ülke parametresi", () => {
  it("ulusal biçimdeki numarayı verilen ülkeye göre E.164'e çevirir", () => {
    expect(normalizePhone("(512) 555-0132", "US")?.e164).toBe("+15125550132");
    expect(normalizePhone("020 7946 0958", "GB")?.e164).toBe("+442079460958");
    expect(normalizePhone("(416) 555-0199", "CA")?.e164).toBe("+14165550199");
    expect(normalizePhone("02 9374 4000", "AU")?.e164).toBe("+61293744000");
  });

  it("uluslararası biçimde ülke parametresinden bağımsız çalışır", () => {
    expect(normalizePhone("+44 20 7946 0958", "TR")?.e164).toBe("+442079460958");
    expect(normalizePhone("+90 532 123 45 67", "US")?.e164).toBe("+905321234567");
  });

  it("ülke verilmezse eskisi gibi TR varsayar", () => {
    expect(normalizePhone("0532 123 45 67")?.e164).toBe("+905321234567");
  });

  it("bilinmeyen ülke kodunda hata fırlatmaz, null döner", () => {
    expect(normalizePhone("0532 123 45 67", "ZZ")).toBeNull();
  });
});

describe("formatPhoneInternational", () => {
  it("E.164'ü uluslararası okunur biçime çevirir", () => {
    expect(formatPhoneInternational("+15125550132")).toBe("+1 512 555 0132");
    expect(formatPhoneInternational("+442079460958")).toBe("+44 20 7946 0958");
    expect(formatPhoneInternational("+905321234567")).toBe("+90 532 123 45 67");
  });
  it("çözülemeyen girdiyi olduğu gibi döner", () => {
    expect(formatPhoneInternational("abc")).toBe("abc");
  });
});
