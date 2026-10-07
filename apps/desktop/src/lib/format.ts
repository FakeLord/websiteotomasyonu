/** Ekibin varsayılan saati (workspace_settings.timezone ile aynı varsayılan). */
export const TIME_ZONE = "Europe/Istanbul";

/** "3 dk önce", "2 saat önce", "dün", yoksa tarih. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 0) return formatDateTime(iso);
  if (diffSec < 60) return "az önce";
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "dün";
  if (days < 7) return `${days} gün önce`;
  return formatDate(iso);
}

export function formatDate(iso: string, timeZone: string = TIME_ZONE): string {
  return new Date(iso).toLocaleDateString("tr-TR", { timeZone, day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string, timeZone: string = TIME_ZONE): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(amount: number, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/** İşletmenin yerel saati, ör. "14:32 Salı". Geçersiz saat diliminde boş metin döner. */
export function formatLocalTime(timeZone: string, now: Date = new Date()): string {
  try {
    return now.toLocaleString("tr-TR", { timeZone, hour: "2-digit", minute: "2-digit", weekday: "long" }).replace(/^(\d{2}:\d{2})\s+(.+)$/, "$1 $2");
  } catch {
    return "";
  }
}

/** Para birimine göre toplamlar: { TRY: 1000, USD: 500 } → "₺1.000 · US$500" (boşsa "—"). */
export function formatMoneyTotals(totals: Record<string, number>): string {
  const parts = Object.entries(totals)
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => formatCurrency(amount, currency));
  return parts.length ? parts.join(" · ") : "—";
}

export function greetingForHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}
