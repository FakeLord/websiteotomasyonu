import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactOutcome } from "@lbf/core";
import { supabase } from "../../../lib/supabase-client";

export interface ContactAttemptRow {
  id: string;
  channel: string;
  address: string;
  outcome: ContactOutcome;
  note: string | null;
  follow_up_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OutcomeResult {
  stage: string;
  nextActionAt: string | null;
  version: number;
}

/** Bağlantı açıldığı anda temas kaydı düşer (sonuç henüz bilinmez). Hata fırlatır; çağıran görünür kılar. */
export async function logContactAttempt(businessId: string, channel: string, address: string): Promise<string> {
  const { data, error } = await supabase.rpc("log_contact_attempt", { p_business_id: businessId, p_channel: channel, p_address: address });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setContactOutcome(
  attemptId: string,
  outcome: ContactOutcome,
  options: { note?: string; followUpAt?: Date } = {},
): Promise<OutcomeResult> {
  const { data, error } = await supabase.rpc("set_contact_attempt_outcome", {
    p_attempt_id: attemptId,
    p_outcome: outcome,
    p_note: options.note ?? null,
    p_follow_up_at: options.followUpAt?.toISOString() ?? null,
  });
  if (error) throw new Error(error.message);
  return data as OutcomeResult;
}

export function useContactAttempts(businessId: string | undefined) {
  return useQuery({
    queryKey: ["contact-attempts", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<ContactAttemptRow[]> => {
      const { data, error } = await supabase
        .from("contact_attempts")
        .select("id, channel, address, outcome, note, follow_up_at, created_by, created_at")
        .eq("business_id", businessId as string)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ContactAttemptRow[];
    },
  });
}

/** Temas veya sonuç değişince işletme, geçmiş ve listeler tazelensin. */
export function useRefreshAfterContact(businessId: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      ["business", businessId],
      ["contact-attempts", businessId],
      ["stage-transitions", businessId],
      ["businesses"],
      ["dashboard-metrics"],
      ["market-performance"],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

/** `datetime-local` yerine tarih seçimi: seçilen gün 10:00 (yerel saat). */
export function followUpDate(daysFromNow: number, now = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(10, 0, 0, 0);
  return date;
}

export function dateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day, 10, 0, 0, 0);
  // 2026-13-45 gibi var olmayan tarihler JavaScript'te kayarak "geçerli" olur; gidiş-dönüş ile reddedilir.
  return date.getMonth() === month && date.getDate() === day ? date : null;
}
