// unsubscribe: alıcının e-postadaki "listeden çık" bağlantısı (ADR 0023). Herkese açıktır (`--no-verify-jwt`):
// kimlik yerine tahmin edilemez, tek kullanımlık anahtar vardır. Anahtar veritabanında yalnızca özet olarak durur;
// tüketimi `consume_unsubscribe_token` yapar (yalnızca service_role). Yanıt düz metindir: Supabase varsayılan
// alan adı HTML'i düz metne çevirir.
//
// GET  ?t=<anahtar>&lang=tr|en  : bağlantıya tıklama.
// POST ?t=<anahtar>             : RFC 8058 tek tıklama (posta istemcisinin "abonelikten çık" düğmesi).
import { createClient } from "npm:@supabase/supabase-js@2";
import { isPlausibleToken, messageFor, pickLang, statusCodeFor, type UnsubscribeStatus } from "./parse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return text("Method not allowed", 405);
  }

  const url = new URL(req.url);
  const lang = pickLang(url.searchParams.get("lang"), req.headers.get("accept-language"));
  const token = url.searchParams.get("t");

  if (!isPlausibleToken(token)) {
    return text(messageFor("invalid", lang), statusCodeFor("invalid"));
  }

  let status: UnsubscribeStatus = "error";
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("consume_unsubscribe_token", { p_token: token });
    if (!error && data && typeof data === "object") {
      const value = (data as { status?: string }).status;
      if (value === "unsubscribed" || value === "already" || value === "invalid") status = value;
    }
  } catch {
    status = "error";
  }

  return text(messageFor(status, lang), statusCodeFor(status));
});
