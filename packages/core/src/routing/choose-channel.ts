import type { Channel, RoutingInput, RoutingRejection, RoutingResult } from "./types";

const MIN_CONFIDENCE = 0.5;

/**
 * I.4 bölümündeki kanal seçimi algoritması. Saf fonksiyon: aynı girdi her
 * zaman aynı sonucu verir, DB erişimi yok (guard'lar için gereken veri
 * `history`/`limits` olarak inject edilir). Gerçek zorlama DB'de
 * `outreach_guard()` RPC'sindedir (CLAUDE.md #9); bu fonksiyon yalnızca
 * öneri/ön kontrol amaçlıdır (lead detayındaki "Önerilen kanal" kartı).
 */
export function chooseChannel(input: RoutingInput): RoutingResult {
  if (input.doNotContact) {
    return { ok: false, doNotContact: true, reasons: [] };
  }

  const eligibleCandidates = input.candidates.filter(
    (c) => c.status !== "INVALID" && c.status !== "BOUNCED" && c.confidence >= MIN_CONFIDENCE,
  );

  const orderedChannels = input.settings.channelPriority.filter((channel) =>
    eligibleCandidates.some((c) => c.channel === channel),
  );

  const rejections: RoutingRejection[] = [];

  for (const candidate of input.candidates) {
    if (candidate.status === "INVALID" || candidate.status === "BOUNCED") {
      rejections.push({ channel: candidate.channel, reason: "STATUS_INVALID" });
    } else if (candidate.confidence < MIN_CONFIDENCE) {
      rejections.push({ channel: candidate.channel, reason: "LOW_CONFIDENCE" });
    }
  }

  for (const channel of orderedChannels) {
    const guardReason = checkGuards(channel, input);
    if (guardReason) {
      rejections.push({ channel, reason: guardReason });
      continue;
    }

    const mode = input.settings.channelModes[channel];
    return { ok: true, channel, mode };
  }

  return { ok: false, doNotContact: false, reasons: rejections };
}

function checkGuards(channel: Channel, input: RoutingInput): RoutingRejection["reason"] | null {
  const { history, limits, now } = input;

  const lastSent = history.lastMessageAtByChannel[channel];
  if (lastSent) {
    const hoursSince = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
    if (hoursSince < limits.channelCooldownHours) return "COOLDOWN";
  }

  const channelDailyLimit = limits.dailyByChannel[channel];
  const channelDailyCount = history.dailyCountByChannel[channel] ?? 0;
  if (channelDailyLimit != null && channelDailyCount >= channelDailyLimit) return "DAILY_CHANNEL_LIMIT";

  if (history.dailyCountTotal >= limits.dailyTotal) return "DAILY_TOTAL_LIMIT";

  if (
    history.firstMessageChannelWithin30Days &&
    history.firstMessageChannelWithin30Days !== channel &&
    !history.lastMessageAtByChannel[channel]
  ) {
    // "Fallback yalnızca teslim hatasında çalışır" — normal akışta ilk
    // mesaj başka bir kanaldan gittiyse ve bu kanaldan hiç gönderim
    // yapılmadıysa, bu kanal yalnızca fallback senaryosunda seçilir; bu
    // fonksiyon fallback'i ayrıca modellemez, bu yüzden burada engellenir.
    return "OTHER_CHANNEL_ALREADY_CONTACTED";
  }

  return null;
}
