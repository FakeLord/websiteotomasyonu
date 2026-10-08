import { useAnalysisStore } from "../lib/analysis-store";
import { getDeviceId } from "../lib/device-id";
import { supabase } from "../lib/supabase-client";
import { createAnalysisQueue, type AnalysisQueueState, type AnalysisTarget } from "./analysis-queue";
import { analyzeBusiness } from "./website-analysis-runner";

const JOB_TYPE = "website_analysis";
/** Tek bir işletme en kötü durumda ~30 sn sürebilir; kilit her partiden önce yenilenir. */
const LEASE_TTL_SECONDS = 300;

const ANALYSIS_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Analiz zaman aşımına uğradı (90 sn).")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

type Queue = ReturnType<typeof createAnalysisQueue>;
const queues = new Map<string, Queue>();

function queueFor(workspaceId: string): Queue {
  let queue = queues.get(workspaceId);
  if (queue) return queue;

  const deviceId = getDeviceId();
  queue = createAnalysisQueue({
    async fetchPending(limit): Promise<AnalysisTarget[]> {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, website_url, category")
        .eq("workspace_id", workspaceId)
        .is("merged_into", null)
        .is("website_status", null)
        // En son bulunanlar önce: kullanıcı az önce aradığı işletmelerin sonucunu ilk görür.
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id as string,
        websiteUrl: row.website_url as string | null,
        category: row.category as string | null,
      }));
    },
    // Takılan tek bir site (yanıt vermeyen worker/istek) bütün kuyruğu sonsuza kadar bekletmesin.
    analyze: (target) => withTimeout(analyzeBusiness(workspaceId, target), ANALYSIS_TIMEOUT_MS),
    async acquireLease() {
      const { data, error } = await supabase.rpc("acquire_worker_lease", {
        ws: workspaceId,
        p_job_type: JOB_TYPE,
        p_device_id: deviceId,
        p_ttl_seconds: LEASE_TTL_SECONDS,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
    async releaseLease() {
      await supabase.rpc("release_worker_lease", { ws: workspaceId, p_job_type: JOB_TYPE, p_device_id: deviceId });
    },
    onState: (state) => useAnalysisStore.getState().setQueue(state),
  });
  queues.set(workspaceId, queue);
  return queue;
}

/**
 * Analiz edilmemiş işletmeleri arka planda analiz eder; hangi sayfada olunduğundan bağımsızdır.
 * Uygulama açılışında, arama/içe aktarma sonrasında ve aralıklarla çağrılır; zaten çalışıyorsa süren turu döner.
 */
export async function kickBackgroundAnalysis(workspaceId: string): Promise<AnalysisQueueState> {
  try {
    return await queueFor(workspaceId).kick();
  } catch (error) {
    // Kilit çağrısı gibi tur dışı hatalar da görünür olsun; sessizce yutulmaz.
    const failed: AnalysisQueueState = {
      running: false,
      done: 0,
      total: 0,
      failed: 0,
      firstError: error instanceof Error ? error.message : "Bilinmeyen hata",
      blockedBy: null,
    };
    useAnalysisStore.getState().setQueue(failed);
    return failed;
  }
}

/** "Toplu Analiz": bu oturumda başarısız olanları da yeniden dener. */
export function retryFailedAndKick(workspaceId: string): Promise<AnalysisQueueState> {
  queueFor(workspaceId).retryFailed();
  useAnalysisStore.getState().clearProblem();
  return kickBackgroundAnalysis(workspaceId);
}
