import { useEffect, useId } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "./supabase-client";

const REFRESH_DEBOUNCE_MS = 1500;

/**
 * `businesses`/`notes`/`stage_transitions` gibi Realtime'a açılmış tablolarda
 * workspace'e filtrelenmiş değişiklikleri dinler ve ilgili query'leri geçersiz
 * kılar (SPEC.md → B, K: "bir kullanıcının değişikliği diğerinde ≤ 3 sn içinde
 * görünür"). RLS, aboneliği zaten workspace'e göre filtreler (bkz. ADR 0003);
 * `filter` burada yalnızca gereksiz olay trafiğini azaltmak için.
 */
export function useRealtimeTable(
  table: string,
  workspaceId: string | undefined,
  queryKey: QueryKey,
) {
  const queryClient = useQueryClient();
  // Aynı tabloyu birden fazla bileşen dinleyebilir; supabase-js aynı adlı
  // kanalı yeniden kullandığı için ad her hook örneğine özgü olmalı.
  const instanceId = useId();

  useEffect(() => {
    if (!workspaceId) return;

    // Toplu işlemlerde (analiz, içe aktarma) yüzlerce olay art arda gelir; her biri listeyi
    // baştan yüklerse arayüz kilitlenir. Olayları birleştirip sakinleşince bir kez yenileriz.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`realtime:${table}:${workspaceId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey });
          }, REFRESH_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [table, workspaceId, queryClient, instanceId, JSON.stringify(queryKey)]);
}
