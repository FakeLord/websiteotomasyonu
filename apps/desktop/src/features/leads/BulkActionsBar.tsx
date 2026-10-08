import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronDown, UserMinus, UserPlus, X } from "lucide-react";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/primitives";

interface Member {
  user_id: string;
  name: string;
}

interface BulkActionsBarProps {
  workspaceId: string;
  selectedIds: string[];
  members: Member[];
  onClear: () => void;
}

interface BulkResult {
  updated: number;
  skipped: number;
}

/**
 * Seçili işletmeler için toplu işlem çubuğu: atama (veya atamayı kaldırma) ve eleme. İşlemler sunucuda tek tek mevcut
 * kurallardan geçer; başka çalışma alanının kaydı varsa hiçbiri değişmez. Sonuç (kaç tanesi değişti, kaç tanesi atlandı) yazılır.
 */
export function BulkActionsBar({ workspaceId, selectedIds, members, onClear }: BulkActionsBarProps) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const refresh = () => {
    for (const queryKey of [["businesses"], ["dashboard-metrics"], ["market-options", workspaceId]]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const assign = useMutation({
    mutationFn: async (userId: string | null) => {
      const { data, error } = await supabase.rpc("bulk_assign_businesses", { p_business_ids: selectedIds, p_user_id: userId });
      if (error) throw new Error(error.message);
      return { result: data as BulkResult, userId };
    },
    onSuccess: ({ result, userId }) => {
      refresh();
      const name = members.find((m) => m.user_id === userId)?.name;
      setNotice({ tone: "info", text: userId ? tr.leads.bulk.assigned(result.updated, result.skipped, name ?? "") : tr.leads.bulk.unassigned(result.updated, result.skipped) });
      onClear();
    },
    onError: (error: Error) => setNotice({ tone: "error", text: error.message }),
  });

  const disqualify = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("bulk_disqualify_businesses", { p_business_ids: selectedIds, p_reason: null });
      if (error) throw new Error(error.message);
      return data as BulkResult;
    },
    onSuccess: (result) => {
      refresh();
      setNotice({ tone: "info", text: tr.leads.bulk.disqualified(result.updated, result.skipped) });
      onClear();
    },
    onError: (error: Error) => setNotice({ tone: "error", text: error.message }),
  });

  const busy = assign.isPending || disqualify.isPending;

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/10 px-3 py-2" role="toolbar" aria-label={tr.leads.bulk.title}>
          <span className="text-sm font-medium text-text">{tr.leads.bulk.selected(selectedIds.length)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy}>
                <UserPlus />
                {tr.leads.bulk.assign}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {members.map((member) => (
                <DropdownMenuItem key={member.user_id} onSelect={() => assign.mutate(member.user_id)}>
                  {member.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => assign.mutate(null)}>
                <UserMinus />
                {tr.leads.bulk.removeAssignment}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(tr.leads.bulk.disqualifyConfirm(selectedIds.length))) disqualify.mutate();
            }}
          >
            <Ban />
            {tr.leads.bulk.disqualify}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
            <X />
            {tr.leads.bulk.clear}
          </Button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className={
            "border-b border-border px-3 py-2 text-sm " + (notice.tone === "error" ? "bg-danger/10 text-[#f87171]" : "bg-surface-2 text-muted")
          }
        >
          {notice.text}
        </p>
      )}
    </>
  );
}
