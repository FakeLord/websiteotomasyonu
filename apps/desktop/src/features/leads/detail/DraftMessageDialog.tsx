import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import type { OutreachChannel } from "@lbf/core";
import { tr } from "../../../i18n/tr";
import { Button } from "../../../components/ui/button";
import { Input, Label, Select, Textarea } from "../../../components/ui/input";
import { Dialog, DialogContent } from "../../../components/ui/primitives";
import { generateFirstMessageDraft, saveDraftToConversation, type FirstMessageDraft } from "../../outreach/outreach";
import { draftReasonLabel } from "./lead-data";
import type { BusinessDetail } from "../types";

const OUTREACH_CHANNELS: OutreachChannel[] = ["EMAIL", "INSTAGRAM", "FACEBOOK", "WHATSAPP", "LINKEDIN", "TIKTOK"];

interface DraftMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  business: BusinessDetail;
  availableChannels: string[];
  recommendedChannel: OutreachChannel | null;
}

export function DraftMessageDialog({
  open,
  onOpenChange,
  workspaceId,
  business,
  availableChannels,
  recommendedChannel,
}: DraftMessageDialogProps) {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<OutreachChannel>(recommendedChannel ?? "EMAIL");
  const [draft, setDraft] = useState<FirstMessageDraft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const generate = useMutation({
    mutationFn: () => generateFirstMessageDraft(workspaceId, business, channel),
    onSuccess: (result) => {
      setDraft(result);
      setSubject(result.subject ?? "");
      setBody(result.ok ? result.body : "");
    },
  });

  const save = useMutation({
    mutationFn: () =>
      saveDraftToConversation(workspaceId, business.id, {
        channel,
        subject: channel === "EMAIL" ? subject : undefined,
        body,
        authorType: "AI",
      }),
    onSuccess: (conversationId) => {
      onOpenChange(false);
      navigate(`/conversations?c=${conversationId}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={tr.draft.dialogTitle} description={tr.draft.dialogDescription(business.name)} size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label>{tr.draft.channelLabel}</Label>
              <Select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value as OutreachChannel);
                  setDraft(null);
                }}
              >
                {OUTREACH_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {tr.channels[c]}
                    {c === recommendedChannel ? ` — ${tr.draft.recommended}` : ""}
                    {!availableChannels.includes(c) ? ` (${tr.draft.noContactForChannel})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="violet" disabled={generate.isPending || business.do_not_contact} onClick={() => generate.mutate()}>
              {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {generate.isPending ? tr.draft.generating : draft ? tr.draft.regenerate : tr.draft.generateButton}
            </Button>
          </div>

          {business.do_not_contact && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">{tr.routing.doNotContact}</p>}
          {generate.isError && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">
              {generate.error instanceof Error ? generate.error.message : tr.draft.error}
            </p>
          )}

          {draft && !draft.ok && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="mb-1 flex items-center gap-2 font-medium text-[#fbbf24]">
                <AlertTriangle className="size-4" />
                {tr.draft.rejectedTitle}
              </p>
              <p className="mb-2 text-xs text-muted">{tr.draft.rejectedHint}</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-[#fcd34d]">
                {draft.reasons.map((r) => (
                  <li key={r}>{draftReasonLabel(r)}</li>
                ))}
              </ul>
            </div>
          )}

          {draft?.ok && (
            <div className="space-y-3">
              {channel === "EMAIL" && (
                <div>
                  <Label>{tr.draft.subjectLabel}</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
              )}
              <div>
                <Label>{tr.draft.bodyLabel}</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} />
                <p className="mt-1 text-xs text-subtle">{tr.draft.editHint}</p>
              </div>
              {save.isError && <p className="text-sm text-[#f87171]">{save.error instanceof Error ? save.error.message : tr.common.error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => void navigator.clipboard.writeText(body)}>
                  {tr.draft.copyButton}
                </Button>
                <Button disabled={!body.trim() || save.isPending} onClick={() => save.mutate()}>
                  {tr.draft.saveToConversation}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
