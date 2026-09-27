// Bu dosya Deno Edge Function'larından (ai-gateway, jarvis-chat) göreli yolla
// içe aktarılır; bu yüzden hiçbir import içermemelidir.

export interface AiProviderConfig {
  id: string;
  baseUrl: string;
  model: string;
  routes: Record<string, string>;
  timeoutMs: number;
  enabled: boolean;
  /** Sağlayıcıya özel ek istek alanları (ör. NVIDIA'da düşünme modunu kapatmak). */
  extraBody: Record<string, unknown>;
}

export interface AiChainConfig {
  providers: AiProviderConfig[];
  dailyLimit: number;
}

export const DEFAULT_DAILY_LIMIT = 300;

interface ProviderDefaults {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  extraBody: Record<string, unknown>;
}

// NVIDIA model kataloğu sık değişiyor (llama-3.1/3.3 serisi 2026-08-26'da emekliye
// ayrıldı). nemotron-3.5-lightning, düşünme modu kapalıyken ~1-2 sn'de geçerli
// JSON dönüyor (scripts/smoke/nvidia.ts, 2026-09-27).
export const PROVIDER_DEFAULTS: Record<string, ProviderDefaults> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", timeoutMs: 30_000, extraBody: {} },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    timeoutMs: 90_000,
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
};

export const DEFAULT_PROVIDER_ORDER = ["openai", "nvidia"] as const;

export function secretNameForProvider(providerId: string): string {
  return `${providerId}_api_key`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string" && v.trim().length > 0) out[key] = v.trim();
  }
  return out;
}

function buildProvider(raw: Record<string, unknown>): AiProviderConfig | null {
  const id = typeof raw.id === "string" ? raw.id : typeof raw.provider === "string" ? raw.provider : null;
  if (!id) return null;
  const defaults = PROVIDER_DEFAULTS[id];
  const baseUrl = typeof raw.baseUrl === "string" && raw.baseUrl.length > 0 ? raw.baseUrl : defaults?.baseUrl;
  const model = typeof raw.model === "string" && raw.model.length > 0 ? raw.model : defaults?.model;
  if (!baseUrl || !model) return null;
  const timeoutMs =
    typeof raw.timeoutMs === "number" && raw.timeoutMs > 0 ? raw.timeoutMs : (defaults?.timeoutMs ?? 60_000);
  return {
    id,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    routes: toStringRecord(raw.routes),
    timeoutMs,
    enabled: raw.enabled !== false,
    extraBody: isRecord(raw.extraBody) ? raw.extraBody : (defaults?.extraBody ?? {}),
  };
}

function defaultProviders(): AiProviderConfig[] {
  return DEFAULT_PROVIDER_ORDER.map((id) => buildProvider({ id })).filter(
    (p): p is AiProviderConfig => p !== null,
  );
}

/**
 * `workspace_settings.ai_config`'i zincir şekline çevirir. Faz 6'daki eski tek
 * sağlayıcılı şekil (`{provider, model, routes, baseUrl}`) tek elemanlı zincire
 * dönüşür; hiç yapılandırma yoksa OpenAI → NVIDIA varsayılanı kullanılır.
 */
export function normalizeAiConfig(raw: unknown): AiChainConfig {
  const record = isRecord(raw) ? raw : {};
  const dailyLimit =
    typeof record.dailyLimit === "number" && record.dailyLimit > 0 ? record.dailyLimit : DEFAULT_DAILY_LIMIT;

  if (Array.isArray(record.providers)) {
    const providers = record.providers
      .filter(isRecord)
      .map(buildProvider)
      .filter((p): p is AiProviderConfig => p !== null);
    return { providers: providers.length > 0 ? providers : defaultProviders(), dailyLimit };
  }

  if (typeof record.provider === "string") {
    const legacy = buildProvider(record);
    return { providers: legacy ? [legacy] : defaultProviders(), dailyLimit };
  }

  return { providers: defaultProviders(), dailyLimit };
}

export interface ChatRequestInput {
  operation: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  jsonSchema?: Record<string, unknown> | undefined;
  maxTokens: number;
  temperature: number;
}

/**
 * OpenAI-uyumlu `/chat/completions` gövdesini üretir. JSON şeması sistem
 * promptuna açıkça eklenir: `response_format: json_object` yalnızca "geçerli
 * JSON" garantisi verir, anahtar adlarını değil — şema gösterilmezse modeller
 * `body` yerine `mesaj` gibi anahtarlar uyduruyor (smoke test, 2026-09-27).
 */
export function buildChatCompletionBody(
  provider: AiProviderConfig,
  request: ChatRequestInput,
): Record<string, unknown> {
  const system = request.jsonSchema
    ? `${request.system}\n\nÇIKTI BİÇİMİ: Yalnızca aşağıdaki JSON Schema'ya uyan tek bir JSON nesnesi döndür. ` +
      `Anahtar adlarını birebir kullan, başka anahtar ekleme, JSON dışında metin yazma.\n` +
      JSON.stringify(request.jsonSchema)
    : request.system;
  return {
    ...provider.extraBody,
    model: modelForOperation(provider, request.operation),
    messages: [{ role: "system", content: system }, ...request.messages],
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    response_format: { type: "json_object" },
  };
}

export function activeProviders(config: AiChainConfig): AiProviderConfig[] {
  return config.providers.filter((p) => p.enabled);
}

export function modelForOperation(provider: AiProviderConfig, operation: string): string {
  return provider.routes[operation] ?? provider.model;
}

export type AttemptFailure =
  | { kind: "missing_key" }
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "parse" }
  | { kind: "http"; status: number; body?: string };

/** `ai_runs.error_code`'a yazılacak kısa kod. */
export function failureErrorCode(failure: AttemptFailure): string {
  switch (failure.kind) {
    case "missing_key":
      return "MISSING_KEY";
    case "network":
      return "NETWORK_ERROR";
    case "timeout":
      return "TIMEOUT";
    case "parse":
      return "PARSE_ERROR";
    case "http":
      if (failure.status === 429 && failure.body?.includes("insufficient_quota")) return "QUOTA_EXHAUSTED";
      return `HTTP_${failure.status}`;
  }
}

/**
 * Zincirdeki tüm denemeler başarısız olduğunda istemciye dönecek hata. Herhangi
 * bir deneme hız/kota sınırına takıldıysa RATE_LIMITED, hiçbir sağlayıcının
 * anahtarı yoksa yapılandırma hatası, aksi halde upstream hatası döner.
 */
export function summarizeChainFailure(failures: AttemptFailure[]): {
  code: "RATE_LIMITED" | "VALIDATION" | "PARSE_ERROR" | "UPSTREAM_ERROR";
  status: number;
} {
  if (failures.length === 0 || failures.every((f) => f.kind === "missing_key")) {
    return { code: "VALIDATION", status: 400 };
  }
  const real = failures.filter((f) => f.kind !== "missing_key");
  if (real.some((f) => f.kind === "http" && f.status === 429)) return { code: "RATE_LIMITED", status: 429 };
  if (real.every((f) => f.kind === "parse")) return { code: "PARSE_ERROR", status: 502 };
  return { code: "UPSTREAM_ERROR", status: 502 };
}
