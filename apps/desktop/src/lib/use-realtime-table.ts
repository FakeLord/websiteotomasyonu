import { useEffect, useId } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "./supabase-client";

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

    const channel = supabase
      .channel(`realtime:${table}:${workspaceId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${workspaceId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, workspaceId, queryClient, instanceId, JSON.stringify(queryKey)]);
}
