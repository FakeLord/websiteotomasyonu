import {
  buildDraftFirstMessagePrompt,
  validateDraft,
  type OutreachChannel,
  type ServicePackageInfo,
} from "@lbf/core";
import { draftFirstMessageOutputSchema } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { callAiGateway } from "../../lib/ai-gateway-client";

export const FORBIDDEN_WORDS = ["indirim", "%", "bedava", "garanti"];

export interface DraftBusiness {
  id: string;
  name: string;
  category: string | null;
  district: string | null;
  do_not_contact: boolean;
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
