// Jarvis salt-okunur asistanı: prompt derleyici + model çıktısı temizleyici.
// Deno Edge Function'ından (jarvis-chat) içe aktarılır; import içermemelidir.
// Jarvis hiçbir veriyi değiştirmez; yalnızca cevap verir ve kullanıcıyı
// uygulama içinde bir ekrana/filtreye yönlendirmeyi önerebilir (SPEC.md → O:
// mutasyon yapan action katmanı Faz 12'de).

export const JARVIS_PROMPT_VERSION = 1;

export const JARVIS_NAV_PATHS = [
  "/",
  "/discover",
  "/leads",
  "/conversations",
  "/follow-ups",
  "/pipeline",
  "/customers",
  "/campaigns",
  "/reports",
  "/team",
  "/knowledge-base",
  "/settings",
] as const;

export const JARVIS_STAGES = [
  "NEW",
  "QUALIFIED",
  "OUTREACH_READY",
  "CONTACTED",
  "REPLIED",
  "ENGAGED",
  "PROPOSAL_READY",
  "HANDED_OFF",
  "WON",
  "DISQUALIFIED",
  "LOST",
] as const;

export const JARVIS_WEBSITE_STATUSES = ["NO_WEBSITE", "BROKEN_WEBSITE", "LOW_QUALITY_WEBSITE", "GOOD_WEBSITE"] as const;

export interface JarvisLeadFilter {
  q?: string;
  city?: string;
  district?: string;
  category?: string;
  minScore?: number;
  stage?: string;
  websiteStatus?: string;
}

export type JarvisAction =
  | { type: "open_leads"; label: string; filter: JarvisLeadFilter }
  | { type: "navigate"; label: string; path: string };

export interface JarvisReply {
  answer: string;
  action: JarvisAction | null;
}

export interface JarvisContext {
  today: string;
  summary: Record<string, unknown>;
  last7Days: Record<string, unknown>;
  previous7Days: Record<string, unknown>;
  topLeads: Array<Record<string, unknown>>;
  dueFollowUps: Array<Record<string, unknown>>;
  openHandoffs: Array<Record<string, unknown>>;
  knownCategories: string[];
  knownDistricts: string[];
}

export const JARVIS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    action: {
      type: ["object", "null"],
      properties: {
        type: { enum: ["open_leads", "navigate"] },
        label: { type: "string" },
        path: { enum: [...JARVIS_NAV_PATHS] },
        filter: {
          type: "object",
          properties: {
            q: { type: "string" },
            city: { type: "string" },
            district: { type: "string" },
            category: { type: "string" },
            minScore: { type: "number" },
            stage: { enum: [...JARVIS_STAGES] },
            websiteStatus: { enum: [...JARVIS_WEBSITE_STATUSES] },
          },
        },
      },
    },
  },
  required: ["answer", "action"],
};

export function buildJarvisSystemPrompt(context: JarvisContext): string {
  return [
    "Sen Jarvis'sin: bir web ajansının yerel işletme bulma ve satış CRM'indeki Türkçe asistan.",
    "Yalnızca aşağıdaki BAĞLAM verisini kullanarak kısa, net ve Türkçe cevap ver. Bağlamda olmayan",
    "sayı, işletme, fiyat veya tarih uydurma; bilmiyorsan açıkça söyle ve ilgili ekrana yönlendir.",
    "Hiçbir veriyi değiştiremezsin, mesaj gönderemezsin; bunlar istenirse kullanıcının ilgili ekranda",
    "yapması gerektiğini söyle. Cevap metninde action, open_leads, NO_WEBSITE gibi teknik kodları",
    "anma; bunları Türkçe karşılıklarıyla anlat (ör. 'web sitesi olmayan').",
    "Kullanıcı bir işletme listesi isterse (ör. 'Kadıköy'de 80+ skorlu diş klinikleri') action olarak",
    "open_leads öner; filtre değerlerini mümkünse bilinen kategori/ilçe listesinden seç. Bir ekrana",
    "gitmesi gerekiyorsa navigate öner. Gerek yoksa action null olsun. Aşama kodları: " +
      JARVIS_STAGES.join(", ") +
      ". Website durum kodları: " +
      JARVIS_WEBSITE_STATUSES.join(", ") +
      ".",
    "",
    "BAĞLAM:",
    JSON.stringify(context),
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, max = 80): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeFilter(raw: unknown): JarvisLeadFilter {
  if (!isRecord(raw)) return {};
  const filter: JarvisLeadFilter = {};
  const q = cleanString(raw.q);
  const city = cleanString(raw.city);
  const district = cleanString(raw.district);
  const category = cleanString(raw.category);
  if (q) filter.q = q;
  if (city) filter.city = city;
  if (district) filter.district = district;
  if (category) filter.category = category;
  if (typeof raw.minScore === "number" && Number.isFinite(raw.minScore)) {
    filter.minScore = Math.max(0, Math.min(100, Math.round(raw.minScore)));
  }
  if (typeof raw.stage === "string" && (JARVIS_STAGES as readonly string[]).includes(raw.stage)) {
    filter.stage = raw.stage;
  }
  if (typeof raw.websiteStatus === "string" && (JARVIS_WEBSITE_STATUSES as readonly string[]).includes(raw.websiteStatus)) {
    filter.websiteStatus = raw.websiteStatus;
  }
  return filter;
}

/**
 * Model çıktısını güvenli bir `JarvisReply`'a indirger: bilinmeyen action
 * tipleri, izin listesinde olmayan yollar ve geçersiz filtre değerleri atılır.
 * `answer` yoksa `null` döner (çağıran bunu hata sayar).
 */
export function sanitizeJarvisReply(raw: unknown): JarvisReply | null {
  if (!isRecord(raw)) return null;
  const answer = cleanString(raw.answer, 4000);
  if (!answer) return null;

  const action = raw.action;
  if (!isRecord(action)) return { answer, action: null };

  const label = cleanString(action.label, 60);
  if (action.type === "navigate" && typeof action.path === "string" && (JARVIS_NAV_PATHS as readonly string[]).includes(action.path)) {
    return { answer, action: { type: "navigate", path: action.path, label: label ?? "Ekrana git" } };
  }
  if (action.type === "open_leads") {
    return { answer, action: { type: "open_leads", filter: sanitizeFilter(action.filter), label: label ?? "Leadleri aç" } };
  }
  return { answer, action: null };
}

/** Lead filtresini Leadler sayfasının URL sorgu parametrelerine çevirir. */
export function leadFilterToSearchParams(filter: JarvisLeadFilter): string {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.city) params.set("city", filter.city);
  if (filter.district) params.set("district", filter.district);
  if (filter.category) params.set("category", filter.category);
  if (filter.minScore !== undefined) params.set("minScore", String(filter.minScore));
  if (filter.stage) params.set("stage", filter.stage);
  if (filter.websiteStatus) params.set("website", filter.websiteStatus);
  return params.toString();
}
