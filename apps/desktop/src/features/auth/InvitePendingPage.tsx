import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { acceptInviteInputSchema, type AcceptInviteInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const bootstrapInputSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
});
type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

export function InvitePendingPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold text-slate-900">{tr.auth.invitePendingTitle}</h1>
          <p className="text-sm text-slate-500">{tr.auth.invitePendingDescription}</p>
        </div>
        <AcceptInviteForm />
        <BootstrapWorkspaceForm />
        <div className="text-center">
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="text-sm text-slate-500 hover:underline"
          >
            {tr.auth.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}

function AcceptInviteForm() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteInput>({ resolver: zodResolver(acceptInviteInputSchema) });

  const onSubmit = async (values: AcceptInviteInput) => {
    setError(null);
    const { error: rpcError } = await supabase.rpc("accept_invite", {
      p_token: values.inviteCode,
    });
    if (rpcError) {
      setError(tr.auth.acceptInviteError);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["workspace-membership"] });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="inviteCode">
          {tr.auth.inviteCodeLabel}
        </label>
        <Input id="inviteCode" {...register("inviteCode")} />
        {errors.inviteCode && <p className="text-xs text-red-600">{errors.inviteCode.message}</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {tr.auth.acceptInviteButton}
      </Button>
    </form>
  );
}

function BootstrapWorkspaceForm() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BootstrapInput>({ resolver: zodResolver(bootstrapInputSchema) });

  const onSubmit = async (values: BootstrapInput) => {
    setError(null);
    const { error: rpcError } = await supabase.rpc("bootstrap_workspace", {
      p_name: values.workspaceName,
    });
    if (rpcError) {
      setError(tr.auth.bootstrapError);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["workspace-membership"] });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-white p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {tr.auth.bootstrapTitle}
      </p>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="workspaceName">
          {tr.auth.workspaceNameLabel}
        </label>
        <Input id="workspaceName" {...register("workspaceName")} />
        {errors.workspaceName && (
          <p className="text-xs text-red-600">{errors.workspaceName.message}</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" variant="outline" disabled={isSubmitting} className="w-full">
        {tr.auth.bootstrapButton}
      </Button>
    </form>
  );
}
