import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminInviteInputSchema, type AdminInviteInput, type WorkspaceRole } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

interface TeamMemberRow {
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

export function TeamPage() {
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;
  const isAdmin = membership.data?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ["team-members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<TeamMemberRow[]> => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id, role, created_at, profiles(full_name)")
        .eq("workspace_id", workspaceId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TeamMemberRow[];
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      const { error } = await supabase
        .from("workspace_members")
        .update({ role })
        .eq("workspace_id", workspaceId as string)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team-members", workspaceId] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdminInviteInput>({ resolver: zodResolver(adminInviteInputSchema) });

  const onInvite = async (values: AdminInviteInput) => {
    setLastInviteCode(null);
    const { data, error } = await supabase.functions.invoke("admin-invite", {
      body: { workspaceId, ...values },
    });
    if (error) return;
    setLastInviteCode((data as { inviteCode: string }).inviteCode);
    reset();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{tr.nav.team}</h1>

      {isAdmin && (
        <form
          onSubmit={handleSubmit(onInvite)}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="invite-email">
              {tr.auth.email}
            </label>
            <Input id="invite-email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="invite-role">
              Rol
            </label>
            <select
              id="invite-role"
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              {...register("role")}
            >
              <option value="MEMBER">MEMBER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="AGENT">AGENT</option>
            </select>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            Davet gönder
          </Button>
        </form>
      )}

      {lastInviteCode && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Davet kodu (yalnızca bir kez gösterilir, davetliye elden/mesajla iletin):{" "}
          <code className="font-mono font-semibold">{lastInviteCode}</code>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Ad</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Katılma</th>
            </tr>
          </thead>
          <tbody>
            {membersQuery.data?.map((member) => (
              <tr key={member.user_id} className="border-t border-slate-100">
                <td className="px-4 py-2">{member.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-2">
                  {isAdmin ? (
                    <select
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm"
                      value={member.role}
                      onChange={(e) =>
                        roleMutation.mutate({
                          userId: member.user_id,
                          role: e.target.value as WorkspaceRole,
                        })
                      }
                    >
                      <option value="MEMBER">MEMBER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="AGENT">AGENT</option>
                    </select>
                  ) : (
                    member.role
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(member.created_at).toLocaleDateString("tr-TR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
