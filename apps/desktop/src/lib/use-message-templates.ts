import { useQuery } from "@tanstack/react-query";
import { DEFAULT_MESSAGE_TEMPLATES, type MessageTemplates } from "@lbf/core";
import { supabase } from "./supabase-client";
import { useWorkspaceMembership } from "./use-workspace-membership";

export interface MessageTemplateSettings {
  /** Kayıtlı özel şablonlar; boş olan dil için `templates` varsayılanı kullanır. */
  custom: Partial<MessageTemplates>;
  /** Mesajda kullanılacak (özel veya varsayılan) şablonlar. */
  templates: MessageTemplates;
  /** `{sirket}` yer tutucusunun değeri: Ayarlar → Gönderen kimliği → Şirket adı. */
  senderName: string;
}

/** WhatsApp'a hazır yazılan sabit mesaj şablonları ve gönderen şirket adı (çalışma alanı ayarlarından). */
export function useMessageTemplates() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  return useQuery({
    queryKey: ["message-templates", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<MessageTemplateSettings> => {
      const { data, error } = await supabase
        .from("workspace_settings")
        .select("message_templates, sender_profile")
        .eq("workspace_id", workspaceId as string)
        .single();
      if (error) throw new Error(error.message);
      const custom = (data?.message_templates ?? {}) as Partial<MessageTemplates>;
      const profile = (data?.sender_profile ?? {}) as { legalName?: string };
      return {
        custom,
        templates: {
          tr: custom.tr?.trim() ? custom.tr : DEFAULT_MESSAGE_TEMPLATES.tr,
          en: custom.en?.trim() ? custom.en : DEFAULT_MESSAGE_TEMPLATES.en,
        },
        senderName: profile.legalName?.trim() ?? "",
      };
    },
  });
}
