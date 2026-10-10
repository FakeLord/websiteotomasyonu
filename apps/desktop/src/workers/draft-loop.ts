import type { OutreachLanguage } from "@lbf/core";

/** `claim_next_draft_job` RPC'sinin döndürdüğü iş. */
export interface ClaimedDraftJob {
  jobId: string;
  businessId: string;
  channel: "EMAIL";
  language: OutreachLanguage;
  name: string;
  category: string | null;
  district: string | null;
  city: string | null;
  doNotContact: boolean;
}

/**
 * `generate` sonucu. `RELEASE`: iş başarısız sayılmadan kuyruğa geri bırakılır ve tur durur
 * (günlük AI kotası doldu ya da kurulum eksik; kullanıcı düzeltince sürer).
 */
export type DraftJobResult =
  | { status: "DONE"; messageId: string }
  | { status: "FAILED"; error: string }
  | { status: "RELEASE"; error: string; reason: "QUOTA" | "SETUP" };

export type DraftStopReason = "QUOTA" | "SETUP" | "FAILURES";

export interface DraftLoopState {
  running: boolean;
  /** Bu turda hazırlanan taslak sayısı. */
  done: number;
  /** Bu turda başarısız olan iş sayısı. */
  failed: number;
  current: string | null;
  /** Turun neden durduğu (kuyruk boşaldıysa null). */
  stopped: DraftStopReason | null;
  error: string | null;
}

export interface DraftLoopDeps {
  claim(): Promise<ClaimedDraftJob | null>;
  generate(job: ClaimedDraftJob): Promise<DraftJobResult>;
  complete(job: ClaimedDraftJob, result: DraftJobResult): Promise<void>;
  onState(state: DraftLoopState): void;
}

const IDLE: DraftLoopState = { running: false, done: 0, failed: 0, current: null, stopped: null, error: null };

/** Sağlayıcı kapalıyken bütün kuyruk FAILED olmasın diye üst üste bu kadar başarısızlıkta tur durur. */
export const MAX_CONSECUTIVE_FAILURES = 5;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Bilinmeyen hata";
}

/**
 * Taslak kuyruğu çalıştırıcısı (ADR 0018): işleri sırayla alır, taslağı üretir ve kapatır. Saf orkestrasyondur
 * (I/O `deps` ile verilir). Gönderim yoktur; yalnızca DRAFT mesaj üretilir, onay insandadır.
 */
export function createDraftLoop(deps: DraftLoopDeps) {
  let current: Promise<DraftLoopState> | null = null;
  let state: DraftLoopState = IDLE;

  const emit = (patch: Partial<DraftLoopState>) => {
    state = { ...state, ...patch };
    deps.onState(state);
  };

  async function run(): Promise<DraftLoopState> {
    state = { ...IDLE, running: true };
    deps.onState(state);
    let consecutiveFailures = 0;

    try {
      while (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        const job = await deps.claim();
        if (!job) break;
        emit({ current: job.name });

        let result: DraftJobResult;
        try {
          result = await deps.generate(job);
        } catch (error) {
          result = { status: "FAILED", error: messageOf(error) };
        }
        await deps.complete(job, result);

        if (result.status === "RELEASE") {
          emit({ stopped: result.reason, error: result.error });
          break;
        }
        if (result.status === "DONE") {
          consecutiveFailures = 0;
          emit({ done: state.done + 1 });
        } else {
          consecutiveFailures += 1;
          emit({ failed: state.failed + 1, error: result.error });
        }
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) emit({ stopped: "FAILURES" });
    } catch (error) {
      emit({ error: messageOf(error) });
    } finally {
      emit({ running: false, current: null });
    }
    return state;
  }

  return {
    /** Kuyruğu çalıştırır; zaten çalışıyorsa süren turu döner. */
    kick(): Promise<DraftLoopState> {
      current ??= run().finally(() => {
        current = null;
      });
      return current;
    },
    state: () => state,
  };
}
