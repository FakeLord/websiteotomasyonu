import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { ScoringSettingsSection } from "./ScoringSettingsSection";
import { EmailAccountSection } from "./EmailAccountSection";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

type SecretName = "google_places_api_key" | "nvidia_api_key";

interface SecretStatus {
  configured: boolean;
  last4?: string;
}

export function SettingsPage() {
  const membership = useWorkspaceMembership();
  const workspaceId = membership.data?.workspaceId;
  const isAdmin = membership.data?.role === "ADMIN";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">{tr.nav.settings}</h1>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-medium text-slate-900">{tr.settings.apiKeysTitle}</h2>
          <p className="text-sm text-slate-500">{tr.settings.apiKeysDescription}</p>
        </div>

        {!isAdmin ? (
          <p className="text-sm text-slate-400">{tr.settings.adminOnly}</p>
        ) : (
          workspaceId && (
            <div className="space-y-4">
              <SecretField workspaceId={workspaceId} name="google_places_api_key" label={tr.settings.googlePlacesLabel} />
              <SecretField workspaceId={workspaceId} name="nvidia_api_key" label={tr.settings.nvidiaLabel} />
            </div>
          )
        )}

        {isAdmin && workspaceId && <ScoringSettingsSection workspaceId={workspaceId} />}
        <EmailAccountSection />
      </div>
    </div>
  );
}

function SecretField({ workspaceId, name, label }: { workspaceId: string; name: SecretName; label: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const statusQuery = useQuery({
    queryKey: ["secret-status", workspaceId, name],
    queryFn: async (): Promise<SecretStatus> => {
      const { data, error } = await supabase.functions.invoke("admin-secrets", {
        body: { workspaceId, name, action: "status" },
      });
      if (error) throw error;
      return data as SecretStatus;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("admin-secrets", {
        body: { workspaceId, name, action: "set", value },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setValue("");
      setMessage({ kind: "success", text: tr.settings.saveSuccess });
      void queryClient.invalidateQueries({ queryKey: ["secret-status", workspaceId, name] });
    },
    onError: (err) => {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : tr.settings.saveError });
    },
  });

  return (
    <div className="space-y-2 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className="text-xs text-slate-500">
          {statusQuery.data?.configured
            ? `${tr.settings.keyConfigured} (•••• ${statusQuery.data.last4})`
            : tr.settings.keyNotConfigured}
        </span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          if (!value.trim()) return;
          saveMutation.mutate();
        }}
      >
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={tr.settings.keyPlaceholder}
          className="max-w-sm"
        />
        <Button type="submit" disabled={saveMutation.isPending || !value.trim()}>
          {tr.settings.saveButton}
        </Button>
      </form>
      {message && (
        <p className={`text-xs ${message.kind === "success" ? "text-emerald-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
