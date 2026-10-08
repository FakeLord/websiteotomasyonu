import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { supabase } from "../../lib/supabase-client";
import { useAuthStore } from "../../lib/auth-store";
import { useMarket } from "../../lib/use-market";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { applyDue } from "../../lib/due-filter";
import { formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Card, CardBody, CardHeader, CardLink } from "../../components/ui/card";
import { Avatar } from "../../components/ui/data-display";
import { StageBadge } from "../../components/domain/badges";

const LIMIT = 6;

interface DueRow {
  id: string;
  name: string;
  stage: string;
  next_action_at: string;
  last_contact_channel: string | null;
  last_contact_outcome: string | null;
}

/**
 * Dashboard "Bugünün işleri": takip tarihi bugün veya geçmiş olan işletmeler (en eskiden başlayarak). "Benim işlerim"
 * yalnızca bana atananları gösterir. Aynı süzgeç Leadler → Takip sekmesindedir.
 */
export function TodayTasksCard() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const myId = useAuthStore((state) => state.session?.user.id);
  const { market } = useMarket();
  const [mine, setMine] = useState(false);

  const query = useQuery({
    queryKey: ["businesses", workspaceId, "today-tasks", mine, myId, market.country, market.city],
    enabled: !!workspaceId,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<{ rows: DueRow[]; count: number }> => {
      let q = supabase
        .from("businesses")
        .select("id, name, stage, next_action_at, last_contact_channel, last_contact_outcome", { count: "exact" })
        .eq("workspace_id", workspaceId as string)
        .is("merged_into", null);
      if (market.country) q = q.eq("country_code", market.country);
      if (market.country && market.city) q = q.eq("city", market.city);
      if (mine && myId) q = q.eq("assigned_to", myId);
      const { data, error, count } = await applyDue(q).order("next_action_at", { ascending: true }).limit(LIMIT);
      if (error) throw error;
      return { rows: (data ?? []) as DueRow[], count: count ?? 0 };
    },
  });

  const rows = query.data?.rows ?? [];
  const count = query.data?.count ?? 0;

  return (
    <Card>
      <CardHeader
        title={tr.dashboard.todayTasks.title}
        icon={<CalendarClock className="size-4 text-warning" />}
        action={<CardLink onClick={() => navigate("/leads?tab=due")}>{tr.common.seeAll}</CardLink>}
      />
      <CardBody className="space-y-3">
        <div className="flex gap-1">
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setMine(value)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (mine === value ? "bg-primary text-white" : "bg-surface-2 text-muted hover:text-text")
              }
            >
              {value ? tr.dashboard.todayTasks.mine : tr.dashboard.todayTasks.all}
            </button>
          ))}
        </div>
        {query.isError && <p className="text-sm text-[#f87171]">{query.error instanceof Error ? query.error.message : tr.common.error}</p>}
        {!query.isError && rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">{query.isLoading ? tr.common.loading : tr.dashboard.todayTasks.empty}</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => navigate(`/leads/${row.id}`)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-2">
                  <Avatar name={row.name} size="sm" square />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{row.name}</span>
                    <span className="block text-xs text-[#fbbf24]">{formatRelative(row.next_action_at)}</span>
                  </span>
                  <StageBadge stage={row.stage} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {count > rows.length && <p className="text-xs text-muted">{tr.dashboard.todayTasks.more(count - rows.length)}</p>}
      </CardBody>
    </Card>
  );
}
