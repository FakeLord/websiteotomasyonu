import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ListChecks, Loader2 } from "lucide-react";
import { tr } from "../i18n/tr";
import { useAnalysisStore } from "../lib/analysis-store";
import { useDraftStore } from "../lib/draft-store";
import { useScanStore } from "../lib/scan-store";
import { supabase } from "../lib/supabase-client";
import {
  useDraftQueue,
  usePlacesUsage,
  useScanPlans,
  type ScanPlanProgress,
  type ScanPlanStatus,
} from "../lib/use-jobs";
import { useWorkspaceMembership } from "../lib/use-workspace-membership";
import { backfillWhatsappChannels } from "../lib/whatsapp-channels";
import { kickBackgroundAnalysis, retryFailedAndKick } from "../workers/background-analysis";
import { kickDraftQueue } from "../workers/draft-runner";
import { kickScan } from "../workers/scan-runner";
import { Badge, type BadgeTone } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/data-display";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../components/ui/primitives";
import { cn } from "../lib/cn";

const RECHECK_INTERVAL_MS = 60_000;
/** Her işletmede değil, birkaç işletmede bir tazele: listeler sürekli yeniden yüklenmesin. */
const REFRESH_EVERY = 5;
const REFRESH_KEYS = [["businesses"], ["search-results"], ["business"], ["dashboard-metrics"]] as const;
const FINISHED_PLANS_SHOWN = 3;

const PLAN_TONES: Record<ScanPlanStatus, BadgeTone> = {
  ACTIVE: "blue",
  PAUSED: "gray",
  BUDGET_PAUSED: "orange",
  DONE: "green",
  CANCELLED: "gray",
};

const isOpen = (plan: ScanPlanProgress) => plan.status === "ACTIVE" || plan.status === "PAUSED" || plan.status === "BUDGET_PAUSED";

/**
 * Arka plan işlerini (şehir taraması, site analizi) başlatır ve tazeler. Uygulama açık olduğu sürece, hangi sayfada
 * olunursa olunsun çalışır: açılışta, pencere odaklanınca ve dakikada bir yeniden bakar.
 */
function useJobRunners(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const analysis = useAnalysisStore((state) => state.queue);
  const scan = useScanStore((state) => state.scan);
  const lastRefreshed = useRef(0);

  useEffect(() => {
    if (!workspaceId) return;
    const kick = () => {
      void kickBackgroundAnalysis(workspaceId);
      void kickScan(workspaceId);
      void kickDraftQueue(workspaceId);
    };
    kick();
    const interval = window.setInterval(kick, RECHECK_INTERVAL_MS);
    window.addEventListener("focus", kick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", kick);
    };
  }, [workspaceId]);

  // Eski kayıtlar için tek seferlik: cep numarası olan işletmelere WhatsApp kanalı eklenir.
  useEffect(() => {
    if (!workspaceId) return;
    void backfillWhatsappChannels(workspaceId)
      .then((added) => {
        if (added) void queryClient.invalidateQueries({ queryKey: ["businesses"] });
      })
      .catch(() => {
        // İşaret yazılmadığı için bir sonraki açılışta yeniden denenir.
      });
  }, [workspaceId, queryClient]);

  // Analiz ilerledikçe (birkaç işletmede bir) ve bitince listeler/puanlar tazelenir.
  useEffect(() => {
    if (analysis.done === 0) {
      lastRefreshed.current = 0;
      return;
    }
    if (analysis.running && analysis.done - lastRefreshed.current < REFRESH_EVERY) return;
    lastRefreshed.current = analysis.done;
    for (const queryKey of REFRESH_KEYS) void queryClient.invalidateQueries({ queryKey });
  }, [analysis.done, analysis.running, queryClient]);

  // Her taslak hazırlandığında: kuyruk sayaçları ve onay bekleyen listesi tazelenir.
  const draftsDone = useDraftStore((state) => state.draft.done);
  const draftsFailed = useDraftStore((state) => state.draft.failed);
  useEffect(() => {
    if (!workspaceId || draftsDone + draftsFailed === 0) return;
    void queryClient.invalidateQueries({ queryKey: ["draft-queue", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["review-drafts", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
  }, [draftsDone, draftsFailed, workspaceId, queryClient]);

  // Her kare kapandığında: ilerleme ve sayaç tazelenir, bulunan işletmeler beklemeden analize girer.
  useEffect(() => {
    if (!workspaceId || scan.tilesDone === 0) return;
    void queryClient.invalidateQueries({ queryKey: ["scan-plans", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["places-usage", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["businesses"] });
    void queryClient.invalidateQueries({ queryKey: ["market-options", workspaceId] });
    void kickBackgroundAnalysis(workspaceId);
  }, [scan.tilesDone, scan.running, workspaceId, queryClient]);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-medium text-muted">{children}</p>;
}

/** Taslak kuyruğu (ADR 0018): ilerleme, durma nedeni, başarısızları yeniden dene / bekleyenleri iptal et. */
function DraftQueueSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const loop = useDraftStore((state) => state.draft);
  const queue = useDraftQueue().data;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["draft-queue", workspaceId] });
  const retryFailed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("retry_failed_draft_jobs", { ws: workspaceId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh();
      void kickDraftQueue(workspaceId);
    },
  });
  const cancelQueued = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_draft_jobs", { ws: workspaceId });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });

  const waiting = (queue?.queued ?? 0) + (queue?.running ?? 0);
  const total = waiting + (queue?.done ?? 0);
  const actionError = retryFailed.error ?? cancelQueued.error;

  return (
    <section>
      <SectionTitle>{tr.draftQueue.jobsTitle}</SectionTitle>
      {!queue || (total === 0 && queue.failed === 0 && queue.pendingApproval === 0) ? (
        <p className="text-sm text-muted">{tr.draftQueue.idle}</p>
      ) : (
        <div className="space-y-1.5">
          {total > 0 && <Progress value={((queue.done ?? 0) / total) * 100} />}
          <p className="text-xs text-muted tabular-nums">{tr.draftQueue.counts(waiting, queue.done, queue.failed)}</p>
          {loop.running && loop.current && <p className="text-xs text-muted">{tr.draftQueue.running(loop.current)}</p>}
          {!loop.running && waiting > 0 && !loop.stopped && <p className="text-xs text-muted">{tr.draftQueue.waitingHint}</p>}
          {loop.stopped && <p className="text-xs text-warning">{tr.draftQueue.stopped[loop.stopped]}</p>}
          {queue.failed > 0 && queue.lastError && <p className="text-xs text-danger">{queue.lastError}</p>}
          {actionError && <p className="text-xs text-danger">{actionError.message || tr.draftQueue.actionError}</p>}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {queue.pendingApproval > 0 && (
              <Button size="sm" variant="outline" onClick={() => navigate("/review")}>
                {tr.draftQueue.pendingApproval(queue.pendingApproval)}
              </Button>
            )}
            {queue.failed > 0 && (
              <Button size="sm" variant="outline" disabled={retryFailed.isPending} onClick={() => retryFailed.mutate()}>
                {tr.draftQueue.retryFailed}
              </Button>
            )}
            {queue.queued > 0 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={cancelQueued.isPending}
                onClick={() => {
                  if (window.confirm(tr.draftQueue.cancelConfirm)) cancelQueued.mutate();
                }}
              >
                {tr.draftQueue.cancelQueued}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PlanRow({ plan, workspaceId }: { plan: ScanPlanProgress; workspaceId: string }) {
  const queryClient = useQueryClient();
  const scanning = useScanStore((state) => state.scan.running);
  const setStatus = useMutation({
    mutationFn: async (status: "ACTIVE" | "PAUSED" | "CANCELLED") => {
      const { error } = await supabase.rpc("set_scan_plan_status", { p_plan_id: plan.id, p_status: status });
      if (error) throw new Error(error.message);
      return status;
    },
    onSuccess: (status) => {
      void queryClient.invalidateQueries({ queryKey: ["scan-plans", workspaceId] });
      if (status === "ACTIVE") void kickScan(workspaceId);
    },
  });

  const retryFailed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("retry_failed_scan_tiles", { p_plan_id: plan.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scan-plans", workspaceId] });
      void kickScan(workspaceId);
    },
  });

  // Bütün bölgeler taranamadıysa "Tamamlandı" yanıltıcı olur.
  const hasGaps = plan.status === "DONE" && plan.tilesFailed > 0;
  const actionError = setStatus.error ?? retryFailed.error;
  const percent = plan.tilesTotal > 0 ? (plan.tilesFinished / plan.tilesTotal) * 100 : 0;
  const hint =
    plan.status === "BUDGET_PAUSED" ? tr.jobs.budgetPausedHint : plan.status === "ACTIVE" && !scanning ? tr.jobs.waitingHint : null;

  return (
    <li className="space-y-1.5 rounded-lg bg-surface-3/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-text">
          {tr.jobs.planTitle(plan.city, plan.countryCode, plan.categoryCount)}
        </p>
        <Badge tone={hasGaps ? "orange" : PLAN_TONES[plan.status]}>
          {hasGaps ? tr.jobs.doneWithGaps : tr.jobs.planStatus[plan.status]}
        </Badge>
      </div>
      <Progress value={percent} />
      <p className="flex justify-between gap-2 text-xs text-muted tabular-nums">
        <span>{tr.jobs.planProgress(plan.tilesFinished, plan.tilesTotal)}</span>
        <span>{tr.jobs.planResult(plan.newBusinesses, plan.apiCalls)}</span>
      </p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {plan.tilesFailed > 0 && (
        <p className="text-xs text-danger">
          {tr.jobs.planFailedTiles(plan.tilesFailed)}
          {plan.lastError ? `: ${plan.lastError}` : ""}
        </p>
      )}
      {actionError && <p className="text-xs text-danger">{actionError.message || tr.jobs.actionError}</p>}
      {plan.tilesFailed > 0 && plan.status !== "CANCELLED" && (
        <Button size="sm" variant="outline" disabled={retryFailed.isPending} onClick={() => retryFailed.mutate()}>
          {tr.jobs.retryFailed}
        </Button>
      )}
      {isOpen(plan) && (
        <div className="flex gap-2 pt-0.5">
          {plan.status === "ACTIVE" && (
            <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate("PAUSED")}>
              {tr.jobs.pause}
            </Button>
          )}
          {plan.status === "PAUSED" && (
            <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate("ACTIVE")}>
              {tr.jobs.resume}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={setStatus.isPending}
            onClick={() => {
              if (window.confirm(tr.jobs.cancelConfirm)) setStatus.mutate("CANCELLED");
            }}
          >
            {tr.jobs.cancel}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Üst çubuktaki "İşler" kutusu (ADR 0014): şehir taramaları, site analizi ve aylık Places sayacı tek yerde.
 * Kapalıyken düğme o an süren işi özetler.
 */
export function JobsMenu() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  useJobRunners(workspaceId);

  const analysis = useAnalysisStore((state) => state.queue);
  const problem = useAnalysisStore((state) => state.problem);
  const scan = useScanStore((state) => state.scan);
  const plans = useScanPlans().data ?? [];
  const usage = usePlacesUsage().data;

  const openPlans = plans.filter(isOpen);
  const finishedPlans = plans.filter((plan) => !isOpen(plan)).slice(0, FINISHED_PLANS_SHOWN);
  const drafting = useDraftStore((state) => state.draft);
  const analysisRunning = analysis.running && analysis.total > 0;
  const busy = scan.running || analysisRunning || drafting.running;
  const warn = !!problem || !!scan.error || scan.budgetPaused || !!drafting.stopped;

  const summary =
    scan.running && scan.current
      ? tr.jobs.scanRunning(scan.current.city, scan.current.categoryLabel)
      : analysisRunning
        ? tr.websiteAnalysis.indicatorRunning(analysis.done, analysis.total)
        : drafting.running
          ? tr.draftQueue.summary(drafting.done)
          : tr.jobs.title;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={tr.jobs.open}
        className={cn(
          "flex h-10 max-w-64 items-center gap-2 rounded-lg px-2.5 text-xs hover:bg-surface-2",
          warn && !busy ? "text-warning" : "text-muted hover:text-text",
        )}
      >
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : warn ? (
          <AlertTriangle className="size-4 shrink-0" />
        ) : (
          <ListChecks className="size-4 shrink-0" />
        )}
        <span role="status" className="truncate">
          {summary}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-96 space-y-4 p-3">
        <section>
          <SectionTitle>{tr.jobs.scansTitle}</SectionTitle>
          {openPlans.length === 0 && finishedPlans.length === 0 ? (
            <p className="text-sm text-muted">{tr.jobs.scansEmpty}</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {workspaceId &&
                [...openPlans, ...finishedPlans].map((plan) => <PlanRow key={plan.id} plan={plan} workspaceId={workspaceId} />)}
            </ul>
          )}
          {scan.error && !scan.running && <p className="mt-2 text-xs text-danger">{scan.error}</p>}
        </section>

        <section>
          <SectionTitle>{tr.jobs.analysisTitle}</SectionTitle>
          {analysisRunning ? (
            <div className="space-y-1.5">
              <Progress value={(analysis.done / analysis.total) * 100} />
              <p className="text-xs text-muted tabular-nums">{tr.jobs.analysisRunning(analysis.done, analysis.total)}</p>
            </div>
          ) : problem ? (
            <div className="space-y-1.5">
              <p className="text-xs text-warning">
                {problem.failed > 0 ? tr.websiteAnalysis.indicatorFailed(problem.failed) : tr.websiteAnalysis.indicatorError}
                {problem.firstError ? `: ${problem.firstError}` : ""}
              </p>
              <Button size="sm" variant="outline" onClick={() => workspaceId && void retryFailedAndKick(workspaceId)}>
                {tr.jobs.analysisRetry}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {analysis.blockedBy === "lease" ? tr.websiteAnalysis.indicatorElsewhere : tr.jobs.analysisIdle}
            </p>
          )}
        </section>

        {workspaceId && <DraftQueueSection workspaceId={workspaceId} />}

        {usage && (
          <section>
            <SectionTitle>{tr.jobs.usageTitle}</SectionTitle>
            {usage.cap !== null && usage.cap > 0 && (
              <Progress
                value={(usage.used / usage.cap) * 100}
                color={usage.used >= usage.cap ? "var(--color-danger)" : "var(--color-primary)"}
                className="mb-1.5"
              />
            )}
            <p className="text-xs text-muted tabular-nums">{tr.jobs.usageLine(usage.used, usage.cap)}</p>
          </section>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
