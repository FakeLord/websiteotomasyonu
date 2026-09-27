import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMembership } from "./use-workspace-membership";
import { POLL_INTERVAL_MS, pollInboxOnce } from "../workers/imap-poller";

/**
 * Uygulama açıkken çalışan arka plan işleri (SPEC.md → L: IMAP poller 5 dk).
 * Uygulama kapalıyken hiçbir şey çalışmaz; açılışta hemen bir tur atılır.
 * Hatalar döngüyü durdurmaz, Ayarlar → E-posta'da gösterilir.
 */
export function useBackgroundWorkers() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    const pollInbox = async () => {
      try {
        const summary = await pollInboxOnce(workspaceId);
        if (!cancelled && summary && (summary.imported > 0 || summary.bounces > 0)) {
          void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
          void queryClient.invalidateQueries({ queryKey: ["messages"] });
          void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
          void queryClient.invalidateQueries({ queryKey: ["shell-counters", workspaceId] });
        }
      } catch {
        // Durum useImapStatus'ta; bir sonraki turda yeniden denenir.
      }
    };

    void pollInbox();
    const inboxTimer = window.setInterval(() => void pollInbox(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(inboxTimer);
    };
  }, [workspaceId, queryClient]);
}
