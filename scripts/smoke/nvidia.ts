/**
 * NVIDIA (build.nvidia.com / integrate.api.nvidia.com) OpenAI-uyumlu uç noktasına karşı
 * gerçek bir çağrı yapar. CLAUDE.md #6: gerçek API çağrısı yalnızca burada, elle çalıştırılır.
 *
 * Çalıştırma:
 *   NVIDIA_API_KEY=nvapi-... pnpm exec tsx scripts/smoke/nvidia.ts
 *   NVIDIA_MODEL=başka/model ile varsayılan model değiştirilebilir.
 *   SMOKE_LANGUAGE=tr ile Türkçe taslak denenir (varsayılan: en; çeviri ayrı çağrıyla ölçülür).
 */
import {
  PROVIDER_DEFAULTS,
  buildChatCompletionBody,
  buildDraftFirstMessagePrompt,
  buildTranslateDraftPrompt,
  normalizeAiConfig,
  extractJsonObject,
  stripSignOff,
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

  const language = process.env.SMOKE_LANGUAGE === "tr" ? "tr" : "en";
  const request = buildDraftFirstMessagePrompt({
    businessName: "ABC Diş Kliniği",
    category: "Diş Kliniği",
    district: "Kadıköy",
    city: "İstanbul",
    rating: 4.6,
    reviewCount: 120,
    websiteIssues: ["Site HTTPS kullanmıyor", "Mobilde düzgün görünmüyor"],
    channel: "EMAIL",
    language,
    companyFacts:
      "Şirket: Biz bir yazılım şirketiyiz. İşletmeler için premium, canlı hissiyatlı, yeni nesil web siteleri, mobil uygulamalar ve iş süreçlerini kolaylaştıran otomasyonlar geliştiriyoruz. Teklifimiz: 15 dakikalık kısa bir görüşme ve işletmenin sitesi için ücretsiz bir örnek tasarım.",
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

  const parsed = extractJsonObject(rawContent) as {
    subject?: string;
    body?: string;
  } | null;
  if (!parsed || typeof parsed.body !== "string") {
    console.error("✗ Yanıttan `body` içeren bir JSON nesnesi ayıklanamadı.");
    process.exit(1);
  }

  const shared = {
    channel: "EMAIL" as const,
    packages,
    salesRules: { allowDiscountMention: false, forbiddenWords: ["indirim", "%", "bedava", "garanti", "discount", "guarantee"] },
    verifiedReferenceNames: [],
    recipientBusinessName: "ABC Diş Kliniği",
    contextNames: ["Diş Kliniği", "Kadıköy", "İstanbul"],
    stopRequest: false,
  };
  const validation = validateDraft({ ...shared, body: stripSignOff(parsed.body) });
  console.log(`\nDil: ${language}`);
  console.log("validateDraft() sonucu:", validation);

  // Çeviri arayüzde taslaktan SONRA, ayrı çağrıyla gelir; süresini ayrı ölçeriz.
  if (language !== "tr") {
    const translateStarted = Date.now();
    const translateResponse = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(
        buildChatCompletionBody(
          { ...provider, model: MODEL },
          buildTranslateDraftPrompt({ subject: parsed.subject, body: stripSignOff(parsed.body), channel: "EMAIL" }),
        ),
      ),
    });
    const translateMs = Date.now() - translateStarted;
    if (!translateResponse.ok) {
      console.error(`✗ Çeviri HTTP ${translateResponse.status} (${translateMs}ms):`, await translateResponse.text());
    } else {
      const translatePayload = (await translateResponse.json()) as { choices: { message: { content: string } }[] };
      console.log(`✓ Türkçe çeviri (${translateMs}ms):`);
      console.log(translatePayload.choices[0]?.message.content ?? "");
    }
  }
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
