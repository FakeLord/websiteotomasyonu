import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { BusinessStage } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { analyzeBusinessesInBatches } from "../../workers/website-analysis-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ManualAddDialog } from "./ManualAddDialog";
import { ImportCsvDialog } from "./ImportCsvDialog";
import type { BusinessListRow } from "./types";

const PAGE_SIZE = 25;
type StageFilter = "ALL" | "POSSIBLE_DUP" | BusinessStage;

export function LeadsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;

  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [dncOnly, setDncOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [bulkAnalyzeProgress, setBulkAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);

  useRealtimeTable("businesses", workspaceId, ["businesses", workspaceId]);

  const query = useQuery({
    queryKey: ["businesses", workspaceId, stageFilter, dncOnly, search, page],
    enabled: !!workspaceId,
    queryFn: async (): Promise<{ rows: BusinessListRow[]; count: number }> => {
      let q = supabase
        .from("businesses")
        .select(
          "id, name, stage, city, district, lead_score, assigned_to, updated_at, do_not_contact, possible_duplicate_of",
          { count: "exact" },
        )
        .eq("workspace_id", workspaceId as string)
        .is("merged_into", null)
        .order("updated_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (stageFilter === "POSSIBLE_DUP") {
        q = q.not("possible_duplicate_of", "is", null);
      } else if (stageFilter !== "ALL") {
        q = q.eq("stage", stageFilter);
      }

      if (dncOnly) {
        q = q.eq("do_not_contact", true);
      }

      const cleanSearch = search.trim().replace(/[,()]/g, "");
      if (cleanSearch) {
        q = q.or(`name.ilike.%${cleanSearch}%,city.ilike.%${cleanSearch}%,district.ilike.%${cleanSearch}%`);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as BusinessListRow[], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.count ?? 0) / PAGE_SIZE));

  const runBulkAnalyze = async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("businesses")
      .select("id, website_url, category")
      .eq("workspace_id", workspaceId)
      .is("merged_into", null)
      .is("website_status", null)
      .limit(200);
    if (error || !data || data.length === 0) return;

    setBulkAnalyzeProgress({ done: 0, total: data.length });
    await analyzeBusinessesInBatches(
      workspaceId,
      data.map((row) => ({ id: row.id as string, websiteUrl: row.website_url as string | null, category: row.category as string | null })),
      (done, total) => setBulkAnalyzeProgress({ done, total }),
    );
    setBulkAnalyzeProgress(null);
    void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{tr.leads.title}</h1>
        <div className="flex items-center gap-2">
          {bulkAnalyzeProgress && (
            <span className="text-xs text-slate-500">
              {tr.websiteAnalysis.bulkAnalyzeProgress(bulkAnalyzeProgress.done, bulkAnalyzeProgress.total)}
            </span>
          )}
          <Button variant="outline" disabled={!!bulkAnalyzeProgress} onClick={() => void runBulkAnalyze()}>
            {tr.websiteAnalysis.bulkAnalyzeButton}
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)}>
            {tr.leads.importCsv}
          </Button>
          <Button onClick={() => setShowAdd(true)}>{tr.leads.addManual}</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <select
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={stageFilter}
          onChange={(e) => {
            setStageFilter(e.target.value as StageFilter);
            setPage(0);
          }}
        >
          <option value="ALL">{tr.leads.filterAllStages}</option>
          <option value="POSSIBLE_DUP">{tr.leads.filterPossibleDuplicates}</option>
          {(Object.keys(tr.stages) as BusinessStage[]).map((stage) => (
            <option key={stage} value={stage}>
              {tr.stages[stage]}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={dncOnly}
            onChange={(e) => {
              setDncOnly(e.target.checked);
              setPage(0);
            }}
          />
          {tr.leads.filterDnc}
        </label>

        <Input
          className="max-w-xs"
          placeholder={tr.leads.searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">{tr.leads.columns.name}</th>
              <th className="px-4 py-2">{tr.leads.columns.stage}</th>
              <th className="px-4 py-2">{tr.leads.columns.city}</th>
              <th className="px-4 py-2">{tr.leads.columns.score}</th>
              <th className="px-4 py-2">{tr.leads.columns.updated}</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {tr.leads.empty}
                </td>
              </tr>
            )}
            {query.data?.rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                onClick={() => navigate(`/leads/${row.id}`)}
              >
                <td className="px-4 py-2 font-medium text-slate-900">
                  {row.name}
                  {row.do_not_contact && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">DNC</span>
                  )}
                  {row.possible_duplicate_of && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      {tr.leads.filterPossibleDuplicates}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{tr.stages[row.stage]}</td>
                <td className="px-4 py-2 text-slate-500">
                  {[row.city, row.district].filter(Boolean).join(" / ")}
                </td>
                <td className="px-4 py-2">{row.lead_score}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(row.updated_at).toLocaleString("tr-TR")}
                </td>
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

      {showAdd && workspaceId && (
        <ManualAddDialog workspaceId={workspaceId} onClose={() => setShowAdd(false)} />
      )}
      {showImport && workspaceId && (
        <ImportCsvDialog workspaceId={workspaceId} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
