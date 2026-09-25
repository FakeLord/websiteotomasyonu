import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildFollowupDraftPrompt, computeFollowUpDueDate } from "@lbf/core";
import { followupDraftOutputSchema, type FollowupDraftOutput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { callAiGateway } from "../../lib/ai-gateway-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";

interface FollowUpRow {
  id: string;
  business_id: string;
  conversation_id: string;
  step: number;
  due_at: string;
  status: "PENDING" | "DRAFTED" | "SENT" | "CANCELLED" | "SKIPPED";
  message_id: string | null;
  businesses: { name: string } | null;
}

export function FollowUpsPage() {
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const followUpsQuery = useQuery({
    queryKey: ["follow-ups", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<FollowUpRow[]> => {
      const { data, error: queryError } = await supabase
        .from("follow_ups")
        .select("id, business_id, conversation_id, step, due_at, status, message_id, businesses(name)")
        .eq("workspace_id", workspaceId as string)
        .in("status", ["PENDING", "DRAFTED"])
        .order("due_at", { ascending: true });
      if (queryError) throw queryError;
      return (data ?? []) as unknown as FollowUpRow[];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["follow-ups", workspaceId] });

  const draftMutation = useMutation({
    mutationFn: async (row: FollowUpRow) => {
      if (!workspaceId) return;

      const { data: firstMessage } = await supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", row.conversation_id)
        .eq("direction", "OUT")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const request = buildFollowupDraftPrompt({
        firstMessageBody: firstMessage?.body ?? "",
        stepNumber: row.step,
        businessName: row.businesses?.name ?? "",
      });
      const result = await callAiGateway(workspaceId, request, { entityType: "follow_up", entityId: row.id });
      const parsed = followupDraftOutputSchema.parse(result.json) as FollowupDraftOutput;

      const { data: message, error: insertError } = await supabase
        .from("messages")
        .insert({
          workspace_id: workspaceId,
          conversation_id: row.conversation_id,
          direction: "OUT",
          status: "DRAFT",
          body: parsed.body,
          author_type: "AI",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await supabase.rpc("mark_followup_drafted", { p_followup_id: row.id, p_message_id: message.id });
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : tr.draft.error),
  });

  const sendMutation = useMutation({
    mutationFn: async (row: FollowUpRow) => {
      if (!row.message_id) throw new Error(tr.followUps.noDraft);
      if (!workspaceId) return;

      await supabase.rpc("approve_message", { p_message_id: row.message_id });

      const { data: message } = await supabase.from("messages").select("body, subject").eq("id", row.message_id).single();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message?.body ?? ""));
      const contentHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");

      await supabase.rpc("mark_message_sent", { p_message_id: row.message_id, p_content_hash: contentHash, p_external_message_id: null });

      const { data: settings } = await supabase
        .from("workspace_settings")
        .select("followup_policy")
        .eq("workspace_id", workspaceId)
        .single();
      const policy = settings?.followup_policy as {
        steps: Array<{ afterDays: number }>;
        maxFollowUps: number;
        sendWindow: { days: number[]; from: string };
        skipHolidays: boolean;
      };
      const nextStepIndex = row.step; // steps[0] -> step 1'in gecikmesi, dolayısıyla steps[row.step] -> sıradaki adım
      const nextStepPolicy = policy?.steps?.[nextStepIndex];
      const nextDueAt =
        nextStepPolicy && row.step < (policy?.maxFollowUps ?? 0)
          ? computeFollowUpDueDate(new Date(), nextStepPolicy.afterDays, policy.sendWindow, policy.skipHolidays)
          : null;

      await supabase.rpc("mark_followup_sent", {
        p_followup_id: row.id,
        p_message_id: row.message_id,
        p_next_due_at: nextDueAt?.toISOString() ?? null,
      });
    },
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : tr.followUps.sendError),
  });

  const skipMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.rpc("skip_followup", { p_followup_id: id, p_reason: null });
    },
    onSuccess: invalidate,
  });

  const snoozeMutation = useMutation({
    mutationFn: async (row: FollowUpRow) => {
      const newDate = new Date(row.due_at);
      newDate.setDate(newDate.getDate() + 3);
      await supabase.rpc("snooze_followup", { p_followup_id: row.id, p_new_due_at: newDate.toISOString() });
    },
    onSuccess: invalidate,
  });

  if (!workspaceId) return <p className="text-sm text-slate-500">{tr.common.loading}</p>;

  const rows = followUpsQuery.data ?? [];
  const overdue = rows.filter((r) => new Date(r.due_at) < new Date());
  const upcoming = rows.filter((r) => new Date(r.due_at) >= new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{tr.nav.followUps}</h1>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <FollowUpGroup
        title={tr.followUps.overdueTitle}
        rows={overdue}
        onDraft={(r) => draftMutation.mutate(r)}
        onSend={(r) => sendMutation.mutate(r)}
        onSkip={(id) => skipMutation.mutate(id)}
        onSnooze={(r) => snoozeMutation.mutate(r)}
      />
      <FollowUpGroup
        title={tr.followUps.upcomingTitle}
        rows={upcoming}
        onDraft={(r) => draftMutation.mutate(r)}
        onSend={(r) => sendMutation.mutate(r)}
        onSkip={(id) => skipMutation.mutate(id)}
        onSnooze={(r) => snoozeMutation.mutate(r)}
      />
    </div>
  );
}

function FollowUpGroup({
  title,
  rows,
  onDraft,
  onSend,
  onSkip,
  onSnooze,
}: {
  title: string;
  rows: FollowUpRow[];
  onDraft: (row: FollowUpRow) => void;
  onSend: (row: FollowUpRow) => void;
  onSkip: (id: string) => void;
  onSnooze: (row: FollowUpRow) => void;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {rows.length === 0 && <p className="text-xs text-slate-400">{tr.followUps.empty}</p>}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-sm">
            <div>
              <p className="font-medium text-slate-800">
                {row.businesses?.name ?? "—"} · {tr.followUps.stepLabel} {row.step}
              </p>
              <p className="text-xs text-slate-400">
                {new Date(row.due_at).toLocaleString("tr-TR")} · {row.status}
              </p>
            </div>
            <div className="flex gap-2">
              {row.status === "PENDING" && (
                <Button size="sm" variant="outline" onClick={() => onDraft(row)}>
                  {tr.draft.generateButton}
                </Button>
              )}
              {row.status === "DRAFTED" && (
                <Button size="sm" onClick={() => onSend(row)}>
                  {tr.conversations.approveAndSend}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onSnooze(row)}>
                {tr.followUps.snooze}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onSkip(row.id)}>
                {tr.followUps.skip}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
