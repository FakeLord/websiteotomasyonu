import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { OutreachChannel } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, PageHeader } from "../../components/ui/data-display";
import { ScoreBadge } from "../../components/domain/badges";
import { rpc, sendDraftMessage, translateDraftToTurkish, type DraftTranslation } from "../outreach/outreach";

interface PendingDraft {
  id: string;
  subject: string | null;
  body: string;
  created_at: string;
  conversation_id: string;
  conversations: {
    id: string;
    channel: string;
    business_id: string;
    businesses: { id: string; name: string; city: string | null; country_code: string; lead_score: number | null } | null;
  } | null;
}

const PAGE_SIZE = 50;

function DraftCard({ draft, workspaceId, onChanged }: { draft: PendingDraft; workspaceId: string; onChanged: () => void }) {
  const navigate = useNavigate();
  const [translation, setTranslation] = useState<DraftTranslation | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const conversation = draft.conversations;
  const business = conversation?.businesses ?? null;

  const translate = useMutation({
    mutationFn: () =>
      translateDraftToTurkish(workspaceId, business?.id ?? "", {
        subject: draft.subject ?? undefined,
        body: draft.body,
        channel: (conversation?.channel ?? "EMAIL") as OutreachChannel,
      }),
    onSuccess: setTranslation,
    onError: (err) => setNotice({ tone: "error", text: err instanceof Error ? err.message : tr.draft.translationFailed }),
  });

  const send = useMutation({
    mutationFn: () => {
      if (!conversation) throw new Error(tr.draftQueue.review.sendError);
      return sendDraftMessage(
        workspaceId,
        { conversationId: conversation.id, businessId: conversation.business_id, channel: conversation.channel },
        { id: draft.id, body: draft.body, subject: draft.subject },
      );
    },
    onSuccess: () => {
      setNotice({ tone: "ok", text: tr.draftQueue.review.sent });
      onChanged();
    },
    onError: (err) => {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : tr.draftQueue.review.sendError });
      onChanged();
    },
  });

  const discard = useMutation({
    mutationFn: () => rpc("discard_message", { p_message_id: draft.id }),
    onSuccess: onChanged,
    onError: (err) => setNotice({ tone: "error", text: err instanceof Error ? err.message : tr.common.error }),
  });

  const busy = send.isPending || discard.isPending;
  const name = business?.name ?? "—";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{name}</p>
          <p className="text-xs text-muted">
            {[business?.city, business?.country_code].filter(Boolean).join(" · ")} · {formatRelative(draft.created_at)}
          </p>
        </div>
        {business?.lead_score !== null && business?.lead_score !== undefined && <ScoreBadge score={business.lead_score} />}
      </div>

      {draft.subject && (
        <p className="text-sm text-text">
          <span className="text-muted">{tr.draftQueue.review.subject}: </span>
          {draft.subject}
        </p>
      )}
      <p className="rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-wrap text-text">{draft.body}</p>

      {translation && (
        <div className="rounded-lg border border-border p-3 text-sm whitespace-pre-wrap text-muted">
          <p className="mb-1 text-xs font-medium">{tr.draftQueue.review.translationTitle}</p>
          {translation.subjectTr && <p className="mb-1 text-text">{translation.subjectTr}</p>}
          {translation.translationTr}
        </div>
      )}

      {notice && (
        <p className={notice.tone === "ok" ? "text-xs text-muted" : "text-xs text-danger"} role="status">
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm(tr.draftQueue.review.sendConfirm(name))) send.mutate();
          }}
        >
          {send.isPending && <Loader2 className="animate-spin" />}
          {tr.draftQueue.review.send}
        </Button>
        {conversation && (
          <Button size="sm" variant="outline" onClick={() => navigate(`/conversations?c=${conversation.id}`)}>
            {tr.draftQueue.review.edit}
          </Button>
        )}
        {!translation && (
          <Button size="sm" variant="ghost" disabled={translate.isPending || !business} onClick={() => translate.mutate()}>
            {translate.isPending ? tr.draftQueue.review.translating : tr.draftQueue.review.showTranslation}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (window.confirm(tr.draftQueue.review.discardConfirm)) discard.mutate();
          }}
        >
          {tr.draftQueue.review.discard}
        </Button>
      </div>
    </Card>
  );
}

/** "Onay Bekleyenler" (ADR 0018): AI'ın hazırladığı e-posta taslakları; insan okur, onaylar ve gönderir. */
export function ReviewPage() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;

  const drafts = useQuery({
    queryKey: ["review-drafts", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PendingDraft[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, subject, body, created_at, conversation_id, conversations!inner(id, channel, business_id, businesses!inner(id, name, city, country_code, lead_score))",
        )
        .eq("workspace_id", workspaceId as string)
        .eq("direction", "OUT")
        .eq("status", "DRAFT")
        .eq("author_type", "AI")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as unknown as PendingDraft[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["review-drafts", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["draft-queue", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["shell-counters", workspaceId] });
  };

  return (
    <div>
      <PageHeader title={tr.draftQueue.review.title} description={tr.draftQueue.review.subtitle} />
      {drafts.isLoading ? (
        <p className="text-sm text-muted">{tr.common.loading}</p>
      ) : drafts.isError ? (
        <p className="text-sm text-danger">{tr.draftQueue.review.loadError}</p>
      ) : (drafts.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title={tr.draftQueue.review.empty} />
        </Card>
      ) : (
        <div className="space-y-3">
          {workspaceId &&
            (drafts.data ?? []).map((draft) => (
              <DraftCard key={draft.id} draft={draft} workspaceId={workspaceId} onChanged={refresh} />
            ))}
        </div>
      )}
    </div>
  );
}
