import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus, XCircle } from "lucide-react";
import { isValidTransition, type BusinessStage } from "@lbf/core";
import { useMarket } from "../../lib/use-market";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useWorkspaceMembers } from "../../lib/use-workspace-members";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/button";
import { Avatar, PageHeader } from "../../components/ui/data-display";
import { ScoreBadge } from "../../components/domain/badges";
import { STAGE_COLORS } from "../../components/domain/badges";
import { CustomerDealDialog } from "../customers/CustomerDealDialog";
import { rpc } from "../outreach/outreach";

const COLUMNS: BusinessStage[] = ["REPLIED", "ENGAGED", "PROPOSAL_READY", "HANDED_OFF", "WON"];

interface PipelineCard {
  id: string;
  name: string;
  category: string | null;
  district: string | null;
  country_code: string;
  stage: BusinessStage;
  lead_score: number;
  assigned_to: string | null;
  version: number;
  updated_at: string;
  human_handoffs: Array<{ summary: string; status: string }>;
}

export function PipelinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const { byId } = useWorkspaceMembers();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<BusinessStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dealFor, setDealFor] = useState<{ id: string; name: string; countryCode: string } | null>(null);
  const { market } = useMarket();
  const queryKey = ["pipeline", workspaceId, market.country, market.city];
  useRealtimeTable("businesses", workspaceId, queryKey);

  const query = useQuery({
    queryKey,
    enabled: !!workspaceId,
    queryFn: async (): Promise<PipelineCard[]> => {
      const { data, error: qError } = await supabase
        .from("businesses")
        .select("id, name, category, district, country_code, stage, lead_score, assigned_to, version, updated_at, human_handoffs(summary, status)")
        .eq("workspace_id", workspaceId as string)
        .is("merged_into", null)
        .match({ ...(market.country ? { country_code: market.country } : {}), ...(market.country && market.city ? { city: market.city } : {}) })
        .in("stage", COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (qError) throw qError;
      return (data ?? []) as unknown as PipelineCard[];
    },
  });

  const move = useMutation({
    mutationFn: async ({ card, to }: { card: PipelineCard; to: BusinessStage }) => {
      await rpc("transition_stage", {
        p_business_id: card.id,
        p_to_stage: to,
        p_reason: null,
        p_expected_version: card.version,
      });
      return { card, to };
    },
    onMutate: async ({ card, to }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PipelineCard[]>(queryKey);
      queryClient.setQueryData<PipelineCard[]>(queryKey, (cards) => cards?.map((c) => (c.id === card.id ? { ...c, stage: to } : c)));
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setError(err instanceof Error ? err.message : tr.common.error);
    },
    onSuccess: ({ card, to }) => {
      setError(null);
      if (to === "WON") setDealFor({ id: card.id, name: card.name, countryCode: card.country_code });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
  });

  const cards = query.data ?? [];
  const dragged = cards.find((c) => c.id === dragId) ?? null;

  const drop = (to: BusinessStage) => {
    setOverColumn(null);
    if (!dragged || dragged.stage === to) return;
    if (!isValidTransition(dragged.stage, to)) {
      setError(tr.pipeline.invalidMove(tr.stages[dragged.stage], tr.stages[to]));
      return;
    }
    move.mutate({ card: dragged, to });
  };

  return (
    <div>
      <PageHeader
        title={tr.pipeline.title}
        description={tr.pipeline.description}
        actions={
          <Button onClick={() => navigate("/leads?tab=engaged")}>
            <Plus />
            {tr.pipeline.addFromLeads}
          </Button>
        }
      />
      {error && <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">{error}</p>}

      <div className="grid gap-3 overflow-x-auto pb-2 xl:grid-cols-5" style={{ gridTemplateColumns: "repeat(5, minmax(240px, 1fr))" }}>
        {COLUMNS.map((stage) => {
          const columnCards = cards.filter((c) => c.stage === stage);
          const canDrop = dragged ? isValidTransition(dragged.stage, stage) : false;
          return (
            <section
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOverColumn(stage);
              }}
              onDragLeave={() => setOverColumn((c) => (c === stage ? null : c))}
              onDrop={() => drop(stage)}
              className={cn(
                "flex min-h-[520px] flex-col rounded-xl border border-border bg-surface/60 transition-colors",
                dragged && canDrop && "border-primary/50",
                overColumn === stage && canDrop && "bg-primary/10",
                overColumn === stage && dragged && !canDrop && "border-danger/50",
              )}
            >
              <header className="flex items-center justify-between px-3 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
                  <span className="size-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                  {tr.stages[stage]}
                </h2>
                <span className="rounded-full bg-surface-3 px-2 text-xs text-muted tabular-nums">{columnCards.length}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {columnCards.map((card) => {
                  const handoff = card.human_handoffs.find((h) => h.status === "OPEN");
                  const assignee = card.assigned_to ? byId.get(card.assigned_to)?.name : null;
                  return (
                    <article
                      key={card.id}
                      draggable
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverColumn(null);
                      }}
                      onClick={() => navigate(`/leads/${card.id}`)}
                      className={cn(
                        "cursor-grab rounded-lg border border-border bg-surface-2 p-3 transition-colors hover:border-border-strong active:cursor-grabbing",
                        dragId === card.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <Avatar name={card.name} size="sm" square />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{card.name}</p>
                          <p className="truncate text-xs text-muted">{[card.category, card.district].filter(Boolean).join(" · ")}</p>
                        </div>
                        <ScoreBadge score={card.lead_score} />
                      </div>
                      {handoff && (
                        <p className="mt-2 line-clamp-2 flex gap-1.5 rounded-md bg-violet/10 p-2 text-xs text-[#c4b5fd]">
                          <Handshake className="size-3.5 shrink-0" />
                          {handoff.summary}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between text-[11px] text-subtle">
                        <span>{formatRelative(card.updated_at)}</span>
                        {assignee && (
                          <span className="flex items-center gap-1" title={assignee}>
                            <Avatar name={assignee} size="xs" />
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
                {columnCards.length === 0 && <p className="px-2 py-6 text-center text-xs text-subtle">{tr.pipeline.emptyColumn}</p>}
              </div>
            </section>
          );
        })}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOverColumn("LOST");
        }}
        onDragLeave={() => setOverColumn((c) => (c === "LOST" ? null : c))}
        onDrop={() => drop("LOST")}
        className={cn(
          "mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-sm text-muted transition-colors",
          dragged ? "opacity-100" : "opacity-50",
          overColumn === "LOST" && "border-danger/60 bg-danger/10 text-[#f87171]",
        )}
      >
        <XCircle className="size-4" />
        {tr.pipeline.dropToLose}
      </div>

      {dealFor && (
        <CustomerDealDialog open onOpenChange={(open) => !open && setDealFor(null)} businessId={dealFor.id} businessName={dealFor.name} countryCode={dealFor.countryCode} />
      )}
    </div>
  );
}
