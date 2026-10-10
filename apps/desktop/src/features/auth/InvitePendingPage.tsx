import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { acceptInviteInputSchema, type AcceptInviteInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { AuthShell, FieldError } from "./AuthShell";

const bootstrapInputSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
});
type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

export function InvitePendingPage() {
  return (
    <AuthShell title={tr.auth.invitePendingTitle} description={tr.auth.invitePendingDescription}>
      <div className="space-y-5">
        <AcceptInviteForm />
        <div className="h-px bg-border" />
        <BootstrapWorkspaceForm />
        <div className="text-center">
          <button type="button" onClick={() => void supabase.auth.signOut()} className="text-sm text-muted hover:text-text">
            {tr.auth.signOut}
          </button>
        </div>
      </div>
    </AuthShell>
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
    const { error: rpcError } = await supabase.rpc("accept_invite", { p_token: values.inviteCode });
    if (rpcError) {
      setError(tr.auth.acceptInviteError);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["workspace-membership"] });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <Label htmlFor="inviteCode">{tr.auth.inviteCodeLabel}</Label>
        <Input id="inviteCode" {...register("inviteCode")} />
        <FieldError message={errors.inviteCode?.message} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
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
    const { error: rpcError } = await supabase.rpc("bootstrap_workspace", { p_name: values.workspaceName });
    if (rpcError) {
      setError(tr.auth.bootstrapError);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["workspace-membership"] });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <p className="text-sm font-medium text-text">{tr.auth.bootstrapTitle}</p>
      <div>
        <Label htmlFor="workspaceName">{tr.auth.workspaceNameLabel}</Label>
        <Input id="workspaceName" {...register("workspaceName")} />
        <FieldError message={errors.workspaceName?.message} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="outline" disabled={isSubmitting} className="w-full">
        {tr.auth.bootstrapButton}
      </Button>
    </form>
  );
}
