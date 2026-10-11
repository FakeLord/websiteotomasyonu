import { platform } from "../../lib/platform";
import {
  appendComplianceFooter,
  assembleFirstMessage,
  buildDraftFirstMessagePrompt,
  buildTranslateDraftPrompt,
  computeFollowUpDueDate,
  detectDraftLanguage,
  extractReadyOffer,
  findForeignWords,
  retryRejected,
  stripSignOff,
  validateDraft,
  type OutreachChannel,
  type OutreachLanguage,
  type ServicePackageInfo,
} from "@lbf/core";
import { draftFirstMessageOutputSchema, translateDraftOutputSchema } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { callAiGateway } from "../../lib/ai-gateway-client";
import { getEmailAccount } from "../../lib/email-account";
import { tr } from "../../i18n/tr";

export const FORBIDDEN_WORDS = ["indirim", "%", "bedava", "garanti", "discount", "guarantee", "guaranteed"];

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

interface Delivery {
  mode: DeliveryMode;
  /** SMTP gönderiminde üretilen RFC 5322 Message-ID (gelen cevap eşleştirmesi için). */
  externalMessageId: string | null;
}

/** Konuşmadaki son gelen e-postanın Message-ID'si; cevap aynı thread'de gönderilir. */
async function lastInboundMessageId(conversationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("external_message_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "IN")
    .not("external_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.external_message_id as string | null | undefined) ?? null;
}

/**
 * Mesajı gerçekten iletir: e-posta SMTP ile gönderilir; Instagram/Facebook/
 * WhatsApp için metin panoya kopyalanıp ilgili sohbet açılır (SPEC → I.3
 * ASSISTED); diğer kanallarda metin panoya kopyalanır ve kullanıcı elle gönderir.
 */
/**
 * E-postanın sonuna gönderen kimliği, posta adresi ve çıkma satırını ekler (ADR 0019). Dil metinden anlaşılır;
 * belirsizse işletmenin ülkesine göre (TR → Türkçe, diğerleri İngilizce) seçilir.
 */
async function withComplianceFooter(workspaceId: string, businessId: string, body: string, fallbackName: string): Promise<string> {
  const [settings, business] = await Promise.all([
    supabase.from("workspace_settings").select("sender_profile").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("businesses").select("country_code").eq("id", businessId).maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  if (business.error) throw business.error;
  const profile = (settings.data?.sender_profile ?? {}) as { legalName?: string; postalAddress?: string };
  const countryCode = (business.data?.country_code as string | undefined) ?? "TR";
  const detected = detectDraftLanguage(body);
  const language = detected === "tr" || detected === "en" ? detected : countryCode === "TR" ? "tr" : "en";
  return appendComplianceFooter(body, {
    language,
    legalName: profile.legalName?.trim() || fallbackName,
    postalAddress: profile.postalAddress ?? "",
    countryCode,
  });
}

async function deliver(workspaceId: string, target: SendTarget, message: SendableMessage): Promise<Delivery> {
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
    const inReplyTo = await lastInboundMessageId(target.conversationId);
    const externalMessageId = await platform.sendEmail(
      {
        host: account.smtpHost,
        port: account.smtpPort,
        username: account.smtpUsername,
        password: account.smtpPassword,
        from_name: account.fromName,
        from_email: account.fromEmail,
      },
      {
        to_email: channelRow.value,
        subject: message.subject ?? "",
        body: await withComplianceFooter(workspaceId, target.businessId, message.body, account.fromName),
        in_reply_to: inReplyTo,
      },
    );
    return { mode: "SMTP", externalMessageId };
  }

  await navigator.clipboard.writeText(message.body);
  const linkBuilder = ASSISTED_LINK[target.channel];
  if (!linkBuilder) return { mode: "MANUAL", externalMessageId: null };

  const { data: channelRow } = await supabase
    .from("contact_channels")
    .select("normalized_value")
    .eq("business_id", target.businessId)
    .eq("channel", target.channel)
    .limit(1)
    .maybeSingle();
  const handle = (channelRow?.normalized_value as string | undefined)?.split(":").pop();
  if (!handle) return { mode: "MANUAL", externalMessageId: null };
  await platform.openExternal(linkBuilder(handle));
  return { mode: "ASSISTED", externalMessageId: null };
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
export function nextFollowUpDate(
  policy: FollowupPolicy | null,
  completedStep: number,
  from: Date = new Date(),
  geo: { timeZone?: string | null; countryCode?: string | null } = {},
): Date | null {
  if (!policy) return null;
  const step = policy.steps[completedStep];
  if (!step || completedStep >= (policy.maxFollowUps ?? 0)) return null;
  return computeFollowUpDueDate(from, step.afterDays, policy.sendWindow, policy.skipHolidays, {
    ...(geo.timeZone ? { timeZone: geo.timeZone } : {}),
    ...(geo.countryCode ? { countryCode: geo.countryCode } : {}),
  });
}

/**
 * Mesaj gerçekten iletildikten sonra: `mark_message_sent` (outreach_guard + çift
 * gönderim kontrolü DB'de tekrar çalışır), ardından sekans ilerletilir —
 * mesaj bir follow-up'ın taslağıysa o adım SENT olur ve sonraki adım planlanır;
 * konuşmadaki ilk giden mesajsa 1. follow-up planlanır (SPEC.md → M).
 */
async function finalizeSent(workspaceId: string, target: SendTarget, message: SendableMessage, externalMessageId: string | null) {
  const { count: previousSent, error: countError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", target.conversationId)
    .eq("direction", "OUT")
    .eq("status", "SENT");
  if (countError) throw countError;

  await rpc("mark_message_sent", {
    p_message_id: message.id,
    p_content_hash: await sha256Hex(message.body),
    p_external_message_id: externalMessageId,
  });

  const { data: followUp, error: followUpError } = await supabase
    .from("follow_ups")
    .select("id, step")
    .eq("message_id", message.id)
    .in("status", ["PENDING", "DRAFTED"])
    .maybeSingle();
  if (followUpError) throw followUpError;

  const policy = await loadFollowupPolicy(workspaceId);
  // Takip günü ve saati işletmenin yerel saat diliminde, tatiller işletmenin ülkesine göre hesaplanır.
  const { data: businessGeo } = await supabase
    .from("businesses")
    .select("timezone, country_code")
    .eq("id", target.businessId)
    .maybeSingle();
  const geo = { timeZone: businessGeo?.timezone as string | null | undefined, countryCode: businessGeo?.country_code as string | null | undefined };
  if (followUp) {
    const nextDue = nextFollowUpDate(policy, followUp.step as number, new Date(), geo);
    await rpc("mark_followup_sent", {
      p_followup_id: followUp.id,
      p_message_id: message.id,
      p_next_due_at: nextDue?.toISOString() ?? null,
    });
  } else if ((previousSent ?? 0) === 0) {
    const dueAt = nextFollowUpDate(policy, 0, new Date(), geo);
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
}

/**
 * Taslak → onay → gerçek teslim. E-postada SMTP başarılıysa mesaj hemen SENT
 * olur. Asist/manuel kanallarda metin panoya kopyalanıp sohbet açılır; mesaj
 * APPROVED kalır ve kullanıcı "Gönderdim" (`confirmAssistedSent`) veya
 * "Gönderemedim" (`reportAssistedFailure`) diyene kadar gönderilmiş sayılmaz
 * (SPEC.md → L.3). Teslim hata verirse mesaj FAILED işaretlenir.
 */
export async function sendDraftMessage(workspaceId: string, target: SendTarget, message: SendableMessage): Promise<DeliveryMode> {
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

  let delivery: Delivery;
  try {
    delivery = await deliver(workspaceId, target, message);
    if (delivery.mode === "SMTP") await finalizeSent(workspaceId, target, message, delivery.externalMessageId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : tr.conversations.sendError;
    await supabase.rpc("mark_message_failed", { p_message_id: message.id, p_reason: reason });
    throw err instanceof Error ? err : new Error(reason);
  }
  return delivery.mode;
}

/** Onaylanmış bir asist mesajı için metni tekrar panoya kopyalar ve sohbeti yeniden açar. */
export async function reopenAssistedMessage(target: SendTarget, message: SendableMessage): Promise<DeliveryMode> {
  // Asist/manuel kanallarda gövdeye alt bilgi eklenmez; workspace kimliği yalnızca e-posta dalında kullanılır.
  return (await deliver("", target, message)).mode;
}

/** Kullanıcı mesajı asist kanaldan gerçekten gönderdiğini onayladı. */
export async function confirmAssistedSent(workspaceId: string, target: SendTarget, message: SendableMessage): Promise<void> {
  await finalizeSent(workspaceId, target, message, null);
}

export const ASSISTED_FAILURE_REASONS = ["NO_ACCOUNT", "DM_CLOSED", "OTHER"] as const;
export type AssistedFailureReason = (typeof ASSISTED_FAILURE_REASONS)[number];

/**
 * Kullanıcı mesajı gönderemedi (hesap yok, DM kapalı…): mesaj FAILED, kanal
 * INVALID olur; kanal trigger'ı o kanaldaki bekleyen follow-up'ları iptal eder
 * ve kanal yönlendirmesi sıradaki kanala geçer (SPEC.md → L.3, I.3).
 */
export async function reportAssistedFailure(target: SendTarget, messageId: string, reason: AssistedFailureReason): Promise<void> {
  const label = tr.conversations.assistedFailure[reason];
  await rpc("mark_message_failed", { p_message_id: messageId, p_reason: label });
  await rpc("mark_channel_status", {
    p_business_id: target.businessId,
    p_channel: target.channel,
    p_value: null,
    p_status: "INVALID",
    p_reason: label,
  });
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
  /** Bilgi Bankası "Şirket" kayıtları: şirketin kim olduğu ve teklifi için tek kaynak. */
  companyFacts: string;
  companyNames: string[];
}

async function loadSalesContext(workspaceId: string): Promise<SalesContext> {
  const [packages, salesRules, references, company] = await Promise.all([
    supabase
      .from("service_packages")
      .select("id, name, summary, price_min, price_max, delivery_days_min, delivery_days_max")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
    supabase.from("kb_entries").select("title, body, data").eq("workspace_id", workspaceId).eq("type", "SALES_RULE").eq("is_active", true),
    supabase.from("kb_entries").select("title").eq("workspace_id", workspaceId).eq("type", "REFERENCE").eq("is_verified_real", true),
    supabase.from("kb_entries").select("title, body").eq("workspace_id", workspaceId).eq("type", "COMPANY").eq("is_active", true),
  ]);
  if (packages.error) throw packages.error;
  if (salesRules.error) throw salesRules.error;
  if (references.error) throw references.error;
  if (company.error) throw company.error;

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
    companyFacts: (company.data ?? []).map((e) => `${e.title}: ${e.body}`).join("\n"),
    companyNames: (company.data ?? []).map((e) => e.title as string),
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
  language: OutreachLanguage,
  /** `fresh`: yeniden oluşturma; önbellekteki aynı (belki reddedilmiş) taslak yerine yenisi istenir. */
  options?: { fresh?: boolean },
): Promise<FirstMessageDraft> {
  const [{ data: analysis, error: analysisError }, { data: reputation, error: reputationError }, context] = await Promise.all([
    supabase
      .from("website_analyses")
      .select("issues")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("businesses").select("rating, review_count, website_status").eq("id", business.id).maybeSingle(),
    loadSalesContext(workspaceId),
  ]);
  if (analysisError) throw analysisError;
  if (reputationError) throw reputationError;
  // Şirket tanıtımı olmadan model hizmet uydurur; bu yüzden hiç çağırmadan açık hata veririz.
  if (!context.companyFacts.trim()) throw new Error(tr.draft.noCompanyProfile);

  const promptInput = {
    businessName: business.name,
    category: business.category,
    district: business.district,
    city: business.city,
    rating: (reputation?.rating as number | null | undefined) ?? null,
    reviewCount: (reputation?.review_count as number | null | undefined) ?? null,
    websiteIssues: ((analysis?.issues ?? []) as string[]).slice(0, 3),
    websiteStatus: (reputation?.website_status as string | null | undefined) ?? null,
    channel,
    language,
    companyFacts: context.companyFacts,
    relevantPackages: context.packages,
    salesRulesSummary: context.salesRulesSummary,
  };
  const request = buildDraftFirstMessagePrompt(promptInput);

  // Kontrolden geçemeyen taslak kullanıcıya gösterilmeden yeniden üretilir (en çok 3 deneme).
  return retryRejected((attempt) => draftOnce(attempt > 0 || options?.fresh === true));

  async function draftOnce(fresh: boolean): Promise<FirstMessageDraft> {
  // Kullanıcı Bilgi Bankası'na "Hazır teklif: ..." yazdıysa model çağrılmaz; cümle olduğu gibi kullanılır.
  const readyOffer = extractReadyOffer(context.companyFacts, language);
  let offer: string;
  if (readyOffer !== null) {
    offer = readyOffer;
  } else {
    const result = await callAiGateway(workspaceId, request, { entityType: "business", entityId: business.id }, { fresh });
    const parsed = draftFirstMessageOutputSchema.safeParse(result.json);
    if (!parsed.success) {
      return { ok: false, body: "", reasons: ["INVALID_SHAPE"], channel };
    }
    offer = stripSignOff(parsed.data.body);
  }
  // Model yalnızca teklif paragrafını yazar; selamlama, işletmeye özel gözlem, konu ve kapanış kodla eklenir
  // (ücretsiz küçük modelin serbest yazdığı Türkçe bozuk çıkıyordu). Modelin uydurduğu imza atılır.
  // Yalnızca GÖNDERİLECEK metin doğrulanır; Türkçe çeviri ayrı çağrıyla gelir ve gönderilmediği için kontrol edilmez.
  const assembled = assembleFirstMessage(
    {
      language,
      channel,
      businessName: business.name,
      category: business.category,
      rating: promptInput.rating,
      reviewCount: promptInput.reviewCount,
      websiteIssues: promptInput.websiteIssues,
      websiteStatus: promptInput.websiteStatus,
    },
    offer,
    { trusted: readyOffer !== null },
  );
  // Model boş/yalnızca selamlama döndürdüyse teklif paragrafı yoktur: geçersiz biçim sayılır ve yeniden denenir.
  if (assembled.offer.length === 0) {
    return { ok: false, body: "", reasons: ["INVALID_SHAPE"], channel };
  }
  const body = assembled.body;
  // Model seçilen dili yok sayabiliyor (İngilizce istenip Türkçe yazıldı); yanlış dildeki taslak gösterilmez.
  const written = detectDraftLanguage(body);
  if (written !== "unknown" && written !== language) {
    return { ok: false, body: "", reasons: ["WRONG_LANGUAGE"], channel };
  }
  // Doğru dilde yazılmış metne bile tek bir yabancı kelime karışabiliyor ("dijital varlığınızı strengthen etmek").
  const leaked = findForeignWords(body, language, [business.name, ...businessContextNames(business), ...context.companyNames]);
  if (leaked.length > 0) {
    return { ok: false, body: "", reasons: [`FOREIGN_WORD:${leaked[0]}`], channel };
  }
  const validation = validateDraft({
    body,
    channel,
    packages: context.packages,
    salesRules: { allowDiscountMention: context.allowDiscountMention, forbiddenWords: FORBIDDEN_WORDS },
    verifiedReferenceNames: context.verifiedReferenceNames,
    recipientBusinessName: business.name,
    // Şirketin kendi adı (Şirket kaydının başlığı) müşteri referansı sayılmaz.
    contextNames: [...businessContextNames(business), ...context.companyNames],
    stopRequest: business.do_not_contact,
  });

  return {
    ok: validation.ok,
    subject: assembled.subject,
    body,
    reasons: validation.reasons,
    channel,
  };
  }
}

export interface DraftTranslation {
  translationTr: string;
  subjectTr?: string | undefined;
}

/**
 * Türkçe dışı taslağın Türkçe çevirisi (ekibin okuması için). Ana taslaktan ayrı ve arka planda çalışır;
 * gönderilmez ve kaydedilmez, bu yüzden satış guardrail'larından geçirilmez.
 */
export async function translateDraftToTurkish(
  workspaceId: string,
  businessId: string,
  draft: { subject?: string | undefined; body: string; channel: OutreachChannel },
): Promise<DraftTranslation> {
  const request = buildTranslateDraftPrompt(draft);
  const result = await callAiGateway(workspaceId, request, { entityType: "business", entityId: businessId });
  const parsed = translateDraftOutputSchema.safeParse(result.json);
  if (!parsed.success) throw new Error(tr.draft.translationFailed);
  return { translationTr: parsed.data.translation_tr, subjectTr: parsed.data.subject_tr };
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

/** Taslağı konuşmaya DRAFT mesaj olarak kaydeder ve konuşma ile mesaj kimliklerini döner. */
export async function saveDraftMessage(
  workspaceId: string,
  businessId: string,
  draft: { channel: string; subject?: string | undefined; body: string; authorType: "AI" | "USER" },
): Promise<{ conversationId: string; messageId: string }> {
  const conversationId = await ensureConversation(workspaceId, businessId, draft.channel);
  const { data, error } = await supabase
    .from("messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: "OUT",
      status: "DRAFT",
      subject: draft.subject ?? null,
      body: draft.body,
      author_type: draft.authorType,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { conversationId, messageId: data.id as string };
}

/** Onaylanmış bir taslağı konuşmaya DRAFT mesaj olarak kaydeder; gönderim insan onayıyla Konuşmalar'da yapılır. */
export async function saveDraftToConversation(
  workspaceId: string,
  businessId: string,
  draft: { channel: string; subject?: string | undefined; body: string; authorType: "AI" | "USER" },
): Promise<string> {
  return (await saveDraftMessage(workspaceId, businessId, draft)).conversationId;
}

/** İşletmenin e-posta konuşmasında zaten taslak/onaylı/gönderilmiş giden mesaj var mı (kuyruk çift taslak üretmesin). */
export async function hasOutgoingEmail(businessId: string): Promise<boolean> {
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("channel", "EMAIL")
    .maybeSingle();
  if (error) throw error;
  if (!conversation) return false;
  const { count, error: countError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id as string)
    .eq("direction", "OUT")
    .in("status", ["DRAFT", "APPROVED", "SENT"]);
  if (countError) throw countError;
  return (count ?? 0) > 0;
}
