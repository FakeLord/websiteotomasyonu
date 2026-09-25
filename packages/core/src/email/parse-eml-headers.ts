export interface EmailHeaders {
  messageId?: string | undefined;
  inReplyTo?: string | undefined;
  references: string[];
  subject?: string | undefined;
  from?: string | undefined;
}

/**
 * Ham bir `.eml` dosyasından yalnızca başlıkları (thread eşleme için gereken
 * `Message-ID`/`In-Reply-To`/`References`/`Subject`) ayrıştırır. Katlanmış
 * (folded) başlık satırlarını (RFC 5322 — devam satırı boşlukla başlar)
 * birleştirir; gövdeyi (ilk boş satırdan sonrası) hiç okumaz.
 */
export function parseEmlHeaders(raw: string): EmailHeaders {
  const headerBlock = raw.split(/\r?\n\r?\n/)[0] ?? "";
  const lines = headerBlock.split(/\r?\n/);

  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }

  const headers: Record<string, string> = {};
  for (const line of unfolded) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (match?.[1] && match[2] !== undefined) {
      headers[match[1].toLowerCase()] = match[2].trim();
    }
  }

  const references = (headers["references"] ?? "")
    .split(/\s+/)
    .map((r) => r.trim())
    .filter(Boolean);

  return {
    messageId: headers["message-id"] || undefined,
    inReplyTo: headers["in-reply-to"] || undefined,
    references,
    subject: headers["subject"] || undefined,
    from: headers["from"] || undefined,
  };
}
