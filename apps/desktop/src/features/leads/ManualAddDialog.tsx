import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importBusinessInputSchema, type ImportBusinessInput } from "@lbf/contracts";
import { SUPPORTED_COUNTRY_CODES, getCountryProfile, normalizePhone } from "@lbf/core";
import { geoDefaultsForCountry } from "../../lib/business-geo";
import { useUiStore } from "../../lib/ui-store";
import { supabase } from "../../lib/supabase-client";
import { recomputeScore } from "../../workers/score-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Select } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";

interface ManualAddDialogProps {
  workspaceId: string;
  onClose: () => void;
}

export function ManualAddDialog({ workspaceId, onClose }: ManualAddDialogProps) {
  const queryClient = useQueryClient();
  const marketCountry = useUiStore((state) => state.market.country);
  const [phoneError, setPhoneError] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ImportBusinessInput>({
    resolver: zodResolver(importBusinessInputSchema),
    defaultValues: { source: "MANUAL", countryCode: marketCountry || "US" },
  });
  const country = watch("countryCode") ?? "US";

  const mutation = useMutation({
    mutationFn: async (input: ImportBusinessInput) => {
      const countryCode = input.countryCode ?? "US";
      // Telefon ülkeye göre E.164'e çevrilir; geçersizse kayıt yapılmaz.
      const rawPhone = input.phoneE164?.trim();
      const phone = rawPhone ? normalizePhone(rawPhone, countryCode)?.e164 : undefined;
      if (rawPhone && !phone) {
        setPhoneError(true);
        return "INVALID_PHONE" as const;
      }
      setPhoneError(false);
      const { phoneE164: _raw, ...rest } = input;
      const values = { ...rest, ...geoDefaultsForCountry(countryCode), ...(phone ? { phoneE164: phone } : {}) };
      const { data, error } = await supabase.rpc("import_business", {
        ws: workspaceId,
        p_payload: values,
        p_search_job_id: null,
      });
      if (error) throw error;
      const result = data as { businessId: string; status: string } | null;
      if (result && result.status !== "DUPLICATE_MERGED") {
        await recomputeScore(workspaceId, result.businessId);
      }
    },
    onSuccess: (result) => {
      if (result === "INVALID_PHONE") return;
      void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["market-options", workspaceId] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={tr.leads.manualAddTitle} size="lg">
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="grid grid-cols-2 gap-3"
        >
          <Field label={tr.leads.nameLabel} error={errors.name?.message} full>
            <Input {...register("name")} />
          </Field>
          <Field label={tr.leads.categoryLabel}>
            <Input {...register("category")} />
          </Field>
          <Field label={tr.discover.countryLabel}>
            <Select {...register("countryCode")}>
              {SUPPORTED_COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} · {getCountryProfile(code).nameTr}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.leads.cityLabel}>
            <Input {...register("city")} />
          </Field>
          <Field label={tr.leads.districtLabel}>
            <Input {...register("district")} />
          </Field>
          <Field label={tr.leads.phoneLabel} error={phoneError ? tr.leads.phoneInvalid : undefined}>
            <Input {...register("phoneE164")} placeholder={`+${getCountryProfile(country).phoneCode ?? ""} …`} />
          </Field>
          <Field label={tr.leads.emailLabel} error={errors.email?.message}>
            <Input type="email" {...register("email")} />
          </Field>
          <Field label={tr.leads.websiteLabel} error={errors.websiteUrl?.message}>
            <Input {...register("websiteUrl")} placeholder="https://…" />
          </Field>
          <Field label={tr.leads.instagramLabel}>
            <Input {...register("instagram")} />
          </Field>
          <Field label={tr.leads.facebookLabel}>
            <Input {...register("facebook")} />
          </Field>

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {tr.leads.submitAdd}
            </Button>
          </div>
        </form>
        {mutation.isError && <p className="mt-3 text-sm text-danger">{tr.common.error}</p>}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  full,
  children,
}: {
  label: string;
  error?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <Label>{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
