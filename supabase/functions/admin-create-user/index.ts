// admin-create-user: yönetici bir ekip üyesini davet/onay akışı olmadan doğrudan oluşturur.
//
// Akış: çağıranın JWT'si ile is_admin() doğrulanır → service role ile e-postası onaylanmış kullanıcı oluşturulur
// (şifre verilmediyse güçlü bir şifre üretilir) → çalışma alanına seçilen rolle eklenir. Üye hemen giriş yapabilir;
// e-posta gönderilmez. Şifre yalnızca üretildiyse yanıtta bir kez döner.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { generatePassword, isValidBody } from "./validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ code: "FORBIDDEN", message: "missing Authorization header" }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ code: "VALIDATION", message: "invalid JSON body" }, 400);
  }
  if (!isValidBody(raw)) {
    return json({ code: "VALIDATION", message: "workspaceId, email, role required; password must be 12+ characters" }, 400);
  }
  const body = raw;

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return json({ code: "FORBIDDEN", message: "invalid session" }, 401);

  const { data: isAdmin, error: isAdminError } = await callerClient.rpc("is_admin", { ws: body.workspaceId });
  if (isAdminError || !isAdmin) return json({ code: "FORBIDDEN", message: "admin role required" }, 403);

  const generated = !body.password;
  const password = body.password && body.password.length > 0 ? body.password : generatePassword();
  const email = body.email.trim().toLowerCase();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: body.fullName ? { full_name: body.fullName.trim() } : {},
  });
  if (createError || !created.user) {
    if (createError?.code === "email_exists") {
      return json(
        { code: "EMAIL_EXISTS", message: "Bu e-posta zaten kayıtlı. Ekip sayfasından 'Üye Davet Et' ile davet edin." },
        409,
      );
    }
    return json({ code: "VALIDATION", message: createError?.message ?? "user create failed" }, 400);
  }
  const userId = created.user.id;

  const { error: memberError } = await admin
    .from("workspace_members")
    .insert({ workspace_id: body.workspaceId, user_id: userId, role: body.role });
  if (memberError) {
    // Yarım kalmış hesap bırakılmaz.
    await admin.auth.admin.deleteUser(userId);
    return json({ code: "VALIDATION", message: memberError.message }, 400);
  }

  if (body.fullName?.trim()) {
    await admin.from("profiles").update({ full_name: body.fullName.trim() }).eq("id", userId);
  }

  return json({ userId, email, ...(generated ? { password } : {}) }, 200);
});
