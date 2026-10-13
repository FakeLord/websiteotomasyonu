import { whatsappUrlWithText } from "../outreach/message-template";
import { phoneLineType } from "./reachability";

export interface QuickContactChannel {
  channel: string;
  value: string;
  /** Sosyal kanallarda `platform:handle`; telefonlarda E.164. */
  normalizedValue: string;
  status?: string | null;
}

export type ContactOptionKind = "EMAIL" | "WHATSAPP" | "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "TIKTOK" | "PHONE";

export interface ContactOption {
  channel: ContactOptionKind;
  /** Kullanıcının hangi adrese gideceğini görmesi için: e-posta, numara veya @kullanıcı. */
  display: string;
  url: string;
}

const SOCIAL = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"] as const;
type Social = (typeof SOCIAL)[number];

/** Menüdeki sıra: önce yazılabilen ve en güvenilir kanallar. */
const ORDER: ContactOptionKind[] = ["EMAIL", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK", "PHONE"];

const handleOf = (row: QuickContactChannel) =>
  (row.normalizedValue.includes(":") ? (row.normalizedValue.split(":").pop() ?? "") : row.normalizedValue).trim().replace(/^@/, "");

function socialUrl(channel: Social, row: QuickContactChannel): string | null {
  if (/^https?:\/\//i.test(row.value)) return row.value;
  const handle = handleOf(row);
  if (!handle) return null;
  switch (channel) {
    case "INSTAGRAM":
      return `https://instagram.com/${handle}`;
    case "FACEBOOK":
      return `https://facebook.com/${handle}`;
    case "LINKEDIN":
      return `https://linkedin.com/company/${handle}`;
    case "TIKTOK":
      return `https://tiktok.com/@${handle}`;
  }
}

const digitsOf = (phone: string) => phone.replace(/\D/g, "");
const cleanPhone = (phone: string) => phone.replace(/[^\d+]/g, "");

/**
 * İşletmeye ulaşılabilecek bütün adresler; kullanıcı hangisine gideceğini kendi seçer.
 * Yalnızca bağlantı üretir; mesajı kullanıcı yazar ve gönderir (CLAUDE.md #9: otomatik DM yok).
 * Geçersiz/geri dönmüş kanallar ve tekrarlar atlanır. WhatsApp yalnızca kayıtlı bir WhatsApp kanalı varsa
 * veya telefon cep numarasıysa listelenir; her telefon ayrıca "ara" seçeneği olarak gelir.
 */
export function contactOptions(
  channels: QuickContactChannel[],
  primaryPhoneE164: string | null | undefined,
  options: { /** WhatsApp sohbeti bu metin yazılmış olarak açılır (kullanıcı yalnızca gönder'e basar). */ whatsappText?: string } = {},
): ContactOption[] {
  const usable = channels.filter((row) => row.status !== "INVALID" && row.status !== "BOUNCED");
  const result: ContactOption[] = [];
  const seen = new Set<string>();
  const add = (option: ContactOption) => {
    if (seen.has(option.url)) return;
    seen.add(option.url);
    result.push(option);
  };
  const addWhatsapp = (phone: string) => {
    const url = whatsappUrlWithText(phone, options.whatsappText ?? "");
    if (url) add({ channel: "WHATSAPP", display: cleanPhone(phone), url });
  };

  for (const row of usable) {
    if ((SOCIAL as readonly string[]).includes(row.channel)) {
      const url = socialUrl(row.channel as Social, row);
      if (url) add({ channel: row.channel as Social, display: `@${handleOf(row)}`, url });
    } else if (row.channel === "EMAIL" && row.value.trim()) {
      add({ channel: "EMAIL", display: row.value.trim(), url: `mailto:${row.value.trim()}` });
    } else if (row.channel === "WHATSAPP") {
      addWhatsapp(row.normalizedValue);
    }
  }

  const phones = [...usable.filter((row) => row.channel === "PHONE").map((row) => row.normalizedValue), primaryPhoneE164 ?? ""]
    .map(cleanPhone)
    .filter((phone) => digitsOf(phone).length >= 7);
  for (const phone of phones) {
    if (phoneLineType(phone) === "MOBILE") addWhatsapp(phone);
    add({ channel: "PHONE", display: phone, url: `tel:${phone}` });
  }

  return result
    .map((option, index) => ({ option, index }))
    .sort((a, b) => ORDER.indexOf(a.option.channel) - ORDER.indexOf(b.option.channel) || a.index - b.index)
    .map(({ option }) => option);
}

/** Google Haritalar bağlantısı (resmi Maps URLs biçimi); `place_id` varsa işletmenin kendi sayfası açılır. */
export function googleMapsUrl(business: {
  name: string;
  address?: string | null;
  city?: string | null;
  googlePlaceId?: string | null;
}): string {
  const query = [business.name, business.address?.trim() || business.city?.trim()].filter(Boolean).join(", ");
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return business.googlePlaceId ? `${base}&query_place_id=${encodeURIComponent(business.googlePlaceId)}` : base;
}
