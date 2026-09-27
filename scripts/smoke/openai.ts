/**
 * OpenAI API'ye karşı gerçek bir `draft_first_message` çağrısı yapar
 * (ai-gateway ile aynı gövde: buildChatCompletionBody). CLAUDE.md #6: gerçek
 * API çağrısı yalnızca burada, elle çalıştırılır.
 *
 * Çalıştırma:
 *   OPENAI_API_KEY=sk-... pnpm exec tsx scripts/smoke/openai.ts
 *   OPENAI_MODEL=gpt-4.1-mini ile model değiştirilebilir.
 */
import {
  buildChatCompletionBody,
  buildDraftFirstMessagePrompt,
  extractJsonObject,
  normalizeAiConfig,
  validateDraft,
  type ServicePackageInfo,
} from "../../packages/core/src/index.ts";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY ortam değişkeni gerekli.");
    process.exit(1);
  }

  const base = normalizeAiConfig({ providers: [{ id: "openai" }] }).providers[0]!;
  const provider = { ...base, model: process.env.OPENAI_MODEL ?? base.model };

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

  console.log(`→ ${provider.baseUrl}/chat/completions (model: ${provider.model})`);
  const started = Date.now();
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildChatCompletionBody(provider, request)),
  });
  const latencyMs = Date.now() - started;

  if (!response.ok) {
    console.error(`✗ HTTP ${response.status} (${latencyMs}ms):`, await response.text());
    process.exit(1);
  }

  const payload = (await response.json()) as { choices: { message: { content: string } }[] };
  const rawContent = payload.choices[0]?.message.content ?? "";
  console.log(`✓ Yanıt alındı (${latencyMs}ms):\n${rawContent}`);

  const parsed = extractJsonObject(rawContent) as { body?: string } | null;
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
}

main().catch((err) => {
  console.error("✗ Beklenmeyen hata:", err);
  process.exit(1);
});
