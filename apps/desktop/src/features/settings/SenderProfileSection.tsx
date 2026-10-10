import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Label, Textarea } from "../../components/ui/input";

interface SenderProfile {
  legalName?: string;
  postalAddress?: string;
}

/** Gönderen kimliği (ADR 0019): e-posta alt bilgisinin kaynağı; yalnızca yönetici düzenler. */
export function SenderProfileSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [legalName, setLegalName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const query = useQuery({
    queryKey: ["sender-profile", workspaceId],
    queryFn: async (): Promise<SenderProfile> => {
      const { data, error } = await supabase
        .from("workspace_settings")
        .select("sender_profile")
        .eq("workspace_id", workspaceId)
        .single();
      if (error) throw error;
      return (data?.sender_profile ?? {}) as SenderProfile;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    setLegalName(query.data.legalName ?? "");
    setPostalAddress(query.data.postalAddress ?? "");
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workspace_settings")
        .update({ sender_profile: { legalName: legalName.trim(), postalAddress: postalAddress.trim() } })
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage({ tone: "ok", text: tr.senderProfile.saved });
      void queryClient.invalidateQueries({ queryKey: ["sender-profile", workspaceId] });
    },
    onError: (err) => setMessage({ tone: "error", text: err instanceof Error ? err.message : tr.senderProfile.error }),
  });

  return (
    <Card className="mt-5 space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-text">{tr.senderProfile.title}</h2>
        <p className="text-sm text-muted">{tr.senderProfile.description}</p>
      </div>
      <div className="space-y-3">
        <div>
          <Label>{tr.senderProfile.legalNameLabel}</Label>
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={120} />
        </div>
        <div>
          <Label>{tr.senderProfile.postalAddressLabel}</Label>
          <Textarea value={postalAddress} onChange={(e) => setPostalAddress(e.target.value)} rows={3} maxLength={300} />
          <p className="mt-1 text-xs text-muted">{tr.senderProfile.postalAddressHint}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={save.isPending || query.isLoading} onClick={() => save.mutate()}>
          {tr.senderProfile.save}
        </Button>
        {message && (
          <span role="status" className={message.tone === "ok" ? "text-xs text-muted" : "text-xs text-[#f87171]"}>
            {message.text}
          </span>
        )}
      </div>
    </Card>
  );
}
