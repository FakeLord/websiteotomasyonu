import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useAuthStore } from "../../lib/auth-store";
import { formatCurrency } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Textarea } from "../../components/ui/input";
import { Card, CardBody } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { EmptyState, PageHeader } from "../../components/ui/data-display";
import { CountPill, Dialog, DialogContent, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/primitives";

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface PackageRow {
  id: string;
  service_id: string;
  name: string;
  summary: string | null;
  price_min: number | null;
  price_max: number | null;
  delivery_days_min: number | null;
  delivery_days_max: number | null;
  features: string[];
  is_active: boolean;
}

type KbType = "COMPANY" | "FAQ" | "REFERENCE" | "SALES_RULE" | "OBJECTION";

interface KbEntryRow {
  id: string;
  type: KbType;
  title: string;
  body: string;
  data: { allowDiscountMention?: boolean } | null;
  is_active: boolean;
  is_verified_real: boolean;
}

const KB_TYPES: KbType[] = ["COMPANY", "FAQ", "REFERENCE", "SALES_RULE", "OBJECTION"];

const toNumber = (value: string): number | null => {
  const n = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(n) ? n : null;
};

export function KnowledgeBasePage() {
  const membership = useWorkspaceMembership().data;
  const workspaceId = membership?.workspaceId;
  const isAdmin = membership?.role === "ADMIN";

  const entries = useQuery({
    queryKey: ["kb-entries", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<KbEntryRow[]> => {
      const { data, error } = await supabase
        .from("kb_entries")
        .select("id, type, title, body, data, is_active, is_verified_real")
        .eq("workspace_id", workspaceId as string)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as KbEntryRow[];
    },
  });

  if (!workspaceId) return <p className="text-sm text-muted">{tr.common.loading}</p>;
  const count = (type: KbType) => entries.data?.filter((e) => e.type === type).length ?? 0;

  return (
    <div>
      <PageHeader title={tr.kb.title} description={tr.kb.description} />
      {!isAdmin && <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{tr.kb.readOnly}</p>}
      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">{tr.kb.tabs.services}</TabsTrigger>
          {KB_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {tr.kb.tabs[type]}
              <CountPill>{count(type)}</CountPill>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="services">
          <ServicesTab workspaceId={workspaceId} isAdmin={isAdmin} />
        </TabsContent>
        {KB_TYPES.map((type) => (
          <TabsContent key={type} value={type}>
            <EntriesTab workspaceId={workspaceId} isAdmin={isAdmin} type={type} entries={(entries.data ?? []).filter((e) => e.type === type)} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/* ---------- Hizmetler ve paketler ---------- */

function ServicesTab({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [serviceName, setServiceName] = useState("");
  const [editingPackage, setEditingPackage] = useState<{ serviceId: string; pkg: PackageRow | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onError = (err: unknown) => setError(err instanceof Error ? err.message : tr.common.error);

  const services = useQuery({
    queryKey: ["services", workspaceId],
    queryFn: async (): Promise<ServiceRow[]> => {
      const { data, error: qError } = await supabase.from("services").select("id, name, description, is_active").eq("workspace_id", workspaceId).order("created_at");
      if (qError) throw qError;
      return (data ?? []) as ServiceRow[];
    },
  });

  const packages = useQuery({
    queryKey: ["service-packages-all", workspaceId],
    queryFn: async (): Promise<PackageRow[]> => {
      const { data, error: qError } = await supabase
        .from("service_packages")
        .select("id, service_id, name, summary, price_min, price_max, delivery_days_min, delivery_days_max, features, is_active")
        .eq("workspace_id", workspaceId)
        .order("price_min", { ascending: true, nullsFirst: false });
      if (qError) throw qError;
      return (data ?? []) as PackageRow[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["services", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["service-packages-all", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["service-packages", workspaceId] });
  };

  const addService = useMutation({
    mutationFn: async () => {
      const { error: iError } = await supabase.from("services").insert({ workspace_id: workspaceId, name: serviceName.trim() });
      if (iError) throw iError;
    },
    onSuccess: () => {
      setServiceName("");
      refresh();
    },
    onError,
  });

  const updateService = useMutation({
    mutationFn: async (patch: Partial<ServiceRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error: uError } = await supabase.from("services").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
      if (uError) throw uError;
    },
    onSuccess: refresh,
    onError,
  });

  const deleteService = useMutation({
    mutationFn: async (id: string) => {
      const { error: dError } = await supabase.from("services").delete().eq("id", id);
      if (dError) throw dError;
    },
    onSuccess: refresh,
    onError,
  });

  const deletePackage = useMutation({
    mutationFn: async (id: string) => {
      const { error: dError } = await supabase.from("service_packages").delete().eq("id", id);
      if (dError) throw dError;
    },
    onSuccess: refresh,
    onError,
  });

  const togglePackage = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error: uError } = await supabase.from("service_packages").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
      if (uError) throw uError;
    },
    onSuccess: refresh,
    onError,
  });

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {isAdmin && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addService.mutate();
          }}
        >
          <Input className="max-w-sm" placeholder={tr.kb.serviceNamePlaceholder} value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
          <Button type="submit" disabled={!serviceName.trim() || addService.isPending}>
            <Plus />
            {tr.kb.addService}
          </Button>
        </form>
      )}

      {services.data?.length === 0 && (
        <Card>
          <EmptyState icon={Package} title={tr.kb.noServices} description={tr.kb.noServicesHint} />
        </Card>
      )}

      {services.data?.map((service) => {
        const servicePackages = (packages.data ?? []).filter((p) => p.service_id === service.id);
        return (
          <Card key={service.id}>
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <Package className="size-5 text-primary" />
              <div className="min-w-0 flex-1">
                {isAdmin ? (
                  <input
                    defaultValue={service.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== service.name && updateService.mutate({ id: service.id, name: e.target.value.trim() })}
                    className="w-full bg-transparent font-semibold text-text focus-visible:outline-none"
                    aria-label={tr.kb.serviceNamePlaceholder}
                  />
                ) : (
                  <p className="font-semibold text-text">{service.name}</p>
                )}
              </div>
              {!service.is_active && <Badge tone="gray">{tr.kb.inactive}</Badge>}
              {isAdmin && (
                <>
                  <Switch checked={service.is_active} onCheckedChange={(v) => updateService.mutate({ id: service.id, is_active: v })} aria-label={tr.kb.active} />
                  <Button size="sm" variant="outline" onClick={() => setEditingPackage({ serviceId: service.id, pkg: null })}>
                    <Plus />
                    {tr.kb.addPackage}
                  </Button>
                  <button
                    type="button"
                    onClick={() => window.confirm(tr.kb.deleteServiceConfirm) && deleteService.mutate(service.id)}
                    className="rounded-md p-1.5 text-muted hover:bg-danger/15 hover:text-danger"
                    aria-label={tr.common.delete}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {servicePackages.length === 0 && <p className="text-sm text-muted">{tr.kb.noPackages}</p>}
              {servicePackages.map((pkg) => (
                <div key={pkg.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-text">{pkg.name}</p>
                    {!pkg.is_active && <Badge tone="gray">{tr.kb.inactive}</Badge>}
                  </div>
                  {pkg.summary && <p className="mt-1 text-sm text-muted">{pkg.summary}</p>}
                  <p className="mt-2 text-sm text-text">
                    {pkg.price_min != null && pkg.price_max != null
                      ? `${formatCurrency(pkg.price_min)} – ${formatCurrency(pkg.price_max)}`
                      : tr.kb.noPrice}
                  </p>
                  {pkg.delivery_days_min != null && pkg.delivery_days_max != null && (
                    <p className="text-xs text-muted">{tr.kb.deliveryRange(pkg.delivery_days_min, pkg.delivery_days_max)}</p>
                  )}
                  {pkg.features.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-xs text-muted">
                      {pkg.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                  {isAdmin && (
                    <div className="mt-3 flex items-center gap-2">
                      <Switch checked={pkg.is_active} onCheckedChange={(v) => togglePackage.mutate({ id: pkg.id, is_active: v })} aria-label={tr.kb.active} />
                      <Button size="sm" variant="ghost" onClick={() => setEditingPackage({ serviceId: service.id, pkg })}>
                        <Pencil />
                        {tr.common.edit}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.confirm(tr.kb.deletePackageConfirm) && deletePackage.mutate(pkg.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {editingPackage && (
        <PackageDialog
          workspaceId={workspaceId}
          serviceId={editingPackage.serviceId}
          pkg={editingPackage.pkg}
          onClose={() => setEditingPackage(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function PackageDialog({
  workspaceId,
  serviceId,
  pkg,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  serviceId: string;
  pkg: PackageRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: pkg?.name ?? "",
    summary: pkg?.summary ?? "",
    priceMin: pkg?.price_min?.toString() ?? "",
    priceMax: pkg?.price_max?.toString() ?? "",
    deliveryMin: pkg?.delivery_days_min?.toString() ?? "",
    deliveryMax: pkg?.delivery_days_max?.toString() ?? "",
    features: (pkg?.features ?? []).join("\n"),
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        summary: form.summary.trim() || null,
        price_min: toNumber(form.priceMin),
        price_max: toNumber(form.priceMax),
        delivery_days_min: toNumber(form.deliveryMin),
        delivery_days_max: toNumber(form.deliveryMax),
        features: form.features
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        updated_at: new Date().toISOString(),
      };
      if (payload.price_min !== null && payload.price_max !== null && payload.price_min > payload.price_max) {
        throw new Error(tr.kb.priceOrder);
      }
      const { error } = pkg
        ? await supabase.from("service_packages").update(payload).eq("id", pkg.id)
        : await supabase.from("service_packages").insert({ ...payload, workspace_id: workspaceId, service_id: serviceId });
      if (error) throw error;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={pkg ? tr.kb.editPackage : tr.kb.addPackage} description={tr.kb.packageHint} size="lg">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Label>{tr.kb.packageName}</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <Label>{tr.kb.summary}</Label>
            <Input value={form.summary} onChange={(e) => set("summary", e.target.value)} />
          </div>
          <div>
            <Label>{tr.kb.priceMin}</Label>
            <Input inputMode="decimal" value={form.priceMin} onChange={(e) => set("priceMin", e.target.value)} />
          </div>
          <div>
            <Label>{tr.kb.priceMax}</Label>
            <Input inputMode="decimal" value={form.priceMax} onChange={(e) => set("priceMax", e.target.value)} />
          </div>
          <div>
            <Label>{tr.kb.deliveryMin}</Label>
            <Input inputMode="numeric" value={form.deliveryMin} onChange={(e) => set("deliveryMin", e.target.value)} />
          </div>
          <div>
            <Label>{tr.kb.deliveryMax}</Label>
            <Input inputMode="numeric" value={form.deliveryMax} onChange={(e) => set("deliveryMax", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>{tr.kb.features}</Label>
            <Textarea rows={4} value={form.features} onChange={(e) => set("features", e.target.value)} placeholder={tr.kb.featuresPlaceholder} />
          </div>
          {save.isError && <p className="text-sm text-danger sm:col-span-2">{save.error instanceof Error ? save.error.message : tr.common.error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={!form.name.trim() || save.isPending}>
              {tr.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- KB girdileri ---------- */

function EntriesTab({ workspaceId, isAdmin, type, entries }: { workspaceId: string; isAdmin: boolean; type: KbType; entries: KbEntryRow[] }) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.session?.user.id);
  const [editing, setEditing] = useState<KbEntryRow | "new" | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["kb-entries", workspaceId] });

  const toggle = useMutation({
    mutationFn: async (entry: KbEntryRow) => {
      const { error } = await supabase
        .from("kb_entries")
        .update({ is_active: !entry.is_active, updated_by: myId, updated_at: new Date().toISOString() })
        .eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kb_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{tr.kb.typeHints[type]}</p>
        {isAdmin && (
          <Button onClick={() => setEditing("new")}>
            <Plus />
            {tr.kb.addEntry}
          </Button>
        )}
      </div>
      {entries.length === 0 && (
        <Card>
          <EmptyState icon={BookOpen} title={tr.kb.noEntries} />
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <Card key={entry.id} className={entry.is_active ? undefined : "opacity-60"}>
            <CardBody className="space-y-2 pt-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-text">{entry.title}</p>
                <div className="flex shrink-0 gap-1">
                  {type === "REFERENCE" && (
                    <Badge tone={entry.is_verified_real ? "green" : "orange"}>{entry.is_verified_real ? tr.kb.verified : tr.kb.unverified}</Badge>
                  )}
                  {type === "SALES_RULE" && entry.data?.allowDiscountMention && <Badge tone="blue">{tr.kb.discountAllowed}</Badge>}
                  {!entry.is_active && <Badge tone="gray">{tr.kb.inactive}</Badge>}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap text-muted">{entry.body}</p>
              {isAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={entry.is_active} onCheckedChange={() => toggle.mutate(entry)} aria-label={tr.kb.active} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(entry)}>
                    <Pencil />
                    {tr.common.edit}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(tr.kb.deleteEntryConfirm) && remove.mutate(entry.id)}>
                    <Trash2 />
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
      {editing && (
        <EntryDialog
          workspaceId={workspaceId}
          type={type}
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function EntryDialog({
  workspaceId,
  type,
  entry,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  type: KbType;
  entry: KbEntryRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const myId = useAuthStore((state) => state.session?.user.id);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [verified, setVerified] = useState(entry?.is_verified_real ?? false);
  const [allowDiscount, setAllowDiscount] = useState(entry?.data?.allowDiscountMention ?? false);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        is_verified_real: type === "REFERENCE" ? verified : false,
        data: type === "SALES_RULE" ? { allowDiscountMention: allowDiscount } : (entry?.data ?? {}),
        updated_by: myId,
        updated_at: new Date().toISOString(),
      };
      const { error } = entry
        ? await supabase.from("kb_entries").update(payload).eq("id", entry.id)
        : await supabase.from("kb_entries").insert({ ...payload, workspace_id: workspaceId, type });
      if (error) throw error;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={entry ? tr.kb.editEntry : tr.kb.addEntry} description={tr.kb.tabs[type]} size="lg">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <Label>{tr.kb.titlePlaceholder}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>{tr.kb.bodyPlaceholder}</Label>
            <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          {type === "REFERENCE" && (
            <label className="flex items-center gap-2 text-sm text-text">
              <Switch checked={verified} onCheckedChange={setVerified} />
              {tr.kb.verifiedRealLabel}
            </label>
          )}
          {type === "SALES_RULE" && (
            <label className="flex items-center gap-2 text-sm text-text">
              <Switch checked={allowDiscount} onCheckedChange={setAllowDiscount} />
              {tr.kb.allowDiscountLabel}
            </label>
          )}
          {save.isError && <p className="text-sm text-danger">{save.error instanceof Error ? save.error.message : tr.common.error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={!title.trim() || !body.trim() || save.isPending}>
              {tr.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
