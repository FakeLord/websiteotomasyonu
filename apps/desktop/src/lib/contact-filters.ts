/** Bu kadar günden uzun süredir temas edilmeyen işletme "sessiz" sayılır. */
export const STALE_CONTACT_DAYS = 7;

export const CONTACT_RECENCY_OPTIONS = ["never", "today", "stale"] as const;
export type ContactRecency = (typeof CONTACT_RECENCY_OPTIONS)[number];

export function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function endOfLocalDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 0);
  return end;
}

export interface ColumnFilter {
  column: "last_contacted_at";
  op: "is" | "gte" | "lt";
  value: string | null;
}

/**
 * Leadler "Son temas" süzgecinin veritabanı koşulu. `never`: hiç temas edilmemiş; `today`: bugün temas edilmiş;
 * `stale`: son teması 7 günden eski (hiç temas edilmeyenler dahil değildir, onlar "hiç yazılmamış"tır).
 */
export function contactRecencyFilter(value: string, now: Date = new Date()): ColumnFilter | null {
  switch (value) {
    case "never":
      return { column: "last_contacted_at", op: "is", value: null };
    case "today":
      return { column: "last_contacted_at", op: "gte", value: startOfLocalDay(now).toISOString() };
    case "stale": {
      const limit = new Date(now);
      limit.setDate(limit.getDate() - STALE_CONTACT_DAYS);
      return { column: "last_contacted_at", op: "lt", value: limit.toISOString() };
    }
    default:
      return null;
  }
}
