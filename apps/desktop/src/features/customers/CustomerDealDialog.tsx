import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";
import { DEAL_CURRENCIES, defaultDealCurrency, type DealCurrency } from "./customer-metrics";
import { Button } from "../../components/ui/button";
import { Input, Label, Select, Textarea } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";

export interface CustomerDealRow {
  id: string;
  business_id: string;
  package_id: string | null;
  package_name: string | null;
  amount: number | null;
  currency: DealCurrency;
  billing: "ONE_TIME" | "MONTHLY" | "YEARLY";
  start_date: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  note: string | null;
}

interface FormState {
  packageId: string;
  packageName: string;
  amount: string;
  currency: CustomerDealRow["currency"];
  billing: CustomerDealRow["billing"];
  startDate: string;
  status: CustomerDealRow["status"];
  note: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function CustomerDealDialog({
  open,
  onOpenChange,
  businessId,
  businessName,
  countryCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  businessName: string;
  /** İşletmenin ülkesi; yeni anlaşmanın varsayılan para birimini belirler. */
  countryCode?: string;
}) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const [form, setForm] = useState<FormState>({
    packageId: "",
    packageName: "",
    amount: "",
    currency: defaultDealCurrency(countryCode),
    billing: "ONE_TIME",
    startDate: today(),
    status: "ACTIVE",
    note: "",
  });

  const deal = useQuery({
    queryKey: ["customer-deal", businessId],
    queryFn: async (): Promise<CustomerDealRow | null> => {
      const { data, error } = await supabase.from("customer_deals").select("*").eq("business_id", businessId).maybeSingle();
      if (error) throw error;
      return data as CustomerDealRow | null;
    },
  });

  const packages = useQuery({
    queryKey: ["service-packages", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_packages")
        .select("id, name, price_min, price_max, currency")
        .eq("workspace_id", workspaceId as string)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; price_min: number | null; price_max: number | null; currency: string }>;
    },
  });

  useEffect(() => {
    const d = deal.data;
    if (!d) return;
    setForm({
      packageId: d.package_id ?? "",
      packageName: d.package_id ? "" : (d.package_name ?? ""),
      amount: d.amount !== null ? String(d.amount) : "",
      currency: d.currency,
      billing: d.billing,
      startDate: d.start_date,
      status: d.status,
      note: d.note ?? "",
    });
  }, [deal.data]);

  const save = useMutation({
    mutationFn: async () => {
      const amount = form.amount.trim() ? Number(form.amount.replace(",", ".")) : null;
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new Error(tr.customers.invalidAmount);
      const { error } = await supabase.rpc("upsert_customer_deal", {
        p_business_id: businessId,
        p_package_id: form.packageId || null,
        p_package_name: form.packageId ? null : form.packageName || null,
        p_amount: amount,
        p_currency: form.currency,
        p_billing: form.billing,
        p_start_date: form.startDate || today(),
        p_status: form.status,
        p_note: form.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-deal", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      onOpenChange(false);
    },
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={tr.customers.dealTitle} description={businessName} size="lg">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <Label>{tr.customers.package}</Label>
            <Select value={form.packageId} onChange={(e) => set("packageId", e.target.value)}>
              <option value="">{tr.customers.customPackage}</option>
              {packages.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {!form.packageId && (
            <div>
              <Label>{tr.customers.packageName}</Label>
              <Input value={form.packageName} onChange={(e) => set("packageName", e.target.value)} placeholder={tr.customers.packageNamePlaceholder} />
            </div>
          )}
          <div>
            <Label>{tr.customers.amount}</Label>
            <Input inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="15000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{tr.customers.currency}</Label>
              <Select value={form.currency} onChange={(e) => set("currency", e.target.value as FormState["currency"])}>
                {DEAL_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tr.customers.billing}</Label>
              <Select value={form.billing} onChange={(e) => set("billing", e.target.value as FormState["billing"])}>
                {Object.entries(tr.customers.billingOptions).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>{tr.customers.startDate}</Label>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div>
            <Label>{tr.customers.status}</Label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])}>
              {Object.entries(tr.customers.statusOptions).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{tr.customers.note}</Label>
            <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={3} />
          </div>
          {save.isError && (
            <p className="text-sm text-[#f87171] sm:col-span-2">{save.error instanceof Error ? save.error.message : tr.common.error}</p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {tr.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
