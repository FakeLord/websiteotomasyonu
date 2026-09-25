// admin-invite: yalnızca ADMIN rolündeki bir workspace üyesinin çağırabildiği,
// service role key'in kullanıldığı tek yer (SPEC.md → F, P.3).
//
// Akış: çağıranın JWT'si (anon key + Authorization header) ile is_admin() RPC'si
// çağrılarak yetki doğrulanır → auth.admin.inviteUserByEmail (service role) ile
// Supabase'in kendi davet e-postası gönderilir → kısa bir uygulama içi davet kodu
// üretilir, hash'i workspace_invites.token_hash'e yazılır (bkz. docs/adr/0002-auth.md
// → madde 5). Ham kod yalnızca bu yanıtta döner; admin bunu davetliye elden iletir.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { generateInviteCode, isValidBody, sha256Hex } from "./validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface ErrorBody {
  code: "VALIDATION" | "FORBIDDEN" | "METHOD_NOT_ALLOWED";
  message: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function errorResponse(body: ErrorBody, status: number): Response {
  return json(body, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse({ code: "METHOD_NOT_ALLOWED", message: "POST required" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse({ code: "FORBIDDEN", message: "missing Authorization header" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse({ code: "VALIDATION", message: "invalid JSON body" }, 400);
  }

  if (!isValidBody(rawBody)) {
    return errorResponse(
      { code: "VALIDATION", message: "workspaceId, email, role (ADMIN|MEMBER|AGENT) required" },
      400,
    );
  }
  const body = rawBody;

  // Çağıranın kimliği ve admin yetkisi, kullanıcının kendi JWT'siyle (anon key +
  // Authorization header) doğrulanır — service role bu adımda kullanılmaz.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await callerClient.auth.getUser();

  if (!user) {
    return errorResponse({ code: "FORBIDDEN", message: "invalid session" }, 401);
  }

  const { data: isAdmin, error: isAdminError } = await callerClient.rpc("is_admin", {
    ws: body.workspaceId,
  });

  if (isAdminError || !isAdmin) {
    return errorResponse({ code: "FORBIDDEN", message: "admin role required" }, 403);
  }

  const inviteCode = generateInviteCode();
  const tokenHash = await sha256Hex(inviteCode);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Service role yalnızca burada: Supabase Auth kullanıcısı oluşturma/davet e-postası.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(body.email, {
    data: { invited_role: body.role },
  });

  // "email_exists": kullanıcı zaten auth.users'ta var (ör. başka bir workspace'e
  // daha önce davet edildi). Bu durumda yine de yeni bir workspace_invites kaydı
  // açılır; kullanıcı ikinci workspace'e bu kodla katılabilir.
  if (inviteError && inviteError.code !== "email_exists") {
    return json({ code: "VALIDATION", message: inviteError.message }, 400);
  }

  const { data: inviteRow, error: insertError } = await adminClient
    .from("workspace_invites")
    .insert({
      workspace_id: body.workspaceId,
      email: body.email,
      role: body.role,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !inviteRow) {
    return json({ code: "VALIDATION", message: insertError?.message ?? "insert failed" }, 400);
  }

  return json({ inviteId: inviteRow.id, inviteCode, expiresAt }, 200);
});
