export interface ContactChannelRef {
  channel: string;
  status?: string | null;
}

/** Listelerde gösterilen, ulaşmaya yarayan kanallar (görüntü sırası). */
export const CONTACT_CHANNEL_ORDER = ["PHONE", "EMAIL", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"] as const;

/** Geçersiz/sektirmiş kayıtlar elenir; tekrarlar tek kanal sayılır; sıra sabittir. */
export function availableChannels(rows: ContactChannelRef[] | null | undefined): string[] {
  const usable = new Set(
    (rows ?? []).filter((row) => row.status !== "INVALID" && row.status !== "BOUNCED").map((row) => row.channel),
  );
  return CONTACT_CHANNEL_ORDER.filter((channel) => usable.has(channel));
}
