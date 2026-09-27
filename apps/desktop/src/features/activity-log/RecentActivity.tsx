import { useQuery } from "@tanstack/react-query";
import { Bot, Settings2, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { Avatar } from "../../components/ui/data-display";
import { tr } from "../../i18n/tr";
import { formatRelative } from "../../lib/format";

interface ActivityRow {
  id: number;
  actor_type: "USER" | "AI" | "JARVIS" | "SYSTEM";
  summary: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

function ActorMark({ row }: { row: ActivityRow }) {
  if (row.actor_type === "USER") return <Avatar name={row.profiles?.full_name || "?"} size="sm" />;
  const Icon = row.actor_type === "AI" ? Bot : row.actor_type === "JARVIS" ? Sparkles : Settings2;
  const color = row.actor_type === "SYSTEM" ? "#8b95b4" : "#8b5cf6";
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}22`, color }}>
      <Icon className="size-4" />
    </span>
  );
}

export function RecentActivity({ limit = 6 }: { limit?: number }) {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const queryKey = ["recent-activity", workspaceId, limit];
  useRealtimeTable("activity_logs", workspaceId, queryKey);

  const query = useQuery({
    queryKey,
    enabled: !!workspaceId,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, actor_type, summary, created_at, profiles(full_name)")
        .eq("workspace_id", workspaceId as string)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ActivityRow[];
    },
  });

  if (query.data?.length === 0) return <p className="py-6 text-center text-sm text-muted">{tr.activity.empty}</p>;

  return (
    <ul className="space-y-3">
      {query.data?.map((row) => (
        <li key={row.id} className="flex items-start gap-3">
          <ActorMark row={row} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text">
              {row.actor_type === "USER" && row.profiles?.full_name && (
                <span className="font-medium">{row.profiles.full_name} </span>
              )}
              <span className="text-muted">{row.summary}</span>
            </p>
            <p className="mt-0.5 text-xs text-subtle">{formatRelative(row.created_at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
