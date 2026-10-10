/**
 * AI taslak ve cevap sınıflandırma değerlendirmesinin saf özet fonksiyonları (scripts/eval/run.ts kullanır).
 * Gerçek model çağrısı yoktur; yalnızca ölçüm sonuçlarını toplar (PHASE-16: kullanılabilir taslak oranı ≥ %90).
 */
export type EvalLanguage = "tr" | "en";

export interface DraftEvalResult {
  id: string;
  language: EvalLanguage;
  /** Yeniden üretimler dahil sonunda güvenlik kontrolünden geçen taslak var mı. */
  ok: boolean;
  /** İlk denemede geçti mi (yeniden üretim gerekmedi). */
  firstAttemptOk: boolean;
  attempts: number;
  reasons: string[];
  latencyMs: number;
  /** Ağ/sağlayıcı hatası (kalite değil, erişim sorunu). */
  error?: string;
}

export interface DraftEvalBucket {
  total: number;
  usable: number;
  usableRate: number;
  firstAttemptRate: number;
}

export interface DraftEvalSummary extends DraftEvalBucket {
  byLanguage: Record<EvalLanguage, DraftEvalBucket>;
  /** Red sebeplerinin dağılımı (son denemedeki sebep koduna göre, "FOREIGN_WORD:x" → "FOREIGN_WORD"). */
  reasonCounts: Record<string, number>;
  providerErrors: number;
  avgLatencyMs: number;
  threshold: number;
  /** Her iki dilde de kullanılabilir oran eşiğin üstünde mi. */
  passed: boolean;
}

function bucket(results: DraftEvalResult[]): DraftEvalBucket {
  const total = results.length;
  const usable = results.filter((r) => r.ok).length;
  const first = results.filter((r) => r.firstAttemptOk).length;
  return {
    total,
    usable,
    usableRate: total === 0 ? 0 : usable / total,
    firstAttemptRate: total === 0 ? 0 : first / total,
  };
}

export function summarizeDraftEval(results: DraftEvalResult[], threshold = 0.9): DraftEvalSummary {
  const reasonCounts: Record<string, number> = {};
  for (const result of results) {
    if (result.ok || result.error) continue;
    for (const reason of result.reasons) {
      const code = reason.split(":")[0] ?? reason;
      reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
    }
  }
  const tr = bucket(results.filter((r) => r.language === "tr"));
  const en = bucket(results.filter((r) => r.language === "en"));
  const overall = bucket(results);
  const latencies = results.filter((r) => !r.error).map((r) => r.latencyMs);
  return {
    ...overall,
    byLanguage: { tr, en },
    reasonCounts,
    providerErrors: results.filter((r) => r.error).length,
    avgLatencyMs: latencies.length === 0 ? 0 : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    threshold,
    passed: [tr, en].filter((b) => b.total > 0).every((b) => b.usableRate >= threshold),
  };
}

export interface ClassifyEvalResult {
  id: string;
  language: EvalLanguage;
  expectedIntent: string;
  predictedIntent: string | null;
  expectedStop: boolean;
  /** Model veya kural tabanlı anahtar kelime yedeği durdurma dedi mi (uygulamadaki gerçek karar). */
  predictedStop: boolean;
  error?: string;
}

export interface ClassifyEvalSummary {
  total: number;
  intentAccuracy: number;
  byLanguage: Record<EvalLanguage, { total: number; intentAccuracy: number }>;
  /** Durdurma isteklerinin yakalanma oranı: yakalanamayan her istek istenmeyen mesaj demektir. */
  stopRecall: number;
  /** Durdurma istemeyen kişiyi yanlışlıkla DNC yapma oranı (kayıp lead). */
  stopFalsePositiveRate: number;
  confusions: Record<string, number>;
  providerErrors: number;
}

export function summarizeClassifyEval(results: ClassifyEvalResult[]): ClassifyEvalSummary {
  const valid = results.filter((r) => !r.error);
  const accuracy = (rows: ClassifyEvalResult[]) =>
    rows.length === 0 ? 0 : rows.filter((r) => r.predictedIntent === r.expectedIntent).length / rows.length;
  const stops = valid.filter((r) => r.expectedStop);
  const nonStops = valid.filter((r) => !r.expectedStop);
  const confusions: Record<string, number> = {};
  for (const row of valid) {
    if (row.predictedIntent !== row.expectedIntent) {
      const key = `${row.expectedIntent}→${row.predictedIntent ?? "?"}`;
      confusions[key] = (confusions[key] ?? 0) + 1;
    }
  }
  const lang = (language: EvalLanguage) => {
    const rows = valid.filter((r) => r.language === language);
    return { total: rows.length, intentAccuracy: accuracy(rows) };
  };
  return {
    total: results.length,
    intentAccuracy: accuracy(valid),
    byLanguage: { tr: lang("tr"), en: lang("en") },
    stopRecall: stops.length === 0 ? 1 : stops.filter((r) => r.predictedStop).length / stops.length,
    stopFalsePositiveRate: nonStops.length === 0 ? 0 : nonStops.filter((r) => r.predictedStop).length / nonStops.length,
    confusions,
    providerErrors: results.filter((r) => r.error).length,
  };
}
