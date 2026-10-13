import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_MESSAGE_TEMPLATES,
  renderMessageTemplate,
  shortBusinessName,
  unknownPlaceholders,
  type MessageTemplates,
  type TemplateLanguage,
} from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { useMessageTemplates } from "../../lib/use-message-templates";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Label, Textarea } from "../../components/ui/input";

const LANGUAGES: TemplateLanguage[] = ["tr", "en"];
const MAX_LENGTH = 1500;
const SAMPLE = { name: "ECESU BEAUTY STUDIO | Güzellik Salonu | Cilt Bakımı", category: "Güzellik Merkezi", city: "İstanbul" };

/**
 * WhatsApp mesaj şablonu (yalnızca yönetici): "İletişime geç → WhatsApp" mesajı yazılmış olarak açar. Türkçe ve İngilizce;
 * işletmenin ülkesine/diline göre biri seçilir. Boş bırakılan dil için varsayılan şablon kullanılır.
 */
export function MessageTemplatesSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const settings = useMessageTemplates().data;
  const [draft, setDraft] = useState<MessageTemplates>(DEFAULT_MESSAGE_TEMPLATES);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings.templates);
  }, [settings]);

  const problems = LANGUAGES.flatMap((language) => unknownPlaceholders(draft[language]).map((token) => ({ language, token })));
  const tooLong = LANGUAGES.some((language) => draft[language].length > MAX_LENGTH);
  const senderMissing = !settings?.senderName && LANGUAGES.some((language) => draft[language].includes("{sirket}"));

  const save = useMutation({
    mutationFn: async () => {
      // Varsayılanla aynı veya boş olan dil kaydedilmez: varsayılan ileride iyileşirse otomatik gelir.
      const custom: Partial<MessageTemplates> = {};
      for (const language of LANGUAGES) {
        const text = draft[language].trim();
        if (text && text !== DEFAULT_MESSAGE_TEMPLATES[language]) custom[language] = text;
      }
      const { error } = await supabase.from("workspace_settings").update({ message_templates: custom }).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setMessage({ tone: "ok", text: tr.messageTemplates.saved });
      void queryClient.invalidateQueries({ queryKey: ["message-templates", workspaceId] });
    },
    onError: (error: Error) => setMessage({ tone: "error", text: error.message }),
  });

  const insert = (language: TemplateLanguage, token: string) => {
    setDraft((current) => ({ ...current, [language]: `${current[language]}${current[language] && !/\s$/.test(current[language]) ? " " : ""}${token}` }));
    setMessage(null);
  };

  return (
    <Card className="mt-5 space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-text">{tr.messageTemplates.title}</h2>
        <p className="text-sm text-muted">{tr.messageTemplates.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{tr.messageTemplates.placeholders}</span>
        {(["{isletme}", "{sirket}", "{kategori}", "{sehir}"] as const).map((token) => (
          <code key={token} className="rounded bg-surface-2 px-1.5 py-0.5 text-text">
            {token}
          </code>
        ))}
        <span>{tr.messageTemplates.placeholdersHint}</span>
      </div>

      {LANGUAGES.map((language) => {
        const preview = renderMessageTemplate(draft[language], {
          isletme: shortBusinessName(SAMPLE.name, language),
          sirket: settings?.senderName ?? "",
          kategori: SAMPLE.category,
          sehir: SAMPLE.city,
        });
        return (
          <div key={language} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="mb-0">{tr.messageTemplates.languages[language]}</Label>
              <span className="flex items-center gap-3 text-xs">
                {["{isletme}", "{sirket}"].map((token) => (
                  <button key={token} type="button" className="text-primary hover:underline" onClick={() => insert(language, token)}>
                    + {token}
                  </button>
                ))}
                <button
                  type="button"
                  className="text-muted hover:underline"
                  onClick={() => {
                    setDraft((current) => ({ ...current, [language]: DEFAULT_MESSAGE_TEMPLATES[language] }));
                    setMessage(null);
                  }}
                >
                  {tr.messageTemplates.reset}
                </button>
              </span>
            </div>
            <Textarea
              value={draft[language]}
              rows={5}
              maxLength={MAX_LENGTH}
              onChange={(e) => {
                setDraft((current) => ({ ...current, [language]: e.target.value }));
                setMessage(null);
              }}
            />
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="mb-1 text-xs text-muted">{tr.messageTemplates.preview}</p>
              <p className="text-sm whitespace-pre-wrap text-text">{preview || "—"}</p>
            </div>
          </div>
        );
      })}

      {problems.length > 0 && (
        <p className="text-sm text-[#f87171]">{tr.messageTemplates.unknown(problems.map((p) => p.token).join(", "))}</p>
      )}
      {senderMissing && <p className="text-sm text-[#fbbf24]">{tr.messageTemplates.senderMissing}</p>}

      <div className="flex items-center gap-3">
        <Button disabled={problems.length > 0 || tooLong || save.isPending} onClick={() => save.mutate()}>
          {tr.settings.saveButton}
        </Button>
        {message && <span className={"text-xs " + (message.tone === "ok" ? "text-[#4ade80]" : "text-[#f87171]")}>{message.text}</span>}
      </div>
    </Card>
  );
}
