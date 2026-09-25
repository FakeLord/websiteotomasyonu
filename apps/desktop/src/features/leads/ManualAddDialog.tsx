import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importBusinessInputSchema, type ImportBusinessInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

interface ManualAddDialogProps {
  workspaceId: string;
  onClose: () => void;
}

export function ManualAddDialog({ workspaceId, onClose }: ManualAddDialogProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ImportBusinessInput>({
    resolver: zodResolver(importBusinessInputSchema),
    defaultValues: { source: "MANUAL" },
  });

  const mutation = useMutation({
    mutationFn: async (values: ImportBusinessInput) => {
      const { error } = await supabase.rpc("import_business", {
        ws: workspaceId,
        p_payload: values,
        p_search_job_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">{tr.leads.manualAddTitle}</h2>
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
          <Field label={tr.leads.cityLabel}>
            <Input {...register("city")} />
          </Field>
          <Field label={tr.leads.districtLabel}>
            <Input {...register("district")} />
          </Field>
          <Field label={tr.leads.phoneLabel}>
            <Input {...register("phoneE164")} placeholder="+90 5xx xxx xx xx" />
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
      </div>
    </div>
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
    <div className={full ? "col-span-2 space-y-1" : "space-y-1"}>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
