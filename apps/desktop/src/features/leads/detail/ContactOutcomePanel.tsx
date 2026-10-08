import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, X } from "lucide-react";
import type { ContactOutcome } from "@lbf/core";
import { tr } from "../../../i18n/tr";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ChannelIcon } from "../../../components/domain/channel-icon";
import { dateFromInput, followUpDate, setContactOutcome, useRefreshAfterContact } from "./contact-attempts";

export interface PendingContact {
  /** Kayıt hâlâ açılıyorsa null; hata olursa `error` dolu. */
  attemptId: string | null;
  channel: string;
  address: string;
  error: string | null;
}

interface ContactOutcomePanelProps {
  businessId: string;
  pending: PendingContact;
  onClose: () => void;
}

const QUICK_OUTCOMES: Array<{ outcome: ContactOutcome; tone: "default" | "outline" | "danger" }> = [
  { outcome: "SENT", tone: "default" },
  { outcome: "REPLIED", tone: "outline" },
  { outcome: "UNREACHABLE", tone: "outline" },
  { outcome: "NOT_INTERESTED", tone: "danger" },
];

const LATER_CHOICES = [
  { key: "tomorrow", days: 1 },
  { key: "threeDays", days: 3 },
  { key: "week", days: 7 },
] as const;

/**
 * Temas bağlantısı açıldıktan sonra köşede çıkan "Ne oldu?" kutusu. Kapatılırsa temas "Denendi" olarak kalır;
 * kullanıcıyı bekletmez. Sonuç girilince aşama ve takip tarihi sunucuda güncellenir.
 */
export function ContactOutcomePanel({ businessId, pending, onClose }: ContactOutcomePanelProps) {
  const refresh = useRefreshAfterContact(businessId);
  const [later, setLater] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (input: { outcome: ContactOutcome; followUpAt?: Date }) => {
      if (!pending.attemptId) throw new Error(tr.contactOutcome.notRecorded);
      return setContactOutcome(pending.attemptId, input.outcome, input.followUpAt ? { followUpAt: input.followUpAt } : {});
    },
    onSuccess: (result, input) => {
      refresh();
      setDone(tr.contactOutcome.saved(tr.contactOutcome.outcomes[input.outcome], result.stage));
      window.setTimeout(onClose, 2500);
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (pending.attemptId) await setContactOutcome(pending.attemptId, "CANCELLED");
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const busy = save.isPending || cancel.isPending;
  const error = pending.error ?? save.error?.message ?? cancel.error?.message ?? null;
  const customValid = dateFromInput(customDate) !== null;

  return (
    <div
      role="dialog"
      aria-label={tr.contactOutcome.title}
      className="fixed right-5 bottom-5 z-40 w-96 space-y-3 rounded-xl border border-border-strong bg-surface p-4 shadow-2xl shadow-black/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{tr.contactOutcome.title}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted">
            <ChannelIcon channel={pending.channel} />
            <span className="truncate">{pending.address}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={tr.contactOutcome.close} title={tr.contactOutcome.closeHint} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text">
          <X className="size-4" />
        </button>
      </div>

      {done ? (
        <p role="status" className="flex items-center gap-2 text-sm text-[#4ade80]">
          <CheckCircle2 className="size-4" />
          {done}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_OUTCOMES.map(({ outcome, tone }) => (
              <Button key={outcome} size="sm" variant={tone} disabled={busy || !pending.attemptId} onClick={() => save.mutate({ outcome })}>
                {tr.contactOutcome.outcomes[outcome]}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={busy || !pending.attemptId} onClick={() => setLater((v) => !v)}>
              {tr.contactOutcome.outcomes.LATER}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || !pending.attemptId} onClick={() => cancel.mutate()}>
              {tr.contactOutcome.outcomes.CANCELLED}
            </Button>
          </div>

          {later && (
            <div className="space-y-2 rounded-lg bg-surface-2 p-2.5">
              <p className="text-xs text-muted">{tr.contactOutcome.laterHint}</p>
              <div className="flex flex-wrap gap-2">
                {LATER_CHOICES.map(({ key, days }) => (
                  <Button key={key} size="sm" variant="outline" disabled={busy} onClick={() => save.mutate({ outcome: "LATER", followUpAt: followUpDate(days) })}>
                    {tr.contactOutcome.laterChoices[key]}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} aria-label={tr.contactOutcome.customDate} className="h-8" />
                <Button
                  size="sm"
                  disabled={busy || !customValid}
                  onClick={() => {
                    const followUpAt = dateFromInput(customDate);
                    if (followUpAt) save.mutate({ outcome: "LATER", followUpAt });
                  }}
                >
                  {tr.common.save}
                </Button>
              </div>
            </div>
          )}

          {busy && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              {tr.common.loading}
            </p>
          )}
          {!pending.attemptId && !pending.error && <p className="text-xs text-muted">{tr.contactOutcome.recording}</p>}
          {error && <p className="text-xs text-[#f87171]">{error}</p>}
        </>
      )}
    </div>
  );
}
