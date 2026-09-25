import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { processSearchQueue, type SearchJobParams } from "../../workers/search-queue-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

interface SearchJobRow {
  id: string;
  params: SearchJobParams;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";
  api_calls: number;
  result_count: number;
  new_count: number;
  duplicate_count: number;
  error: string | null;
  created_at: string;
}

function buildTextQuery(fields: { keyword: string; category: string; city: string; district: string }): string {
  return [fields.category, fields.keyword, fields.district, fields.city].filter((v) => v.trim()).join(" ").trim();
}

export function DiscoverPage() {
  const queryClient = useQueryClient();
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;

  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [repeatWarning, setRepeatWarning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useRealtimeTable("search_jobs", workspaceId, ["search-jobs", workspaceId]);

  const jobsQuery = useQuery({
    queryKey: ["search-jobs", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<SearchJobRow[]> => {
      const { data, error } = await supabase
        .from("search_jobs")
        .select("id, params, status, api_calls, result_count, new_count, duplicate_count, error, created_at")
        .eq("workspace_id", workspaceId as string)
        .eq("provider", "GOOGLE_PLACES")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SearchJobRow[];
    },
  });

  const settingsQuery = useQuery({
    queryKey: ["workspace-settings-quota", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<{ cap: number | null; used: number }> => {
      const { data: settings, error: settingsError } = await supabase
        .from("workspace_settings")
        .select("outreach_limits")
        .eq("workspace_id", workspaceId as string)
        .single();
      if (settingsError) throw settingsError;

      const cap = (settings?.outreach_limits as { places_monthly_cap?: number | null } | null)
        ?.places_monthly_cap ?? null;

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: jobs, error: jobsError } = await supabase
        .from("search_jobs")
        .select("api_calls")
        .eq("workspace_id", workspaceId as string)
        .eq("provider", "GOOGLE_PLACES")
        .gte("created_at", monthStart.toISOString());
      if (jobsError) throw jobsError;

      const used = (jobs ?? []).reduce((sum, j) => sum + ((j as { api_calls: number }).api_calls ?? 0), 0);
      return { cap, used };
    },
  });

  const runQueue = useMutation({
    mutationFn: async () => {
      if (!workspaceId) return;
      return processSearchQueue(workspaceId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["search-jobs", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-settings-quota", workspaceId] });
    },
    onError: (err) => {
      setRunError(err instanceof Error ? err.message : tr.discover.enqueueError);
    },
  });

  const enqueue = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("workspace yok");
      const textQuery = buildTextQuery({ keyword, category, city, district });
      const { data, error } = await supabase.rpc("enqueue_search_job", {
        ws: workspaceId,
        p_params: { textQuery, city: city || undefined, district: district || undefined },
      });
      if (error) throw error;
      return data as { jobId: string; repeatWarning: boolean };
    },
    onSuccess: (data) => {
      setRepeatWarning(data.repeatWarning);
      void queryClient.invalidateQueries({ queryKey: ["search-jobs", workspaceId] });
      runQueue.mutate();
    },
    onError: (err) => {
      setRunError(err instanceof Error ? err.message : tr.discover.enqueueError);
    },
  });

  const quotaExceeded =
    settingsQuery.data?.cap != null && settingsQuery.data.used >= settingsQuery.data.cap;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">{tr.nav.discover}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRepeatWarning(false);
          setRunError(null);
          enqueue.mutate();
        }}
        className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">{tr.discover.keywordLabel}</label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={tr.discover.keywordPlaceholder} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">{tr.discover.categoryLabel}</label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">{tr.discover.cityLabel}</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">{tr.discover.districtLabel}</label>
          <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
        </div>

        <div className="col-span-2 flex items-end gap-3 sm:col-span-4">
          <Button type="submit" disabled={enqueue.isPending || !keyword.trim() || quotaExceeded}>
            {tr.discover.searchButton}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={runQueue.isPending || !workspaceId}
            onClick={() => runQueue.mutate()}
          >
            {tr.discover.runQueueButton}
          </Button>
          {settingsQuery.data && (
            <span className="text-sm text-slate-500">
              {tr.discover.quotaLabel}: {settingsQuery.data.used}
              {settingsQuery.data.cap != null ? ` / ${settingsQuery.data.cap}` : ""}
            </span>
          )}
        </div>
      </form>

      {quotaExceeded && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{tr.discover.quotaExceeded}</p>
      )}
      {repeatWarning && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{tr.discover.repeatWarning}</p>
      )}
      {runError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{runError}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">{tr.discover.columns.query}</th>
              <th className="px-4 py-2">{tr.discover.columns.status}</th>
              <th className="px-4 py-2">{tr.discover.columns.results}</th>
              <th className="px-4 py-2">{tr.discover.columns.new}</th>
              <th className="px-4 py-2">{tr.discover.columns.duplicate}</th>
              <th className="px-4 py-2">{tr.discover.columns.createdAt}</th>
            </tr>
          </thead>
          <tbody>
            {jobsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {tr.discover.empty}
                </td>
              </tr>
            )}
            {jobsQuery.data?.map((job) => (
              <tr key={job.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-900">{job.params?.textQuery}</td>
                <td className="px-4 py-2">{tr.discover.status[job.status]}</td>
                <td className="px-4 py-2">{job.result_count}</td>
                <td className="px-4 py-2">{job.new_count}</td>
                <td className="px-4 py-2">{job.duplicate_count}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(job.created_at).toLocaleString("tr-TR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
