/**
 * NVIDIA (build.nvidia.com / integrate.api.nvidia.com) OpenAI-uyumlu uç noktasına karşı
 * gerçek bir çağrı yapar. CLAUDE.md #6: gerçek API çağrısı yalnızca burada, elle çalıştırılır.
 *
 * Çalıştırma:
 *   NVIDIA_API_KEY=nvapi-... pnpm exec tsx scripts/smoke/nvidia.ts
 *   NVIDIA_MODEL=başka/model ile varsayılan model değiştirilebilir.
 */
import {
  PROVIDER_DEFAULTS,
  buildChatCompletionBody,
  buildDraftFirstMessagePrompt,
  normalizeAiConfig,
  extractJsonObject,
  validateDraft,
  type ServicePackageInfo,
} from "../../packages/core/src/index.ts";

const NVIDIA_BASE_URL = PROVIDER_DEFAULTS.nvidia!.baseUrl;
const MODEL = process.env.NVIDIA_MODEL ?? PROVIDER_DEFAULTS.nvidia!.model;

async function main() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY ortam değişkeni gerekli.");
    process.exit(1);
  }

  const packages: ServicePackageInfo[] = [
    {
      id: "pkg-1",
      name: "Website Yenileme",
      summary: "Mobil uyumlu, hızlı yüklenen kurumsal site",
      priceMin: 15000,
      priceMax: 25000,
      deliveryDaysMin: 10,
      deliveryDaysMax: 20,
    },
  ];

  const request = buildDraftFirstMessagePrompt({
    businessName: "ABC Diş Kliniği",
    category: "Diş Kliniği",
    district: "Kadıköy",
    websiteIssues: ["Site HTTPS kullanmıyor", "Mobilde düzgün görünmüyor"],
    channel: "EMAIL",
    relevantPackages: packages,
    salesRulesSummary: "Fiyat, indirim veya teslim süresi verme; ekip arkadaşım netleştirir.",
  });

  const provider = normalizeAiConfig({ providers: [{ id: "nvidia" }] }).providers[0]!;
  console.log(`→ ${NVIDIA_BASE_URL}/chat/completions (model: ${MODEL})`);
  const started = Date.now();

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildChatCompletionBody({ ...provider, model: MODEL }, request)),
  });

  const latencyMs = Date.now() - started;

  if (!response.ok) {
    const text = await response.text();
    console.error(`✗ HTTP ${response.status} (${latencyMs}ms):`, text);
    process.exit(1);
  }

  const payload = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  const rawContent = payload.choices[0]?.message.content ?? "";
  console.log(`✓ Yanıt alındı (${latencyMs}ms):`);
  console.log(rawContent);

  const parsed = extractJsonObject(rawContent) as { subject?: string; body?: string; used_facts?: string[] } | null;
  if (!parsed || typeof parsed.body !== "string") {
    console.error("✗ Yanıttan `body` içeren bir JSON nesnesi ayıklanamadı.");
    process.exit(1);
  }

  const validation = validateDraft({
    body: parsed.body,
    channel: "EMAIL",
    packages,
    salesRules: { allowDiscountMention: false, forbiddenWords: [] },
    verifiedReferenceNames: [],
    recipientBusinessName: "ABC Diş Kliniği",
    stopRequest: false,
  });

  console.log("\nvalidateDraft() sonucu:", validation);
  if (!validation.ok) {
    console.warn(
      "⚠ Model çıktısı guardrail'lardan geçemedi (fiyat/indirim/referans/teslim süresi uydurmuş olabilir)." +
        " Bu smoke test'in amacı tam olarak bunu yakalamak — kod tarafında bir sorun değil.",
    );
  }
}

main().catch((err) => {
  console.error("✗ Beklenmeyen hata:", err);
  process.exit(1);
});
