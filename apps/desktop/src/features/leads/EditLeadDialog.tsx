import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buildBusinessPatch, type BusinessEditError, type BusinessEditField, type BusinessEditForm } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { addWhatsappChannelFor } from "../../lib/whatsapp-channels";
import { kickBackgroundAnalysis } from "../../workers/background-analysis";
import { recomputeScore } from "../../workers/score-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";
import type { BusinessDetail } from "./types";

interface EditLeadDialogProps {
  business: BusinessDetail;
  workspaceId: string;
  onClose: () => void;
}

/** Sunucu hatasını kullanıcıya anlaşılır metne çevirir; bilinmeyen hata olduğu gibi gösterilir. */
export function editErrorMessage(message: string): string {
  if (message.includes("version_conflict")) return tr.leadEdit.versionConflict;
  if (message.includes("duplicate_contact")) return tr.leadEdit.duplicatePhone;
  return message || tr.common.error;
}

/** Lead bilgilerini düzenler (ad, kategori, adres, şehir, ilçe, telefon, web sitesi). Yalnızca değişen alanlar gönderilir. */
export function EditLeadDialog({ business, workspaceId, onClose }: EditLeadDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BusinessEditForm>({
    name: business.name,
    category: business.category ?? "",
    address: business.address ?? "",
    city: business.city ?? "",
    district: business.district ?? "",
    phone: business.primary_phone_e164 ?? "",
    website: business.website_url ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<BusinessEditField, BusinessEditError>>>({});

  const source = {
    name: business.name,
    category: business.category,
    address: business.address,
    city: business.city,
    district: business.district,
    primaryPhoneE164: business.primary_phone_e164,
    websiteUrl: business.website_url,
    countryCode: business.country_code,
  };

  const save = useMutation({
    mutationFn: async () => {
      const result = buildBusinessPatch(source, form);
      setErrors(result.errors);
      if (Object.keys(result.errors).length > 0) return "INVALID" as const;
      if (result.changed.length === 0) return "UNCHANGED" as const;

      const { error } = await supabase.rpc("update_business_details", {
        p_business_id: business.id,
        p_patch: result.patch,
        p_expected_version: business.version,
      });
      if (error) throw new Error(editErrorMessage(error.message));

      // Yan etkiler hata verirse düzenleme yine de kaydedilmiştir; bir sonraki analizde/açılışta tamamlanır.
      try {
        if (result.changed.includes("phone")) await addWhatsappChannelFor(workspaceId, business.id);
        await recomputeScore(workspaceId, business.id);
        if (result.websiteChanged) void kickBackgroundAnalysis(workspaceId);
      } catch {
        /* düzenleme kaydedildi */
      }
      return "SAVED" as const;
    },
    onSuccess: (outcome) => {
      if (outcome === "INVALID") return;
      for (const queryKey of [["business", business.id], ["contact-channels", business.id], ["businesses"], ["market-options", workspaceId]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onClose();
    },
  });

  const set = (field: keyof BusinessEditForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const fieldError = (field: BusinessEditField) => (errors[field] ? tr.leadEdit.errors[errors[field]] : null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={tr.leadEdit.title} description={tr.leadEdit.description} size="lg">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label={tr.leads.nameLabel} error={fieldError("name")} full>
            <Input value={form.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label={tr.leads.categoryLabel}>
            <Input value={form.category} onChange={set("category")} />
          </Field>
          <Field label={tr.leads.phoneLabel} error={fieldError("phone")} hint={tr.leadEdit.phoneHint(business.country_code)}>
            <Input value={form.phone} onChange={set("phone")} inputMode="tel" />
          </Field>
          <Field label={tr.leads.cityLabel}>
            <Input value={form.city} onChange={set("city")} />
          </Field>
          <Field label={tr.leads.districtLabel}>
            <Input value={form.district} onChange={set("district")} />
          </Field>
          <Field label={tr.leads.addressLabel} full>
            <Input value={form.address} onChange={set("address")} />
          </Field>
          <Field label={tr.leads.websiteLabel} error={fieldError("website")} hint={tr.leadEdit.websiteHint} full>
            <Input value={form.website} onChange={set("website")} inputMode="url" />
          </Field>

          {save.isError && <p className="col-span-2 text-sm text-danger">{save.error.message}</p>}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? tr.common.loading : tr.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, hint, full, children }: { label: string; error?: string | null; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
