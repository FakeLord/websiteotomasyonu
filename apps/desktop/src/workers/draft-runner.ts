import { tr } from "../i18n/tr";
import { generateFirstMessageDraft, hasOutgoingEmail, saveDraftMessage } from "../features/outreach/outreach";
import { draftReasonLabel } from "../features/leads/detail/lead-data";
import { getDeviceId } from "../lib/device-id";
import { useDraftStore } from "../lib/draft-store";
import { supabase } from "../lib/supabase-client";
import { createDraftLoop, type ClaimedDraftJob, type DraftJobResult, type DraftLoopState } from "./draft-loop";

/** Bir taslak en kötü durumda 3 deneme + çeviri sürer; sahiplik bu süre dolmadan başka cihaza geçmez. */
const JOB_TTL_SECONDS = 600;

type Loop = ReturnType<typeof createDraftLoop>;
const loops = new Map<string, Loop>();

/** Sunucudaki günlük AI kotası (ai-gateway) dolduğunda gelen hata. */
function isQuotaError(message: string): boolean {
  return /kota|QUOTA_EXCEEDED/i.test(message);
}

async function generate(workspaceId: string, job: ClaimedDraftJob): Promise<DraftJobResult> {
  // Aynı işletmeye bu sırada elle taslak yazıldıysa/gönderildiyse tekrar üretme.
  if (await hasOutgoingEmail(job.businessId)) {
    return { status: "FAILED", error: tr.draftQueue.alreadyHasMessage };
  }
  try {
    const draft = await generateFirstMessageDraft(
      workspaceId,
      {
        id: job.businessId,
        name: job.name,
        category: job.category,
        district: job.district,
        city: job.city,
        do_not_contact: job.doNotContact,
      },
      job.channel,
      job.language,
    );
    if (!draft.ok) {
      return { status: "FAILED", error: draft.reasons.map(draftReasonLabel).join(" · ") || tr.draftQueue.rejected };
    }
    const saved = await saveDraftMessage(workspaceId, job.businessId, {
      channel: job.channel,
      subject: draft.subject,
      body: draft.body,
      authorType: "AI",
    });
    return { status: "DONE", messageId: saved.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : tr.draftQueue.unknownError;
    if (message === tr.draft.noCompanyProfile) return { status: "RELEASE", reason: "SETUP", error: message };
    if (isQuotaError(message)) return { status: "RELEASE", reason: "QUOTA", error: message };
    return { status: "FAILED", error: message };
  }
}

function loopFor(workspaceId: string): Loop {
  let loop = loops.get(workspaceId);
  if (loop) return loop;

  const deviceId = getDeviceId();
  loop = createDraftLoop({
    async claim() {
      const { data, error } = await supabase.rpc("claim_next_draft_job", {
        ws: workspaceId,
        p_device_id: deviceId,
        p_ttl_seconds: JOB_TTL_SECONDS,
      });
      if (error) throw new Error(error.message);
      return (data as ClaimedDraftJob | null) ?? null;
    },
    generate: (job) => generate(workspaceId, job),
    async complete(job, result) {
      const { error } = await supabase.rpc("complete_draft_job", {
        p_job_id: job.jobId,
        p_device_id: deviceId,
        p_status: result.status === "RELEASE" ? "QUEUED" : result.status,
        p_error: result.status === "DONE" ? null : result.error,
        p_message_id: result.status === "DONE" ? result.messageId : null,
      });
      if (error) throw new Error(error.message);
    },
    onState: (state: DraftLoopState) => useDraftStore.getState().setDraft(state),
  });
  loops.set(workspaceId, loop);
  return loop;
}

/**
 * Kuyruktaki taslak işlerini arka planda üretir; hangi sayfada olunduğundan bağımsızdır (sekme açıkken).
 * Gönderim yoktur: taslaklar "Onay bekleyenler"e düşer.
 */
export function kickDraftQueue(workspaceId: string): Promise<DraftLoopState> {
  return loopFor(workspaceId).kick();
}
