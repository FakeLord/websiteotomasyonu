// Sağlayıcı zincirini çalıştıran Deno tarafı (ai-gateway ve jarvis-chat ortak
// kullanır). Saf karar mantığı packages/core'da, burada yalnızca I/O var.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  activeProviders,
  buildChatCompletionBody,
  failureErrorCode,
  modelForOperation,
  normalizeAiConfig,
  secretNameForProvider,
  summarizeChainFailure,
  type AttemptFailure,
  type ChatRequestInput,
} from "./core/provider-chain.ts";
import { extractJsonObject } from "./core/extract-json.ts";

export interface RunChainInput {
  adminClient: SupabaseClient;
  callerClient: SupabaseClient;
  workspaceId: string;
  requestedBy: string | null;
  request: ChatRequestInput & { promptVersion: number };
  entityType: string | null;
  entityId: string | null;
}

export type RunChainResult =
  | {
      ok: true;
      json: Record<string, unknown>;
      provider: string;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      latencyMs: number;
    }
  | { ok: false; code: string; message: string; status: number };

export async function runChain(input: RunChainInput): Promise<RunChainResult> {
  const { adminClient, callerClient, workspaceId, request } = input;

  const { data: settingsRow } = await callerClient
    .from("workspace_settings")
    .select("ai_config")
    .eq("workspace_id", workspaceId)
    .single();
  const config = normalizeAiConfig(settingsRow?.ai_config);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: usedToday } = await adminClient
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .neq("status", "CACHED")
    .gte("created_at", dayStart.toISOString());
  if ((usedToday ?? 0) >= config.dailyLimit) {
    return {
      ok: false,
      code: "QUOTA_EXCEEDED",
      message: `Günlük AI çağrı kotası (${config.dailyLimit}) doldu`,
      status: 429,
    };
  }

  const logRun = (row: Record<string, unknown>) =>
    adminClient.from("ai_runs").insert({
      workspace_id: workspaceId,
      operation: request.operation,
      prompt_version: request.promptVersion,
      entity_type: input.entityType,
      entity_id: input.entityId,
      requested_by: input.requestedBy,
      ...row,
    });

  const failures: AttemptFailure[] = [];

  for (const provider of activeProviders(config)) {
    const { data: apiKey } = await adminClient.rpc("internal_get_secret", {
      ws: workspaceId,
      p_name: secretNameForProvider(provider.id),
    });
    if (!apiKey) {
      failures.push({ kind: "missing_key" });
      continue;
    }

    const model = modelForOperation(provider, request.operation);
    // J.3: geçersiz JSON'da aynı sağlayıcıyla bir kez daha denenir.
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      let failure: AttemptFailure | null = null;
      let parsed: Record<string, unknown> | null = null;
      let usage: { prompt_tokens?: number; completion_tokens?: number } = {};

      try {
        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(buildChatCompletionBody(provider, request)),
          signal: AbortSignal.timeout(provider.timeoutMs),
        });
        if (!response.ok) {
          failure = { kind: "http", status: response.status, body: (await response.text()).slice(0, 500) };
        } else {
          const completion = await response.json();
          usage = completion.usage ?? {};
          const content: string = completion.choices?.[0]?.message?.content ?? "";
          parsed = extractJsonObject(content);
          if (!parsed) failure = { kind: "parse" };
        }
      } catch (err) {
        failure = err instanceof DOMException && err.name === "TimeoutError" ? { kind: "timeout" } : { kind: "network" };
      }

      const latencyMs = Date.now() - started;
      await logRun({
        provider: provider.id,
        model,
        status: failure ? "ERROR" : "OK",
        error_code: failure ? failureErrorCode(failure) : null,
        input_tokens: usage.prompt_tokens ?? null,
        output_tokens: usage.completion_tokens ?? null,
        latency_ms: latencyMs,
      });

      if (!failure && parsed) {
        return {
          ok: true,
          json: parsed,
          provider: provider.id,
          model,
          usage: { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 },
          latencyMs,
        };
      }
      failures.push(failure!);
      if (failure!.kind !== "parse") break;
    }
  }

  const summary = summarizeChainFailure(failures);
  const messages: Record<string, string> = {
    VALIDATION: "Hiçbir AI sağlayıcısı için API anahtarı ayarlı değil (Ayarlar → API Ayarları).",
    RATE_LIMITED: "AI sağlayıcıları şu an istek sınırında; biraz sonra tekrar deneyin.",
    PARSE_ERROR: "AI çıktısı geçerli JSON değildi.",
    UPSTREAM_ERROR: "Tüm AI sağlayıcıları hata verdi.",
  };
  return { ok: false, code: summary.code, message: messages[summary.code] ?? summary.code, status: summary.status };
}
