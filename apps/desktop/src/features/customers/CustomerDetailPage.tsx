import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, ExternalLink, FileText, Loader2, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase-client";
import { platform } from "../../lib/platform";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { formatCurrency, formatDate, formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input, Label, Select, Textarea } from "../../components/ui/input";
import { EmptyState, KeyValue, PageHeader, Table, Td, Th, Tr } from "../../components/ui/data-display";
import { Dialog, DialogContent, PillTabsList, PillTabsTrigger, Tabs, TabsContent } from "../../components/ui/primitives";
import { CustomerDealDialog, type CustomerDealRow } from "./CustomerDealDialog";
import {
  DOCUMENT_KINDS,
  FILE_ACCEPT,
  SERVICE_KINDS,
  STORAGE_BUCKET,
  buildStoragePath,
  checkFile,
  formatFileSize,
  renewalState,
  type CustomerDocumentRow,
  type CustomerServiceRow,
  type DocumentKind,
  type MoneyCurrency,
  type ServiceKind,
  type ServiceStatus,
} from "./customer-data";

const T = tr.customerDetail;
const CURRENCIES: MoneyCurrency[] = ["TRY", "USD", "EUR"];
const STATUS_TONES = { ACTIVE: "green", PAUSED: "orange", ENDED: "gray" } as const;

interface CustomerBusiness {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  district: string | null;
  country_code: string;
  primary_phone_e164: string | null;
  stage: string;
  customer_deals: CustomerDealRow | CustomerDealRow[] | null;
}

interface ActivityItem {
  id: number;
  summary: string;
  created_at: string;
}

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function CustomerDetailPage() {
  const { businessId = "" } = useParams();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const isAdmin = useWorkspaceMembership().data?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [dealOpen, setDealOpen] = useState(false);
  useRealtimeTable("customer_deals", workspaceId, ["customer-business", businessId]);
  useRealtimeTable("customer_services", workspaceId, ["customer-services", businessId]);
  useRealtimeTable("customer_documents", workspaceId, ["customer-documents", businessId]);

  const business = useQuery({
    queryKey: ["customer-business", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<CustomerBusiness | null> => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, category, city, district, country_code, primary_phone_e164, stage, customer_deals(*)")
        .eq("id", businessId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CustomerBusiness | null;
    },
  });

  const services = useQuery({
    queryKey: ["customer-services", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<CustomerServiceRow[]> => {
      const { data, error } = await supabase
        .from("customer_services")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CustomerServiceRow[];
    },
  });

  const documents = useQuery({
    queryKey: ["customer-documents", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<CustomerDocumentRow[]> => {
      const { data, error } = await supabase
        .from("customer_documents")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomerDocumentRow[];
    },
  });

  const history = useQuery({
    queryKey: ["customer-history", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, summary, created_at")
        .eq("entity_type", "business")
        .eq("entity_id", businessId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as ActivityItem[];
    },
  });

  if (business.isLoading) return <p className="text-sm text-muted">{tr.common.loading}</p>;
  const b = business.data;
  if (!b) return <p className="text-sm text-muted">{T.notFound}</p>;

  const deal = Array.isArray(b.customer_deals) ? (b.customer_deals[0] ?? null) : b.customer_deals;
  const isWon = b.stage === "WON";
  const serviceList = services.data ?? [];
  const documentList = documents.data ?? [];
  const location = [b.district, b.city, b.country_code].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <div>
        <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft className="size-4" />
          {T.back}
        </Link>
      </div>

      <PageHeader
        title={b.name}
        description={[b.category, location, b.primary_phone_e164].filter(Boolean).join(" · ")}
        actions={
          <Link to={`/leads/${b.id}`}>
            <Button variant="outline">
              <ExternalLink />
              {T.openLead}
            </Button>
          </Link>
        }
      />

      {!isWon && <p className="rounded-lg bg-warning/10 p-3 text-sm text-text">{T.notWon}</p>}

      <Tabs defaultValue="overview" className="space-y-4">
        <PillTabsList>
          <PillTabsTrigger value="overview">{T.tabs.overview}</PillTabsTrigger>
          <PillTabsTrigger value="services">
            {T.tabs.services} ({serviceList.length})
          </PillTabsTrigger>
          <PillTabsTrigger value="documents">
            {T.tabs.documents} ({documentList.length})
          </PillTabsTrigger>
          <PillTabsTrigger value="history">{T.tabs.history}</PillTabsTrigger>
        </PillTabsList>

        <TabsContent value="overview">
          <OverviewTab
            deal={deal}
            services={serviceList}
            documentCount={documentList.length}
            canEditDeal={isWon}
            onEditDeal={() => setDealOpen(true)}
          />
        </TabsContent>

        <TabsContent value="services">
          <ServicesTab
            businessId={b.id}
            canEdit={isWon}
            isAdmin={isAdmin}
            services={serviceList}
            onChanged={() => {
              void queryClient.invalidateQueries({ queryKey: ["customer-services", businessId] });
              void queryClient.invalidateQueries({ queryKey: ["customer-history", businessId] });
            }}
          />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab
            businessId={b.id}
            workspaceId={workspaceId ?? ""}
            canEdit={isWon}
            isAdmin={isAdmin}
            documents={documentList}
            services={serviceList}
            onChanged={() => {
              void queryClient.invalidateQueries({ queryKey: ["customer-documents", businessId] });
              void queryClient.invalidateQueries({ queryKey: ["customer-history", businessId] });
            }}
          />
        </TabsContent>

        <TabsContent value="history">
          <Card className="p-4">
            {(history.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{T.history.empty}</p>
            ) : (
              <ul className="space-y-3">
                {history.data?.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-text">{item.summary}</span>
                    <span className="shrink-0 text-xs text-subtle">{formatRelative(item.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {dealOpen && (
        <CustomerDealDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDealOpen(false);
              void queryClient.invalidateQueries({ queryKey: ["customer-business", businessId] });
            }
          }}
          businessId={b.id}
          businessName={b.name}
          countryCode={b.country_code}
        />
      )}
    </div>
  );
}

function OverviewTab({
  deal,
  services,
  documentCount,
  canEditDeal,
  onEditDeal,
}: {
  deal: CustomerDealRow | null;
  services: CustomerServiceRow[];
  documentCount: number;
  canEditDeal: boolean;
  onEditDeal: () => void;
}) {
  const packageItems = services.filter((s) => s.kind === "PACKAGE_ITEM");
  const upcoming = services
    .filter((s) => s.status !== "ENDED" && s.renews_on && renewalState(s.renews_on) !== "OK")
    .sort((a, b) => (a.renews_on ?? "").localeCompare(b.renews_on ?? ""));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">{T.overview.deal}</h2>
          {canEditDeal && (
            <Button size="sm" variant="outline" onClick={onEditDeal}>
              <Pencil />
              {T.overview.editDeal}
            </Button>
          )}
        </div>
        {deal ? (
          <dl className="space-y-2 text-sm">
            <KeyValue label={tr.customers.package}>{deal.package_name ?? "—"}</KeyValue>
            <KeyValue label={tr.customers.amount}>
              {deal.amount != null ? formatCurrency(Number(deal.amount), deal.currency) : "—"}
              {deal.billing !== "ONE_TIME" && <span className="ml-1 text-xs text-muted">/ {tr.customers.billingShort[deal.billing]}</span>}
            </KeyValue>
            <KeyValue label={tr.customers.startDate}>{formatDate(deal.start_date)}</KeyValue>
            <KeyValue label={tr.customers.status}>
              <Badge tone={STATUS_TONES[deal.status]}>{tr.customers.statusOptions[deal.status]}</Badge>
            </KeyValue>
            {deal.note && <KeyValue label={tr.customers.note}>{deal.note}</KeyValue>}
          </dl>
        ) : (
          <p className="text-sm text-muted">{T.overview.noDeal}</p>
        )}
        <p className="text-xs text-subtle">{T.overview.counts(services.length, documentCount)}</p>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-text">{T.overview.packageContents}</h2>
        {packageItems.length === 0 ? (
          <p className="text-sm text-muted">{T.overview.noPackageContents}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-text">
            {packageItems.map((item) => (
              <li key={item.id}>
                {item.title}
                {item.note && <span className="text-muted"> — {item.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-4 lg:col-span-2">
        <h2 className="text-sm font-semibold text-text">{T.overview.renewals}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">{T.overview.noRenewals}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text">
                  {s.title} <span className="text-muted">· {T.services.kinds[s.kind]}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{formatDate(s.renews_on as string)}</span>
                  <Badge tone={renewalState(s.renews_on) === "OVERDUE" ? "red" : "orange"}>
                    {renewalState(s.renews_on) === "OVERDUE" ? T.services.renewOverdue : T.services.renewSoon}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface ServiceForm {
  kind: ServiceKind;
  title: string;
  provider: string;
  identifier: string;
  loginUrl: string;
  username: string;
  status: ServiceStatus;
  startsOn: string;
  renewsOn: string;
  cost: string;
  currency: MoneyCurrency;
  note: string;
}

const EMPTY_SERVICE: ServiceForm = {
  kind: "DOMAIN",
  title: "",
  provider: "",
  identifier: "",
  loginUrl: "",
  username: "",
  status: "ACTIVE",
  startsOn: "",
  renewsOn: "",
  cost: "",
  currency: "TRY",
  note: "",
};

function ServicesTab({
  businessId,
  canEdit,
  isAdmin,
  services,
  onChanged,
}: {
  businessId: string;
  canEdit: boolean;
  isAdmin: boolean;
  services: CustomerServiceRow[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<{ id: string | null; form: ServiceForm } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: rpcError } = await supabase.rpc("delete_customer_service", { p_id: id });
      if (rpcError) throw new Error(rpcError.message);
    },
    onSuccess: onChanged,
    onError: (err) => setError(messageOf(err, tr.common.error)),
  });

  const openAdd = () => setEditing({ id: null, form: EMPTY_SERVICE });
  const openEdit = (s: CustomerServiceRow) =>
    setEditing({
      id: s.id,
      form: {
        kind: s.kind,
        title: s.title,
        provider: s.provider ?? "",
        identifier: s.identifier ?? "",
        loginUrl: s.login_url ?? "",
        username: s.username ?? "",
        status: s.status,
        startsOn: s.starts_on ?? "",
        renewsOn: s.renews_on ?? "",
        cost: s.cost_amount !== null ? String(s.cost_amount) : "",
        currency: s.currency,
        note: s.note ?? "",
      },
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{T.services.noPasswordNote}</p>
        {canEdit && (
          <Button onClick={openAdd}>
            <Plus />
            {T.services.add}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      {services.length === 0 ? (
        <Card>
          <EmptyState icon={Server} title={T.services.empty} description={T.services.emptyHint} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {services.map((s) => {
            const renewal = s.status === "ENDED" ? null : renewalState(s.renews_on);
            return (
              <Card key={s.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">{s.title}</p>
                    <p className="text-xs text-muted">
                      {T.services.kinds[s.kind]}
                      {s.provider ? ` · ${s.provider}` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[s.status]}>{T.services.statuses[s.status]}</Badge>
                </div>
                <dl className="space-y-1 text-sm">
                  {s.identifier && <KeyValue label={T.services.identifier}>{s.identifier}</KeyValue>}
                  {s.username && <KeyValue label={T.services.username}>{s.username}</KeyValue>}
                  {s.cost_amount !== null && <KeyValue label={T.services.cost}>{formatCurrency(Number(s.cost_amount), s.currency)}</KeyValue>}
                  {s.renews_on && <KeyValue label={T.services.renewsOn}>{formatDate(s.renews_on)}</KeyValue>}
                </dl>
                {renewal && renewal !== "OK" && (
                  <Badge tone={renewal === "OVERDUE" ? "red" : "orange"}>
                    {renewal === "OVERDUE" ? T.services.renewOverdue : T.services.renewSoon}
                  </Badge>
                )}
                {s.note && <p className="text-xs whitespace-pre-wrap text-muted">{s.note}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {s.login_url && (
                    <Button size="sm" variant="outline" onClick={() => void platform.openExternal(s.login_url as string)}>
                      <ExternalLink />
                      {T.services.open}
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      <Pencil />
                      {T.services.edit}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(T.services.deleteConfirm(s.title))) remove.mutate(s.id);
                      }}
                    >
                      <Trash2 />
                      {T.services.delete}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <ServiceDialog
          businessId={businessId}
          serviceId={editing.id}
          initial={editing.form}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ServiceDialog({
  businessId,
  serviceId,
  initial,
  onClose,
  onSaved,
}: {
  businessId: string;
  serviceId: string | null;
  initial: ServiceForm;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ServiceForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const cost = form.cost.trim() ? Number(form.cost.replace(",", ".")) : null;
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error(T.services.invalidCost);
      if (form.loginUrl.trim() && !/^https?:\/\//i.test(form.loginUrl.trim())) throw new Error(T.services.invalidUrl);
      const { error: rpcError } = await supabase.rpc("upsert_customer_service", {
        p_id: serviceId,
        p_business_id: businessId,
        p_kind: form.kind,
        p_title: form.title,
        p_provider: form.provider || null,
        p_identifier: form.identifier || null,
        p_login_url: form.loginUrl || null,
        p_username: form.username || null,
        p_status: form.status,
        p_starts_on: form.startsOn || null,
        p_renews_on: form.renewsOn || null,
        p_cost_amount: cost,
        p_currency: form.currency,
        p_note: form.note || null,
      });
      if (rpcError) throw new Error(rpcError.message);
    },
    onSuccess: onSaved,
    onError: (err) => setError(messageOf(err, T.services.saveError)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={serviceId ? T.services.dialogEdit : T.services.dialogAdd} description={T.services.noPasswordNote} size="lg">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div>
            <Label>{T.services.kind}</Label>
            <Select value={form.kind} onChange={(e) => set("kind", e.target.value as ServiceKind)}>
              {SERVICE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {T.services.kinds[k]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{T.services.title}</Label>
            <Input required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={T.services.titlePlaceholder} />
          </div>
          <div>
            <Label>{T.services.provider}</Label>
            <Input value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder={T.services.providerPlaceholder} />
          </div>
          <div>
            <Label>{T.services.identifier}</Label>
            <Input value={form.identifier} onChange={(e) => set("identifier", e.target.value)} />
          </div>
          <div>
            <Label>{T.services.loginUrl}</Label>
            <Input value={form.loginUrl} onChange={(e) => set("loginUrl", e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label>{T.services.username}</Label>
            <Input value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
          </div>
          <div>
            <Label>{T.services.status}</Label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value as ServiceStatus)}>
              {(Object.keys(T.services.statuses) as ServiceStatus[]).map((s) => (
                <option key={s} value={s}>
                  {T.services.statuses[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T.services.cost}</Label>
              <Input inputMode="decimal" value={form.cost} onChange={(e) => set("cost", e.target.value)} />
            </div>
            <div>
              <Label>{tr.customers.currency}</Label>
              <Select value={form.currency} onChange={(e) => set("currency", e.target.value as MoneyCurrency)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>{T.services.startsOn}</Label>
            <Input type="date" value={form.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
          </div>
          <div>
            <Label>{T.services.renewsOn}</Label>
            <Input type="date" value={form.renewsOn} onChange={(e) => set("renewsOn", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>{T.services.note}</Label>
            <Textarea rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={T.services.notePlaceholder} />
          </div>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {tr.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsTab({
  businessId,
  workspaceId,
  canEdit,
  isAdmin,
  documents,
  services,
  onChanged,
}: {
  businessId: string;
  workspaceId: string;
  canEdit: boolean;
  isAdmin: boolean;
  documents: CustomerDocumentRow[];
  services: CustomerServiceRow[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const serviceTitle = useMemo(() => new Map(services.map((s) => [s.id, s.title])), [services]);

  const download = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60);
      if (error || !data?.signedUrl) throw new Error(T.documents.downloadError);
      await platform.openExternal(data.signedUrl);
    },
    onError: (err) => setNotice(messageOf(err, T.documents.downloadError)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("delete_customer_document", { p_id: id });
      if (error) throw new Error(error.message);
      // Kayıt silindi; dosya kovadan kaldırılır (başarısız olsa bile kayıt tekrar görünmez).
      if (typeof data === "string") await supabase.storage.from(STORAGE_BUCKET).remove([data]);
    },
    onSuccess: onChanged,
    onError: (err) => setNotice(messageOf(err, tr.common.error)),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{T.documents.emptyHint}</p>
        {canEdit && (
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {T.documents.add}
          </Button>
        )}
      </div>
      {notice && <p className="text-xs text-danger">{notice}</p>}

      {documents.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title={T.documents.empty} description={T.documents.emptyHint} />
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{T.documents.columns.title}</Th>
                <Th>{T.documents.columns.kind}</Th>
                <Th>{T.documents.columns.invoice}</Th>
                <Th>{T.documents.columns.amount}</Th>
                <Th>{T.documents.columns.date}</Th>
                <Th>{T.documents.columns.size}</Th>
                <Th className="w-28">
                  <span className="sr-only">{tr.common.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <p className="font-medium text-text">{d.title}</p>
                    <p className="text-xs text-muted">
                      {d.file_name}
                      {d.service_id && serviceTitle.get(d.service_id) ? ` · ${serviceTitle.get(d.service_id)}` : ""}
                    </p>
                  </Td>
                  <Td>{T.documents.kinds[d.kind]}</Td>
                  <Td className="text-muted">{d.invoice_number ?? "—"}</Td>
                  <Td className="tabular-nums">{d.amount !== null ? formatCurrency(Number(d.amount), d.currency) : "—"}</Td>
                  <Td className="text-muted">{d.issued_on ? formatDate(d.issued_on) : formatDate(d.created_at)}</Td>
                  <Td className="text-muted">{formatFileSize(d.size_bytes)}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-text"
                        aria-label={T.documents.download}
                        title={T.documents.download}
                        disabled={download.isPending}
                        onClick={() => download.mutate(d.file_path)}
                      >
                        <Download className="size-4" />
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-danger"
                          aria-label={T.documents.delete}
                          title={T.documents.delete}
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(T.documents.deleteConfirm(d.title))) remove.mutate(d.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {adding && (
        <DocumentDialog
          businessId={businessId}
          workspaceId={workspaceId}
          services={services}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function DocumentDialog({
  businessId,
  workspaceId,
  services,
  onClose,
  onSaved,
}: {
  businessId: string;
  workspaceId: string;
  services: CustomerServiceRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>("INVOICE");
  const [title, setTitle] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<MoneyCurrency>("TRY");
  const [issuedOn, setIssuedOn] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileInput.current?.files?.[0];
      if (!file) throw new Error(T.documents.chooseFile);
      const problem = checkFile(file);
      if (problem) throw new Error(T.documents.problems[problem]);
      const parsedAmount = amount.trim() ? Number(amount.replace(",", ".")) : null;
      if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) throw new Error(T.documents.invalidAmount);

      const path = buildStoragePath(workspaceId, businessId, file.name, crypto.randomUUID());
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(T.documents.uploadError);

      const { error: rpcError } = await supabase.rpc("register_customer_document", {
        p_business_id: businessId,
        p_kind: kind,
        p_title: title.trim() || file.name,
        p_invoice_number: invoiceNumber || null,
        p_amount: parsedAmount,
        p_currency: currency,
        p_issued_on: issuedOn || null,
        p_service_id: serviceId || null,
        p_file_path: path,
        p_file_name: file.name.slice(0, 255),
        p_mime_type: file.type,
        p_size_bytes: file.size,
      });
      if (rpcError) {
        // Kayıt açılamadıysa yetim dosya bırakılmaz.
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        throw new Error(rpcError.message);
      }
    },
    onSuccess: onSaved,
    onError: (err) => setError(messageOf(err, T.documents.uploadError)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={T.documents.dialogTitle} size="lg">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            upload.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Label>{T.documents.file}</Label>
            <input
              ref={fileInput}
              type="file"
              accept={FILE_ACCEPT}
              className="block w-full text-sm text-text file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <div>
            <Label>{T.documents.kind}</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {T.documents.kinds[k]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{T.documents.title}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={T.documents.titlePlaceholder} />
          </div>
          <div>
            <Label>{T.documents.invoiceNumber}</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T.documents.amount}</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>{tr.customers.currency}</Label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value as MoneyCurrency)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>{T.documents.issuedOn}</Label>
            <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </div>
          <div>
            <Label>{T.documents.service}</Label>
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">{T.documents.noService}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </div>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending && <Loader2 className="animate-spin" />}
              {upload.isPending ? T.documents.uploading : T.documents.upload}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
