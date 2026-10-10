import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useWorkspaceMembers } from "../../lib/use-workspace-members";
import { formatDateTime } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Select } from "../../components/ui/input";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { PageHeader, Pagination, Table, Td, Th, Tr } from "../../components/ui/data-display";

const PAGE_SIZE = 25;
const ACTOR_TYPES = ["USER", "AI", "JARVIS", "SYSTEM"] as const;
type ActorType = (typeof ACTOR_TYPES)[number];
const ACTOR_TONES = { USER: "blue", AI: "navy", JARVIS: "gray", SYSTEM: "gray" } as const;

interface ActivityLogRow {
  id: number;
  actor_type: ActorType;
  actor_user_id: string | null;
  action: string;
  summary: string;
  created_at: string;
}

/** Aktivite kaydı tablosu; Raporlar → Aktivite sekmesinde ve /activity-log'da kullanılır. */
export function ActivityLogTable() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const { byId } = useWorkspaceMembers();
  const [actorType, setActorType] = useState<ActorType | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const logsQuery = useQuery({
    queryKey: ["activity-logs", workspaceId, actorType, page],
    enabled: !!workspaceId,
    queryFn: async (): Promise<{ rows: ActivityLogRow[]; count: number }> => {
      let query = supabase
        .from("activity_logs")
        .select("id, actor_type, actor_user_id, action, summary, created_at", { count: "exact" })
        .eq("workspace_id", workspaceId as string)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (actorType !== "ALL") query = query.eq("actor_type", actorType);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as ActivityLogRow[], count: count ?? 0 };
    },
  });

  const total = logsQuery.data?.count ?? 0;

  return (
    <Card>
      <div className="flex items-center justify-end gap-2 p-3">
        <Select
          className="w-48"
          value={actorType}
          onChange={(e) => {
            setActorType(e.target.value as ActorType | "ALL");
            setPage(1);
          }}
        >
          <option value="ALL">{tr.activity.allActors}</option>
          {ACTOR_TYPES.map((type) => (
            <option key={type} value={type}>
              {tr.actorTypes[type]}
            </option>
          ))}
        </Select>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>{tr.activity.time}</Th>
            <Th>{tr.activity.actor}</Th>
            <Th>{tr.activity.summary}</Th>
          </tr>
        </thead>
        <tbody>
          {logsQuery.data?.rows.map((row) => (
            <Tr key={row.id}>
              <Td className="whitespace-nowrap text-muted">{formatDateTime(row.created_at)}</Td>
              <Td className="whitespace-nowrap">
                <Badge tone={ACTOR_TONES[row.actor_type]}>
                  {row.actor_type === "USER" && row.actor_user_id
                    ? (byId.get(row.actor_user_id)?.name ?? tr.actorTypes.USER)
                    : tr.actorTypes[row.actor_type]}
                </Badge>
              </Td>
              <Td>{row.summary}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {logsQuery.data?.rows.length === 0 && <p className="p-6 text-center text-sm text-muted">{tr.activity.empty}</p>}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} onPageChange={setPage} />
    </Card>
  );
}

export function ActivityLogPage() {
  return (
    <div>
      <PageHeader title={tr.nav.activityLog} />
      <ActivityLogTable />
    </div>
  );
}
