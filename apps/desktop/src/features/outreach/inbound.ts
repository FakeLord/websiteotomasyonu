import { buildClassifyReplyPrompt, buildUpdateSummaryPrompt, hasStopKeyword } from "@lbf/core";
import { classifyReplyOutputSchema, updateSummaryOutputSchema } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { callAiGateway } from "../../lib/ai-gateway-client";
import { rpc } from "./outreach";

export interface InboundMessageInput {
  businessId: string;
  channel: string;
  body: string;
  subject?: string | null;
  /** E-postanın Message-ID'si; aynı mesaj ikinci kez kaydedilmez. */
  externalMessageId?: string | null;
  /** Başlıklardan kesin tespit edilmiş otomatik yanıt (AI'a sorulmaz). */
  autoReply?: boolean;
  /** Bilinen konuşma özeti; verilmezse DB'den okunur. */
  conversationSummary?: string;
}

export interface InboundMessageResult {
  conversationId: string;
  duplicate: boolean;
  aiFailed: boolean;
  stopRequest: boolean;
  intent: string | null;
}

async function summaryFor(businessId: string, channel: string): Promise<string> {
  const { data } = await supabase.from("conversations").select("summary").eq("business_id", businessId).eq("channel", channel).maybeSingle();
  return (data?.summary as string | undefined) ?? "";
}

/**
 * Gelen bir mesajı kaydeder (SPEC.md → L): STOP kelime yedeği + AI
 * sınıflandırma → `record_inbound` (DNC, follow-up iptali/ertelemesi DB'de)
 * → rolling özet. Hem "Cevap yapıştır" hem IMAP poller bu akışı kullanır.
 * AI başarısız olsa bile mesaj niyetsiz kaydedilir; cevap asla kaybolmaz.
 */
export async function ingestInboundMessage(workspaceId: string, input: InboundMessageInput): Promise<InboundMessageResult> {
  const body = input.body.trim();
  const summary = input.conversationSummary ?? (await summaryFor(input.businessId, input.channel));
  const stopByKeyword = hasStopKeyword(body);

  let intent: string | null = input.autoReply ? "AUTO_REPLY" : null;
  let confidence: number | null = input.autoReply ? 1 : null;
  let stopRequest = stopByKeyword;
  let aiFailed = false;

  if (!input.autoReply) {
    try {
      const result = await callAiGateway(workspaceId, buildClassifyReplyPrompt({ lastInboundMessage: body, conversationSummary: summary }), {
        entityType: "business",
        entityId: input.businessId,
      });
      const classification = classifyReplyOutputSchema.parse(result.json);
      intent = classification.intent;
      confidence = classification.confidence;
      stopRequest = stopByKeyword || (classification.intent === "STOP_CONTACT" && classification.confidence >= 0.5);
    } catch {
      aiFailed = true;
    }
  }

  const recorded = await rpc<{ conversationId: string; messageId: string; duplicate: boolean }>("record_inbound", {
    ws: workspaceId,
    p_business_id: input.businessId,
    p_channel: input.channel,
    p_body: body,
    p_subject: input.subject || null,
    p_external_message_id: input.externalMessageId ?? null,
    p_intent: intent,
    p_intent_confidence: confidence,
    p_stop_request: stopRequest,
  });

  if (!recorded.duplicate && !aiFailed && !input.autoReply) {
    try {
      const update = await callAiGateway(
        workspaceId,
        buildUpdateSummaryPrompt({ previousSummary: summary, newMessages: [{ direction: "IN", body }] }),
        { entityType: "conversation", entityId: recorded.conversationId },
      );
      const parsed = updateSummaryOutputSchema.safeParse(update.json);
      if (parsed.success) {
        await supabase
          .from("conversations")
          .update({ summary: parsed.data.summary, requirements: parsed.data.requirements, interest_level: parsed.data.interest_level })
          .eq("id", recorded.conversationId);
      }
    } catch {
      // Özet güncellenemezse mesaj yine kayıtlıdır.
    }
  }

  return { conversationId: recorded.conversationId, duplicate: recorded.duplicate, aiFailed, stopRequest, intent };
}
