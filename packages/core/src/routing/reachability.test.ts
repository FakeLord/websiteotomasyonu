import { describe, expect, it } from "vitest";
import { WRITABLE_CHANNELS, hasWritableChannel, phoneLineType, whatsappCandidates } from "./reachability";

describe("phoneLineType", () => {
  it("cep numarasını tanır (TR, DE, GB, AU)", () => {
    expect(phoneLineType("+905321234567")).toBe("MOBILE");
    expect(phoneLineType("+4915123456789")).toBe("MOBILE");
    expect(phoneLineType("+447911123456")).toBe("MOBILE");
    expect(phoneLineType("+61412345678")).toBe("MOBILE");
  });

  it("sabit hattı tanır", () => {
    expect(phoneLineType("+493601856553")).toBe("LANDLINE");
    expect(phoneLineType("+902121234567")).toBe("LANDLINE");
    expect(phoneLineType("+442071234567")).toBe("LANDLINE");
  });

  it("ABD/Kanada'da cep ve sabit hat ayırt edilemez", () => {
    expect(phoneLineType("+15125550132")).toBe("UNKNOWN");
  });

  it("boş veya bozuk numara UNKNOWN döner", () => {
    expect(phoneLineType(null)).toBe("UNKNOWN");
    expect(phoneLineType("abc")).toBe("UNKNOWN");
  });
});

describe("hasWritableChannel", () => {
  it("e-posta, WhatsApp veya sosyal medya yazılabilir kanaldır", () => {
    for (const channel of WRITABLE_CHANNELS) expect(hasWritableChannel([{ channel }])).toBe(true);
  });

  it("yalnızca telefonu olan işletmeye yazılamaz", () => {
    expect(hasWritableChannel([{ channel: "PHONE" }, { channel: "WEBSITE_FORM" }])).toBe(false);
    expect(hasWritableChannel([])).toBe(false);
    expect(hasWritableChannel(null)).toBe(false);
  });

  it("geçersiz veya geri dönmüş kanal sayılmaz", () => {
    expect(hasWritableChannel([{ channel: "EMAIL", status: "BOUNCED" }, { channel: "INSTAGRAM", status: "INVALID" }])).toBe(false);
    expect(hasWritableChannel([{ channel: "EMAIL", status: "BOUNCED" }, { channel: "WHATSAPP", status: "UNVERIFIED" }])).toBe(true);
  });
});

describe("whatsappCandidates", () => {
  it("cep numarası olan ve WhatsApp kanalı olmayan işletmeleri seçer", () => {
    const rows = [
      { id: "mobile", phoneE164: "+905321234567", channels: ["PHONE"] },
      { id: "landline", phoneE164: "+493601856553", channels: ["PHONE"] },
      { id: "already", phoneE164: "+905331234567", channels: ["PHONE", "WHATSAPP"] },
      { id: "us", phoneE164: "+15125550132", channels: ["PHONE"] },
      { id: "none", phoneE164: null, channels: [] },
    ];

    expect(whatsappCandidates(rows)).toEqual([{ businessId: "mobile", phoneE164: "+905321234567" }]);
  });
});
