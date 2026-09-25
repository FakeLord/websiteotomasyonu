import { computeScore, type ScoringInput, type ScoringRules } from "@lbf/core";
import { supabase } from "../lib/supabase-client";

const NEEDS_BOOKING_CATEGORIES = new Set([
  "dis_klinigi",
  "estetik_guzellik_merkezi",
  "veteriner",
  "kuafor_berber",
  "fizyoterapi_psikolog_diyetisyen",
  "spor_salonu_pilates",
]);

interface BusinessScoringRow {
  id: string;
  category: string | null;
  website_status: ScoringInput["websiteStatus"];
  business_status: ScoringInput["businessStatus"];
  rating: number | null;
  review_count: number | null;
}

async function fetchScoringRules(workspaceId: string): Promise<ScoringRules> {
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("scoring_rules")
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw error;
  return data.scoring_rules as ScoringRules;
}

async function buildScoringInput(business: BusinessScoringRow): Promise<ScoringInput> {
  const [{ data: contacts, error: contactsError }, { data: sources, error: sourcesError }, { data: analysis }] =
    await Promise.all([
      supabase.from("contact_channels").select("channel").eq("business_id", business.id).neq("status", "INVALID"),
      supabase.from("business_sources").select("source").eq("business_id", business.id),
      supabase
        .from("website_analyses")
        .select("checks")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (contactsError) throw contactsError;
  if (sourcesError) throw sourcesError;

  const channels = new Set((contacts ?? []).map((c) => c.channel as string));
  const runsAds = (sources ?? []).some((s) => s.source === "META_ADS" || s.source === "GOOGLE_ADS");
  const checks = (analysis?.checks ?? {}) as { hasContactForm?: boolean; hasBookingWidget?: boolean };

  return {
    websiteStatus: business.website_status,
    businessStatus: business.business_status,
    needsBooking: business.category ? NEEDS_BOOKING_CATEGORIES.has(business.category) : false,
    hasBookingWidget: checks.hasBookingWidget ?? false,
    hasContactForm: checks.hasContactForm ?? false,
    rating: business.rating,
    reviewCount: business.review_count,
    runsAds,
    contacts: {
      hasInstagram: channels.has("INSTAGRAM"),
      hasEmail: channels.has("EMAIL"),
      hasWhatsappMobile: channels.has("WHATSAPP"),
      hasPhone: channels.has("PHONE"),
      hasAnyContact: channels.size > 0,
    },
  };
}

/**
 * Bir işletmenin skorunu `packages/core/scoring`'deki saf kuralla yeniden
 * hesaplar ve `update_lead_score()` RPC'sine yazar (lead_score/score_breakdown
 * REVOKE UPDATE'li — CLAUDE.md #5). Website analizi, kanal değişikliği veya
 * kural versiyonu değiştiğinde çağrılır (SPEC.md → I.1).
 */
export async function recomputeScore(workspaceId: string, businessId: string): Promise<void> {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("id, category, website_status, business_status, rating, review_count")
    .eq("id", businessId)
    .single();
  if (error) throw error;

  const [rules, input] = await Promise.all([
    fetchScoringRules(workspaceId),
    buildScoringInput(business as BusinessScoringRow),
  ]);

  const result = computeScore(input, rules);

  const { error: rpcError } = await supabase.rpc("update_lead_score", {
    ws: workspaceId,
    p_business_id: businessId,
    p_score: result.score,
    p_score_breakdown: { reasons: result.reasons },
    p_scoring_version: result.version,
  });
  if (rpcError) throw rpcError;
}

/**
 * Skor kuralları değiştiğinde (`scoring_version` arttığında) tüm workspace
 * için toplu yeniden hesaplama.
 */
export async function recomputeAllScores(
  workspaceId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("merged_into", null);
  if (error) throw error;

  const ids = (data ?? []).map((b) => b.id as string);
  const CONCURRENCY = 4;
  let done = 0;

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          await recomputeScore(workspaceId, id);
        } catch {
          // Bir işletme başarısız olursa diğerleri etkilenmez.
        } finally {
          done += 1;
          onProgress?.(done, ids.length);
        }
      }),
    );
  }
}
