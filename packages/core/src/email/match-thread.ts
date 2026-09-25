import type { EmailHeaders } from "./parse-eml-headers";

export interface ConversationThreadRef {
  conversationId: string;
  /** İlk giden e-postanın `Message-ID`'si (`conversations.email_thread_ref`). */
  messageId: string | null;
  /** İlk giden e-postanın konusu; yalnızca Message-ID eşleşmezse yedek olarak kullanılır. */
  subject: string | null;
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*(re|fwd?|ynt|ilt)\s*:\s*/gi, "")
    .trim()
    .toLowerCase();
}

/**
 * Gelen bir e-postanın hangi `conversation`'a ait olduğunu bulur. Önce
 * `In-Reply-To`/`References`'ı bilinen `email_thread_ref`'lerle karşılaştırır
 * (RFC 5322 — en güvenilir yol); hiçbiri eşleşmezse normalize edilmiş konuya
 * (Re:/Fwd: önekleri atılmış) düşer. Hiçbiri eşleşmezse `null` — yeni bir
 * conversation açılmalıdır (SPEC.md → Faz 7: "e-posta thread eşleme").
 */
export function matchEmailThread(headers: EmailHeaders, candidates: ConversationThreadRef[]): string | null {
  const referenceIds = new Set([headers.inReplyTo, ...headers.references].filter((v): v is string => !!v));

  for (const candidate of candidates) {
    if (candidate.messageId && referenceIds.has(candidate.messageId)) {
      return candidate.conversationId;
    }
  }

  if (headers.subject) {
    const normalized = normalizeSubject(headers.subject);
    for (const candidate of candidates) {
      if (candidate.subject && normalizeSubject(candidate.subject) === normalized) {
        return candidate.conversationId;
      }
    }
  }

  return null;
}
