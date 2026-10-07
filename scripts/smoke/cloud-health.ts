// Elle çalıştırılan duman testi (CLAUDE.md #6 — gerçek ağ yalnızca burada). Bulut projesini OTURUM AÇMADAN yoklar:
//   node --env-file=.env --import tsx scripts/smoke/cloud-health.ts
// Yalnızca VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY (publishable) okunur; gizli anahtar gerekmez, yazdırılmaz.
// Kontroller: herkese açık kayıt kapalı mı, anonim kullanıcı tabloları okuyamıyor mu, anonim RPC reddediliyor mu,
// Edge Function'lar oturumsuz çağrıyı reddediyor mu.
import process from "node:process";

const url = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY gerekli (node --env-file=.env ile çalıştırın).");
  process.exit(2);
}
if (/127\.0\.0\.1|localhost/.test(url)) {
  console.error("Bu test bulut içindir; .env şu an yerel adresi gösteriyor.");
  process.exit(2);
}

let failed = false;
function report(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

async function call(path: string, init: RequestInit & { bearer?: string } = {}) {
  const { bearer, ...rest } = init;
  const headers: Record<string, string> = { apikey: key!, "content-type": "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const response = await fetch(`${url}${path}`, { ...rest, headers: { ...headers, ...(rest.headers as Record<string, string> | undefined) } });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // JSON olmayan gövde olduğu gibi kalır
  }
  return { status: response.status, body };
}

// 1) Auth ayarları: kayıt kapalı, e-posta ile giriş açık
const settings = await call("/auth/v1/settings");
const s = settings.body as { disable_signup?: boolean; mailer_autoconfirm?: boolean; external?: { email?: boolean } };
report(settings.status === 200 && s.disable_signup === true, "Herkese açık kayıt kapalı", `disable_signup=${String(s.disable_signup)}`);
report(s.external?.email === true, "E-posta ile giriş açık");
report(s.mailer_autoconfirm !== true, "E-posta otomatik onayı kapalı (doğrulama gerekir)", `mailer_autoconfirm=${String(s.mailer_autoconfirm)}`);

// 2) Anonim kullanıcı tablolardan satır okuyamaz (RLS)
for (const table of ["businesses", "workspace_members", "activity_logs", "conversations"]) {
  const result = await call(`/rest/v1/${table}?select=*&limit=1`);
  const rows = Array.isArray(result.body) ? result.body.length : -1;
  report(rows === 0 || result.status >= 400, `Anonim okuma satır döndürmez: ${table}`, `HTTP ${result.status}, ${rows >= 0 ? `${rows} satır` : "hata"}`);
}

// 3) Anonim RPC reddedilir (sahte davet kodu; oturum yok)
const rpc = await call("/rest/v1/rpc/accept_invite", { method: "POST", body: JSON.stringify({ p_token: "smoke-test-gecersiz" }) });
report(rpc.status >= 400, "Anonim accept_invite reddedilir", `HTTP ${rpc.status}`);

// 4) Edge Function'lar kullanıcı oturumu olmadan işlem yapmaz. Her fonksiyona KENDİ gövde şekline uygun, zararsız bir
//    deneme gönderilir (gövde geçersizse fonksiyon yetkiden önce 400 döner ve ölçüm anlamsızlaşır). Sahte workspace kimliği.
const ws = "00000000-0000-0000-0000-000000000000";
const probes: Record<string, unknown> = {
  "admin-invite": { workspaceId: ws, email: "smoke@example.test", role: "MEMBER" },
  "admin-secrets": { workspaceId: ws, name: "google_places_api_key", action: "status" },
  "ai-gateway": {
    workspaceId: ws,
    inputHash: "smoke",
    request: { operation: "smoke", promptVersion: 1, system: "x", messages: [], jsonSchema: {}, maxTokens: 1, temperature: 0 },
  },
  "jarvis-chat": { workspaceId: ws, messages: [{ role: "user", content: "smoke" }] },
  "places-search": { workspaceId: ws, textQuery: "smoke" },
};
for (const [fn, probe] of Object.entries(probes)) {
  const none = await call(`/functions/v1/${fn}`, { method: "POST", body: JSON.stringify(probe) });
  const withKey = await call(`/functions/v1/${fn}`, { method: "POST", body: JSON.stringify(probe), bearer: key });
  const rejected = (status: number) => status === 401 || status === 403;
  report(rejected(none.status) && rejected(withKey.status), `Edge Function oturumsuz reddeder: ${fn}`, `HTTP ${none.status}/${withKey.status}`);
}

process.exit(failed ? 1 : 0);
