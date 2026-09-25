import { useEffect } from "react";
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

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`realtime:${table}:${workspaceId}`)
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
  }, [table, workspaceId, queryClient, JSON.stringify(queryKey)]);
}
