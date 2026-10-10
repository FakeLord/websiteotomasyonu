import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { OUTREACH_LANGUAGES, type OutreachLanguage } from "@lbf/core";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Select } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";
import { rpc } from "../outreach/outreach";
import { kickDraftQueue } from "../../workers/draft-runner";

const DEFAULT_COUNT = 25;
const MAX_COUNT = 100;

interface PrepareDraftsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Üst çubuktaki pazar süzgeci; boşsa tüm pazarlar. */
  country: string | null;
  city: string | null;
}

/** Fırsatlar'daki e-postalı işletmeler için taslakları arka planda hazırlatır (ADR 0018). Gönderim yapılmaz. */
export function PrepareDraftsDialog({ open, onOpenChange, workspaceId, country, city }: PrepareDraftsDialogProps) {
  const queryClient = useQueryClient();
  // Bilerek varsayılan yok (ADR 0013): dil her seferinde seçilir.
  const [language, setLanguage] = useState<OutreachLanguage | "">("");
  const [count, setCount] = useState(DEFAULT_COUNT);

  const enqueue = useMutation({
    mutationFn: async () => {
      if (!language) throw new Error(tr.draft.selectLanguageFirst);
      return rpc<{ queued: number }>("enqueue_opportunity_drafts", {
        ws: workspaceId,
        p_language: language,
        p_limit: Math.min(Math.max(Math.trunc(count) || DEFAULT_COUNT, 1), MAX_COUNT),
        p_country: country,
        p_city: city,
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["draft-queue", workspaceId] });
      if (result.queued > 0) void kickDraftQueue(workspaceId);
    },
  });

  const queued = enqueue.data?.queued;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) enqueue.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={tr.draftQueue.prepare.title} description={tr.draftQueue.prepare.description} size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1">
              <Label>{tr.draftQueue.prepare.languageLabel}</Label>
              <Select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value as OutreachLanguage | "");
                  enqueue.reset();
                }}
              >
                <option value="">{tr.draftQueue.prepare.languagePlaceholder}</option>
                {OUTREACH_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {tr.draft.languages[l]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <Label>{tr.draftQueue.prepare.countLabel}</Label>
              <Input
                type="number"
                min={1}
                max={MAX_COUNT}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
          </div>
          <p className="text-xs text-muted">{tr.draftQueue.prepare.foreignHint}</p>

          {enqueue.isError && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">
              {enqueue.error instanceof Error ? enqueue.error.message : tr.draftQueue.actionError}
            </p>
          )}
          {queued !== undefined && (
            <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text">
              {queued > 0 ? tr.draftQueue.prepare.queued(queued) : tr.draftQueue.prepare.none}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tr.common.close}
            </Button>
            <Button variant="violet" disabled={enqueue.isPending || !language} onClick={() => enqueue.mutate()}>
              {enqueue.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {tr.draftQueue.prepare.start}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
