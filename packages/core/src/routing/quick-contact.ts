export interface QuickContactChannel {
  channel: string;
  value: string;
  /** Sosyal kanallarda `platform:handle`; telefonlarda E.164. */
  normalizedValue: string;
  status?: string | null;
}

export type QuickContactKind = "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "TIKTOK" | "EMAIL" | "WHATSAPP";

export interface QuickContactTarget {
  channel: QuickContactKind;
  url: string;
}

const SOCIAL_ORDER = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"] as const;

const handleOf = (row: QuickContactChannel) =>
  (row.normalizedValue.includes(":") ? (row.normalizedValue.split(":").pop() ?? "") : row.normalizedValue).trim();

function socialUrl(channel: (typeof SOCIAL_ORDER)[number], row: QuickContactChannel): string | null {
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

function whatsappUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

/**
 * "Tek tıkla iletişim" hedefi: sosyal medya varsa o, yoksa e-posta, o da yoksa kayıtlı telefona WhatsApp.
 * Yalnızca bağlantıyı üretir; mesajı kullanıcı kendi yazar ve gönderir (CLAUDE.md #9: otomatik DM yok).
 * Geçersiz/sektirmiş kanallar atlanır. Hiçbir kanal yoksa `null`.
 */
export function quickContactTarget(
  channels: QuickContactChannel[],
  primaryPhoneE164: string | null | undefined,
): QuickContactTarget | null {
  const usable = channels.filter((row) => row.status !== "INVALID" && row.status !== "BOUNCED");
  const first = (channel: string) => usable.find((row) => row.channel === channel);

  for (const channel of SOCIAL_ORDER) {
    const row = first(channel);
    const url = row ? socialUrl(channel, row) : null;
    if (url) return { channel, url };
  }

  const email = first("EMAIL")?.value.trim();
  if (email) return { channel: "EMAIL", url: `mailto:${email}` };

  const url =
    whatsappUrl(first("WHATSAPP")?.normalizedValue) ?? whatsappUrl(first("PHONE")?.normalizedValue) ?? whatsappUrl(primaryPhoneE164);
  return url ? { channel: "WHATSAPP", url } : null;
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
