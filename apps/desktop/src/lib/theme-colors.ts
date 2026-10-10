/**
 * JS tarafında renk değeri gereken yerler (Recharts, Leaflet, SVG) için kurumsal palet.
 * Değerler `src/index.css` içindeki `@theme` ile aynıdır; CSS sınıfı kullanılabilen yerde bu dosya kullanılmaz.
 */
export const THEME = {
  surface: "#ffffff",
  surface3: "#eef2f7",
  border: "#dfe5ee",
  borderStrong: "#c5cfdd",
  text: "#0f172a",
  muted: "#475569",
  subtle: "#64748b",
  primary: "#1d4ed8",
  success: "#15803d",
  warning: "#b45309",
  danger: "#b91c1c",
  info: "#0369a1",
  navy: "#0b1f3a",
  teal: "#0f766e",
  slate: "#334155",
} as const;

/** Grafik serileri: sakin, birbirinden ayırt edilebilir, beyaz yüzeyde ≥ 4.5:1. */
export const SERIES = [THEME.primary, THEME.teal, THEME.warning, THEME.muted, THEME.slate] as const;
export const SEGMENTS = [THEME.primary, THEME.teal, THEME.warning, THEME.muted, THEME.info, THEME.success] as const;

/** Satış aşaması renkleri: ilerledikçe koyu mavi → yeşil; kayıplar gri/kırmızı. */
export const STAGE_COLORS: Record<string, string> = {
  NEW: "#64748b",
  QUALIFIED: "#0369a1",
  OUTREACH_READY: "#1d4ed8",
  CONTACTED: "#1e40af",
  REPLIED: "#b45309",
  ENGAGED: "#0f766e",
  PROPOSAL_READY: "#0f766e",
  HANDED_OFF: "#15803d",
  WON: "#15803d",
  DISQUALIFIED: "#94a3b8",
  LOST: "#b91c1c",
};

/** Lead puanı: düşükten yükseğe kırmızı → kehribar → yeşil. */
export function scoreColor(score: number): string {
  if (score >= 80) return THEME.success;
  if (score >= 60) return THEME.teal;
  if (score >= 40) return THEME.warning;
  return THEME.danger;
}

/** Avatar zeminleri: lacivert ve düşük doygunluklu kurumsal tonlar. */
export const AVATAR_COLORS = ["#1d4ed8", "#0f766e", "#0369a1", "#334155", "#1e40af", "#475569", "#155e75"] as const;
