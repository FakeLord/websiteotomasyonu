import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

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
  is_active: boolean;
}

interface KbEntryRow {
  id: string;
  type: "COMPANY" | "FAQ" | "REFERENCE" | "SALES_RULE" | "OBJECTION";
  title: string;
  body: string;
  is_active: boolean;
  is_verified_real: boolean;
}

const KB_TYPES: KbEntryRow["type"][] = ["COMPANY", "FAQ", "REFERENCE", "SALES_RULE", "OBJECTION"];

export function KnowledgeBasePage() {
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;
  const isAdmin = membership.data?.role === "ADMIN";

  if (!workspaceId) return <p className="text-sm text-slate-500">{tr.common.loading}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{tr.nav.knowledgeBase}</h1>
      <ServicesSection workspaceId={workspaceId} isAdmin={isAdmin} />
      <KbEntriesSection workspaceId={workspaceId} isAdmin={isAdmin} />
    </div>
  );
}

function ServicesSection({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [newPackage, setNewPackage] = useState<Record<string, string>>({});

  const servicesQuery = useQuery({
    queryKey: ["services", workspaceId],
    queryFn: async (): Promise<ServiceRow[]> => {
      const { data, error } = await supabase.from("services").select("id, name, description, is_active").eq("workspace_id", workspaceId);
      if (error) throw error;
      return (data ?? []) as ServiceRow[];
    },
  });

  const packagesQuery = useQuery({
    queryKey: ["service-packages", workspaceId],
    queryFn: async (): Promise<PackageRow[]> => {
      const { data, error } = await supabase
        .from("service_packages")
        .select("id, service_id, name, summary, price_min, price_max, delivery_days_min, delivery_days_max, is_active")
        .eq("workspace_id", workspaceId);
      if (error) throw error;
      return (data ?? []) as PackageRow[];
    },
  });

  const addService = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("services").insert({ workspace_id: workspaceId, name });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["services", workspaceId] });
    },
  });

  const addPackage = useMutation({
    mutationFn: async (serviceId: string) => {
      const { error } = await supabase.from("service_packages").insert({
        workspace_id: workspaceId,
        service_id: serviceId,
        name: newPackage.name || "Paket",
        summary: newPackage.summary || null,
        price_min: newPackage.priceMin ? Number(newPackage.priceMin) : null,
        price_max: newPackage.priceMax ? Number(newPackage.priceMax) : null,
        delivery_days_min: newPackage.deliveryMin ? Number(newPackage.deliveryMin) : null,
        delivery_days_max: newPackage.deliveryMax ? Number(newPackage.deliveryMax) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewPackage({});
      void queryClient.invalidateQueries({ queryKey: ["service-packages", workspaceId] });
    },
  });

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium text-slate-900">{tr.kb.servicesTitle}</h2>

      {isAdmin && (
        <div className="flex gap-2">
          <Input placeholder={tr.kb.serviceNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button size="sm" disabled={!name.trim() || addService.isPending} onClick={() => addService.mutate()}>
            {tr.kb.addService}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {servicesQuery.data?.map((service) => {
          const packages = packagesQuery.data?.filter((p) => p.service_id === service.id) ?? [];
          return (
            <div key={service.id} className="rounded-md border border-slate-100 p-3">
              <h3 className="font-medium text-slate-800">{service.name}</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {packages.map((pkg) => (
                  <li key={pkg.id}>
                    {pkg.name}
                    {pkg.price_min != null && pkg.price_max != null && ` — ${pkg.price_min}-${pkg.price_max} TRY`}
                    {pkg.delivery_days_min != null && pkg.delivery_days_max != null && ` (${pkg.delivery_days_min}-${pkg.delivery_days_max} gün)`}
                  </li>
                ))}
                {packages.length === 0 && <li className="text-slate-400">{tr.kb.noPackages}</li>}
              </ul>
              {isAdmin && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    className="h-7 w-32 text-xs"
                    placeholder={tr.kb.packageNamePlaceholder}
                    value={newPackage.name ?? ""}
                    onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })}
                  />
                  <Input className="h-7 w-20 text-xs" placeholder="Min ₺" value={newPackage.priceMin ?? ""} onChange={(e) => setNewPackage({ ...newPackage, priceMin: e.target.value })} />
                  <Input className="h-7 w-20 text-xs" placeholder="Max ₺" value={newPackage.priceMax ?? ""} onChange={(e) => setNewPackage({ ...newPackage, priceMax: e.target.value })} />
                  <Input className="h-7 w-16 text-xs" placeholder="Min gün" value={newPackage.deliveryMin ?? ""} onChange={(e) => setNewPackage({ ...newPackage, deliveryMin: e.target.value })} />
                  <Input className="h-7 w-16 text-xs" placeholder="Max gün" value={newPackage.deliveryMax ?? ""} onChange={(e) => setNewPackage({ ...newPackage, deliveryMax: e.target.value })} />
                  <Button size="sm" variant="outline" disabled={addPackage.isPending} onClick={() => addPackage.mutate(service.id)}>
                    {tr.kb.addPackage}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function KbEntriesSection({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<KbEntryRow["type"]>("FAQ");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isVerifiedReal, setIsVerifiedReal] = useState(false);

  const entriesQuery = useQuery({
    queryKey: ["kb-entries", workspaceId],
    queryFn: async (): Promise<KbEntryRow[]> => {
      const { data, error } = await supabase
        .from("kb_entries")
        .select("id, type, title, body, is_active, is_verified_real")
        .eq("workspace_id", workspaceId)
        .order("type");
      if (error) throw error;
      return (data ?? []) as KbEntryRow[];
    },
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("kb_entries").insert({
        workspace_id: workspaceId,
        type,
        title,
        body,
        is_verified_real: type === "REFERENCE" ? isVerifiedReal : false,
        updated_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      setIsVerifiedReal(false);
      void queryClient.invalidateQueries({ queryKey: ["kb-entries", workspaceId] });
    },
  });

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium text-slate-900">{tr.kb.entriesTitle}</h2>

      {isAdmin && (
        <div className="space-y-2 rounded-md border border-slate-100 p-3">
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as KbEntryRow["type"])}
            >
              {KB_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input placeholder={tr.kb.titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} className="max-w-xs" />
          </div>
          <textarea
            className="w-full rounded-md border border-slate-300 p-2 text-sm"
            rows={3}
            placeholder={tr.kb.bodyPlaceholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {type === "REFERENCE" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={isVerifiedReal} onChange={(e) => setIsVerifiedReal(e.target.checked)} />
              {tr.kb.verifiedRealLabel}
            </label>
          )}
          <Button size="sm" disabled={!title.trim() || !body.trim() || addEntry.isPending} onClick={() => addEntry.mutate()}>
            {tr.kb.addEntry}
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {entriesQuery.data?.map((entry) => (
          <li key={entry.id} className="rounded-md bg-slate-50 p-2 text-sm">
            <p className="font-medium text-slate-800">
              [{entry.type}] {entry.title}
              {entry.type === "REFERENCE" && !entry.is_verified_real && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{tr.kb.unverified}</span>
              )}
            </p>
            <p className="text-slate-600">{entry.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
