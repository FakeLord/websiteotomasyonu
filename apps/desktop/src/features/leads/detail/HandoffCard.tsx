import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Handshake } from "lucide-react";
import { supabase } from "../../../lib/supabase-client";
import { useAuthStore } from "../../../lib/auth-store";
import { useWorkspaceMembers } from "../../../lib/use-workspace-members";
import { formatRelative } from "../../../lib/format";
import { tr } from "../../../i18n/tr";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Card, CardBody, CardHeader } from "../../../components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/primitives";

interface ActiveHandoff {
  id: string;
  status: "OPEN" | "ACCEPTED";
  summary: string;
  assigned_to: string | null;
  created_at: string;
}

/**
 * İşletmenin etkin (açık veya devralınmış) devir kartı: özet, durum, sorumlu ve işlemler (devral, ata, kapat).
 * Kart yoksa hiçbir şey göstermez. Değişiklikler RPC ile yapılır (aktivite günlüğüne düşer).
 */
export function HandoffCard({ businessId, workspaceId }: { businessId: string; workspaceId: string }) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.session?.user.id);
  const { members, byId } = useWorkspaceMembers();
  const [error, setError] = useState<string | null>(null);

  const handoff = useQuery({
    queryKey: ["active-handoff", businessId],
    queryFn: async (): Promise<ActiveHandoff | null> => {
      const { data, error: queryError } = await supabase
        .from("human_handoffs")
        .select("id, status, summary, assigned_to, created_at")
        .eq("business_id", businessId)
        .in("status", ["OPEN", "ACCEPTED"])
        .maybeSingle();
      if (queryError) throw new Error(queryError.message);
      return data as ActiveHandoff | null;
    },
  });

  const refresh = () => {
    for (const queryKey of [
      ["active-handoff", businessId],
      ["open-handoff", businessId],
      ["business", businessId],
      ["businesses"],
      ["pipeline"],
      ["shell-counters", workspaceId],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const accept = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error: rpcError } = await supabase.rpc("accept_handoff", { p_handoff_id: handoff.data?.id, p_user_id: userId });
      if (rpcError) throw new Error(rpcError.message);
    },
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const close = useMutation({
    mutationFn: async () => {
      const note = window.prompt(tr.handoff.closePrompt) ?? null;
      if (note === null) return false;
      const { error: rpcError } = await supabase.rpc("close_handoff", { p_handoff_id: handoff.data?.id, p_note: note.trim() || null });
      if (rpcError) throw new Error(rpcError.message);
      return true;
    },
    onSuccess: (closed) => {
      if (!closed) return;
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const card = handoff.data;
  if (!card) return null;
  const assignee = card.assigned_to ? (byId.get(card.assigned_to)?.name ?? tr.progress.unknownUser) : null;
  const busy = accept.isPending || close.isPending;

  return (
    <Card className="border-primary/30">
      <CardHeader
        title={tr.handoff.title}
        icon={<Handshake className="size-4 text-primary" />}
        action={<Badge tone={card.status === "OPEN" ? "orange" : "green"}>{tr.handoff.status[card.status]}</Badge>}
      />
      <CardBody className="space-y-3">
        <p className="text-sm whitespace-pre-wrap text-text">{card.summary}</p>
        <p className="text-xs text-muted">
          {assignee ? tr.handoff.assignedTo(assignee) : tr.handoff.unassigned} · {formatRelative(card.created_at)}
        </p>
        <div className="flex flex-wrap gap-2">
          {card.status === "OPEN" && (
            <Button size="sm" disabled={busy || !myId} onClick={() => accept.mutate(null)}>
              {tr.handoff.accept}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy}>
                {tr.handoff.assign}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {members.map((member) => (
                <DropdownMenuItem key={member.user_id} onSelect={() => accept.mutate(member.user_id)}>
                  {member.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => close.mutate()}>
            {tr.handoff.close}
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </CardBody>
    </Card>
  );
}
