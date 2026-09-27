import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Minus, Plus, UserRound } from "lucide-react";
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
            {saved && <span className="text-xs text-[#4ade80]">{tr.settings.saveSuccess}</span>}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={tr.settings.workspace} />
        <CardBody className="divide-y divide-border/60">
          <KeyValue label={tr.settings.workspaceName}>{workspace.data?.name ?? "—"}</KeyValue>
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
          {message && <span className={`text-xs ${message.ok ? "text-[#4ade80]" : "text-[#f87171]"}`}>{message.text}</span>}
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
            action={<Badge tone="violet">{card.status}</Badge>}
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
