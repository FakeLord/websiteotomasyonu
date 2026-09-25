import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";

const PAGE_SIZE = 25;
const ACTOR_TYPES = ["USER", "AI", "JARVIS", "SYSTEM"] as const;
type ActorType = (typeof ACTOR_TYPES)[number];

interface ActivityLogRow {
  id: number;
  actor_type: ActorType;
  action: string;
  summary: string;
  created_at: string;
}

export function ActivityLogPage() {
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;
  const [actorType, setActorType] = useState<ActorType | "ALL">("ALL");
  const [page, setPage] = useState(0);

  const logsQuery = useQuery({
    queryKey: ["activity-logs", workspaceId, actorType, page],
    enabled: !!workspaceId,
    queryFn: async (): Promise<{ rows: ActivityLogRow[]; count: number }> => {
      let query = supabase
        .from("activity_logs")
        .select("id, actor_type, action, summary, created_at", { count: "exact" })
        .eq("workspace_id", workspaceId as string)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (actorType !== "ALL") {
        query = query.eq("actor_type", actorType);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as ActivityLogRow[], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((logsQuery.data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{tr.nav.activityLog}</h1>
        <select
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={actorType}
          onChange={(e) => {
            setActorType(e.target.value as ActorType | "ALL");
            setPage(0);
          }}
        >
          <option value="ALL">Tüm aktörler</option>
          {ACTOR_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Zaman</th>
              <th className="px-4 py-2">Aktör</th>
              <th className="px-4 py-2">Aksiyon</th>
              <th className="px-4 py-2">Özet</th>
            </tr>
          </thead>
          <tbody>
            {logsQuery.data?.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {new Date(row.created_at).toLocaleString("tr-TR")}
                </td>
                <td className="px-4 py-2">{row.actor_type}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.action}</td>
                <td className="px-4 py-2">{row.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Sayfa {page + 1} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Önceki
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
