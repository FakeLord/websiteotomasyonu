// places-search: Google Places API (New) Text Search proxy'si. Yalnızca dış
// API çağrısını yapar ve HAM sonucu döner; dedupe/insert mantığı istemcideki
// (masaüstü worker) import_business() RPC'sindedir — iş mantığı tek yerde
// (SPEC.md → G.1, docs/adr/0004-places-vault.md).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildSearchRequest, fieldMaskFor, isValidBody } from "./validate.ts";

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
    return json({ code: "VALIDATION", message: "workspaceId, textQuery required" }, 400);
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

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: apiKey, error: keyError } = await adminClient.rpc("internal_get_secret", {
    ws: rawBody.workspaceId,
    p_name: "google_places_api_key",
  });

  if (keyError || !apiKey) {
    return json({ code: "VALIDATION", message: "Google Places API anahtarı ayarlı değil" }, 400);
  }

  // ADR 0014: aylık çağrı sınırı burada, sunucuda zorlanır. Sayaç Google'a gitmeden ÖNCE tüketilir; sınır
  // dolduysa istek hiç gönderilmez. Google çağrısı başarısız olursa (faturalanmaz) tüketim iade edilir.
  const { data: quota, error: quotaError } = await adminClient.rpc("consume_places_call", {
    ws: rawBody.workspaceId,
  });
  if (quotaError) {
    return json({ code: "UPSTREAM_ERROR", message: "Places sayacı okunamadı" }, 500);
  }
  if (!quota?.allowed) {
    // 402: istemci bunu hız sınırı (429) gibi yeniden denemez; tarama planı "bütçe doldu" diye durur.
    return json(
      {
        code: "QUOTA_EXCEEDED",
        message: `Aylık Places çağrı sınırı doldu (${quota?.used ?? "?"}/${quota?.cap ?? "?"}). Ayarlar'dan sınırı artırabilirsiniz.`,
      },
      402,
    );
  }
  const refund = () => adminClient.rpc("refund_places_call", { ws: rawBody.workspaceId });

  let googleResponse: Response;
  try {
    googleResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMaskFor(rawBody.mode),
      },
      body: JSON.stringify(buildSearchRequest(rawBody)),
    });
  } catch {
    await refund();
    return json({ code: "UPSTREAM_ERROR", message: "Google Places'a ulaşılamadı" }, 502);
  }

  if (googleResponse.status === 429) {
    await refund();
    return json({ code: "RATE_LIMITED", message: "Google Places rate limit" }, 429);
  }

  if (!googleResponse.ok) {
    await refund();
    const errorText = await googleResponse.text();
    return json({ code: "VALIDATION", message: `Places API error: ${errorText}` }, 502);
  }

  const result = await googleResponse.json();
  return json(result, 200);
});
