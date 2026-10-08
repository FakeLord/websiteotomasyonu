import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { tr } from "../i18n/tr";
import { useAnalysisStore } from "../lib/analysis-store";
import { useWorkspaceMembership } from "../lib/use-workspace-membership";
import { kickBackgroundAnalysis, retryFailedAndKick } from "../workers/background-analysis";

const RECHECK_INTERVAL_MS = 60_000;
/** Her işletmede değil, birkaç işletmede bir tazele: listeler sürekli yeniden yüklenmesin. */
const REFRESH_EVERY = 5;

const REFRESH_KEYS = [["businesses"], ["search-results"], ["business"], ["dashboard-metrics"]] as const;

/**
 * Arka plan website analizini başlatır ve durumunu üst çubukta gösterir. Uygulama açık olduğu sürece
 * (hangi sayfada olunursa olunsun) analiz edilmemiş işletmeleri alır; açılışta, pencere odaklanınca ve
 * dakikada bir yeniden bakar. Kullanıcının bir düğmeye basması gerekmez.
 */
export function AnalysisIndicator() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const queue = useAnalysisStore((state) => state.queue);
  const problem = useAnalysisStore((state) => state.problem);
  const lastRefreshed = useRef(0);

  useEffect(() => {
    if (!workspaceId) return;
    const kick = () => void kickBackgroundAnalysis(workspaceId);
    kick();
    const interval = window.setInterval(kick, RECHECK_INTERVAL_MS);
    window.addEventListener("focus", kick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", kick);
    };
  }, [workspaceId]);

  // Analiz ilerledikçe (birkaç işletmede bir) ve bitince listeler/puanlar tazelenir.
  useEffect(() => {
    if (queue.done === 0) {
      lastRefreshed.current = 0;
      return;
    }
    if (queue.running && queue.done - lastRefreshed.current < REFRESH_EVERY) return;
    lastRefreshed.current = queue.done;
    for (const queryKey of REFRESH_KEYS) void queryClient.invalidateQueries({ queryKey });
  }, [queue.done, queue.running, queryClient]);

  if (queue.running && queue.total > 0) {
    return (
      <span role="status" className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
        <Loader2 className="size-3.5 animate-spin" />
        {tr.websiteAnalysis.indicatorRunning(queue.done, queue.total)}
      </span>
    );
  }

  if (problem) {
    return (
      <button
        type="button"
        title={`${problem.firstError ?? ""}\n${tr.websiteAnalysis.indicatorRetryHint}`}
        onClick={() => workspaceId && void retryFailedAndKick(workspaceId)}
        className="flex items-center gap-2 rounded-lg bg-warning/15 px-2.5 py-1.5 text-xs text-[#fbbf24] hover:bg-warning/25"
      >
        <AlertTriangle className="size-3.5" />
        {problem.failed > 0 ? tr.websiteAnalysis.indicatorFailed(problem.failed) : tr.websiteAnalysis.indicatorError}
      </button>
    );
  }

  if (queue.blockedBy === "lease") {
    return <span className="rounded-lg px-2.5 py-1.5 text-xs text-subtle">{tr.websiteAnalysis.indicatorElsewhere}</span>;
  }

  return null;
}
