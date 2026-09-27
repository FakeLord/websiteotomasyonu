import { describe, expect, it } from "vitest";
import {
  activeProviders,
  buildChatCompletionBody,
  failureErrorCode,
  modelForOperation,
  normalizeAiConfig,
  summarizeChainFailure,
} from "./provider-chain";

describe("normalizeAiConfig", () => {
  it("defaults to OpenAI then NVIDIA when config is empty", () => {
    const config = normalizeAiConfig(null);
    expect(config.providers.map((p) => p.id)).toEqual(["openai", "nvidia"]);
    expect(config.dailyLimit).toBe(300);
    expect(config.providers[0]?.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.providers[1]?.extraBody).toEqual({ chat_template_kwargs: { enable_thinking: false } });
  });

  it("converts the legacy single-provider shape into a one-element chain", () => {
    const config = normalizeAiConfig({
      provider: "nvidia",
      model: "mistralai/mistral-nemotron",
      routes: { classify_reply: "small-model" },
      dailyLimit: 50,
    });
    expect(config.providers).toHaveLength(1);
    expect(config.providers[0]).toMatchObject({
      id: "nvidia",
      model: "mistralai/mistral-nemotron",
      routes: { classify_reply: "small-model" },
    });
    expect(config.dailyLimit).toBe(50);
  });

  it("keeps the configured provider order and fills defaults per provider", () => {
    const config = normalizeAiConfig({
      providers: [{ id: "nvidia" }, { id: "openai", model: "gpt-4.1-mini" }],
    });
    expect(config.providers.map((p) => `${p.id}:${p.model}`)).toEqual([
      "nvidia:nvidia/nemotron-3.5-lightning-30b-a3b",
      "openai:gpt-4.1-mini",
    ]);
  });

  it("drops unknown providers without a baseUrl and strips trailing slashes", () => {
    const config = normalizeAiConfig({
      providers: [
        { id: "mystery" },
        { id: "groq", baseUrl: "https://api.groq.com/openai/v1/", model: "llama" },
      ],
    });
    expect(config.providers).toHaveLength(1);
    expect(config.providers[0]?.baseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("excludes disabled providers from the active chain", () => {
    const config = normalizeAiConfig({ providers: [{ id: "openai", enabled: false }, { id: "nvidia" }] });
    expect(activeProviders(config).map((p) => p.id)).toEqual(["nvidia"]);
  });
});

describe("modelForOperation", () => {
  it("uses the per-operation route when present", () => {
    const [provider] = normalizeAiConfig({ providers: [{ id: "openai", routes: { classify_reply: "tiny" } }] })
      .providers;
    expect(modelForOperation(provider!, "classify_reply")).toBe("tiny");
    expect(modelForOperation(provider!, "draft_first_message")).toBe("gpt-4o-mini");
  });
});

describe("buildChatCompletionBody", () => {
  const request = {
    operation: "draft_first_message",
    system: "Sen bir satış asistanısın.",
    messages: [{ role: "user", content: "İşletme: ABC" }],
    jsonSchema: { type: "object", required: ["body"] },
    maxTokens: 500,
    temperature: 0.6,
  };

  it("embeds the JSON schema in the system prompt and merges provider extras", () => {
    const [, nvidia] = normalizeAiConfig(null).providers;
    const body = buildChatCompletionBody(nvidia!, request);
    expect(body.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain('{"type":"object","required":["body"]}');
    expect(messages[1]).toEqual({ role: "user", content: "İşletme: ABC" });
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("does not let provider extras override core fields", () => {
    const [openai] = normalizeAiConfig({ providers: [{ id: "openai", extraBody: { model: "evil" } }] }).providers;
    expect(buildChatCompletionBody(openai!, request).model).toBe("gpt-4o-mini");
  });
});

describe("failureErrorCode", () => {
  it("distinguishes exhausted quota from ordinary rate limiting", () => {
    expect(failureErrorCode({ kind: "http", status: 429, body: '{"error":{"code":"insufficient_quota"}}' })).toBe(
      "QUOTA_EXHAUSTED",
    );
    expect(failureErrorCode({ kind: "http", status: 429 })).toBe("HTTP_429");
    expect(failureErrorCode({ kind: "timeout" })).toBe("TIMEOUT");
  });
});

describe("summarizeChainFailure", () => {
  it("reports a configuration error when no provider has a key", () => {
    expect(summarizeChainFailure([{ kind: "missing_key" }, { kind: "missing_key" }])).toEqual({
      code: "VALIDATION",
      status: 400,
    });
  });

  it("reports rate limiting when any real attempt hit 429", () => {
    expect(summarizeChainFailure([{ kind: "http", status: 429 }, { kind: "timeout" }]).code).toBe("RATE_LIMITED");
  });

  it("reports PARSE_ERROR only when every real attempt failed to parse", () => {
    expect(summarizeChainFailure([{ kind: "missing_key" }, { kind: "parse" }]).code).toBe("PARSE_ERROR");
    expect(summarizeChainFailure([{ kind: "parse" }, { kind: "http", status: 500 }]).code).toBe("UPSTREAM_ERROR");
  });
});
