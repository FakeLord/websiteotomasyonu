// places-search: Google Places API (New) Text Search proxy'si. Yalnızca dış
// API çağrısını yapar ve HAM sonucu döner; dedupe/insert mantığı istemcideki
// (masaüstü worker) import_business() RPC'sindedir — iş mantığı tek yerde
// (SPEC.md → G.1, docs/adr/0004-places-vault.md).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildSearchRequest, isValidBody } from "./validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// docs/SPEC.md → G.1: "tek field mask" — istek başına en ucuz SKU'ya düşecek
// sabit alan listesi. nextPageToken üst seviye bir alan olduğu için maskeye
// ayrıca eklenmeli, yoksa sayfalama kırılır.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.businessStatus",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

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

  const googleResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(buildSearchRequest(rawBody)),
  });

  if (googleResponse.status === 429) {
    return json({ code: "RATE_LIMITED", message: "Google Places rate limit" }, 429);
  }

  if (!googleResponse.ok) {
    const errorText = await googleResponse.text();
    return json({ code: "VALIDATION", message: `Places API error: ${errorText}` }, 502);
  }

  const result = await googleResponse.json();
  return json(result, 200);
});
