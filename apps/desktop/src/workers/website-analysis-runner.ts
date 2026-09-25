import { runWebsiteAnalysis, type WebsiteAnalysisResult } from "@lbf/core";
import { supabase } from "../lib/supabase-client";
import { tauriWebsiteFetcher } from "../lib/website-fetcher";
import { recomputeScore } from "./score-runner";

export interface AnalyzeTarget {
  id: string;
  websiteUrl: string | null;
  category: string | null;
}

const CONCURRENCY = 4;

/**
 * Tek bir işletmeyi analiz eder ve sonucu `save_website_analysis()` RPC'sine
 * yazar (yetki ve activity log DB tarafında — CLAUDE.md #8). Fetch, Rust
 * `fetch_page` komutunu saran `tauriWebsiteFetcher` üzerinden yapılır.
 */
export async function analyzeBusiness(workspaceId: string, target: AnalyzeTarget): Promise<WebsiteAnalysisResult> {
  const result = await runWebsiteAnalysis(tauriWebsiteFetcher, {
    websiteUrl: target.websiteUrl,
    category: target.category ?? undefined,
  });

  const { error } = await supabase.rpc("save_website_analysis", {
    ws: workspaceId,
    p_business_id: target.id,
    p_result: result,
  });
  if (error) throw error;

  await recomputeScore(workspaceId, target.id);

  return result;
}

/**
 * Toplu analiz kuyruğu: SPEC.md → H "domain başına saniyede 1 istek, eş
 * zamanlı en fazla 4 domain" sınırına yaklaşmak için 4'lü gruplar halinde
 * paralel çalışır. Bir işletmenin analizi başarısız olursa diğerleri
 * etkilenmez.
 */
export async function analyzeBusinessesInBatches(
  workspaceId: string,
  targets: AnalyzeTarget[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (target) => {
        try {
          await analyzeBusiness(workspaceId, target);
        } catch {
          // Sessizce atla; kullanıcı sonucu website_status = null olarak görür
          // ve tekrar deneyebilir.
        } finally {
          done += 1;
          onProgress?.(done, targets.length);
        }
      }),
    );
  }
}
