import { describe, expect, it } from "vitest";
import { summarizeClassifyEval, summarizeDraftEval, type ClassifyEvalResult, type DraftEvalResult } from "./eval-report";

const draft = (over: Partial<DraftEvalResult>): DraftEvalResult => ({
  id: "x",
  language: "tr",
  ok: true,
  firstAttemptOk: true,
  attempts: 1,
  reasons: [],
  latencyMs: 1000,
  ...over,
});

describe("summarizeDraftEval", () => {
  it("computes usable and first-attempt rates per language and passes at the threshold", () => {
    const results = [
      ...Array.from({ length: 9 }, () => draft({ language: "tr" })),
      draft({ language: "tr", ok: false, firstAttemptOk: false, attempts: 3, reasons: ["FOREIGN_WORD:strengthen"] }),
      ...Array.from({ length: 10 }, () => draft({ language: "en", firstAttemptOk: false, attempts: 2 })),
    ];
    const summary = summarizeDraftEval(results);
    expect(summary.byLanguage.tr).toMatchObject({ total: 10, usable: 9, usableRate: 0.9 });
    expect(summary.byLanguage.en).toMatchObject({ total: 10, usable: 10, firstAttemptRate: 0 });
    expect(summary.reasonCounts).toEqual({ FOREIGN_WORD: 1 });
    expect(summary.passed).toBe(true);
  });

  it("fails when one language is below the threshold", () => {
    const results = [
      ...Array.from({ length: 5 }, () => draft({ language: "tr" })),
      ...Array.from({ length: 5 }, () => draft({ language: "en", ok: false, firstAttemptOk: false, reasons: ["WRONG_LANGUAGE"] })),
    ];
    const summary = summarizeDraftEval(results);
    expect(summary.passed).toBe(false);
    expect(summary.byLanguage.en.usableRate).toBe(0);
  });

  it("counts provider errors separately and keeps them out of reason counts", () => {
    const summary = summarizeDraftEval([draft({ ok: false, firstAttemptOk: false, error: "HTTP 429", reasons: [] })]);
    expect(summary.providerErrors).toBe(1);
    expect(summary.reasonCounts).toEqual({});
  });
});

const cls = (over: Partial<ClassifyEvalResult>): ClassifyEvalResult => ({
  id: "c",
  language: "tr",
  expectedIntent: "INTERESTED",
  predictedIntent: "INTERESTED",
  expectedStop: false,
  predictedStop: false,
  ...over,
});

describe("summarizeClassifyEval", () => {
  it("measures accuracy, stop recall and false positives", () => {
    const summary = summarizeClassifyEval([
      cls({}),
      cls({ expectedIntent: "QUESTION", predictedIntent: "INTERESTED" }),
      cls({ expectedIntent: "STOP_CONTACT", predictedIntent: "STOP_CONTACT", expectedStop: true, predictedStop: true }),
      cls({ expectedIntent: "STOP_CONTACT", predictedIntent: "NOT_INTERESTED", expectedStop: true, predictedStop: false }),
      cls({ language: "en", predictedStop: true }),
    ]);
    expect(summary.intentAccuracy).toBeCloseTo(3 / 5);
    expect(summary.stopRecall).toBe(0.5);
    expect(summary.stopFalsePositiveRate).toBeCloseTo(1 / 3);
    expect(summary.confusions).toEqual({ "QUESTION→INTERESTED": 1, "STOP_CONTACT→NOT_INTERESTED": 1 });
    expect(summary.byLanguage.en.total).toBe(1);
  });
});
