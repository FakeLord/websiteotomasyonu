import { placeToBusinessPayload, runSearchJob, type SearchJobClock } from "@lbf/core";
import type { ImportBusinessResult } from "@lbf/contracts";
import { supabase } from "../lib/supabase-client";
import { createPlacesSearchAdapter } from "../lib/places-provider";
import { recomputeScore } from "./score-runner";

const JOB_TYPE = "places_search";
const LEASE_TTL_SECONDS = 120;
const DEVICE_ID_KEY = "lbf.device_id";

export interface SearchJobParams {
  textQuery: string;
  city?: string;
  district?: string;
}

export interface ProcessQueueResult {
  processed: number;
  leaseHeldElsewhere: boolean;
}

const realClock: SearchJobClock = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Bekleyen (`QUEUED`) Places arama işlerini sırayla işler: `worker_leases`
 * kilidini alır (tek aktif worker — SPEC.md → G.1), her iş için `runSearchJob`
 * çalıştırır ve sonuçları `import_business()` RPC'sine yazar. Kilit başka bir
 * cihazda tutuluyorsa sessizce çıkar (çakışma değil, bekleme).
 */
export async function processSearchQueue(workspaceId: string): Promise<ProcessQueueResult> {
  const deviceId = getDeviceId();

  const { data: acquired, error: leaseError } = await supabase.rpc("acquire_worker_lease", {
    ws: workspaceId,
    p_job_type: JOB_TYPE,
    p_device_id: deviceId,
    p_ttl_seconds: LEASE_TTL_SECONDS,
  });
  if (leaseError) throw leaseError;
  if (!acquired) return { processed: 0, leaseHeldElsewhere: true };

  let processed = 0;
  try {
    const { data: jobs, error } = await supabase
      .from("search_jobs")
      .select("id, params")
      .eq("workspace_id", workspaceId)
      .eq("status", "QUEUED")
      .order("created_at", { ascending: true });
    if (error) throw error;

    for (const job of jobs ?? []) {
      await runOneJob(workspaceId, job.id as string, job.params as SearchJobParams);
      processed += 1;
    }
  } finally {
    await supabase.rpc("release_worker_lease", {
      ws: workspaceId,
      p_job_type: JOB_TYPE,
      p_device_id: deviceId,
    });
  }

  return { processed, leaseHeldElsewhere: false };
}

async function runOneJob(workspaceId: string, jobId: string, params: SearchJobParams): Promise<void> {
  const { error: runningError } = await supabase
    .from("search_jobs")
    .update({ status: "RUNNING" })
    .eq("id", jobId);
  if (runningError) throw runningError;

  try {
    const provider = createPlacesSearchAdapter(workspaceId);
    const result = await runSearchJob(provider, realClock, params.textQuery);

    let newCount = 0;
    let duplicateCount = 0;

    for (const place of result.places) {
      const payload = placeToBusinessPayload(place, { city: params.city, district: params.district });
      const { data, error } = await supabase.rpc("import_business", {
        ws: workspaceId,
        p_payload: payload,
        p_search_job_id: jobId,
      });
      if (error) throw error;

      const importResult = data as ImportBusinessResult | null;
      const status = importResult?.status;
      if (status === "DUPLICATE_MERGED") {
        duplicateCount += 1;
      } else {
        newCount += 1;
        if (importResult) {
          try {
            await recomputeScore(workspaceId, importResult.businessId);
          } catch {
            // Skor hesaplanamazsa iş akışı durmaz.
          }
        }
      }
    }

    const { error: doneError } = await supabase
      .from("search_jobs")
      .update({
        status: "DONE",
        api_calls: result.apiCalls,
        result_count: result.places.length,
        new_count: newCount,
        duplicate_count: duplicateCount,
      })
      .eq("id", jobId);
    if (doneError) throw doneError;
  } catch (err) {
    await supabase
      .from("search_jobs")
      .update({
        status: "FAILED",
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
      })
      .eq("id", jobId);
  }
}
