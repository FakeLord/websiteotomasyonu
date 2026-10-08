import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/** `UNKNOWN`: numara çözülemedi veya ülke cep/sabit ayrımı yapmıyor (ABD, Kanada). */
export type PhoneLineType = "MOBILE" | "LANDLINE" | "UNKNOWN";

/**
 * Numaranın cep mi sabit hat mı olduğunu numara planından çıkarır. WhatsApp yalnızca cep numarasında
 * anlamlıdır; sabit hatta "bu numara WhatsApp kullanmıyor" çıkar. Numaranın WhatsApp'a gerçekten kayıtlı
 * olduğunu DOĞRULAMAZ (bunun izinli bir yolu yok).
 */
export function phoneLineType(e164: string | null | undefined): PhoneLineType {
  if (!e164?.trim()) return "UNKNOWN";
  let type: string | undefined;
  try {
    const parsed = parsePhoneNumberFromString(e164.trim());
    if (!parsed?.isValid()) return "UNKNOWN";
    type = parsed.getType();
  } catch {
    return "UNKNOWN";
  }
  if (type === "MOBILE") return "MOBILE";
  if (type === undefined || type === "FIXED_LINE_OR_MOBILE") return "UNKNOWN";
  return "LANDLINE";
}

/** Mesaj yazılabilen kanallar. Telefon (arama) ve site formu bunlara dahil değildir. */
export const WRITABLE_CHANNELS = ["EMAIL", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"] as const;
export const SOCIAL_WRITABLE_CHANNELS = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"] as const;

export interface ReachabilityChannel {
  channel: string;
  status?: string | null;
}

/** İşletmeye yazılabilecek en az bir kanal var mı (geçersiz/geri dönmüş kanallar sayılmaz). */
export function hasWritableChannel(channels: ReachabilityChannel[] | null | undefined): boolean {
  return (channels ?? []).some(
    (row) => (WRITABLE_CHANNELS as readonly string[]).includes(row.channel) && row.status !== "INVALID" && row.status !== "BOUNCED",
  );
}

export interface WhatsappCandidateInput {
  id: string;
  phoneE164: string | null;
  channels: string[];
}

/** Kayıtlı telefonu cep olan ama WhatsApp kanalı bulunmayan işletmeler (kanal eklenecekler). */
export function whatsappCandidates(rows: WhatsappCandidateInput[]): Array<{ businessId: string; phoneE164: string }> {
  return rows.flatMap((row) =>
    row.phoneE164 && !row.channels.includes("WHATSAPP") && phoneLineType(row.phoneE164) === "MOBILE"
      ? [{ businessId: row.id, phoneE164: row.phoneE164 }]
      : [],
  );
}
