import { whatsappCandidates, type WhatsappCandidateInput } from "@lbf/core";
import { supabase } from "./supabase-client";

const PAGE_SIZE = 500;
// v1: ilk sürüm. Kural değişirse sürüm artırılır ve tarama bir kez daha çalışır.
const BACKFILL_KEY = "lbf.whatsapp_backfill.v1";

/**
 * Kayıtlı telefonu cep numarası olan işletmelere WhatsApp kanalı ekler (zaten varsa dokunmaz).
 * Numaranın WhatsApp'a kayıtlı olduğu doğrulanmaz; bu yüzden kanal UNVERIFIED ve düşük güvenle yazılır.
 */
export async function addWhatsappChannels(workspaceId: string, rows: WhatsappCandidateInput[]): Promise<number> {
  const candidates = whatsappCandidates(rows);
  if (candidates.length === 0) return 0;
  const { error } = await supabase.from("contact_channels").upsert(
    candidates.map((c) => ({
      workspace_id: workspaceId,
      business_id: c.businessId,
      channel: "WHATSAPP",
      value: c.phoneE164,
      normalized_value: c.phoneE164,
      found_via: "PLACES",
      confidence: 0.6,
      status: "UNVERIFIED",
    })),
    { onConflict: "workspace_id,channel,normalized_value", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  return candidates.length;
}

/** Tek işletme: analizden hemen sonra çağrılır (yeni bulunan her işletme analizden geçer). */
export async function addWhatsappChannelFor(workspaceId: string, businessId: string): Promise<void> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, primary_phone_e164, contact_channels(channel)")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) await addWhatsappChannels(workspaceId, [toInput(data as BusinessPhoneRow)]);
}

interface BusinessPhoneRow {
  id: string;
  primary_phone_e164: string | null;
  contact_channels: Array<{ channel: string }> | null;
}

const toInput = (row: BusinessPhoneRow): WhatsappCandidateInput => ({
  id: row.id,
  phoneE164: row.primary_phone_e164,
  channels: (row.contact_channels ?? []).map((c) => c.channel),
});

/**
 * Bu özellikten önce kaydedilmiş işletmeler için tek seferlik tarama (cihaz + çalışma alanı başına bir kez).
 * Eklenen kanal sayısını döner; daha önce çalıştıysa `null`.
 */
export async function backfillWhatsappChannels(workspaceId: string): Promise<number | null> {
  const key = `${BACKFILL_KEY}.${workspaceId}`;
  try {
    if (localStorage.getItem(key)) return null;
  } catch {
    return null;
  }

  let added = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, primary_phone_e164, contact_channels(channel)")
      .eq("workspace_id", workspaceId)
      .is("merged_into", null)
      .not("primary_phone_e164", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as BusinessPhoneRow[];
    added += await addWhatsappChannels(workspaceId, rows.map(toInput));
    if (rows.length < PAGE_SIZE) break;
  }

  localStorage.setItem(key, new Date().toISOString());
  return added;
}
