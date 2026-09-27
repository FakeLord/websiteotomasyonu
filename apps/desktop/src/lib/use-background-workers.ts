import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMembership } from "./use-workspace-membership";
import { POLL_INTERVAL_MS, pollInboxOnce } from "../workers/imap-poller";
import { supabase } from "./supabase-client";

const SEQUENCE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Uygulama açıkken çalışan arka plan işleri (SPEC.md → L: IMAP poller 5 dk;
 * M: sekans sonu otomatik LOST, saatte bir).
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

    // SPEC.md → M: sekansı biten ve 7 gün cevapsız lead'ler LOST (NO_RESPONSE).
    const closeStaleSequences = async () => {
      const { data, error } = await supabase.rpc("close_stale_sequences", { ws: workspaceId });
      if (!cancelled && !error && (data as number) > 0) {
        void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
        void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      }
    };

    void pollInbox();
    void closeStaleSequences();
    const inboxTimer = window.setInterval(() => void pollInbox(), POLL_INTERVAL_MS);
    const sequenceTimer = window.setInterval(() => void closeStaleSequences(), SEQUENCE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(inboxTimer);
      window.clearInterval(sequenceTimer);
    };
  }, [workspaceId, queryClient]);
}
