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
