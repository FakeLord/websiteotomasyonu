import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, ExternalLink, History, Loader2, MapPin, Search, Star, Upload } from "lucide-react";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { useUiStore } from "../../lib/ui-store";
import { TURKISH_CITIES } from "../../lib/use-shell-data";
import { CITY_CENTERS, DISCOVER_CATEGORIES, TURKEY_CENTER, buildTextQuery, type LatLng } from "../../lib/geo";
import { processSearchQueue, type SearchJobParams } from "../../workers/search-queue-runner";
import { formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/button";
import { Input, Label, Select } from "../../components/ui/input";
import { Card, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar, EmptyState, Table, Td, Th, Tr } from "../../components/ui/data-display";
import { Switch } from "../../components/ui/primitives";
import { ScoreBadge, WebsiteStatusBadge } from "../../components/domain/badges";
import { ImportCsvDialog } from "../leads/ImportCsvDialog";
import { DiscoverMap, type MapBusiness } from "./DiscoverMap";

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

type Source = "GOOGLE_PLACES" | "META_ADS" | "GOOGLE_ADS";
const RADIUS_OPTIONS = [0, 1, 3, 5, 10, 20];
const JOB_TONES = { QUEUED: "gray", RUNNING: "blue", DONE: "green", FAILED: "red", CANCELLED: "gray" } as const;

async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export function DiscoverPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const globalCity = useUiStore((state) => state.city);

  const [source, setSource] = useState<Source>("GOOGLE_PLACES");
  const [category, setCategory] = useState<string>(DISCOVER_CATEGORIES[0]);
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState(globalCity || "İstanbul");
  const [district, setDistrict] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);
  const [onlyNoWebsite, setOnlyNoWebsite] = useState(false);
  const [onlyWeakWebsite, setOnlyWeakWebsite] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [minReviews, setMinReviews] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng>(CITY_CENTERS[city] ?? TURKEY_CENTER);
  const [flyTarget, setFlyTarget] = useState<{ point: LatLng; zoom: number } | null>(null);
  const [notice, setNotice] = useState<{ tone: "warn" | "error"; text: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (globalCity) setCity(globalCity);
  }, [globalCity]);

  useEffect(() => {
    const center = CITY_CENTERS[city];
    if (center) setFlyTarget({ point: center, zoom: 11 });
  }, [city]);

  useRealtimeTable("search_jobs", workspaceId, ["search-jobs", workspaceId]);

  const jobsQuery = useQuery({
    queryKey: ["search-jobs", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: (query) => (query.state.data?.some((j) => j.status === "RUNNING" || j.status === "QUEUED") ? 3000 : false),
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

  const activeJobId = selectedJobId ?? jobsQuery.data?.find((j) => j.status === "DONE")?.id ?? null;

  const quotaQuery = useQuery({
    queryKey: ["workspace-settings-quota", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<{ cap: number | null; used: number }> => {
      const { data: settings, error: settingsError } = await supabase
        .from("workspace_settings")
        .select("outreach_limits")
        .eq("workspace_id", workspaceId as string)
        .single();
      if (settingsError) throw settingsError;
      const cap = (settings?.outreach_limits as { places_monthly_cap?: number | null } | null)?.places_monthly_cap ?? null;
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
      return { cap, used: (jobs ?? []).reduce((sum, j) => sum + ((j as { api_calls: number }).api_calls ?? 0), 0) };
    },
  });

  const resultsQuery = useQuery({
    queryKey: ["search-results", activeJobId],
    enabled: !!activeJobId,
    queryFn: async (): Promise<Array<MapBusiness & { lat: number | null; lng: number | null }>> => {
      const { data, error } = await supabase
        .from("business_sources")
        .select("businesses(id, name, category, district, lat, lng, lead_score, website_status, rating, review_count, merged_into)")
        .eq("search_job_id", activeJobId as string);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ businesses: (MapBusiness & { merged_into: string | null }) | null }>;
      const unique = new Map<string, MapBusiness>();
      rows.forEach((r) => {
        if (r.businesses && !r.businesses.merged_into) unique.set(r.businesses.id, r.businesses);
      });
      return [...unique.values()].sort((a, b) => b.lead_score - a.lead_score);
    },
  });

  const results = useMemo(
    () =>
      (resultsQuery.data ?? []).filter((b) => {
        if (onlyNoWebsite && b.website_status !== "NO_WEBSITE") return false;
        if (onlyWeakWebsite && b.website_status !== "LOW_QUALITY_WEBSITE" && b.website_status !== "BROKEN_WEBSITE") return false;
        if (minRating > 0 && (b.rating ?? 0) < minRating) return false;
        if (minReviews > 0 && (b.review_count ?? 0) < minReviews) return false;
        return true;
      }),
    [resultsQuery.data, onlyNoWebsite, onlyWeakWebsite, minRating, minReviews],
  );
  const mappable = results.filter((b): b is MapBusiness => b.lat !== null && b.lng !== null);

  const runQueue = useMutation({
    mutationFn: async () => (workspaceId ? processSearchQueue(workspaceId) : undefined),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["search-jobs", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["search-results"] });
      void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-settings-quota", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
    onError: (err) => setNotice({ tone: "error", text: err instanceof Error ? err.message : tr.discover.enqueueError }),
  });

  const enqueue = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error(tr.common.error);
      const params: SearchJobParams = {
        textQuery: buildTextQuery({ keyword, category, city, district }),
        ...(city ? { city } : {}),
        ...(district.trim() ? { district: district.trim() } : {}),
        ...(category ? { category } : {}),
        ...(radiusKm > 0 ? { location: { lat: mapCenter.lat, lng: mapCenter.lng, radiusMeters: radiusKm * 1000 } } : {}),
      };
      const { data, error } = await supabase.rpc("enqueue_search_job", { ws: workspaceId, p_params: params });
      if (error) throw error;
      return data as { jobId: string; repeatWarning: boolean };
    },
    onSuccess: (data) => {
      setNotice(data.repeatWarning ? { tone: "warn", text: tr.discover.repeatWarning } : null);
      setSelectedJobId(data.jobId);
      void queryClient.invalidateQueries({ queryKey: ["search-jobs", workspaceId] });
      runQueue.mutate();
    },
    onError: (err) =>
      setNotice({
        tone: "error",
        text: err instanceof Error && err.message.includes("quota") ? tr.discover.quotaExceeded : err instanceof Error ? err.message : tr.discover.enqueueError,
      }),
  });

  const quota = quotaQuery.data;
  const quotaExceeded = quota?.cap != null && quota.used >= quota.cap;
  const searching = enqueue.isPending || runQueue.isPending;
  const searchCenter = mapCenter;

  const focusBusiness = (b: MapBusiness) => {
    setSelectedBusinessId(b.id);
    setFlyTarget({ point: { lat: b.lat, lng: b.lng }, zoom: 15 });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit">
          <div className="flex gap-1 border-b border-border p-2">
            {(["GOOGLE_PLACES", "META_ADS", "GOOGLE_ADS"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap",
                  source === s ? "bg-primary text-white" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {tr.discover.sources[s]}
              </button>
            ))}
          </div>

          {source === "GOOGLE_PLACES" ? (
            <form
              className="space-y-4 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setNotice(null);
                enqueue.mutate();
              }}
            >
              <div>
                <Label>{tr.discover.categoryLabel}</Label>
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {DISCOVER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="">{tr.discover.otherCategory}</option>
                </Select>
              </div>
              <div>
                <Label>{tr.discover.keywordLabel}</Label>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={tr.discover.keywordPlaceholder} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{tr.discover.cityLabel}</Label>
                  <Select value={city} onChange={(e) => setCity(e.target.value)}>
                    {TURKISH_CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{tr.discover.districtLabel}</Label>
                  <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={tr.discover.districtPlaceholder} />
                </div>
              </div>
              <div>
                <Label>{tr.discover.radiusLabel}</Label>
                <Select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
                  {RADIUS_OPTIONS.map((km) => (
                    <option key={km} value={km}>
                      {km === 0 ? tr.discover.radiusNone : `${km} km`}
                    </option>
                  ))}
                </Select>
                {radiusKm > 0 && <p className="mt-1 text-xs text-muted">{tr.discover.radiusHint}</p>}
              </div>

              <div className="space-y-3 rounded-lg bg-surface-2 p-3">
                <p className="text-xs font-medium text-muted">{tr.discover.resultFilters}</p>
                <label className="flex items-center justify-between gap-2 text-sm text-text">
                  {tr.discover.onlyNoWebsite}
                  <Switch checked={onlyNoWebsite} onCheckedChange={setOnlyNoWebsite} />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm text-text">
                  {tr.discover.onlyWeakWebsite}
                  <Switch checked={onlyWeakWebsite} onCheckedChange={setOnlyWeakWebsite} />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm text-text">
                  {tr.discover.minRating}
                  <Select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="h-8 w-20 text-xs">
                    {[0, 3.5, 4, 4.5].map((r) => (
                      <option key={r} value={r}>
                        {r === 0 ? tr.common.all : r.toLocaleString("tr-TR")}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex items-center justify-between gap-2 text-sm text-text">
                  {tr.discover.minReviews}
                  <Select value={minReviews} onChange={(e) => setMinReviews(Number(e.target.value))} className="h-8 w-20 text-xs">
                    {[0, 10, 50, 100].map((r) => (
                      <option key={r} value={r}>
                        {r === 0 ? tr.common.all : r}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={searching || quotaExceeded || (!category && !keyword.trim())}>
                {searching ? <Loader2 className="animate-spin" /> : <Search />}
                {searching ? tr.discover.searching : tr.discover.searchButton}
              </Button>
              <p className="text-center text-xs text-muted">{tr.discover.estimate}</p>
              {quota && (
                <p className={cn("text-center text-xs", quotaExceeded ? "text-[#f87171]" : "text-subtle")}>
                  {tr.discover.quotaLine(quota.used, quota.cap)}
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-4 p-4 text-sm">
              <p className="text-muted">{tr.discover.assistedIntro[source]}</p>
              <div>
                <Label>{tr.discover.keywordLabel}</Label>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={category || tr.discover.keywordPlaceholder} />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  void openExternal(
                    source === "META_ADS"
                      ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TR&q=${encodeURIComponent(keyword || category)}`
                      : `https://adstransparency.google.com/?region=TR`,
                  )
                }
              >
                <ExternalLink />
                {tr.discover.openLibrary[source]}
              </Button>
              <Button className="w-full" onClick={() => setShowImport(true)}>
                <Upload />
                {tr.leads.importCsv}
              </Button>
              <p className="text-xs text-subtle">{tr.discover.assistedNote}</p>
            </div>
          )}
        </Card>

        <Card className="relative h-[620px] overflow-hidden">
          <DiscoverMap
            fitKey={resultsQuery.data ? activeJobId : null}
            initialCenter={CITY_CENTERS[city] ?? TURKEY_CENTER}
            flyTarget={flyTarget?.point ?? null}
            flyZoom={flyTarget?.zoom ?? 11}
            businesses={mappable}
            selectedId={selectedBusinessId}
            radiusMeters={radiusKm > 0 ? radiusKm * 1000 : null}
            searchCenter={searchCenter}
            onCenterChange={setMapCenter}
            onSelect={setSelectedBusinessId}
            renderPopup={(b) => (
              <div className="w-56 space-y-2">
                <p className="font-semibold text-text">{b.name}</p>
                <p className="text-xs text-muted">{[b.category, b.district].filter(Boolean).join(" · ")}</p>
                {b.rating !== null && (
                  <p className="flex items-center gap-1 text-xs text-text">
                    <Star className="size-3.5 fill-warning text-warning" />
                    {b.rating.toLocaleString("tr-TR")} ({b.review_count ?? 0})
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <WebsiteStatusBadge status={b.website_status} />
                  <ScoreBadge score={b.lead_score} />
                </div>
                <Button size="sm" className="w-full" onClick={() => navigate(`/leads/${b.id}`)}>
                  {tr.discover.viewDetails}
                </Button>
              </div>
            )}
          />
          {notice && (
            <div
              className={cn(
                "absolute top-3 left-1/2 z-[500] flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-lg",
                notice.tone === "warn" ? "bg-warning/90 text-black" : "bg-danger/90 text-white",
              )}
            >
              <AlertTriangle className="size-4 shrink-0" />
              {notice.text}
            </div>
          )}
        </Card>

        <Card className="flex h-[620px] min-h-0 flex-col lg:col-span-2 xl:col-span-1">
          <CardHeader title={tr.discover.foundBusinesses(results.length)} />
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {results.length === 0 ? (
              <EmptyState icon={MapPin} title={activeJobId ? tr.discover.noResults : tr.discover.empty} description={tr.discover.emptyHint} />
            ) : (
              <ul className="space-y-1">
                {results.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => (b.lat !== null && b.lng !== null ? focusBusiness(b as MapBusiness) : navigate(`/leads/${b.id}`))}
                      onDoubleClick={() => navigate(`/leads/${b.id}`)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
                        selectedBusinessId === b.id ? "bg-primary/15" : "hover:bg-surface-2",
                      )}
                    >
                      <Avatar name={b.name} size="md" square />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">{b.name}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-muted">
                          {b.rating !== null && (
                            <>
                              <Star className="size-3 fill-warning text-warning" />
                              {b.rating.toLocaleString("tr-TR")} ·{" "}
                            </>
                          )}
                          {b.district ?? b.category ?? ""}
                        </p>
                        <div className="mt-1">
                          <WebsiteStatusBadge status={b.website_status} />
                        </div>
                      </div>
                      <ScoreBadge score={b.lead_score} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={tr.discover.history} icon={<History className="size-4 text-muted" />} />
        {jobsQuery.data?.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">{tr.discover.empty}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr.discover.columns.query}</Th>
                <Th>{tr.discover.columns.status}</Th>
                <Th>{tr.discover.columns.results}</Th>
                <Th>{tr.discover.columns.new}</Th>
                <Th>{tr.discover.columns.duplicate}</Th>
                <Th>{tr.discover.columns.createdAt}</Th>
              </tr>
            </thead>
            <tbody>
              {jobsQuery.data?.map((job) => (
                <Tr
                  key={job.id}
                  className={cn("cursor-pointer", activeJobId === job.id && "bg-primary/10")}
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setSelectedBusinessId(null);
                  }}
                >
                  <Td className="font-medium">
                    {job.params?.textQuery}
                    {job.params?.location && <span className="ml-2 text-xs text-muted">({job.params.location.radiusMeters / 1000} km)</span>}
                    {job.error && <p className="text-xs text-[#f87171]">{job.error}</p>}
                  </Td>
                  <Td>
                    <Badge tone={JOB_TONES[job.status]}>{tr.discover.status[job.status]}</Badge>
                  </Td>
                  <Td className="tabular-nums">{job.result_count}</Td>
                  <Td className="tabular-nums">{job.new_count}</Td>
                  <Td className="tabular-nums">{job.duplicate_count}</Td>
                  <Td className="text-muted">{formatRelative(job.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {showImport && workspaceId && <ImportCsvDialog workspaceId={workspaceId} onClose={() => setShowImport(false)} />}
    </div>
  );
}
