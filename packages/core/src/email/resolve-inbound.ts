import type { BounceInfo } from "./parse-inbound";

export interface InboundMatchContext {
  /** Gönderilmiş (SENT) e-postalar ve Message-ID'leri. */
  outbound: Array<{ conversationId: string; businessId: string; externalMessageId: string }>;
  /** İşletmelerin kayıtlı e-posta adresleri (contact_channels, EMAIL). */
  emailChannels: Array<{ businessId: string; address: string }>;
}

export interface InboundTarget {
  businessId: string;
  /** Thread ile eşleştiyse bilinen konuşma; gönderen adresiyle eşleştiyse null (EMAIL konuşması bulunur/açılır). */
  conversationId: string | null;
  matchedBy: "THREAD" | "SENDER";
}

function businessForAddress(address: string | null, context: InboundMatchContext): string | null {
  if (!address) return null;
  const needle = address.trim().toLowerCase();
  const matches = new Set(context.emailChannels.filter((c) => c.address.trim().toLowerCase() === needle).map((c) => c.businessId));
  // Aynı adres birden çok işletmede kayıtlıysa (zincir, ortak muhasebeci…) tahmin yapılmaz.
  return matches.size === 1 ? [...matches][0]! : null;
}

/**
 * Gelen e-postanın ait olduğu lead'i bulur (SPEC.md → L): önce `In-Reply-To`/
 * `References` ↔ gönderdiğimiz Message-ID, sonra gönderen adresi ↔ işletmenin
 * kayıtlı e-postası. Hiçbiri eşleşmezse null — kişisel posta asla içe alınmaz.
 */
export function resolveInboundTarget(
  email: { inReplyTo: string | null; references: string[]; fromAddress: string | null },
  context: InboundMatchContext,
): InboundTarget | null {
  const ids = new Set([email.inReplyTo, ...email.references].filter((v): v is string => !!v));
  const thread = context.outbound.find((o) => ids.has(o.externalMessageId));
  if (thread) return { businessId: thread.businessId, conversationId: thread.conversationId, matchedBy: "THREAD" };

  const businessId = businessForAddress(email.fromAddress, context);
  return businessId ? { businessId, conversationId: null, matchedBy: "SENDER" } : null;
}

/** Bounce'un hangi işletmenin hangi adresine ait olduğunu bulur. */
export function resolveBounceTarget(bounce: BounceInfo, context: InboundMatchContext): { businessId: string; address: string | null } | null {
  const original = bounce.originalMessageId ? context.outbound.find((o) => o.externalMessageId === bounce.originalMessageId) : undefined;
  if (original) return { businessId: original.businessId, address: bounce.failedRecipient };

  const businessId = businessForAddress(bounce.failedRecipient, context);
  return businessId ? { businessId, address: bounce.failedRecipient } : null;
}
