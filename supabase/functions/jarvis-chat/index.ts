// jarvis-chat: salt-okunur AI asistanı (ADR 0007). Bağlam, çağıranın JWT'siyle
// (RLS altında) okunur; yani Jarvis kullanıcının göremediği hiçbir veriyi
// göremez. Yanıt, ai-gateway ile aynı sağlayıcı zincirinden geçer ve
// sanitizeJarvisReply ile izin listesine indirgenir; hiçbir mutasyon yapılmaz.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { runChain } from "../_shared/ai-chain.ts";
import {
  buildJarvisSystemPrompt,
  JARVIS_OUTPUT_SCHEMA,
  JARVIS_PROMPT_VERSION,
  sanitizeJarvisReply,
} from "../_shared/core/jarvis.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_HISTORY = 10;
const MAX_MESSAGE_LENGTH = 2000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function parseBody(value: unknown): { workspaceId: string; messages: ChatMessage[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.workspaceId !== "string" || !Array.isArray(body.messages)) return null;
  const messages = body.messages
    .filter(
      (m): m is ChatMessage =>
        typeof m === "object" &&
        m !== null &&
        ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
        typeof (m as ChatMessage).content === "string",
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") return null;
  return { workspaceId: body.workspaceId, messages };
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))].sort().slice(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED", message: "POST required" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ code: "FORBIDDEN", message: "missing Authorization header" }, 401);

  let body: ReturnType<typeof parseBody>;
  try {
    body = parseBody(await req.json());
  } catch {
    body = null;
  }
  if (!body) return json({ code: "VALIDATION", message: "workspaceId and a trailing user message required" }, 400);

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: isMember } = await caller.rpc("is_member", { ws: body.workspaceId });
  if (!isMember) return json({ code: "FORBIDDEN", message: "workspace membership required" }, 403);

  const ws = body.workspaceId;
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const [summary, metrics, topLeads, dueFollowUps, openHandoffs, vocabulary] = await Promise.all([
    caller.rpc("analytics_summary", { ws }),
    caller.rpc("dashboard_metrics", { ws, p_days: 7 }),
    caller
      .from("businesses")
      .select("name, category, district, city, lead_score, stage, website_status, rating, review_count")
      .eq("workspace_id", ws)
      .is("merged_into", null)
      .eq("do_not_contact", false)
      .order("lead_score", { ascending: false })
      .limit(25),
    caller
      .from("follow_ups")
      .select("step, due_at, status, businesses(name)")
      .eq("workspace_id", ws)
      .in("status", ["PENDING", "DRAFTED"])
      .lte("due_at", endOfToday.toISOString())
      .order("due_at")
      .limit(15),
    caller
      .from("human_handoffs")
      .select("summary, created_at, businesses(name)")
      .eq("workspace_id", ws)
      .eq("status", "OPEN")
      .limit(10),
    caller.from("businesses").select("category, district").eq("workspace_id", ws).is("merged_into", null).limit(1000),
  ]);

  const metricsData = (metrics.data ?? {}) as Record<string, unknown>;
  const vocabularyRows = (vocabulary.data ?? []) as Array<{ category: string | null; district: string | null }>;

  const system = buildJarvisSystemPrompt({
    today: now.toISOString().slice(0, 10),
    summary: (summary.data ?? {}) as Record<string, unknown>,
    last7Days: (metricsData.current ?? {}) as Record<string, unknown>,
    previous7Days: (metricsData.previous ?? {}) as Record<string, unknown>,
    topLeads: (topLeads.data ?? []) as Array<Record<string, unknown>>,
    dueFollowUps: (dueFollowUps.data ?? []) as Array<Record<string, unknown>>,
    openHandoffs: (openHandoffs.data ?? []) as Array<Record<string, unknown>>,
    knownCategories: uniqueSorted(vocabularyRows.map((r) => r.category)),
    knownDistricts: uniqueSorted(vocabularyRows.map((r) => r.district)),
  });

  const { data: userData } = await caller.auth.getUser();
  const result = await runChain({
    adminClient: createClient(SUPABASE_URL, SERVICE_ROLE_KEY),
    callerClient: caller,
    workspaceId: ws,
    requestedBy: userData.user?.id ?? null,
    request: {
      operation: "jarvis_chat",
      promptVersion: JARVIS_PROMPT_VERSION,
      system,
      messages: body.messages,
      jsonSchema: JARVIS_OUTPUT_SCHEMA,
      maxTokens: 700,
      temperature: 0.3,
    },
    entityType: null,
    entityId: null,
  });

  if (!result.ok) return json({ code: result.code, message: result.message }, result.status);

  const reply = sanitizeJarvisReply(result.json);
  if (!reply) return json({ code: "PARSE_ERROR", message: "Asistan yanıtı anlaşılamadı." }, 502);
  return json({ ...reply, provider: result.provider }, 200);
});
