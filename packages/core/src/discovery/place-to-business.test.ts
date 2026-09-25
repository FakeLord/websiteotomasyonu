import { describe, expect, it } from "vitest";
import { placeToBusinessPayload } from "./place-to-business";

describe("placeToBusinessPayload", () => {
  it("maps a normal website correctly", () => {
    const payload = placeToBusinessPayload(
      {
        id: "place-1",
        displayName: { text: "ABC Diş Kliniği" },
        formattedAddress: "Kadıköy, İstanbul",
        websiteUri: "https://abcdis.com",
        internationalPhoneNumber: "+90 532 123 45 67",
        businessStatus: "OPERATIONAL",
      },
      { city: "İstanbul", district: "Kadıköy" },
    );

    expect(payload.websiteDomain).toBe("abcdis.com");
    expect(payload.websiteUrl).toBe("https://abcdis.com");
    expect(payload.phoneE164).toBe("+905321234567");
    expect(payload.googlePlaceId).toBe("place-1");
    expect(payload.businessStatus).toBe("OPERATIONAL");
  });

  it("treats an Instagram websiteUri as a social channel, not a website", () => {
    const payload = placeToBusinessPayload({
      id: "place-2",
      displayName: { text: "XYZ Kuaför" },
      websiteUri: "https://www.instagram.com/xyz_kuafor/",
    });

    expect(payload.websiteUrl).toBeUndefined();
    expect(payload.websiteDomain).toBeUndefined();
    expect(payload.instagram).toBe("instagram:xyz_kuafor");
  });

  it("treats a link-in-bio URL as no website", () => {
    const payload = placeToBusinessPayload({
      id: "place-3",
      displayName: { text: "Test" },
      websiteUri: "https://linktr.ee/test",
    });

    expect(payload.websiteUrl).toBeUndefined();
    expect(payload.instagram).toBeUndefined();
    expect(payload.facebook).toBeUndefined();
  });

  it("falls back to a placeholder name when displayName is missing", () => {
    const payload = placeToBusinessPayload({ id: "place-4" });
    expect(payload.name).toBe("Bilinmeyen İşletme");
  });
});
