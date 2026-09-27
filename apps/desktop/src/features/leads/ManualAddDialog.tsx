import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importBusinessInputSchema, type ImportBusinessInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { recomputeScore } from "../../workers/score-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
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
        {mutation.isError && <p className="mt-3 text-sm text-[#f87171]">{tr.common.error}</p>}
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
      {error && <p className="mt-1 text-xs text-[#f87171]">{error}</p>}
    </div>
  );
}
