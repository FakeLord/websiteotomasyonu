import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  Columns3,
  Download,
  ExternalLink,
  Filter,
  MoreHorizontal,
  Plus,
  ScanSearch,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { OPPORTUNITY_STAGES, OPPORTUNITY_WEBSITE_STATUSES, SOCIAL_WRITABLE_CHANNELS, WRITABLE_CHANNELS, getCountryProfile } from "@lbf/core";
import { useMarket } from "../../lib/use-market";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { contactRecencyFilter, endOfLocalDay } from "../../lib/contact-filters";
import { useWorkspaceMembers } from "../../lib/use-workspace-members";
import { useDashboardMetrics } from "../../lib/use-metrics";
import { useAuthStore } from "../../lib/auth-store";
import { analyzeBusiness } from "../../workers/website-analysis-runner";
import { retryFailedAndKick } from "../../workers/background-analysis";
import { useAnalysisStore } from "../../lib/analysis-store";
import { STAGE_GROUPS, countForGroup } from "../../lib/stage-groups";
import { downloadFile, toCsv, turkishLikePattern } from "../../lib/filters";
import { formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Select } from "../../components/ui/input";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar, EmptyState, PageHeader, Pagination, Table, Td, Th, Tr } from "../../components/ui/data-display";
import {
  CountPill,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/primitives";
import { ScoreBadge, StageBadge, WebsiteStatusBadge } from "../../components/domain/badges";
import { ContactChannelBadges } from "../../components/domain/contact-channel-badges";
import { ManualAddDialog } from "./ManualAddDialog";
import { ImportCsvDialog } from "./ImportCsvDialog";
import type { BusinessListRow } from "./types";

const COLUMN_KEYS = ["category", "location", "website", "contact", "stage", "score", "activity", "assignee"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
// v2: "İletişim" sütunu eklendi; eski kayıtlı tercih yeni sütunu gizli bırakırdı.
const COLUMN_STORAGE_KEY = "lbf.leads.columns.v2";

function loadColumns(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) return parsed.filter((c): c is ColumnKey => COLUMN_KEYS.includes(c as ColumnKey));
  } catch {
    /* kişisel tercih; okunamazsa varsayılana dön */
  }
  return [...COLUMN_KEYS];
}

function saveColumns(columns: ColumnKey[]) {
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columns));
  } catch {
    /* yok say */
  }
}

const OPPORTUNITY_TAB = "opportunities";
// `writable`: mesaj yazılabilen herhangi bir kanal (varsayılan). `all`: süzgeç yok (yalnızca telefonu olanlar dahil).
const OPPORTUNITY_CHANNELS = {
  writable: WRITABLE_CHANNELS,
  email: ["EMAIL"],
  whatsapp: ["WHATSAPP"],
  social: SOCIAL_WRITABLE_CHANNELS,
} as const;
type OpportunityChannel = keyof typeof OPPORTUNITY_CHANNELS;
const OPPORTUNITY_FILTERS = ["writable", "email", "whatsapp", "social", "all"] as const;
type OpportunityFilter = (typeof OPPORTUNITY_FILTERS)[number];

interface OpportunityFilterable<Q> {
  in(column: string, values: readonly string[]): Q;
  eq(column: string, value: boolean | number): Q;
  or(filters: string, options?: { referencedTable?: string }): Q;
}

/** "Fırsatlar" süzgeci; kural packages/core/pipeline/opportunity.ts (isOpportunity) ile aynıdır. */
function applyOpportunity<Q extends OpportunityFilterable<Q>>(q: Q, viaChannel: OpportunityChannel | null, hideChains: boolean): Q {
  let next = q
    .in("website_status", OPPORTUNITY_WEBSITE_STATUSES)
    .in("stage", OPPORTUNITY_STAGES)
    .eq("do_not_contact", false)
    .or("business_status.is.null,business_status.eq.OPERATIONAL");
  // Zincir/şubeler merkezden yönetilir (chain_size > 1); varsayılan olarak gizlenir.
  if (hideChains) next = next.eq("chain_size", 1);
  if (!viaChannel) return next;
  // `reachable`: buildQuery'nin eklediği inner birleşim; geçersiz/sektirmiş kanal sayılmaz.
  return next
    .in("reachable.channel", OPPORTUNITY_CHANNELS[viaChannel])
    .or("status.is.null,status.not.in.(INVALID,BOUNCED)", { referencedTable: "reachable" });
}

const FILTER_PARAMS = [
  "q", "city", "district", "category", "minScore", "minReviews", "contact", "outcome", "channel", "by", "stage", "website", "assignee", "dnc", "dup",
] as const;
const DUE_TAB = "due";
const CONTACT_OUTCOME_FILTERS = ["SENT", "REPLIED", "UNREACHABLE", "NOT_INTERESTED", "LATER", "ATTEMPTED"] as const;
const CONTACT_CHANNEL_FILTERS = ["EMAIL", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK", "PHONE"] as const;
const FINISHED_STAGES = "(WON,LOST,DISQUALIFIED)";

interface DueFilterable<Q> {
  lte(column: string, value: string): Q;
  not(column: string, operator: string, value: string): Q;
  eq(column: string, value: boolean): Q;
}

/** "Takip" görünümü: takip tarihi bugün veya geçmiş, bitmemiş aşamada, aranabilir işletmeler. */
function applyDue<Q extends DueFilterable<Q>>(q: Q): Q {
  return q.lte("next_action_at", endOfLocalDay(new Date()).toISOString()).not("stage", "in", FINISHED_STAGES).eq("do_not_contact", false);
}
const SORTS = ["score", "reviews"] as const;
type Sort = (typeof SORTS)[number];

export function LeadsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const myUserId = useAuthStore((state) => state.session?.user.id);
  const { members, byId: membersById } = useWorkspaceMembers();
  const stageCounts = useDashboardMetrics(7).data?.stageCounts ?? {};
  const { market } = useMarket();
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [columns, setColumns] = useState<ColumnKey[]>(loadColumns);
  const [bulkNotice, setBulkNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const analysisQueue = useAnalysisStore((state) => state.queue);
  const bulkProgress = analysisQueue.running && analysisQueue.total > 0 ? analysisQueue : null;
  const [exporting, setExporting] = useState(false);

  const tab = params.get("tab") ?? "all";
  const isOpportunityTab = tab === OPPORTUNITY_TAB;
  const isDueTab = tab === DUE_TAB;
  const channelParam = params.get("ch");
  const opportunityFilter: OpportunityFilter = OPPORTUNITY_FILTERS.find((f) => f === channelParam) ?? "writable";
  const opportunityChannel: OpportunityChannel | null = opportunityFilter === "all" ? null : opportunityFilter;
  const showChains = params.get("chains") === "1";
  const sort: Sort = SORTS.find((s) => s === params.get("sort")) ?? "score";
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const pageSize = [20, 50, 100].includes(Number(params.get("size"))) ? Number(params.get("size")) : 20;
  const filters = Object.fromEntries(FILTER_PARAMS.map((key) => [key, params.get(key) ?? ""])) as Record<
    (typeof FILTER_PARAMS)[number],
    string
  >;
  const activeFilterCount = FILTER_PARAMS.filter((key) => key !== "q" && filters[key]).length;

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };

  useRealtimeTable("businesses", workspaceId, ["businesses", workspaceId]);

  const buildQuery = (baseSelect: string, withCount: boolean) => {
    // Kanal sekmesinde yalnızca o kanalı olan işletmeler gelsin diye ikinci (inner) birleşim eklenir.
    const select = isOpportunityTab && opportunityChannel ? `${baseSelect}, reachable:contact_channels!inner(channel)` : baseSelect;
    let q = supabase
      .from("businesses")
      .select(select, withCount ? { count: "exact" } : undefined)
      .eq("workspace_id", workspaceId as string)
      .is("merged_into", null);

    if (market.country) q = q.eq("country_code", market.country);
    if (market.country && market.city) q = q.eq("city", market.city);

    const group = STAGE_GROUPS.find((g) => g.key === tab);
    if (filters.minReviews) q = q.gte("review_count", Number(filters.minReviews));
    const recency = contactRecencyFilter(filters.contact);
    if (recency?.op === "is") q = q.is(recency.column, null);
    else if (recency?.op === "gte" && recency.value) q = q.gte(recency.column, recency.value);
    else if (recency?.op === "lt" && recency.value) q = q.lt(recency.column, recency.value);
    if (filters.outcome) q = q.eq("last_contact_outcome", filters.outcome);
    if (filters.channel) q = q.eq("last_contact_channel", filters.channel);
    if (filters.by) q = q.eq("last_contact_by", filters.by);
    if (isDueTab) q = applyDue(q);
    if (isOpportunityTab) q = applyOpportunity(q, opportunityChannel, !showChains);
    else if (filters.stage) q = q.eq("stage", filters.stage);
    else if (group) q = q.in("stage", group.stages);

    if (filters.q) {
      const pattern = turkishLikePattern(filters.q);
      q = q.or(`name.ilike.${pattern},category.ilike.${pattern},city.ilike.${pattern},district.ilike.${pattern}`);
    }
    if (filters.city) q = q.ilike("city", turkishLikePattern(filters.city));
    if (filters.district) q = q.ilike("district", turkishLikePattern(filters.district));
    if (filters.category) q = q.ilike("category", turkishLikePattern(filters.category));
    if (filters.minScore) q = q.gte("lead_score", Number(filters.minScore));
    if (filters.website) q = q.eq("website_status", filters.website);
    if (filters.assignee === "none") q = q.is("assigned_to", null);
    else if (filters.assignee) q = q.eq("assigned_to", filters.assignee);
    if (filters.dnc === "1") q = q.eq("do_not_contact", true);
    if (filters.dup === "1") q = q.not("possible_duplicate_of", "is", null);
    return q;
  };

  const listQuery = useQuery({
    queryKey: ["businesses", workspaceId, tab, opportunityChannel, showChains, sort, filters, page, pageSize, market.country, market.city],
    enabled: !!workspaceId,
    queryFn: async (): Promise<{ rows: BusinessListRow[]; count: number }> => {
      const { data, error, count } = await buildQuery(
        "id, name, category, city, district, country_code, website_url, website_status, stage, lead_score, assigned_to, updated_at, last_contacted_at, do_not_contact, possible_duplicate_of, chain_size, review_count, next_action_at, last_contact_channel, last_contact_outcome, contact_channels(channel, status)",
        true,
      )
        .order(isDueTab ? "next_action_at" : sort === "reviews" ? "review_count" : "lead_score", { ascending: isDueTab, nullsFirst: false })
        .order("lead_score", { ascending: false })
        .order("updated_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as BusinessListRow[], count: count ?? 0 };
    },
  });

  const opportunityCount = useQuery({
    queryKey: ["businesses", workspaceId, "opportunity-count", market.country, market.city],
    enabled: !!workspaceId,
    // Sekmedeki sayı varsayılan görünümle aynıdır: yazılabilir kanalı olan, zincir olmayan fırsatlar.
    queryFn: async (): Promise<{ visible: number; chains: number }> => {
      const count = async (hideChains: boolean): Promise<number> => {
        let q = supabase
          .from("businesses")
          .select("id, reachable:contact_channels!inner(channel)", { count: "exact", head: true })
          .eq("workspace_id", workspaceId as string)
          .is("merged_into", null);
        if (market.country) q = q.eq("country_code", market.country);
        if (market.country && market.city) q = q.eq("city", market.city);
        const { count: total, error } = await applyOpportunity(q, "writable", hideChains);
        if (error) throw error;
        return total ?? 0;
      };
      const [visible, withChains] = await Promise.all([count(true), count(false)]);
      return { visible, chains: Math.max(withChains - visible, 0) };
    },
  });

  const dueCount = useQuery({
    queryKey: ["businesses", workspaceId, "due-count", market.country, market.city],
    enabled: !!workspaceId,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      let q = supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId as string)
        .is("merged_into", null);
      if (market.country) q = q.eq("country_code", market.country);
      if (market.country && market.city) q = q.eq("city", market.city);
      const { count, error } = await applyDue(q);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ businessId, userId }: { businessId: string; userId: string | null }) => {
      const { error } = await supabase.rpc("assign_business", { p_business_id: businessId, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] }),
  });

  const analyzeMutation = useMutation({
    mutationFn: async (row: BusinessListRow) => {
      if (!workspaceId) return;
      await analyzeBusiness(workspaceId, { id: row.id, websiteUrl: row.website_url, category: row.category });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] }),
  });

  // "Toplu Analiz": arka plan kuyruğunu hemen çalıştırır ve bu oturumda başarısız olanları da yeniden dener.
  // Sonuç her durumda yazılır; düğmeye basınca "hiçbir şey olmuyor" durumu kalmaz.
  const runBulkAnalyze = async () => {
    if (!workspaceId) return;
    setBulkNotice(null);
    const summary = await retryFailedAndKick(workspaceId);
    if (summary.firstError) {
      setBulkNotice({
        tone: "error",
        text: summary.failed > 0 ? tr.websiteAnalysis.bulkAnalyzeFailed(summary.failed, summary.total, summary.firstError) : summary.firstError,
      });
    } else if (summary.blockedBy === "lease") {
      setBulkNotice({ tone: "info", text: tr.websiteAnalysis.bulkElsewhere });
    } else {
      setBulkNotice({
        tone: "info",
        text: summary.total === 0 ? tr.websiteAnalysis.bulkNothingPending : tr.websiteAnalysis.bulkDone(summary.total),
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
  };

  const exportCsv = async () => {
    if (!workspaceId) return;
    setExporting(true);
    try {
      const { data, error } = await buildQuery(
        "name, category, city, district, country_code, website_url, website_status, stage, lead_score, primary_phone_e164, assigned_to, last_contacted_at",
        false,
      )
        .order("lead_score", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        stage: tr.stages[row.stage as keyof typeof tr.stages] ?? row.stage,
        website_status: row.website_status
          ? tr.websiteAnalysis.status[row.website_status as keyof typeof tr.websiteAnalysis.status]
          : "",
        assigned_to: row.assigned_to ? (membersById.get(row.assigned_to as string)?.name ?? "") : "",
      }));
      const csv = toCsv(rows, [
        { key: "name", label: tr.leads.columns.name },
        { key: "category", label: tr.leads.columns.category },
        { key: "country_code", label: tr.discover.countryLabel },
        { key: "city", label: tr.leads.cityLabel },
        { key: "district", label: tr.leads.districtLabel },
        { key: "primary_phone_e164", label: tr.leads.phoneLabel },
        { key: "website_url", label: tr.leads.websiteLabel },
        { key: "website_status", label: tr.leads.columns.website },
        { key: "stage", label: tr.leads.columns.status },
        { key: "lead_score", label: tr.leads.columns.score },
        { key: "assigned_to", label: tr.leads.columns.assigned },
        { key: "last_contacted_at", label: tr.leads.columns.lastContacted },
      ]);
      downloadFile(csv, `leadler-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
    } finally {
      setExporting(false);
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    setColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((c) => c !== key) : COLUMN_KEYS.filter((c) => c === key || prev.includes(c));
      saveColumns(next);
      return next;
    });
  };

  const totalAll = useMemo(() => Object.values(stageCounts).reduce((a, b) => a + b, 0), [stageCounts]);
  const rows = listQuery.data?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil((listQuery.data?.count ?? 0) / pageSize));
  const show = (key: ColumnKey) => columns.includes(key);

  const chips = FILTER_PARAMS.filter((key) => key !== "q" && filters[key]).map((key) => {
    let value = filters[key];
    if (key === "stage") value = tr.stages[value as keyof typeof tr.stages] ?? value;
    if (key === "website") value = tr.websiteAnalysis.status[value as keyof typeof tr.websiteAnalysis.status] ?? value;
    if (key === "assignee") value = value === "none" ? tr.leads.unassigned : (membersById.get(value)?.name ?? "…");
    if (key === "contact") value = tr.leads.contactFilters.recency[value as keyof typeof tr.leads.contactFilters.recency] ?? value;
    if (key === "outcome") value = tr.leads.contactFilters.outcomes[value as keyof typeof tr.leads.contactFilters.outcomes] ?? value;
    if (key === "channel") value = tr.channels[value as keyof typeof tr.channels] ?? value;
    if (key === "by") value = membersById.get(value)?.name ?? "…";
    if (key === "dnc" || key === "dup") value = "";
    return { key, label: `${tr.leads.filterLabels[key]}${value ? `: ${value}` : ""}` };
  });

  return (
    <div>
      <PageHeader
        title={tr.leads.title}
        actions={
          <>
            {bulkProgress && (
              <span className="text-xs text-muted">
                {tr.websiteAnalysis.bulkAnalyzeProgress(bulkProgress.done, bulkProgress.total)}
              </span>
            )}
            <Button variant="outline" disabled={analysisQueue.running} onClick={() => void runBulkAnalyze()}>
              <ScanSearch />
              {tr.websiteAnalysis.bulkAnalyzeButton}
            </Button>
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload />
              {tr.leads.importCsv}
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus />
              {tr.leads.addLead}
            </Button>
          </>
        }
      />

      {bulkNotice && (
        <p
          role="status"
          className={
            bulkNotice.tone === "error"
              ? "mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]"
              : "mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted"
          }
        >
          {bulkNotice.text}
        </p>
      )}
      <Card>
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3">
          {[
            { key: "all", label: tr.common.all, count: totalAll },
            { key: OPPORTUNITY_TAB, label: tr.leads.opportunities.tab, count: opportunityCount.data?.visible ?? 0 },
            { key: DUE_TAB, label: tr.leads.dueTab, count: dueCount.data ?? 0 },
            ...STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, count: countForGroup(g, stageCounts) }))].map(
            (t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => updateParams({ tab: t.key === "all" ? null : t.key, stage: null, ch: null })}
                className={
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors " +
                  (tab === t.key ? "border-primary text-text" : "border-transparent text-muted hover:text-text")
                }
              >
                {t.label}
                <CountPill>{t.count.toLocaleString("tr-TR")}</CountPill>
              </button>
            ),
          )}
        </div>

        {isDueTab && <p className="border-b border-border px-3 py-2 text-xs text-muted">{tr.leads.contactFilters.dueHint}</p>}
        {isOpportunityTab && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            {OPPORTUNITY_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => updateParams({ ch: filter === "writable" ? null : filter })}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (opportunityFilter === filter ? "bg-primary text-white" : "bg-surface-2 text-muted hover:text-text")
                }
              >
                {tr.leads.opportunities.filters[filter]}
              </button>
            ))}
            <p className="text-xs text-muted">{tr.leads.opportunities.hint}</p>
            {showChains ? (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => updateParams({ chains: null })}>
                {tr.leads.opportunities.hideChains}
              </button>
            ) : (
              (opportunityCount.data?.chains ?? 0) > 0 && (
                <span className="text-xs text-muted">
                  {tr.leads.opportunities.chainsHidden(opportunityCount.data?.chains ?? 0)}{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => updateParams({ chains: "1" })}>
                    {tr.leads.opportunities.showChains}
                  </button>
                </span>
              )
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 p-3">
          <Input
            className="max-w-sm"
            placeholder={tr.leads.searchPlaceholder}
            defaultValue={filters.q}
            key={filters.q}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParams({ q: e.currentTarget.value });
            }}
            onBlur={(e) => {
              if (e.currentTarget.value !== filters.q) updateParams({ q: e.currentTarget.value });
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            <Select
              className="w-44"
              aria-label={tr.leads.sortLabel}
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value === "score" ? null : e.target.value }, false)}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {tr.leads.sortOptions[s]}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => setShowFilters((v) => !v)}>
              <Filter />
              {tr.common.filters}
              {activeFilterCount > 0 && <CountPill>{activeFilterCount}</CountPill>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Columns3 />
                  {tr.common.columns}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{tr.leads.visibleColumns}</DropdownMenuLabel>
                {COLUMN_KEYS.map((key) => (
                  <DropdownMenuItem
                    key={key}
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleColumn(key);
                    }}
                  >
                    <span className="flex size-4 items-center justify-center">{show(key) && <Check />}</span>
                    {tr.leads.columnLabels[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" disabled={exporting} onClick={() => void exportCsv()}>
              <Download />
              {tr.common.export}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <FilterInput label={tr.leads.cityLabel} value={filters.city} onCommit={(v) => updateParams({ city: v })} />
            <FilterInput label={tr.leads.districtLabel} value={filters.district} onCommit={(v) => updateParams({ district: v })} />
            <FilterInput label={tr.leads.categoryLabel} value={filters.category} onCommit={(v) => updateParams({ category: v })} />
            <div>
              <Label>{tr.leads.columns.website}</Label>
              <Select value={filters.website} onChange={(e) => updateParams({ website: e.target.value })}>
                <option value="">{tr.common.all}</option>
                {Object.entries(tr.websiteAnalysis.status).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tr.leads.filterLabels.stage}</Label>
              <Select value={filters.stage} onChange={(e) => updateParams({ stage: e.target.value, tab: null })}>
                <option value="">{tr.common.all}</option>
                {Object.entries(tr.stages).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <FilterInput
              label={tr.leads.filterLabels.minScore}
              type="number"
              value={filters.minScore}
              onCommit={(v) => updateParams({ minScore: v })}
            />
            <FilterInput
              label={tr.leads.filterLabels.minReviews}
              type="number"
              value={filters.minReviews}
              onCommit={(v) => updateParams({ minReviews: v })}
            />
            <div>
              <Label>{tr.leads.contactFilters.recencyLabel}</Label>
              <Select value={filters.contact} onChange={(e) => updateParams({ contact: e.target.value })}>
                <option value="">{tr.common.all}</option>
                {Object.entries(tr.leads.contactFilters.recency).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tr.leads.contactFilters.outcomeLabel}</Label>
              <Select value={filters.outcome} onChange={(e) => updateParams({ outcome: e.target.value })}>
                <option value="">{tr.common.all}</option>
                {CONTACT_OUTCOME_FILTERS.map((key) => (
                  <option key={key} value={key}>
                    {tr.leads.contactFilters.outcomes[key]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tr.leads.contactFilters.channelLabel}</Label>
              <Select value={filters.channel} onChange={(e) => updateParams({ channel: e.target.value })}>
                <option value="">{tr.common.all}</option>
                {CONTACT_CHANNEL_FILTERS.map((key) => (
                  <option key={key} value={key}>
                    {tr.channels[key]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tr.leads.contactFilters.byLabel}</Label>
              <Select value={filters.by} onChange={(e) => updateParams({ by: e.target.value })}>
                <option value="">{tr.common.all}</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tr.leads.columns.assigned}</Label>
              <Select value={filters.assignee} onChange={(e) => updateParams({ assignee: e.target.value })}>
                <option value="">{tr.common.all}</option>
                <option value="none">{tr.leads.unassigned}</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-1.5 text-sm text-muted">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={filters.dnc === "1"} onChange={(e) => updateParams({ dnc: e.target.checked ? "1" : null })} />
                {tr.leads.filterDnc}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={filters.dup === "1"} onChange={(e) => updateParams({ dup: e.target.checked ? "1" : null })} />
                {tr.leads.filterPossibleDuplicates}
              </label>
            </div>
          </div>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => updateParams({ [chip.key]: null })}
                className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs text-[#8fb0ff] hover:bg-primary/25"
              >
                {chip.label}
                <X className="size-3" />
              </button>
            ))}
            <button
              type="button"
              className="text-xs text-muted hover:text-text"
              onClick={() => updateParams(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])))}
            >
              {tr.leads.clearFilters}
            </button>
          </div>
        )}

        {rows.length === 0 && !listQuery.isPending ? (
          <EmptyState
            icon={Users}
            title={tr.leads.empty}
            description={tr.leads.emptyHint}
            action={
              <Button onClick={() => navigate("/discover")}>
                <ScanSearch />
                {tr.nav.discover}
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr.leads.columns.name}</Th>
                {show("category") && <Th>{tr.leads.columns.category}</Th>}
                {show("location") && <Th>{tr.leads.columns.location}</Th>}
                {show("website") && <Th>{tr.leads.columns.website}</Th>}
                {show("contact") && <Th>{tr.leads.columns.contact}</Th>}
                {show("stage") && <Th>{tr.leads.columns.status}</Th>}
                {show("score") && <Th>{tr.leads.columns.score}</Th>}
                {show("activity") && <Th>{tr.leads.columns.lastActivity}</Th>}
                {show("assignee") && <Th>{tr.leads.columns.assigned}</Th>}
                <Th className="w-10">
                  <span className="sr-only">{tr.common.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const assignee = row.assigned_to ? membersById.get(row.assigned_to) : undefined;
                return (
                  <Tr key={row.id} className="cursor-pointer" onClick={() => navigate(`/leads/${row.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={row.name} size="sm" square />
                        <div className="min-w-0">
                          <p className="max-w-64 truncate font-medium text-text">{row.name}</p>
                          <div className="mt-0.5 flex gap-1">
                            {row.do_not_contact && <Badge tone="red">DNC</Badge>}
                            {row.possible_duplicate_of && <Badge tone="orange">{tr.leads.duplicateShort}</Badge>}
                            {(row.chain_size ?? 1) > 1 && <Badge tone="gray">{tr.leads.chainBadge(row.chain_size ?? 1)}</Badge>}
                          </div>
                        </div>
                      </div>
                    </Td>
                    {show("category") && <Td className="text-muted">{row.category ?? "—"}</Td>}
                    {show("location") && (
                      <Td className="text-muted">
                        <span title={getCountryProfile(row.country_code).nameTr} className="mr-1 rounded bg-surface-2 px-1 text-[11px] font-medium text-muted">
                          {row.country_code}
                        </span>
                        {[row.district, row.city].filter(Boolean).join(", ") || "—"}
                      </Td>
                    )}
                    {show("website") && (
                      <Td>
                        <WebsiteStatusBadge status={row.website_status} />
                      </Td>
                    )}
                    {show("contact") && (
                      <Td>
                        <ContactChannelBadges channels={row.contact_channels} />
                      </Td>
                    )}
                    {show("stage") && (
                      <Td>
                        <StageBadge stage={row.stage} />
                      </Td>
                    )}
                    {show("score") && (
                      <Td>
                        <ScoreBadge score={row.lead_score} />
                      </Td>
                    )}
                    {show("activity") && (
                      <Td className="whitespace-nowrap text-muted">
                        {formatRelative(row.last_contacted_at ?? row.updated_at)}
                        {row.last_contact_outcome && (
                          <span className="block text-[11px] text-subtle">
                            {tr.contactOutcome.outcomes[row.last_contact_outcome as keyof typeof tr.contactOutcome.outcomes] ?? ""}
                            {row.last_contact_channel ? ` · ${tr.channels[row.last_contact_channel as keyof typeof tr.channels] ?? ""}` : ""}
                          </span>
                        )}
                        {isDueTab && row.next_action_at && <span className="block text-[11px] text-[#fbbf24]">{formatRelative(row.next_action_at)}</span>}
                      </Td>
                    )}
                    {show("assignee") && (
                      <Td>
                        {assignee ? (
                          <span className="flex items-center gap-2" title={assignee.name}>
                            <Avatar name={assignee.name} size="xs" />
                            <span className="max-w-28 truncate text-muted">{assignee.name}</span>
                          </span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </Td>
                    )}
                    <Td onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-text"
                          aria-label={tr.common.actions}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => navigate(`/leads/${row.id}`)}>
                            <ExternalLink />
                            {tr.leads.openDetail}
                          </DropdownMenuItem>
                          {myUserId && row.assigned_to !== myUserId && (
                            <DropdownMenuItem onSelect={() => assignMutation.mutate({ businessId: row.id, userId: myUserId })}>
                              <UserPlus />
                              {tr.leads.assignToMe}
                            </DropdownMenuItem>
                          )}
                          {row.assigned_to && (
                            <DropdownMenuItem onSelect={() => assignMutation.mutate({ businessId: row.id, userId: null })}>
                              <UserMinus />
                              {tr.leads.unassign}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => analyzeMutation.mutate(row)}>
                            <ScanSearch />
                            {tr.websiteAnalysis.analyzeButton}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <div className="flex items-center justify-between border-t border-border">
          <Pagination
            page={page}
            pageCount={pageCount}
            total={listQuery.data?.count ?? 0}
            onPageChange={(p) => updateParams({ page: String(p) }, false)}
          />
          <label className="flex items-center gap-2 pr-3 text-xs text-muted">
            {tr.leads.pageSize}
            <Select value={pageSize} onChange={(e) => updateParams({ size: e.target.value })} className="h-8 w-20 text-xs">
              {[20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      {showAdd && workspaceId && <ManualAddDialog workspaceId={workspaceId} onClose={() => setShowAdd(false)} />}
      {showImport && workspaceId && <ImportCsvDialog workspaceId={workspaceId} onClose={() => setShowImport(false)} />}
    </div>
  );
}

function FilterInput({
  label,
  value,
  onCommit,
  type = "text",
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        key={value}
        type={type}
        defaultValue={value}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(e.currentTarget.value);
        }}
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
        }}
      />
    </div>
  );
}
