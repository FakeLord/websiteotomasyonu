import { describe, expect, it } from "vitest";
import { stripSignOff } from "./strip-sign-off";

describe("stripSignOff", () => {
  it("kapanış satırından sonraki isim/unvan imzasını siler, kapanışı korur", () => {
    expect(stripSignOff("Merhaba, bir fikrimiz var.\n\nSaygılarımla,\nDijital Ajans Danışmanı")).toBe(
      "Merhaba, bir fikrimiz var.\n\nSaygılarımla,",
    );
  });

  it("birden çok imza satırını siler", () => {
    expect(stripSignOff("Merhaba.\n\nSevgilerle\nAhmet Yılmaz\nSatış Ekibi\nwww.ornek.com")).toBe("Merhaba.\n\nSevgilerle");
  });

  it("kapanış yoksa metne dokunmaz", () => {
    expect(stripSignOff("Merhaba, bir fikrimiz var.\nDetayları konuşalım mı?")).toBe(
      "Merhaba, bir fikrimiz var.\nDetayları konuşalım mı?",
    );
  });

  it("kapanıştan sonra imza yoksa aynen döner", () => {
    expect(stripSignOff("Merhaba.\n\nSaygılarımla,")).toBe("Merhaba.\n\nSaygılarımla,");
  });

  it("büyük/küçük harf ve noktalama farkını görmezden gelir", () => {
    expect(stripSignOff("Merhaba.\nİyi Çalışmalar!\nEkip")).toBe("Merhaba.\nİyi Çalışmalar!");
  });

  it("cümle içinde geçen kapanış kelimesini imza sanmaz", () => {
    const body = "Saygılarımla ilgili bir not düşmek istedik.\nDevamını konuşalım.";
    expect(stripSignOff(body)).toBe(body);
  });
});
