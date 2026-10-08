import { describe, expect, it } from "vitest";
import { availableChannels } from "./contact-channels";

describe("availableChannels", () => {
  it("kanalları sabit sırada ve tekrarsız döner", () => {
    expect(
      availableChannels([
        { channel: "INSTAGRAM" },
        { channel: "PHONE" },
        { channel: "INSTAGRAM" },
        { channel: "EMAIL", status: "VALID" },
      ]),
    ).toEqual(["PHONE", "EMAIL", "INSTAGRAM"]);
  });

  it("geçersiz ve sektirmiş (bounce) kayıtları saymaz", () => {
    expect(availableChannels([{ channel: "EMAIL", status: "BOUNCED" }, { channel: "PHONE", status: "INVALID" }])).toEqual([]);
  });

  it("doğrulanmamış kaydı sayar", () => {
    expect(availableChannels([{ channel: "EMAIL", status: "UNVERIFIED" }])).toEqual(["EMAIL"]);
  });

  it("web formu gibi ulaşma kanalı olmayanları göstermez; boş/eksik girdide boş döner", () => {
    expect(availableChannels([{ channel: "WEBSITE_FORM" }])).toEqual([]);
    expect(availableChannels(null)).toEqual([]);
    expect(availableChannels(undefined)).toEqual([]);
  });
});
