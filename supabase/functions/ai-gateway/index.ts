// ai-gateway: OpenAI-uyumlu sağlayıcıya (varsayılan NVIDIA — bkz.
// docs/adr/0006-ai-integration.md) tek giriş noktası. Anahtar burada Vault'tan
// okunur, hiçbir zaman istemciye dönmez. Günlük kota + 24 saatlik
// (operation, input_hash, prompt_version) cache uygular; `ai_runs`'a yalnızca
// metadata yazar — prompt/yanıt metni ai_runs'ta TUTULMAZ (SPEC.md → E), asıl
// çıktı istemciye hiç açılmayan `ai_output_cache`'te durur.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isValidBody } from "./validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEFAULT_DAILY_LIMIT = 300;
const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "POST required" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ code: "FORBIDDEN", message: "missing Authorization header" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ code: "VALIDATION", message: "invalid JSON body" }, 400);
  }
  if (!isValidBody(rawBody)) {
    return json({ code: "VALIDATION", message: "workspaceId, request, inputHash required" }, 400);
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isMember, error: isMemberError } = await callerClient.rpc("is_member", {
    ws: rawBody.workspaceId,
  });
  if (isMemberError || !isMember) {
    return json({ code: "FORBIDDEN", message: "workspace membership required" }, 403);
  }

  const { data: userData } = await callerClient.auth.getUser();
  const requestedBy = userData.user?.id ?? null;

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: settingsRow } = await callerClient
    .from("workspace_settings")
    .select("ai_config")
    .eq("workspace_id", rawBody.workspaceId)
    .single();
  const aiConfig = (settingsRow?.ai_config ?? { provider: "nvidia", routes: {} }) as {
    provider: string;
    model?: string;
    routes?: Record<string, string>;
    dailyLimit?: number;
  };

  const dailyLimit = aiConfig.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { count: usedToday } = await adminClient
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", rawBody.workspaceId)
    .gte("created_at", dayStart.toISOString());

  if ((usedToday ?? 0) >= dailyLimit) {
    return json({ code: "QUOTA_EXCEEDED", message: `Günlük AI çağrı kotası (${dailyLimit}) doldu` }, 429);
  }

  const { operation, promptVersion } = rawBody.request;
  // meta/llama-3.1-70b-instruct, NVIDIA tarafından 2026-08-26'da emekliye ayrıldı (smoke test
  // ile bulundu, bkz. scripts/smoke/nvidia.ts). mistralai/mistral-nemotron, bu hesapta erişilebilir
  // olduğu doğrulanan güncel bir genel amaçlı model.
  const model = aiConfig.routes?.[operation] ?? aiConfig.model ?? "mistralai/mistral-nemotron";

  const { data: cached } = await adminClient
    .from("ai_output_cache")
    .select("output, model, created_at")
    .eq("workspace_id", rawBody.workspaceId)
    .eq("operation", operation)
    .eq("input_hash", rawBody.inputHash)
    .eq("prompt_version", promptVersion)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();

  if (cached) {
    await adminClient.from("ai_runs").insert({
      workspace_id: rawBody.workspaceId,
      provider: aiConfig.provider,
      model: cached.model,
      operation,
      prompt_version: promptVersion,
      status: "CACHED",
      entity_type: rawBody.entityType ?? null,
      entity_id: rawBody.entityId ?? null,
      requested_by: requestedBy,
    });
    return json({ json: cached.output, cached: true }, 200);
  }

  const { data: apiKey, error: keyError } = await adminClient.rpc("internal_get_secret", {
    ws: rawBody.workspaceId,
    p_name: aiConfig.provider === "nvidia" ? "nvidia_api_key" : `${aiConfig.provider}_api_key`,
  });
  if (keyError || !apiKey) {
    return json({ code: "VALIDATION", message: `${aiConfig.provider} API anahtarı ayarlı değil` }, 400);
  }

  const baseUrl = aiConfig.provider === "nvidia" ? DEFAULT_NVIDIA_BASE_URL : (aiConfig as { baseUrl?: string }).baseUrl;
  if (!baseUrl) {
    return json({ code: "VALIDATION", message: "AI sağlayıcı base URL'i ayarlı değil" }, 400);
  }

  const started = Date.now();
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: rawBody.request.system }, ...rawBody.request.messages],
        max_tokens: rawBody.request.maxTokens,
        temperature: rawBody.request.temperature,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    await adminClient.from("ai_runs").insert({
      workspace_id: rawBody.workspaceId,
      provider: aiConfig.provider,
      model,
      operation,
      prompt_version: promptVersion,
      status: "ERROR",
      error_code: "NETWORK_ERROR",
      latency_ms: Date.now() - started,
      entity_type: rawBody.entityType ?? null,
      entity_id: rawBody.entityId ?? null,
      requested_by: requestedBy,
    });
    return json({ code: "UPSTREAM_ERROR", message: err instanceof Error ? err.message : "network error" }, 502);
  }

  const latencyMs = Date.now() - started;

  if (!upstreamResponse.ok) {
    const status = upstreamResponse.status === 429 ? "ERROR" : "ERROR";
    await adminClient.from("ai_runs").insert({
      workspace_id: rawBody.workspaceId,
      provider: aiConfig.provider,
      model,
      operation,
      prompt_version: promptVersion,
      status,
      error_code: `HTTP_${upstreamResponse.status}`,
      latency_ms: latencyMs,
      entity_type: rawBody.entityType ?? null,
      entity_id: rawBody.entityId ?? null,
      requested_by: requestedBy,
    });
    return json(
      { code: upstreamResponse.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR", message: `AI sağlayıcı hatası: ${upstreamResponse.status}` },
      upstreamResponse.status === 429 ? 429 : 502,
    );
  }

  const completion = await upstreamResponse.json();
  const content: string | undefined = completion.choices?.[0]?.message?.content;
  const usage = completion.usage ?? {};

  let parsedJson: unknown;
  try {
    parsedJson = content ? JSON.parse(content) : null;
  } catch {
    await adminClient.from("ai_runs").insert({
      workspace_id: rawBody.workspaceId,
      provider: aiConfig.provider,
      model,
      operation,
      prompt_version: promptVersion,
      status: "ERROR",
      error_code: "PARSE_ERROR",
      input_tokens: usage.prompt_tokens ?? null,
      output_tokens: usage.completion_tokens ?? null,
      latency_ms: latencyMs,
      entity_type: rawBody.entityType ?? null,
      entity_id: rawBody.entityId ?? null,
      requested_by: requestedBy,
    });
    return json({ code: "PARSE_ERROR", message: "model çıktısı geçerli JSON değil" }, 502);
  }

  await adminClient.from("ai_runs").insert({
    workspace_id: rawBody.workspaceId,
    provider: aiConfig.provider,
    model,
    operation,
    prompt_version: promptVersion,
    status: "OK",
    input_tokens: usage.prompt_tokens ?? null,
    output_tokens: usage.completion_tokens ?? null,
    latency_ms: latencyMs,
    entity_type: rawBody.entityType ?? null,
    entity_id: rawBody.entityId ?? null,
    requested_by: requestedBy,
  });

  await adminClient.from("ai_output_cache").upsert({
    workspace_id: rawBody.workspaceId,
    operation,
    input_hash: rawBody.inputHash,
    prompt_version: promptVersion,
    output: parsedJson,
    model,
  });

  return json(
    {
      json: parsedJson,
      usage: { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 },
      latencyMs,
      cached: false,
    },
    200,
  );
});
