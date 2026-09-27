import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bot, Cpu, KeyRound, MapPinned } from "lucide-react";
import { DEFAULT_DAILY_LIMIT, PROVIDER_DEFAULTS, normalizeAiConfig, type AiChainConfig } from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { functionErrorMessage } from "../../lib/function-error";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { Card, CardBody, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/primitives";

export type SecretName = "google_places_api_key" | "nvidia_api_key" | "openai_api_key";

interface SecretStatus {
  configured: boolean;
  last4?: string;
}

export function useSecretStatus(workspaceId: string, name: SecretName) {
  return useQuery({
    queryKey: ["secret-status", workspaceId, name],
    queryFn: async (): Promise<SecretStatus> => {
      const { data, error } = await supabase.functions.invoke("admin-secrets", { body: { workspaceId, name, action: "status" } });
      if (error) throw new Error(await functionErrorMessage(error, tr.settings.saveError));
      return data as SecretStatus;
    },
  });
}

export function SecretInput({ workspaceId, name }: { workspaceId: string; name: SecretName }) {
  const queryClient = useQueryClient();
  const status = useSecretStatus(workspaceId, name);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("admin-secrets", { body: { workspaceId, name, action: "set", value: value.trim() } });
      if (error) throw new Error(await functionErrorMessage(error, tr.settings.saveError));
    },
    onSuccess: () => {
      setValue("");
      setMessage({ ok: true, text: tr.settings.saveSuccess });
      void queryClient.invalidateQueries({ queryKey: ["secret-status", workspaceId, name] });
    },
    onError: (err) => setMessage({ ok: false, text: err instanceof Error ? err.message : tr.settings.saveError }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">{tr.settings.apiKey}</Label>
        {status.data?.configured ? (
          <Badge tone="green">
            {tr.settings.keyConfigured} · •••• {status.data.last4}
          </Badge>
        ) : (
          <Badge tone="gray">{tr.settings.keyNotConfigured}</Badge>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          if (value.trim()) save.mutate();
        }}
      >
        <Input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={tr.settings.keyPlaceholder} />
        <Button type="submit" disabled={save.isPending || !value.trim()}>
          {tr.settings.saveButton}
        </Button>
      </form>
      {message && <p className={`text-xs ${message.ok ? "text-[#4ade80]" : "text-[#f87171]"}`}>{message.text}</p>}
    </div>
  );
}

const PROVIDER_META: Record<string, { title: string; icon: typeof Bot; color: string; description: string }> = {
  openai: { title: "OpenAI", icon: Bot, color: "#22c55e", description: tr.settings.openaiDescription },
  nvidia: { title: "NVIDIA", icon: Cpu, color: "#84cc16", description: tr.settings.nvidiaDescription },
};

interface UsageRow {
  provider: string;
  status: string;
  count: number;
}

export function AiProvidersSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<AiChainConfig | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const settings = useQuery({
    queryKey: ["ai-config", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workspace_settings").select("ai_config").eq("workspace_id", workspaceId).single();
      if (error) throw error;
      return normalizeAiConfig(data.ai_config);
    },
  });

  const usage = useQuery({
    queryKey: ["ai-usage-24h", workspaceId],
    queryFn: async (): Promise<UsageRow[]> => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from("ai_runs").select("provider, status").eq("workspace_id", workspaceId).gte("created_at", since).limit(2000);
      if (error) throw error;
      const counts = new Map<string, UsageRow>();
      for (const row of (data ?? []) as Array<{ provider: string; status: string }>) {
        const key = `${row.provider}|${row.status}`;
        const current = counts.get(key) ?? { provider: row.provider, status: row.status, count: 0 };
        current.count += 1;
        counts.set(key, current);
      }
      return [...counts.values()];
    },
  });

  useEffect(() => {
    if (settings.data && !config) setConfig(settings.data);
  }, [settings.data, config]);

  const save = useMutation({
    mutationFn: async () => {
      if (!config) return;
      const payload = {
        dailyLimit: config.dailyLimit,
        providers: config.providers.map((p) => ({
          id: p.id,
          model: p.model,
          enabled: p.enabled,
          ...(Object.keys(p.routes).length ? { routes: p.routes } : {}),
          ...(PROVIDER_DEFAULTS[p.id] ? {} : { baseUrl: p.baseUrl }),
        })),
      };
      const { error } = await supabase.from("workspace_settings").update({ ai_config: payload }).eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage({ ok: true, text: tr.settings.saveSuccess });
      void queryClient.invalidateQueries({ queryKey: ["ai-config", workspaceId] });
    },
    onError: (err) => setMessage({ ok: false, text: err instanceof Error ? err.message : tr.settings.saveError }),
  });

  if (!config) return <p className="text-sm text-muted">{tr.common.loading}</p>;

  const move = (index: number, delta: number) => {
    const providers = [...config.providers];
    const target = index + delta;
    if (target < 0 || target >= providers.length) return;
    [providers[index], providers[target]] = [providers[target]!, providers[index]!];
    setConfig({ ...config, providers });
  };

  const update = (index: number, patch: Partial<AiChainConfig["providers"][number]>) =>
    setConfig({ ...config, providers: config.providers.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{tr.settings.aiChainDescription}</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {config.providers.map((provider, index) => {
          const meta = PROVIDER_META[provider.id] ?? { title: provider.id, icon: Bot, color: "#8b95b4", description: provider.baseUrl };
          const Icon = meta.icon;
          const providerUsage = (usage.data ?? []).filter((u) => u.provider === provider.id);
          return (
            <Card key={provider.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
                      <Icon className="size-4" />
                    </span>
                    {meta.title}
                    <Badge tone="blue">{tr.settings.priority(index + 1)}</Badge>
                  </span>
                }
                action={
                  <div className="flex items-center gap-1">
                    <Button size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={tr.settings.moveUp}>
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === config.providers.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={tr.settings.moveDown}
                    >
                      <ArrowDown />
                    </Button>
                    <Switch checked={provider.enabled} onCheckedChange={(v) => update(index, { enabled: v })} aria-label={tr.settings.enabled} />
                  </div>
                }
              />
              <CardBody className="space-y-4">
                <p className="text-sm text-muted">{meta.description}</p>
                {(provider.id === "openai" || provider.id === "nvidia") && (
                  <SecretInput workspaceId={workspaceId} name={`${provider.id}_api_key` as SecretName} />
                )}
                <div>
                  <Label>{tr.settings.model}</Label>
                  <Input value={provider.model} onChange={(e) => update(index, { model: e.target.value })} />
                  <p className="mt-1 text-xs text-subtle">{tr.settings.defaultModel(PROVIDER_DEFAULTS[provider.id]?.model ?? "—")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {providerUsage.length === 0 ? (
                    <span className="text-xs text-subtle">{tr.settings.noUsage}</span>
                  ) : (
                    providerUsage.map((u) => (
                      <Badge key={u.status} tone={u.status === "OK" ? "green" : "red"}>
                        {tr.reports.aiStatus[u.status as keyof typeof tr.reports.aiStatus] ?? u.status}: {u.count}
                      </Badge>
                    ))
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4 pt-4">
          <div>
            <Label>{tr.settings.dailyLimit}</Label>
            <Input
              type="number"
              min={1}
              className="w-32"
              value={config.dailyLimit}
              onChange={(e) => setConfig({ ...config, dailyLimit: Number(e.target.value) || DEFAULT_DAILY_LIMIT })}
            />
          </div>
          <p className="flex-1 text-xs text-subtle">{tr.settings.dailyLimitHint}</p>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {tr.settings.saveAiConfig}
          </Button>
        </CardBody>
        {message && <p className={`px-4 pb-4 text-xs ${message.ok ? "text-[#4ade80]" : "text-[#f87171]"}`}>{message.text}</p>}
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <MapPinned className="size-4" />
              </span>
              Google Places API
            </span>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">{tr.settings.placesDescription}</p>
          <SecretInput workspaceId={workspaceId} name="google_places_api_key" />
        </CardBody>
      </Card>

      <p className="flex items-center gap-2 text-xs text-subtle">
        <KeyRound className="size-3.5" />
        {tr.settings.vaultNote}
      </p>
    </div>
  );
}
