/**
 * NVIDIA (build.nvidia.com / integrate.api.nvidia.com) OpenAI-uyumlu uç noktasına karşı
 * gerçek bir çağrı yapar. CLAUDE.md #6: gerçek API çağrısı yalnızca burada, elle çalıştırılır.
 *
 * Çalıştırma:
 *   NVIDIA_API_KEY=nvapi-... pnpm exec tsx scripts/smoke/nvidia.ts
 */
import {
  buildDraftFirstMessagePrompt,
  validateDraft,
  type ServicePackageInfo,
} from "../../packages/core/src/index.ts";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "mistralai/mistral-nemotron";

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

  console.log(`→ ${NVIDIA_BASE_URL}/chat/completions (model: ${MODEL})`);
  const started = Date.now();

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: request.system }, ...request.messages],
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      response_format: { type: "json_object" },
    }),
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

  let parsed: { subject?: string; body: string; used_facts: string[] };
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    console.error("✗ Yanıt geçerli JSON değil (jsonSchema/response_format beklenirken).");
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
