import { runWebsiteAnalysis, type WebsiteAnalysisResult } from "@lbf/core";
import { createAnalysisClient, type AnalysisWorkerLike } from "../lib/analysis-client";
import { platform } from "../lib/platform";
import { supabase } from "../lib/supabase-client";
import { platformWebsiteFetcher } from "../lib/website-fetcher";
import { recomputeScore } from "./score-runner";

export interface AnalyzeTarget {
  id: string;
  websiteUrl: string | null;
  category: string | null;
}

const CONCURRENCY = 4;

/**
 * Web modunda ağır HTML analizi arayüzü dondurmasın diye Web Worker'da çalışır; Tauri'de veya
 * worker yoksa doğrudan (ana iş parçacığında) çalışır.
 */
const analysisClient = createAnalysisClient({
  createWorker:
    platform.kind === "web" && typeof Worker !== "undefined"
      ? () => new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" }) as unknown as AnalysisWorkerLike
      : null,
  runInline: (input) => runWebsiteAnalysis(platformWebsiteFetcher, input),
});

/**
 * Tek bir işletmeyi analiz eder ve sonucu `save_website_analysis()` RPC'sine
 * yazar (yetki ve activity log DB tarafında — CLAUDE.md #8). Fetch, kabuğun
 * `fetch_page` uygulamasını (Rust veya yerel sunucu) saran `platformWebsiteFetcher` üzerinden yapılır.
 */
export async function analyzeBusiness(workspaceId: string, target: AnalyzeTarget): Promise<WebsiteAnalysisResult> {
  const result = await analysisClient.run({
    websiteUrl: target.websiteUrl,
    category: target.category ?? undefined,
  });

  const { error } = await supabase.rpc("save_website_analysis", {
    ws: workspaceId,
    p_business_id: target.id,
    p_result: result,
  });
  if (error) throw new Error(error.message);

  await recomputeScore(workspaceId, target.id);

  return result;
}

/**
 * Toplu analiz kuyruğu: SPEC.md → H "domain başına saniyede 1 istek, eş
 * zamanlı en fazla 4 domain" sınırına yaklaşmak için 4'lü gruplar halinde
 * paralel çalışır. Bir işletmenin analizi başarısız olursa diğerleri
 * etkilenmez.
 */
export interface BatchAnalysisSummary {
  failed: number;
  /** İlk hatanın metni (neden görünür olsun diye). */
  firstError: string | null;
}

export async function analyzeBusinessesInBatches(
  workspaceId: string,
  targets: AnalyzeTarget[],
  onProgress?: (done: number, total: number) => void,
  analyze: (workspaceId: string, target: AnalyzeTarget) => Promise<unknown> = analyzeBusiness,
): Promise<BatchAnalysisSummary> {
  let done = 0;
  const summary: BatchAnalysisSummary = { failed: 0, firstError: null };
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (target) => {
        try {
          await analyze(workspaceId, target);
        } catch (error) {
          // Diğer işletmeler etkilenmez; hata sayılır ve ilk nedeni kullanıcıya gösterilir.
          summary.failed += 1;
          summary.firstError ??= error instanceof Error ? error.message : "Bilinmeyen hata";
        } finally {
          done += 1;
          onProgress?.(done, targets.length);
        }
      }),
    );
  }
  return summary;
}
