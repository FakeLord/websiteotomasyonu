// ai-gateway: OpenAI-uyumlu sağlayıcı zincirine tek giriş noktası (varsayılan
// OpenAI → NVIDIA, bkz. docs/adr/0007-redesign-and-scope-extension.md). Anahtarlar
// burada Vault'tan okunur, hiçbir zaman istemciye dönmez. Günlük kota + 24 saatlik
// (operation, input_hash, prompt_version) cache uygular; `ai_runs`'a her deneme için
// yalnızca metadata yazar — prompt/yanıt metni ai_runs'ta TUTULMAZ (SPEC.md → E).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { runChain } from "../_shared/ai-chain.ts";
import { isValidBody } from "./validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { operation, promptVersion } = rawBody.request;

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
      provider: "cache",
      model: cached.model,
      operation,
      prompt_version: promptVersion,
      status: "CACHED",
      entity_type: rawBody.entityType ?? null,
      entity_id: rawBody.entityId ?? null,
      requested_by: userData.user?.id ?? null,
    });
    return json({ json: cached.output, cached: true }, 200);
  }

  const result = await runChain({
    adminClient,
    callerClient,
    workspaceId: rawBody.workspaceId,
    requestedBy: userData.user?.id ?? null,
    request: {
      operation,
      promptVersion,
      system: rawBody.request.system,
      messages: rawBody.request.messages,
      jsonSchema: rawBody.request.jsonSchema,
      maxTokens: rawBody.request.maxTokens,
      temperature: rawBody.request.temperature,
    },
    entityType: rawBody.entityType ?? null,
    entityId: rawBody.entityId ?? null,
  });

  if (!result.ok) {
    return json({ code: result.code, message: result.message }, result.status);
  }

  await adminClient.from("ai_output_cache").upsert({
    workspace_id: rawBody.workspaceId,
    operation,
    input_hash: rawBody.inputHash,
    prompt_version: promptVersion,
    output: result.json,
    model: result.model,
  });

  return json(
    {
      json: result.json,
      provider: result.provider,
      usage: result.usage,
      latencyMs: result.latencyMs,
      cached: false,
    },
    200,
  );
});
