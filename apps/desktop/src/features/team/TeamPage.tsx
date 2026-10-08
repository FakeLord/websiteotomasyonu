import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, RotateCw, Trash2, UserMinus, UserPlus } from "lucide-react";
import { adminInviteInputSchema, type AdminInviteInput, type WorkspaceRole } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useWorkspaceMembers } from "../../lib/use-workspace-members";
import { useAuthStore } from "../../lib/auth-store";
import { functionErrorMessage } from "../../lib/function-error";
import { formatDate, formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Select } from "../../components/ui/input";
import { Card, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar, PageHeader, Table, Td, Th, Tr } from "../../components/ui/data-display";
import { Dialog, DialogContent } from "../../components/ui/primitives";

const ROLES: WorkspaceRole[] = ["ADMIN", "MEMBER", "AGENT"];
const ROLE_TONES = { ADMIN: "violet", MEMBER: "blue", AGENT: "cyan" } as const;

interface InviteRow {
  id: string;
  email: string;
  role: WorkspaceRole;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export function TeamPage() {
  const queryClient = useQueryClient();
  const membership = useWorkspaceMembership().data;
  const workspaceId = membership?.workspaceId;
  const isAdmin = membership?.role === "ADMIN";
  const myId = useAuthStore((state) => state.session?.user.id);
  const { members } = useWorkspaceMembers();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const invites = useQuery({
    queryKey: ["workspace-invites", workspaceId],
    enabled: !!workspaceId && isAdmin,
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error: qError } = await supabase
        .from("workspace_invites")
        .select("id, email, role, expires_at, accepted_at, created_at")
        .eq("workspace_id", workspaceId as string)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (qError) throw qError;
      return (data ?? []) as InviteRow[];
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      const { error: uError } = await supabase
        .from("workspace_members")
        .update({ role })
        .eq("workspace_id", workspaceId as string)
        .eq("user_id", userId);
      if (uError) throw uError;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] }),
    onError: (err) => setError(err instanceof Error ? err.message : tr.common.error),
  });

  const removeMember = useMutation({
    mutationFn: async (member: { user_id: string; name: string }) => {
      if (!window.confirm(tr.team.removeConfirm(member.name))) return null;
      const { data, error: rError } = await supabase.rpc("remove_workspace_member", {
        p_workspace_id: workspaceId as string,
        p_user_id: member.user_id,
      });
      if (rError) throw new Error(rError.message);
      return { name: member.name, ...(data as { unassignedBusinesses: number; reopenedHandoffs: number }) };
    },
    onSuccess: (result) => {
      if (!result) return;
      setError(null);
      setNotice(tr.team.removeDone(result.name, result.unassignedBusinesses, result.reopenedHandoffs));
      for (const queryKey of [["workspace-members", workspaceId], ["businesses"], ["shell-counters", workspaceId]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : tr.common.error),
  });

  const resendInvite = useMutation({
    mutationFn: async (invite: InviteRow) => {
      const { data, error: fnError } = await supabase.functions.invoke("admin-invite", {
        body: { workspaceId, email: invite.email, role: invite.role },
      });
      if (fnError) throw new Error(await functionErrorMessage(fnError, tr.team.inviteError));
      // Yeni davet oluştuktan sonra eskisi iptal edilir (aynı e-postaya iki geçerli kod kalmasın).
      const { error: dError } = await supabase.from("workspace_invites").delete().eq("id", invite.id);
      if (dError) throw dError;
      return (data as { inviteCode: string }).inviteCode;
    },
    onSuccess: (code) => {
      setError(null);
      setInviteCode(code);
      setInviteOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : tr.common.error),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error: dError } = await supabase.from("workspace_invites").delete().eq("id", id);
      if (dError) throw dError;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdminInviteInput>({ resolver: zodResolver(adminInviteInputSchema), defaultValues: { role: "MEMBER" } });

  const onInvite = async (values: AdminInviteInput) => {
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("admin-invite", { body: { workspaceId, ...values } });
    if (fnError) {
      setError(await functionErrorMessage(fnError, tr.team.inviteError));
      return;
    }
    setInviteCode((data as { inviteCode: string }).inviteCode);
    reset({ email: "", role: "MEMBER" });
    void queryClient.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr.team.title}
        description={tr.team.description}
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                setInviteCode(null);
                setInviteOpen(true);
              }}
            >
              <UserPlus />
              {tr.team.invite}
            </Button>
          )
        }
      />
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">{error}</p>}
      {notice && (
        <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          {notice}
        </p>
      )}

      <Card>
        <CardHeader title={tr.team.members(members.length)} />
        <Table>
          <thead>
            <tr>
              <Th>{tr.team.member}</Th>
              <Th>{tr.team.role}</Th>
              <Th>{tr.team.assignedLeads}</Th>
              <Th>{tr.team.lastSeen}</Th>
              <Th>{tr.team.joined}</Th>
              {isAdmin && (
                <Th className="w-10">
                  <span className="sr-only">{tr.common.actions}</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <Tr key={member.user_id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} size="md" />
                    <div>
                      <p className="font-medium text-text">
                        {member.name}
                        {member.user_id === myId && <span className="ml-2 text-xs text-muted">({tr.team.you})</span>}
                      </p>
                      <p className="text-xs text-muted">{member.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  {isAdmin && member.user_id !== myId ? (
                    <Select
                      className="h-8 w-36 text-xs"
                      value={member.role}
                      onChange={(e) => roleMutation.mutate({ userId: member.user_id, role: e.target.value as WorkspaceRole })}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {tr.team.roles[role]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={ROLE_TONES[member.role]}>{tr.team.roles[member.role]}</Badge>
                  )}
                </Td>
                <Td className="tabular-nums">{member.assigned_count}</Td>
                <Td className="text-muted">{member.last_sign_in_at ? formatRelative(member.last_sign_in_at) : "—"}</Td>
                <Td className="text-muted">{formatDate(member.joined_at)}</Td>
                {isAdmin && (
                  <Td>
                    {member.user_id !== myId && (
                      <button
                        type="button"
                        disabled={removeMember.isPending}
                        onClick={() => removeMember.mutate(member)}
                        className="rounded-md p-1.5 text-muted hover:bg-danger/15 hover:text-danger disabled:opacity-40"
                        aria-label={tr.team.removeMember}
                        title={tr.team.removeMember}
                      >
                        <UserMinus className="size-4" />
                      </button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {isAdmin && (invites.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader title={tr.team.pendingInvites} icon={<Mail className="size-4 text-warning" />} />
          <Table>
            <thead>
              <tr>
                <Th>{tr.auth.email}</Th>
                <Th>{tr.team.role}</Th>
                <Th>{tr.team.expires}</Th>
                <Th className="w-20">
                  <span className="sr-only">{tr.common.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {invites.data?.map((invite) => {
                const expired = new Date(invite.expires_at).getTime() < Date.now();
                return (
                  <Tr key={invite.id}>
                    <Td>{invite.email}</Td>
                    <Td>
                      <Badge tone={ROLE_TONES[invite.role]}>{tr.team.roles[invite.role]}</Badge>
                    </Td>
                    <Td className={expired ? "text-[#f87171]" : "text-muted"}>{expired ? tr.team.expired : formatDate(invite.expires_at)}</Td>
                    <Td className="whitespace-nowrap">
                      <button
                        type="button"
                        disabled={resendInvite.isPending}
                        onClick={() => resendInvite.mutate(invite)}
                        className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-text disabled:opacity-40"
                        aria-label={tr.team.resend}
                        title={tr.team.resendHint}
                      >
                        <RotateCw className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeInvite.mutate(invite.id)}
                        className="rounded-md p-1.5 text-muted hover:bg-danger/15 hover:text-danger"
                        aria-label={tr.team.revoke}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {!isAdmin && <p className="text-sm text-muted">{tr.team.adminOnlyInvites}</p>}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent title={tr.team.inviteTitle} description={tr.team.inviteDescription}>
          {inviteCode ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">{tr.team.inviteCodeHint}</p>
              <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-3">
                <code className="flex-1 font-mono text-sm break-all text-text">{inviteCode}</code>
                <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(inviteCode)}>
                  <Copy />
                  {tr.draft.copyButton}
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setInviteOpen(false)}>{tr.common.close}</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onInvite)} className="space-y-3">
              <div>
                <Label htmlFor="invite-email">{tr.auth.email}</Label>
                <Input id="invite-email" type="email" {...register("email")} />
                {errors.email && <p className="mt-1 text-xs text-[#f87171]">{errors.email.message}</p>}
              </div>
              <div>
                <Label htmlFor="invite-role">{tr.team.role}</Label>
                <Select id="invite-role" {...register("role")}>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {tr.team.roles[role]}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-subtle">{tr.team.roleHint}</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {tr.team.sendInvite}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
