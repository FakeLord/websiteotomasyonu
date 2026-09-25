import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";

interface AnalyticsSummary {
  newLeads: number;
  foundToday: number;
  contacted: number;
  replied: number;
  engaged: number;
  proposalReady: number;
  customers: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  openAiAssistedConversations: number;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;

  const summaryQuery = useQuery({
    queryKey: ["analytics-summary", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<AnalyticsSummary> => {
      const { data, error } = await supabase.rpc("analytics_summary", { ws: workspaceId as string });
      if (error) throw error;
      return data as AnalyticsSummary;
    },
  });

  const todayTasksQuery = useQuery({
    queryKey: ["today-tasks", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_ups")
        .select("id, business_id, step, due_at, status, businesses(name)")
        .eq("workspace_id", workspaceId as string)
        .in("status", ["PENDING", "DRAFTED"])
        .lte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; business_id: string; step: number; due_at: string; businesses: { name: string } | null }>;
    },
  });

  if (!workspaceId) return <p className="text-sm text-slate-500">{tr.common.loading}</p>;

  const s = summaryQuery.data;
  const cards: Array<{ label: string; value: number | undefined }> = [
    { label: tr.dashboard.newLeads, value: s?.newLeads },
    { label: tr.dashboard.foundToday, value: s?.foundToday },
    { label: tr.dashboard.contacted, value: s?.contacted },
    { label: tr.dashboard.replied, value: s?.replied },
    { label: tr.dashboard.engaged, value: s?.engaged },
    { label: tr.dashboard.proposalReady, value: s?.proposalReady },
    { label: tr.dashboard.customers, value: s?.customers },
    { label: tr.dashboard.pendingFollowUps, value: s?.pendingFollowUps },
    { label: tr.dashboard.overdueFollowUps, value: s?.overdueFollowUps },
    { label: tr.dashboard.openAiConversations, value: s?.openAiAssistedConversations },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{tr.nav.dashboard}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
            <p className="text-2xl font-semibold text-slate-900">{c.value ?? "—"}</p>
            <p className="text-xs text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{tr.dashboard.todayTasksTitle}</h2>
        {todayTasksQuery.data?.length === 0 && <p className="text-xs text-slate-400">{tr.dashboard.noTasks}</p>}
        <ul className="space-y-2">
          {todayTasksQuery.data?.map((t) => (
            <li
              key={t.id}
              className="flex cursor-pointer items-center justify-between rounded-md bg-slate-50 p-2 text-sm hover:bg-slate-100"
              onClick={() => navigate(`/leads/${t.business_id}`)}
            >
              <span>
                {t.businesses?.name ?? "—"} · {tr.followUps.stepLabel} {t.step}
              </span>
              <span className="text-xs text-slate-400">{new Date(t.due_at).toLocaleString("tr-TR")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
