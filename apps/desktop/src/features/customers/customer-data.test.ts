import { describe, expect, it } from "vitest";
import { buildStoragePath, checkFile, formatFileSize, renewalState, safeFileName } from "./customer-data";

describe("checkFile", () => {
  it("izin verilen türleri kabul eder, büyük/boş/yanlış türü reddeder", () => {
    expect(checkFile({ size: 1000, type: "application/pdf" })).toBeNull();
    expect(checkFile({ size: 1000, type: "image/png" })).toBeNull();
    expect(checkFile({ size: 0, type: "application/pdf" })).toBe("EMPTY");
    expect(checkFile({ size: 11 * 1024 * 1024, type: "application/pdf" })).toBe("TOO_LARGE");
    expect(checkFile({ size: 1000, type: "application/x-msdownload" })).toBe("TYPE");
  });
});

describe("safeFileName / buildStoragePath", () => {
  it("Türkçe harf, boşluk ve yol ayracını temizler, uzantıyı korur", () => {
    expect(safeFileName("Ekim Faturası (son).PDF")).toBe("Ekim-Faturasi-son.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("???")).toBe("dosya");
  });

  it("yol çalışma alanı ve işletmeyle başlar", () => {
    expect(buildStoragePath("ws-1", "biz-1", "Fatura 1.pdf", "abc")).toBe("ws-1/biz-1/abc-Fatura-1.pdf");
  });
});

describe("renewalState", () => {
  const now = new Date("2026-10-11T10:00:00Z");
  it("geçmiş tarih, 30 gün içi ve uzak tarihi ayırır", () => {
    expect(renewalState("2026-10-10", now)).toBe("OVERDUE");
    expect(renewalState("2026-10-11", now)).toBe("SOON");
    expect(renewalState("2026-11-10", now)).toBe("SOON");
    expect(renewalState("2026-11-11", now)).toBe("OK");
    expect(renewalState(null, now)).toBeNull();
    expect(renewalState("bozuk", now)).toBeNull();
  });
});

describe("formatFileSize", () => {
  it("B, KB ve MB yazar", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
