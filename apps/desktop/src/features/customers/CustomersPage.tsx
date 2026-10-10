import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Download, Pencil, Repeat, UserCheck, Users } from "lucide-react";
import { useMarket } from "../../lib/use-market";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { downloadFile, toCsv } from "../../lib/filters";
import { formatCurrency, formatDate, formatMoneyTotals } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Select } from "../../components/ui/input";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar, EmptyState, PageHeader, StatCard, Table, Td, Th, Tr } from "../../components/ui/data-display";
import { CustomerDealDialog, type CustomerDealRow } from "./CustomerDealDialog";
import { summarizeCustomers } from "./customer-metrics";

export interface CustomerRow {
  id: string;
  name: string;
  category: string | null;
  district: string | null;
  country_code: string;
  primary_phone_e164: string | null;
  updated_at: string;
  customer_deals: CustomerDealRow | CustomerDealRow[] | null;
}

export function dealOf(row: CustomerRow): CustomerDealRow | null {
  if (Array.isArray(row.customer_deals)) return row.customer_deals[0] ?? null;
  return row.customer_deals;
}

const STATUS_TONES = { ACTIVE: "green", PAUSED: "orange", ENDED: "gray" } as const;

export function CustomersPage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const [search, setSearch] = useState("");
  const { market } = useMarket();
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; countryCode: string } | null>(null);
  useRealtimeTable("customer_deals", workspaceId, ["customers", workspaceId]);

  const query = useQuery({
    queryKey: ["customers", workspaceId, market.country, market.city],
    enabled: !!workspaceId,
    queryFn: async (): Promise<CustomerRow[]> => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, category, district, country_code, primary_phone_e164, updated_at, customer_deals(*)")
        .eq("workspace_id", workspaceId as string)
        .eq("stage", "WON")
        .is("merged_into", null)
        .match({ ...(market.country ? { country_code: market.country } : {}), ...(market.country && market.city ? { city: market.city } : {}) })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomerRow[];
    },
  });

  const rows = query.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((r) => {
      const deal = dealOf(r);
      if (term && !r.name.toLocaleLowerCase("tr-TR").includes(term)) return false;
      if (status === "NO_DEAL") return !deal;
      if (status && deal?.status !== status) return false;
      return true;
    });
  }, [rows, search, status]);

  const summary = summarizeCustomers(rows.map(dealOf), new Date());

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((r) => {
        const deal = dealOf(r);
        return {
          name: r.name,
          category: r.category ?? "",
          phone: r.primary_phone_e164 ?? "",
          package: deal?.package_name ?? "",
          amount: deal?.amount ?? "",
          currency: deal?.currency ?? "",
          billing: deal ? tr.customers.billingOptions[deal.billing] : "",
          start: deal?.start_date ?? "",
          status: deal ? tr.customers.statusOptions[deal.status] : tr.customers.noDeal,
        };
      }),
      [
        { key: "name", label: tr.customers.columns.name },
        { key: "category", label: tr.leads.columns.category },
        { key: "phone", label: tr.leads.phoneLabel },
        { key: "package", label: tr.customers.package },
        { key: "amount", label: tr.customers.amount },
        { key: "currency", label: tr.customers.currency },
        { key: "billing", label: tr.customers.billing },
        { key: "start", label: tr.customers.startDate },
        { key: "status", label: tr.customers.status },
      ],
    );
    downloadFile(csv, `musteriler-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr.customers.title}
        description={tr.customers.description}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download />
            {tr.common.export}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={tr.customers.kpi.total} value={rows.length} icon={Users} />
        <StatCard label={tr.customers.kpi.active} value={summary.active} icon={UserCheck} />
        <StatCard label={tr.customers.kpi.revenue} value={formatMoneyTotals(summary.totalsByCurrency)} icon={Banknote} />
        <StatCard label={tr.customers.kpi.mrr} value={formatMoneyTotals(summary.mrrByCurrency)} icon={Repeat} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr.customers.searchPlaceholder} />
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{tr.common.all}</option>
            {Object.entries(tr.customers.statusOptions).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="NO_DEAL">{tr.customers.noDeal}</option>
          </Select>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={UserCheck} title={tr.customers.empty} description={tr.customers.emptyHint} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr.customers.columns.name}</Th>
                <Th>{tr.leads.columns.category}</Th>
                <Th>{tr.customers.package}</Th>
                <Th>{tr.customers.amount}</Th>
                <Th>{tr.customers.startDate}</Th>
                <Th>{tr.customers.status}</Th>
                <Th className="w-10">
                  <span className="sr-only">{tr.common.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const deal = dealOf(row);
                return (
                  <Tr key={row.id} className="cursor-pointer" onClick={() => navigate(`/leads/${row.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={row.name} size="sm" />
                        <div>
                          <p className="font-medium text-text">{row.name}</p>
                          <p className="text-xs text-muted">{row.primary_phone_e164 ?? ""}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-muted">{row.category ?? "—"}</Td>
                    <Td>{deal?.package_name ?? "—"}</Td>
                    <Td className="tabular-nums">
                      {deal?.amount != null ? formatCurrency(Number(deal.amount), deal.currency) : "—"}
                      {deal && deal.billing !== "ONE_TIME" && <span className="ml-1 text-xs text-muted">/ {tr.customers.billingShort[deal.billing]}</span>}
                    </Td>
                    <Td className="text-muted">{deal ? formatDate(deal.start_date) : "—"}</Td>
                    <Td>
                      {deal ? (
                        <Badge tone={STATUS_TONES[deal.status]}>{tr.customers.statusOptions[deal.status]}</Badge>
                      ) : (
                        <Badge tone="orange">{tr.customers.noDeal}</Badge>
                      )}
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: row.id, name: row.name, countryCode: row.country_code })}
                        className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-text"
                        aria-label={tr.customers.editDeal}
                      >
                        <Pencil className="size-4" />
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && (
        <CustomerDealDialog open onOpenChange={(open) => !open && setEditing(null)} businessId={editing.id} businessName={editing.name} countryCode={editing.countryCode} />
      )}
    </div>
  );
}
