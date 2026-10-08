import { runWebsiteAnalysis, type WebsiteAnalysisResult } from "@lbf/core";
import { createAnalysisClient, type AnalysisWorkerLike } from "../lib/analysis-client";
import { platform } from "../lib/platform";
import { supabase } from "../lib/supabase-client";
import { platformWebsiteFetcher } from "../lib/website-fetcher";
import { addWhatsappChannelFor } from "../lib/whatsapp-channels";
import { recomputeScore } from "./score-runner";

export interface AnalyzeTarget {
  id: string;
  websiteUrl: string | null;
  category: string | null;
}

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

  // Telefonu cep numarasıysa WhatsApp kanalı eklenir; "yazılabilir" süzgeçleri buna bakar. Eklenemezse analiz bozulmaz.
  try {
    await addWhatsappChannelFor(workspaceId, target.id);
  } catch {
    // Bir sonraki analizde yeniden denenir.
  }

  await recomputeScore(workspaceId, target.id);

  return result;
}
