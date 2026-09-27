import PostalMime from "postal-mime";
import { isAutoReply } from "./auto-reply";

export interface BounceInfo {
  /** Geri dönen (teslim edilemeyen) giden e-postanın Message-ID'si. */
  originalMessageId: string | null;
  /** Teslim edilemeyen alıcı adresi (küçük harf). */
  failedRecipient: string | null;
}

export interface ParsedInboundEmail {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string | null;
  /** Gönderen adresi, küçük harf. */
  fromAddress: string | null;
  fromName: string | null;
  /** Yalnızca yeni yazılan kısım (alıntılanmış önceki mesajlar kırpılmış). */
  text: string;
  autoReply: boolean;
  bounce: BounceInfo | null;
}

type ParsedMime = Awaited<ReturnType<typeof PostalMime.parse>>;

const MESSAGE_ID_RE =/<[^<>\s]+@[^<>\s]+>/g;

/**
 * Cevabın altındaki alıntılanmış geçmişi kırpar (SPEC.md → L: yalnızca yeni
 * içerik sınıflandırılır/kaydedilir). Kırpma her şeyi silecekse metin olduğu
 * gibi döner — içerik asla kaybolmaz.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const separators = [
    /^On .+wrote:\s*$/i,
    /tarihinde .+(şunu )?yazdı:\s*$/i,
    /^-{2,}\s*(Original Message|Özgün İleti|Orijinal Mesaj|Forwarded message|İletilen ileti)\s*-{2,}/i,
    /^_{5,}\s*$/,
    /^(From|Kimden):\s.+$/i,
  ];
  const cut = lines.findIndex((line) => separators.some((re) => re.test(line.trim())) || /^\s*>/.test(line));
  const kept = (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
  return kept || text.trim();
}

function referencesList(value: string | undefined): string[] {
  return value?.match(MESSAGE_ID_RE) ?? [];
}

function attachmentText(content: ArrayBuffer | Uint8Array | string): string {
  if (typeof content === "string") return content;
  return new TextDecoder("utf-8").decode(content instanceof Uint8Array ? content : new Uint8Array(content));
}

function detectBounce(email: ParsedMime,headers: Record<string, string>, fromAddress: string | null): BounceInfo | null {
  const contentType = headers["content-type"]?.toLowerCase() ?? "";
  const isReport = contentType.includes("multipart/report") && contentType.includes("delivery-status");
  const fromDaemon = !!fromAddress && /^(mailer-daemon|postmaster)@/i.test(fromAddress);
  if (!isReport && !fromDaemon && !headers["x-failed-recipients"]) return null;

  const parts = email.attachments.map((a) => ({ type: a.mimeType, text: attachmentText(a.content) }));
  const statusPart = parts.find((p) => p.type === "message/delivery-status")?.text ?? "";
  const originalPart = parts.find((p) => p.type === "text/rfc822-headers" || p.type === "message/rfc822")?.text ?? "";

  const finalRecipient = statusPart.match(/^(?:Final|Original)-Recipient:\s*rfc822;\s*(\S+)/im)?.[1];
  const failedRecipient = (headers["x-failed-recipients"]?.split(",")[0] ?? finalRecipient ?? null)?.trim().toLowerCase() ?? null;

  const originalHeaderId = (originalPart || email.text || "").match(/^Message-ID:\s*(<[^<>\s]+@[^<>\s]+>)/im)?.[1] ?? null;

  return { originalMessageId: originalHeaderId, failedRecipient };
}

/**
 * IMAP'ten gelen ham e-postayı ayrıştırır (ADR 0008): karakter kümesi ve
 * aktarım kodlaması çözülür, gönderen/thread başlıkları, alıntısız metin,
 * otomatik yanıt ve bounce bilgisi çıkarılır.
 */
export async function parseInboundEmail(raw: string | Uint8Array): Promise<ParsedInboundEmail> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: "utf8" });

  const headers: Record<string, string> = {};
  for (const h of email.headers) {
    if (!(h.key in headers)) headers[h.key] = h.value;
  }

  const from = email.from && "address" in email.from && email.from.address ? email.from : null;
  const fromAddress = from?.address?.toLowerCase() ?? null;
  const bounce = detectBounce(email, headers, fromAddress);

  return {
    messageId: email.messageId?.trim() || null,
    inReplyTo: referencesList(email.inReplyTo)[0] ?? null,
    references: referencesList(email.references),
    subject: email.subject ?? null,
    fromAddress,
    fromName: from?.name || null,
    text: stripQuotedReply(email.text ?? ""),
    autoReply: !bounce && isAutoReply(headers, email.subject),
    bounce,
  };
}
