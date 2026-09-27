import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  buildDraftFirstMessagePrompt,
  computeFollowUpDueDate,
  validateDraft,
  type OutreachChannel,
  type ServicePackageInfo,
} from "@lbf/core";
import { draftFirstMessageOutputSchema } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { callAiGateway } from "../../lib/ai-gateway-client";
import { getEmailAccount } from "../../lib/email-account";
import { tr } from "../../i18n/tr";

export const FORBIDDEN_WORDS = ["indirim", "%", "bedava", "garanti"];

/** Supabase RPC hatasını fırlatır; hiçbir gönderim adımı hatayı sessizce yutmamalı. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ASSISTED_LINK: Partial<Record<string, (handle: string) => string>> = {
  INSTAGRAM: (h) => `https://ig.me/m/${h}`,
  FACEBOOK: (h) => `https://m.me/${h}`,
  WHATSAPP: (h) => `https://wa.me/${h.replace(/\D/g, "")}`,
};

export interface SendTarget {
  conversationId: string;
  businessId: string;
  channel: string;
}

export interface SendableMessage {
  id: string;
  body: string;
  subject: string | null;
}

export type DeliveryMode = "SMTP" | "ASSISTED" | "MANUAL";

/**
 * Mesajı gerçekten iletir: e-posta SMTP ile gönderilir; Instagram/Facebook/
 * WhatsApp için metin panoya kopyalanıp ilgili sohbet açılır (SPEC → I.3
 * ASSISTED); diğer kanallarda metin panoya kopyalanır ve kullanıcı elle gönderir.
 */
async function deliver(target: SendTarget, message: SendableMessage): Promise<DeliveryMode> {
  if (target.channel === "EMAIL") {
    const account = await getEmailAccount();
    if (!account) throw new Error(tr.conversations.noEmailAccount);
    const { data: channelRow, error } = await supabase
      .from("contact_channels")
      .select("value")
      .eq("business_id", target.businessId)
      .eq("channel", "EMAIL")
      .not("status", "in", "(INVALID,BOUNCED)")
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!channelRow) throw new Error(tr.conversations.noEmailAddress);
    await invoke("send_email", {
      smtp: {
        host: account.smtpHost,
        port: account.smtpPort,
        username: account.smtpUsername,
        password: account.smtpPassword,
        from_name: account.fromName,
        from_email: account.fromEmail,
      },
      message: { to_email: channelRow.value, subject: message.subject ?? "", body: message.body },
    });
    return "SMTP";
  }

  await navigator.clipboard.writeText(message.body);
  const linkBuilder = ASSISTED_LINK[target.channel];
  if (!linkBuilder) return "MANUAL";

  const { data: channelRow } = await supabase
    .from("contact_channels")
    .select("normalized_value")
    .eq("business_id", target.businessId)
    .eq("channel", target.channel)
    .limit(1)
    .maybeSingle();
  const handle = (channelRow?.normalized_value as string | undefined)?.split(":").pop();
  if (!handle) return "MANUAL";
  await openUrl(linkBuilder(handle));
  return "ASSISTED";
}

interface FollowupPolicy {
  steps: Array<{ afterDays: number }>;
  maxFollowUps: number;
  sendWindow: { days: number[]; from: string };
  skipHolidays: boolean;
}

export async function loadFollowupPolicy(workspaceId: string): Promise<FollowupPolicy | null> {
  const { data, error } = await supabase.from("workspace_settings").select("followup_policy").eq("workspace_id", workspaceId).single();
  if (error) throw error;
  return (data?.followup_policy as FollowupPolicy | null) ?? null;
}

/** Politika gereği bir sonraki follow-up tarihi; sekans bittiyse null. */
export function nextFollowUpDate(policy: FollowupPolicy | null, completedStep: number, from: Date = new Date()): Date | null {
  if (!policy) return null;
  const step = policy.steps[completedStep];
  if (!step || completedStep >= (policy.maxFollowUps ?? 0)) return null;
  return computeFollowUpDueDate(from, step.afterDays, policy.sendWindow, policy.skipHolidays);
}

/**
 * Taslak → onay → gerçek teslim → `mark_message_sent` (outreach_guard + çift
 * gönderim kontrolü DB'de). Teslim başarısız olursa mesaj FAILED işaretlenir.
 * İlk giden mesajsa 1. follow-up planlanır. Dönen mod, UI'da kullanıcıya ne
 * yapması gerektiğini söylemek için kullanılır (ASSISTED/MANUAL: elle gönder).
 */
export async function sendDraftMessage(
  workspaceId: string,
  target: SendTarget,
  message: SendableMessage,
  options: { scheduleFirstFollowUp: boolean },
): Promise<DeliveryMode> {
  // Ön kontrol: DB'deki kurallar (DNC, gönderim penceresi, soğuma, günlük
  // limitler, 30 günlük aynı içerik) mesaj gerçekten gitmeden ÖNCE kontrol
  // edilir; aksi halde e-posta SMTP'den çıkıp mark_message_sent'te reddedilebilirdi.
  const guard = await rpc<{ allowed: boolean; reasons: string[] }>("outreach_guard", {
    p_business_id: target.businessId,
    p_channel: target.channel,
  });
  if (!guard.allowed) {
    throw new Error(guard.reasons.map((r) => tr.guard[r as keyof typeof tr.guard] ?? r).join(" · "));
  }
  const contentHash = await sha256Hex(message.body);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: duplicateCount, error: duplicateError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", target.conversationId)
    .eq("direction", "OUT")
    .eq("status", "SENT")
    .eq("content_hash", contentHash)
    .gte("created_at", since);
  if (duplicateError) throw duplicateError;
  if ((duplicateCount ?? 0) > 0) throw new Error(tr.guard.DUPLICATE_MESSAGE);

  await rpc("approve_message", { p_message_id: message.id });

  let mode: DeliveryMode;
  try {
    mode = await deliver(target, message);
    await rpc("mark_message_sent", {
      p_message_id: message.id,
      p_content_hash: contentHash,
      p_external_message_id: null,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : tr.conversations.sendError;
    await supabase.rpc("mark_message_failed", { p_message_id: message.id, p_reason: reason });
    throw err instanceof Error ? err : new Error(reason);
  }

  if (options.scheduleFirstFollowUp) {
    const dueAt = nextFollowUpDate(await loadFollowupPolicy(workspaceId), 0);
    if (dueAt) {
      await rpc("schedule_next_followup", {
        ws: workspaceId,
        p_business_id: target.businessId,
        p_conversation_id: target.conversationId,
        p_step: 1,
        p_due_at: dueAt.toISOString(),
      });
    }
  }
  return mode;
}

export interface DraftBusiness {
  id: string;
  name: string;
  category: string | null;
  district: string | null;
  city: string | null;
  do_not_contact: boolean;
}

export function businessContextNames(business: { category: string | null; district: string | null; city: string | null }): string[] {
  return [business.category, business.district, business.city].filter((v): v is string => !!v);
}

export interface FirstMessageDraft {
  ok: boolean;
  subject?: string | undefined;
  body: string;
  reasons: string[];
  channel: OutreachChannel;
}

interface SalesContext {
  packages: ServicePackageInfo[];
  salesRulesSummary: string;
  allowDiscountMention: boolean;
  verifiedReferenceNames: string[];
}

async function loadSalesContext(workspaceId: string): Promise<SalesContext> {
  const [packages, salesRules, references] = await Promise.all([
    supabase
      .from("service_packages")
      .select("id, name, summary, price_min, price_max, delivery_days_min, delivery_days_max")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
    supabase.from("kb_entries").select("title, body, data").eq("workspace_id", workspaceId).eq("type", "SALES_RULE").eq("is_active", true),
    supabase.from("kb_entries").select("title").eq("workspace_id", workspaceId).eq("type", "REFERENCE").eq("is_verified_real", true),
  ]);
  if (packages.error) throw packages.error;
  if (salesRules.error) throw salesRules.error;
  if (references.error) throw references.error;

  return {
    packages: (packages.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      summary: (p.summary as string | null) ?? "",
      priceMin: p.price_min as number | null,
      priceMax: p.price_max as number | null,
      deliveryDaysMin: p.delivery_days_min as number | null,
      deliveryDaysMax: p.delivery_days_max as number | null,
    })),
    salesRulesSummary: (salesRules.data ?? []).map((e) => `${e.title}: ${e.body}`).join(" "),
    allowDiscountMention: (salesRules.data ?? []).some(
      (e) => (e.data as { allowDiscountMention?: boolean } | null)?.allowDiscountMention === true,
    ),
    verifiedReferenceNames: (references.data ?? []).map((e) => e.title as string),
  };
}

/**
 * J.2 `draft_first_message`: website analizinden ve KB'den bağlam kurar, AI
 * zincirinden taslak alır ve `validateDraft` guardrail'ından geçirir (CLAUDE.md #10).
 * Reddedilen taslak `ok: false` ve sebeplerle döner; kullanıcıya gövdesi gösterilmez.
 */
export async function generateFirstMessageDraft(
  workspaceId: string,
  business: DraftBusiness,
  channel: OutreachChannel,
): Promise<FirstMessageDraft> {
  const [{ data: analysis, error: analysisError }, context] = await Promise.all([
    supabase
      .from("website_analyses")
      .select("issues")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadSalesContext(workspaceId),
  ]);
  if (analysisError) throw analysisError;

  const request = buildDraftFirstMessagePrompt({
    businessName: business.name,
    category: business.category,
    district: business.district,
    websiteIssues: ((analysis?.issues ?? []) as string[]).slice(0, 3),
    channel,
    relevantPackages: context.packages,
    salesRulesSummary: context.salesRulesSummary,
  });

  const result = await callAiGateway(workspaceId, request, { entityType: "business", entityId: business.id });
  const parsed = draftFirstMessageOutputSchema.safeParse(result.json);
  if (!parsed.success) {
    return { ok: false, body: "", reasons: ["INVALID_SHAPE"], channel };
  }

  const validation = validateDraft({
    body: parsed.data.body,
    channel,
    packages: context.packages,
    salesRules: { allowDiscountMention: context.allowDiscountMention, forbiddenWords: FORBIDDEN_WORDS },
    verifiedReferenceNames: context.verifiedReferenceNames,
    recipientBusinessName: business.name,
    contextNames: businessContextNames(business),
    stopRequest: business.do_not_contact,
  });

  return {
    ok: validation.ok,
    subject: parsed.data.subject,
    body: parsed.data.body,
    reasons: validation.reasons,
    channel,
  };
}

/** İşletme+kanal için konuşmayı bulur, yoksa oluşturur (unique: business_id, channel). */
export async function ensureConversation(workspaceId: string, businessId: string, channel: string): Promise<string> {
  const { data: existing, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("channel", channel)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const { data: created, error: insertError } = await supabase
    .from("conversations")
    .insert({ workspace_id: workspaceId, business_id: businessId, channel })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id as string;
}

/** Onaylanmış bir taslağı konuşmaya DRAFT mesaj olarak kaydeder; gönderim insan onayıyla Konuşmalar'da yapılır. */
export async function saveDraftToConversation(
  workspaceId: string,
  businessId: string,
  draft: { channel: string; subject?: string | undefined; body: string; authorType: "AI" | "USER" },
): Promise<string> {
  const conversationId = await ensureConversation(workspaceId, businessId, draft.channel);
  const { error } = await supabase.from("messages").insert({
    workspace_id: workspaceId,
    conversation_id: conversationId,
    direction: "OUT",
    status: "DRAFT",
    subject: draft.subject ?? null,
    body: draft.body,
    author_type: draft.authorType,
  });
  if (error) throw error;
  return conversationId;
}
