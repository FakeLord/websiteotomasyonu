// admin-secrets: workspace paylaşımlı secret'larını (Google Places, NVIDIA…)
// admin adına Vault'a yazar/durumunu okur. Ham secret bir daha istemciye
// dönmez; yalnızca "ayarlı/değil" ve son 4 karakter döner (SPEC.md → P.3).
//
// admin_set_secret()/admin_get_secret_status() RPC'leri zaten is_admin()
// kontrolü yapıyor (SECURITY DEFINER); bu fonksiyon yalnızca çağıranın JWT'si
// ile bu RPC'leri çağıran ince bir HTTP katmanıdır. Service role kullanılmaz
// (RPC'ler postgres BYPASSRLS ile zaten Vault'a erişebiliyor).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const KNOWN_SECRET_NAMES = ["google_places_api_key", "nvidia_api_key"] as const;

interface RequestBody {
  workspaceId: string;
  name: (typeof KNOWN_SECRET_NAMES)[number];
  action: "set" | "status";
  value?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function isValidBody(value: unknown): value is RequestBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.workspaceId !== "string" || body.workspaceId.length === 0) return false;
  if (!KNOWN_SECRET_NAMES.includes(body.name as never)) return false;
  if (body.action !== "set" && body.action !== "status") return false;
  if (body.action === "set" && typeof body.value !== "string") return false;
  return true;
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
    return json({ code: "VALIDATION", message: "workspaceId, name, action required" }, 400);
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  if (rawBody.action === "set") {
    const { error } = await callerClient.rpc("admin_set_secret", {
      ws: rawBody.workspaceId,
      p_name: rawBody.name,
      p_value: rawBody.value,
    });
    if (error) return json({ code: "FORBIDDEN", message: error.message }, 403);
    return json({ ok: true }, 200);
  }

  const { data, error } = await callerClient.rpc("admin_get_secret_status", {
    ws: rawBody.workspaceId,
    p_name: rawBody.name,
  });
  if (error) return json({ code: "FORBIDDEN", message: error.message }, 403);
  return json(data, 200);
});
