/**
 * Otomatik yanıtları ("izindeyim", "mesajınız alındı") başlıklardan kesin
 * olarak tanır; AI sınıflandırmasından önce çalışır (SPEC.md → L: AUTO_REPLY
 * follow-up'ı iptal etmez, yalnızca erteler). Başlık adları küçük harfle verilir.
 */
const AUTO_SUBJECT_PATTERNS = [
  /^\s*otomatik (yanıt|cevap)/i,
  /^\s*out of (the )?office/i,
  /^\s*automatic reply/i,
  /^\s*auto(matic)?[- ]?reply/i,
  /^\s*ofis dışında/i,
];

export function isAutoReply(headers: Record<string, string | undefined>, subject?: string): boolean {
  const autoSubmitted = headers["auto-submitted"]?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers["x-autoreply"] || headers["x-autorespond"] || headers["x-autoresponse"]) return true;

  const precedence = headers["precedence"]?.trim().toLowerCase();
  if (precedence === "auto_reply" || precedence === "bulk" || precedence === "junk") return true;

  return !!subject && AUTO_SUBJECT_PATTERNS.some((p) => p.test(subject));
}
