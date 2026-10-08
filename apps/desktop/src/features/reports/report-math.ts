export interface FunnelCounts {
  found: number;
  contacted: number;
  replied: number;
  engaged: number;
  proposal: number;
  won: number;
}

export interface FunnelStep {
  key: keyof FunnelCounts;
  value: number;
  /** İlk adıma göre oran (bar genişliği). */
  ofTop: number;
  /** Bir önceki adıma göre dönüşüm; ilk adımda null. */
  fromPrevious: number | null;
}

const ORDER: Array<keyof FunnelCounts> = ["found", "contacted", "replied", "engaged", "proposal", "won"];

export function funnelSteps(counts: FunnelCounts): FunnelStep[] {
  const top = counts.found;
  return ORDER.map((key, index) => {
    const value = counts[key];
    const previousKey = ORDER[index - 1];
    const previous = previousKey ? counts[previousKey] : null;
    return {
      key,
      value,
      ofTop: top > 0 ? Math.min(100, (value / top) * 100) : 0,
      fromPrevious: previous === null ? null : previous > 0 ? Math.round((value / previous) * 100) : 0,
    };
  });
}

export function rangeForPreset(preset: "7" | "30" | "90" | "month", today: Date): { from: string; to: string } {
  const to = new Date(today);
  const from = new Date(today);
  if (preset === "month") from.setDate(1);
  else from.setDate(from.getDate() - (Number(preset) - 1));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

/** Bir segmentin (sektör/şehir) oranına güvenmek için gereken en az yazılan işletme sayısı. */
export const MIN_SEGMENT_SAMPLE = 20;

export interface SegmentRate {
  /** Cevap oranı (%); hiç yazılmamışsa null. */
  percent: number | null;
  /** Örnek yeterli mi: az sayıda yazıdan çıkan oran yanıltıcıdır (3 yazı, 2 cevap = %67). */
  enough: boolean;
}

export function segmentRate(contacted: number, replied: number): SegmentRate {
  if (contacted <= 0) return { percent: null, enough: false };
  return { percent: Math.round((replied / contacted) * 100), enough: contacted >= MIN_SEGMENT_SAMPLE };
}

/** Yeterli örneği olan segmentler arasında en yüksek cevap oranlı olanı seçer; yoksa null. */
export function bestSegment<T extends { contacted: number; replied: number }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!segmentRate(row.contacted, row.replied).enough || row.replied === 0) continue;
    if (!best || row.replied / row.contacted > best.replied / best.contacted) best = row;
  }
  return best;
}

export interface SegmentCounts {
  key: string;
  found: number;
  opportunities: number;
  contacted: number;
  replied: number;
  won: number;
}

/** Aynı sektörün farklı yazımlarını (canonical ile) tek satırda toplar; sıra: önce yazılan, sonra bulunan. */
export function mergeSegments<T extends SegmentCounts>(rows: T[], canonical: (key: string) => string): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const key = canonical(row.key);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row, key });
      continue;
    }
    existing.found += row.found;
    existing.opportunities += row.opportunities;
    existing.contacted += row.contacted;
    existing.replied += row.replied;
    existing.won += row.won;
  }
  return [...merged.values()].sort((a, b) => b.contacted - a.contacted || b.found - a.found);
}
