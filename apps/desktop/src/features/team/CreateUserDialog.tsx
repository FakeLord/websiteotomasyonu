import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import type { WorkspaceRole } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { functionErrorMessage } from "../../lib/function-error";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Select } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";

const ROLES: WorkspaceRole[] = ["ADMIN", "MEMBER", "AGENT"];

interface Created {
  email: string;
  /** Yalnızca sistem şifre ürettiyse dolu; yönetici kendi şifresini verdiyse boştur. */
  password: string | null;
}

/**
 * Davet ve kabul kodu olmadan ekip üyesi oluşturur (`admin-create-user`): hesap hemen aktif olur, üye e-posta ve şifreyle
 * giriş yapar. Üretilen şifre yalnızca bu pencerede bir kez gösterilir.
 */
export function CreateUserDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("MEMBER");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error: fnError } = await supabase.functions.invoke("admin-create-user", {
        body: { workspaceId, email: email.trim(), role, fullName: fullName.trim() || undefined, password: password || undefined },
      });
      if (fnError) throw new Error(await functionErrorMessage(fnError, tr.team.createUser.error));
      return data as { email: string; password?: string };
    },
    onSuccess: (data) => {
      setCreated({ email: data.email, password: data.password ?? null });
      void queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : tr.team.createUser.error),
  });

  const reset = () => {
    setEmail("");
    setFullName("");
    setRole("MEMBER");
    setPassword("");
    setError(null);
    setCreated(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={tr.team.createUser.title} description={tr.team.createUser.description}>
        {created ? (
          <div className="space-y-3">
            <p className="text-sm text-text">{tr.team.createUser.done(created.email)}</p>
            <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
              <p>
                <span className="text-muted">{tr.auth.email}: </span>
                <span className="font-medium text-text">{created.email}</span>
              </p>
              {created.password ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted">{tr.team.createUser.passwordLabel}: </span>
                  <code className="flex-1 font-mono text-sm break-all text-text">{created.password}</code>
                  <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(created.password as string)}>
                    <Copy />
                    {tr.draft.copyButton}
                  </Button>
                </div>
              ) : (
                <p className="text-muted">{tr.team.createUser.ownPassword}</p>
              )}
            </div>
            <p className="text-xs text-subtle">{tr.team.createUser.shareHint}</p>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>{tr.common.close}</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              create.mutate();
            }}
          >
            <div>
              <Label htmlFor="cu-name">{tr.team.createUser.fullName}</Label>
              <Input id="cu-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="cu-email">{tr.auth.email}</Label>
              <Input id="cu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cu-role">{tr.team.role}</Label>
              <Select id="cu-role" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tr.team.roles[r]}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-subtle">{tr.team.roleHint}</p>
            </div>
            <div>
              <Label htmlFor="cu-password">{tr.team.createUser.passwordOptional}</Label>
              <Input
                id="cu-password"
                type="text"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr.team.createUser.passwordPlaceholder}
              />
              <p className="mt-1 text-xs text-subtle">{tr.team.createUser.passwordHint}</p>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tr.common.cancel}
              </Button>
              <Button type="submit" disabled={create.isPending || !email.trim()}>
                {create.isPending && <Loader2 className="animate-spin" />}
                {tr.team.createUser.submit}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
