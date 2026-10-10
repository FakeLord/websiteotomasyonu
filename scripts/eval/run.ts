/**
 * AI kalite değerlendirmesi (PHASE-16, BACKLOG #30). CLAUDE.md #6: gerçek API çağrısı yalnızca scripts/ altında, elle.
 *
 * Çalıştırma (ücretsiz NVIDIA anahtarıyla; anahtarı yalnızca kendi terminalinde ortam değişkeni olarak ver):
 *   $env:NVIDIA_API_KEY = "nvapi-..."                     # PowerShell
 *   pnpm exec tsx scripts/eval/run.ts                      # her şey: 60 taslak + 60 cevap sınıflandırma
 *   pnpm exec tsx scripts/eval/run.ts --only draft --limit 5
 *   pnpm exec tsx scripts/eval/run.ts --only classify --lang en
 *   pnpm exec tsx scripts/eval/run.ts --mock               # ağsız, hat kontrolü (gerçek model yok)
 *
 * Seçenekler: --only draft|classify  --lang tr|en  --limit N  --delay ms (varsayılan 2000)  --model ad  --mock
 * Sonuçlar scripts/eval/results/ altına JSON olarak yazılır (git dışında).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  PROVIDER_DEFAULTS,
  buildChatCompletionBody,
  buildClassifyReplyPrompt,
  buildDraftFirstMessagePrompt,
  detectDraftLanguage,
  extractJsonObject,
  findForeignWords,
  hasStopKeyword,
  normalizeAiConfig,
  retryRejected,
  stripSignOff,
  summarizeClassifyEval,
  summarizeDraftEval,
  validateDraft,
  type AIPromptRequest,
  type ClassifyEvalResult,
  type DraftEvalResult,
  type EvalLanguage,
} from "../../packages/core/src/index.ts";
import {
  DRAFT_CASES,
  EVAL_COMPANY_FACTS,
  EVAL_PACKAGES,
  EVAL_SALES_RULES,
  REPLY_CASES,
  type DraftCase,
  type ReplyCase,
} from "./dataset.ts";

// Uygulamadaki FORBIDDEN_WORDS ile aynı (apps/desktop/src/features/outreach/outreach.ts).
const FORBIDDEN_WORDS = ["indirim", "%", "bedava", "garanti", "discount", "guarantee", "guaranteed"];

interface Options {
  only: "draft" | "classify" | null;
  lang: EvalLanguage | null;
  limit: number | null;
  delayMs: number;
  model: string | null;
  mock: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { only: null, lang: null, limit: null, delayMs: 2000, model: null, mock: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--only" && (next === "draft" || next === "classify")) {
      options.only = next;
      i += 1;
    } else if (arg === "--lang" && (next === "tr" || next === "en")) {
      options.lang = next;
      i += 1;
    } else if (arg === "--limit" && next) {
      options.limit = Math.max(1, Number(next) || 1);
      i += 1;
    } else if (arg === "--delay" && next) {
      options.delayMs = Math.max(0, Number(next) || 0);
      i += 1;
    } else if (arg === "--model" && next) {
      options.model = next;
      i += 1;
    } else if (arg === "--mock") {
      options.mock = true;
    }
  }
  return options;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------------
// Model çağrısı
// ---------------------------------------------------------------------------------------------------
function createModelCaller(options: Options) {
  if (options.mock) {
    return async (request: AIPromptRequest): Promise<unknown> => {
      const text = request.messages.map((m) => m.content).join("\n");
      if (request.operation === "classify_reply") {
        const stop = hasStopKeyword(text.split("Son gelen mesaj:")[1] ?? "");
        return { intent: stop ? "STOP_CONTACT" : "INTERESTED", confidence: 0.9, requirements_delta: [], stop_request: stop, language: "tr" };
      }
      const english = /İngilizce|English/i.test(request.system + text);
      return english
        ? {
            subject: "Quick idea for your website",
            body: "Hello, we noticed a few things on your website that could work better on mobile. We are a software company and can prepare a free sample design for your business. Would a 15 minute call suit you?",
          }
        : {
            subject: "Web siteniz için kısa bir fikir",
            body: "Merhaba, web sitenizi incelediğimizde mobilde geliştirilebilecek noktalar gördük. Biz bir yazılım şirketiyiz ve işletmenize özel ücretsiz bir örnek tasarım hazırlayabiliriz. 15 dakikalık kısa bir görüşme için uygun olur musunuz?",
          };
    };
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY ortam değişkeni gerekli (ya da ağsız hat kontrolü için --mock kullanın).");
    process.exit(1);
  }
  const base = normalizeAiConfig({ providers: [{ id: "nvidia" }] }).providers[0]!;
  const provider = { ...base, model: options.model ?? process.env.NVIDIA_MODEL ?? PROVIDER_DEFAULTS.nvidia!.model };
  console.log(`Model: ${provider.model} (${provider.baseUrl})`);

  return async (request: AIPromptRequest): Promise<unknown> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(buildChatCompletionBody(provider, request)),
      });
      if (response.status === 429 || response.status >= 500) {
        // Ücretsiz katmanın hız sınırı: bekleyip yeniden dene.
        await sleep(8000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const json = extractJsonObject(content);
      // JSON dışı yanıt (kesilmiş/boş içerik) uygulamadaki gibi "geçersiz biçim" sayılır ve yeniden denenir;
      // ham metin teşhis için örneğe yazılır.
      if (json === null) return { __unparseable: content.slice(0, 400) };
      return json;
    }
    throw new Error("Hız sınırı: 4 denemede de yanıt alınamadı.");
  };
}

// ---------------------------------------------------------------------------------------------------
// Taslak değerlendirmesi: uygulamadaki generateFirstMessageDraft ile aynı kontrol sırası
// ---------------------------------------------------------------------------------------------------
interface DraftSample {
  id: string;
  language: EvalLanguage;
  businessName: string;
  ok: boolean;
  reasons: string[];
  subject?: string;
  body: string;
}

async function evaluateDraft(
  call: (request: AIPromptRequest) => Promise<unknown>,
  testCase: DraftCase,
  delayMs: number,
): Promise<{ result: DraftEvalResult; sample: DraftSample }> {
  const request = buildDraftFirstMessagePrompt({
    businessName: testCase.businessName,
    category: testCase.category,
    district: testCase.district,
    city: testCase.city,
    rating: testCase.rating,
    reviewCount: testCase.reviewCount,
    websiteIssues: testCase.websiteIssues,
    channel: "EMAIL",
    language: testCase.language,
    companyFacts: EVAL_COMPANY_FACTS,
    relevantPackages: EVAL_PACKAGES,
    salesRulesSummary: EVAL_SALES_RULES,
  });

  let attempts = 0;
  let firstAttemptOk = false;
  let last: { subject?: string; body: string } = { body: "" };
  const started = Date.now();

  try {
    const outcome = await retryRejected(async (attempt) => {
      attempts = attempt + 1;
      if (attempt > 0) await sleep(delayMs);
      const raw = (await call(request)) as { subject?: unknown; body?: unknown; __unparseable?: unknown };
      if (typeof raw.body !== "string") {
        last = { body: typeof raw.__unparseable === "string" ? `[JSON DEĞİL] ${raw.__unparseable}` : "" };
        return { ok: false, reasons: ["INVALID_SHAPE"] };
      }
      const body = stripSignOff(raw.body);
      last = { ...(typeof raw.subject === "string" ? { subject: raw.subject } : {}), body };
      const written = detectDraftLanguage(body);
      if (written !== "unknown" && written !== testCase.language) return { ok: false, reasons: ["WRONG_LANGUAGE"] };
      const leaked = findForeignWords(body, testCase.language, [testCase.businessName, testCase.category, testCase.district ?? "", testCase.city]);
      if (leaked.length > 0) return { ok: false, reasons: [`FOREIGN_WORD:${leaked[0]}`] };
      const validation = validateDraft({
        body,
        channel: "EMAIL",
        packages: EVAL_PACKAGES,
        salesRules: { allowDiscountMention: false, forbiddenWords: FORBIDDEN_WORDS },
        verifiedReferenceNames: [],
        recipientBusinessName: testCase.businessName,
        contextNames: [testCase.category, testCase.district ?? "", testCase.city].filter(Boolean),
        stopRequest: false,
      });
      if (attempt === 0 && validation.ok) firstAttemptOk = true;
      return { ok: validation.ok, reasons: validation.reasons };
    });
    return {
      result: {
        id: testCase.id,
        language: testCase.language,
        ok: outcome.ok,
        firstAttemptOk,
        attempts,
        reasons: outcome.reasons,
        latencyMs: Date.now() - started,
      },
      sample: { id: testCase.id, language: testCase.language, businessName: testCase.businessName, ok: outcome.ok, reasons: outcome.reasons, ...last },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: { id: testCase.id, language: testCase.language, ok: false, firstAttemptOk: false, attempts, reasons: [], latencyMs: Date.now() - started, error: message },
      sample: { id: testCase.id, language: testCase.language, businessName: testCase.businessName, ok: false, reasons: [`ERROR: ${message}`], ...last },
    };
  }
}

// ---------------------------------------------------------------------------------------------------
// Cevap sınıflandırma değerlendirmesi: model + kural tabanlı STOP yedeği (inbound.ts ile aynı karar)
// ---------------------------------------------------------------------------------------------------
async function evaluateReply(call: (request: AIPromptRequest) => Promise<unknown>, testCase: ReplyCase): Promise<ClassifyEvalResult> {
  try {
    const raw = (await call(buildClassifyReplyPrompt({ lastInboundMessage: testCase.message, conversationSummary: "" }))) as {
      intent?: unknown;
      stop_request?: unknown;
    };
    const predictedIntent = typeof raw.intent === "string" ? raw.intent : null;
    return {
      id: testCase.id,
      language: testCase.language,
      expectedIntent: testCase.intent,
      predictedIntent,
      expectedStop: testCase.stop,
      predictedStop: raw.stop_request === true || predictedIntent === "STOP_CONTACT" || hasStopKeyword(testCase.message),
    };
  } catch (error) {
    return {
      id: testCase.id,
      language: testCase.language,
      expectedIntent: testCase.intent,
      predictedIntent: null,
      expectedStop: testCase.stop,
      predictedStop: hasStopKeyword(testCase.message),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const pct = (value: number) => `%${Math.round(value * 100)}`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const call = createModelCaller(options);
  const out: Record<string, unknown> = { startedAt: new Date().toISOString(), options };

  const pick = <T extends { language: EvalLanguage }>(cases: T[]): T[] => {
    const filtered = options.lang ? cases.filter((c) => c.language === options.lang) : cases;
    return options.limit ? filtered.slice(0, options.limit) : filtered;
  };

  if (options.only !== "classify") {
    const cases = pick(DRAFT_CASES);
    console.log(`\n== İlk mesaj taslağı: ${cases.length} örnek ==`);
    const results: DraftEvalResult[] = [];
    const samples: DraftSample[] = [];
    for (const testCase of cases) {
      const { result, sample } = await evaluateDraft(call, testCase, options.delayMs);
      results.push(result);
      samples.push(sample);
      const mark = result.error ? "!" : result.ok ? "✓" : "✗";
      console.log(`${mark} ${testCase.id} ${testCase.businessName} (${result.attempts} deneme, ${result.latencyMs} ms)${result.reasons.length ? " — " + result.reasons.join(", ") : ""}${result.error ? " — " + result.error : ""}`);
      await sleep(options.delayMs);
    }
    const summary = summarizeDraftEval(results);
    console.log(
      `\nKullanılabilir taslak: ${summary.usable}/${summary.total} (${pct(summary.usableRate)}) — ilk denemede ${pct(summary.firstAttemptRate)}`,
    );
    console.log(`  Türkçe: ${pct(summary.byLanguage.tr.usableRate)} (${summary.byLanguage.tr.total})  İngilizce: ${pct(summary.byLanguage.en.usableRate)} (${summary.byLanguage.en.total})`);
    console.log(`  Ortalama süre: ${summary.avgLatencyMs} ms · sağlayıcı hatası: ${summary.providerErrors}`);
    if (Object.keys(summary.reasonCounts).length > 0) console.log("  Red sebepleri:", summary.reasonCounts);
    console.log(`  Hedef %${Math.round(summary.threshold * 100)} her iki dilde: ${summary.passed ? "GEÇTİ" : "GEÇMEDİ"}`);
    out.draft = { summary, results, samples };
  }

  if (options.only !== "draft") {
    const cases = pick(REPLY_CASES);
    console.log(`\n== Cevap sınıflandırma: ${cases.length} örnek ==`);
    const results: ClassifyEvalResult[] = [];
    for (const testCase of cases) {
      const result = await evaluateReply(call, testCase);
      results.push(result);
      const ok = result.predictedIntent === result.expectedIntent;
      console.log(`${result.error ? "!" : ok ? "✓" : "✗"} ${testCase.id} beklenen=${result.expectedIntent} bulunan=${result.predictedIntent ?? "-"}${result.error ? " — " + result.error : ""}`);
      await sleep(options.delayMs);
    }
    const summary = summarizeClassifyEval(results);
    console.log(`\nNiyet doğruluğu: ${pct(summary.intentAccuracy)} (Türkçe ${pct(summary.byLanguage.tr.intentAccuracy)}, İngilizce ${pct(summary.byLanguage.en.intentAccuracy)})`);
    console.log(`  "Yazmayın" isteklerinin yakalanması: ${pct(summary.stopRecall)} · yanlış durdurma: ${pct(summary.stopFalsePositiveRate)}`);
    if (Object.keys(summary.confusions).length > 0) console.log("  Karışıklıklar:", summary.confusions);
    out.classify = { summary, results };
  }

  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  const file = new URL(`./results/${new Date().toISOString().replace(/[:.]/g, "-")}${options.mock ? "-mock" : ""}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nSonuçlar yazıldı: ${file.pathname.replace(/^\//, "")}`);
}

main().catch((error) => {
  console.error("✗ Beklenmeyen hata:", error);
  process.exit(1);
});
