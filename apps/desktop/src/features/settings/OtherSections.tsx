import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, KeyRound, Minus, Plus, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { setPasswordInputSchema, type SetPasswordInput } from "@lbf/contracts";
import { ChannelIcon } from "../../components/domain/channel-icon";
import { supabase } from "../../lib/supabase-client";
import { useMyProfile } from "../../lib/use-shell-data";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { Card, CardBody, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { KeyValue } from "../../components/ui/data-display";
import { Switch } from "../../components/ui/primitives";

/* ---------- Genel ---------- */

/** Oturum açık kullanıcının şifresini değiştirir (en az 12 karakter; kural davet/sıfırlama ekranıyla aynıdır). */
function ChangePasswordCard() {
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordInput>({ resolver: zodResolver(setPasswordInputSchema) });

  const onSubmit = async (values: SetPasswordInput) => {
    setDone(false);
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setServerError(error.message || tr.settings.password.error);
      return;
    }
    reset({ password: "", confirm: "" });
    setDone(true);
  };

  return (
    <Card>
      <CardHeader title={tr.settings.password.title} icon={<KeyRound className="size-4 text-primary" />} />
      <CardBody>
        <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Label htmlFor="new-password">{tr.auth.newPassword}</Label>
            <Input id="new-password" type="password" autoComplete="new-password" {...register("password")} />
            {errors.password && <p className="mt-1 text-xs text-danger">{tr.auth.passwordTooShort}</p>}
          </div>
          <div>
            <Label htmlFor="confirm-password">{tr.auth.confirmPassword}</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" {...register("confirm")} />
            {errors.confirm && <p className="mt-1 text-xs text-danger">{tr.auth.passwordMismatch}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {tr.settings.password.submit}
            </Button>
            {done && <span className="text-xs text-success">{tr.settings.password.success}</span>}
          </div>
          {serverError && <p className="text-xs text-danger">{serverError}</p>}
        </form>
      </CardBody>
    </Card>
  );
}

/** Yönetici çalışma alanı adını değiştirir (RPC; aktivite günlüğüne düşer). Diğer üyeler adı salt okunur görür. */
function WorkspaceNameRow({ workspaceId, name, canEdit }: { workspaceId: string; name: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(name);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setDraft(name), [name]);

  const rename = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("rename_workspace", { p_workspace_id: workspaceId, p_name: draft });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setMessage({ ok: true, text: tr.settings.saveSuccess });
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (error: Error) => setMessage({ ok: false, text: error.message }),
  });

  if (!canEdit) return <KeyValue label={tr.settings.workspaceName}>{name || "—"}</KeyValue>;
  const unchanged = draft.trim() === name;

  return (
    <div className="space-y-2 py-2">
      <Label>{tr.settings.workspaceRename}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage(null);
          }}
          maxLength={80}
        />
        <Button disabled={unchanged || draft.trim().length < 2 || rename.isPending} onClick={() => rename.mutate()}>
          {tr.settings.saveButton}
        </Button>
      </div>
      <p className="text-xs text-subtle">{tr.settings.workspaceRenameHint}</p>
      {message && <p className={"text-xs " + (message.ok ? "text-success" : "text-danger")}>{message.text}</p>}
    </div>
  );
}

export function GeneralSection() {
  const queryClient = useQueryClient();
  const { userId, email } = useMyProfile();
  const membership = useWorkspaceMembership().data;
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  const profile = useQuery({
    queryKey: ["my-profile-edit", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", userId as string).single();
      if (error) throw error;
      return data as { full_name: string | null };
    },
  });

  const workspace = useQuery({
    queryKey: ["workspace", membership?.workspaceId],
    enabled: !!membership?.workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("name, created_at").eq("id", membership?.workspaceId as string).single();
      if (error) throw error;
      return data as { name: string; created_at: string };
    },
  });

  useEffect(() => {
    const current = profile.data?.full_name ?? "";
    setName(current.includes("@") ? "" : current);
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", userId as string);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
  });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title={tr.settings.profile} icon={<UserRound className="size-4 text-primary" />} />
        <CardBody className="space-y-3">
          <div>
            <Label>{tr.settings.fullName}</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              placeholder={tr.settings.fullNamePlaceholder}
            />
            <p className="mt-1 text-xs text-subtle">{tr.settings.fullNameHint}</p>
          </div>
          <KeyValue label={tr.auth.email}>{email}</KeyValue>
          <div className="flex items-center gap-3">
            <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
              {tr.settings.saveButton}
            </Button>
            {saved && <span className="text-xs text-success">{tr.settings.saveSuccess}</span>}
          </div>
        </CardBody>
      </Card>
      <ChangePasswordCard />
      <Card>
        <CardHeader title={tr.settings.workspace} />
        <CardBody className="divide-y divide-border/60">
          {membership && <WorkspaceNameRow workspaceId={membership.workspaceId} name={workspace.data?.name ?? ""} canEdit={membership.role === "ADMIN"} />}
          <KeyValue label={tr.team.role}>{membership ? tr.team.roles[membership.role] : "—"}</KeyValue>
          <KeyValue label={tr.settings.version}>v{__APP_VERSION__}</KeyValue>
        </CardBody>
      </Card>
    </div>
  );
}

/* ---------- Follow-up politikası ---------- */

interface FollowupPolicy {
  steps: Array<{ afterDays: number }>;
  maxFollowUps: number;
  sendWindow: { days: number[]; from: string; to: string; tz: string };
  skipHolidays: boolean;
  afterSequence: string;
  secondChannelAfterDays: number | null;
}

export function FollowupPolicySection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [policy, setPolicy] = useState<FollowupPolicy | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const query = useQuery({
    queryKey: ["followup-policy-edit", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workspace_settings").select("followup_policy").eq("workspace_id", workspaceId).single();
      if (error) throw error;
      return data.followup_policy as FollowupPolicy;
    },
  });

  useEffect(() => {
    if (query.data && !policy) setPolicy(query.data);
  }, [query.data, policy]);

  const save = useMutation({
    mutationFn: async () => {
      if (!policy) return;
      const normalized = { ...policy, maxFollowUps: policy.steps.length };
      const { error } = await supabase.from("workspace_settings").update({ followup_policy: normalized }).eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage({ ok: true, text: tr.settings.saveSuccess });
      void queryClient.invalidateQueries({ queryKey: ["followup-policy"] });
    },
    onError: (err) => setMessage({ ok: false, text: err instanceof Error ? err.message : tr.settings.saveError }),
  });

  if (!policy) return <p className="text-sm text-muted">{tr.common.loading}</p>;

  return (
    <Card>
      <CardHeader title={tr.settings.followupTitle} />
      <CardBody className="space-y-4">
        <p className="text-sm text-muted">{tr.settings.followupDescription}</p>
        <div className="space-y-2">
          {policy.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
              <span className="w-28">{tr.settings.followupStep(i + 1)}</span>
              <Input
                type="number"
                min={1}
                max={60}
                className="h-8 w-20"
                value={step.afterDays}
                onChange={(e) =>
                  setPolicy({ ...policy, steps: policy.steps.map((s, j) => (j === i ? { afterDays: Math.max(1, Number(e.target.value)) } : s)) })
                }
              />
              <span className="text-muted">{tr.settings.daysAfterPrevious}</span>
              {policy.steps.length > 1 && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setPolicy({ ...policy, steps: policy.steps.filter((_, j) => j !== i) })}
                  aria-label={tr.common.delete}
                >
                  <Minus />
                </Button>
              )}
            </div>
          ))}
          {policy.steps.length < 5 && (
            <Button size="sm" variant="outline" onClick={() => setPolicy({ ...policy, steps: [...policy.steps, { afterDays: 5 }] })}>
              <Plus />
              {tr.settings.addStep}
            </Button>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm text-text">
          <Switch checked={policy.skipHolidays} onCheckedChange={(v) => setPolicy({ ...policy, skipHolidays: v })} />
          {tr.settings.skipHolidays}
        </label>
        <p className="text-xs text-subtle">{tr.settings.sendWindowNote(policy.sendWindow.from, policy.sendWindow.to)}</p>
        <div className="flex items-center gap-3">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {tr.settings.saveButton}
          </Button>
          {message && <span className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</span>}
        </div>
      </CardBody>
    </Card>
  );
}

/* ---------- Entegrasyonlar ---------- */

export function IntegrationsSection() {
  const cards = [
    { key: "whatsapp", channel: "WHATSAPP", title: "WhatsApp", status: tr.settings.integrations.whatsappStatus, body: tr.settings.integrations.whatsappBody },
    { key: "meta", channel: "INSTAGRAM", title: "Instagram / Facebook", status: tr.settings.integrations.metaStatus, body: tr.settings.integrations.metaBody },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ChannelIcon channel={card.channel} boxed />
                {card.title}
              </span>
            }
            action={<Badge tone="navy">{card.status}</Badge>}
          />
          <CardBody>
            <p className="text-sm text-muted">{card.body}</p>
          </CardBody>
        </Card>
      ))}
      <Card className="xl:col-span-2">
        <CardBody className="flex items-start gap-3 pt-4 text-sm text-muted">
          <ExternalLink className="mt-0.5 size-4 shrink-0" />
          {tr.settings.integrations.policyNote}
        </CardBody>
      </Card>
    </div>
  );
}
