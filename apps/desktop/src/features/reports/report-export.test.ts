import { describe, expect, it } from "vitest";
import { buildReportCsv, isExportableTab, type ExportableMetrics } from "./report-export";

const metrics: ExportableMetrics = {
  series: [
    { day: "2026-10-01", found: 5, sent: 2, replied: 1, engaged: 0, won: 0 },
    { day: "2026-10-02", found: 3, sent: 4, replied: 2, engaged: 1, won: 1 },
  ],
  bySource: { GOOGLE_PLACES: 8, MANUAL: 2 },
  byChannel: { EMAIL: { sent: 10, replied: 3 }, WHATSAPP: { sent: 0, replied: 0 } },
  funnel: { found: 100, contacted: 40, replied: 10, engaged: 5, proposal: 2, won: 1 },
  team: [{ name: "Ayşe", assigned: 12, sent: 7, won: 1, activities: 30 }],
};
const range = { from: "2026-10-01", to: "2026-10-07" };
const CRLF = String.fromCharCode(13, 10);
const lines = (csv: string) => csv.replace(String.fromCharCode(0xfeff), "").split(CRLF);

describe("buildReportCsv", () => {
  it("günlük seriyi satır satır yazar ve dosya adına aralığı koyar", () => {
    const { filename, csv } = buildReportCsv("overview", metrics, range);
    expect(filename).toBe("rapor-gunluk-2026-10-01_2026-10-07.csv");
    expect(lines(csv)).toHaveLength(3);
    expect(lines(csv)[1]).toContain("2026-10-01;5;2;1;0;0");
  });

  it("kaynakları çoktan aza sıralar", () => {
    const body = lines(buildReportCsv("source", metrics, range).csv).slice(1);
    expect(body[0]).toMatch(/;8$/);
    expect(body[1]).toMatch(/;2$/);
  });

  it("kanal cevap oranını hesaplar ve sıfır gönderimde %0 yazar", () => {
    const body = lines(buildReportCsv("channel", metrics, range).csv).slice(1);
    expect(body[0]).toContain(";10;3;%30");
    expect(body[1]).toContain(";0;0;%0");
  });

  it("dönüşüm hunisinde ilk adımın önceki oranı boştur", () => {
    const body = lines(buildReportCsv("conversion", metrics, range).csv).slice(1);
    expect(body[0]?.endsWith(";100;")).toBe(true);
    expect(body[1]).toContain(";40;%40");
  });

  it("ekip tablosunu yazar", () => {
    expect(lines(buildReportCsv("team", metrics, range).csv)[1]).toBe("Ayşe;12;7;1;30");
  });
});

describe("isExportableTab", () => {
  it("yalnızca dışa aktarılabilir sekmeleri kabul eder", () => {
    expect(isExportableTab("overview")).toBe(true);
    expect(isExportableTab("segments")).toBe(false);
  });
});
