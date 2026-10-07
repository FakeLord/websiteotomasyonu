import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase-client";
import { useWorkspaceMembership } from "./use-workspace-membership";
import { useUiStore } from "./ui-store";
import { marketRpcParams, type Market, type MarketOption } from "./market";

/** Seçili pazar (üst çubuk). Sorgu anahtarlarına ve RPC parametrelerine bu verilir. */
export function useMarket(): { market: Market; rpcParams: { p_country: string | null; p_city: string | null } } {
  const market = useUiStore((state) => state.market);
  return { market, rpcParams: marketRpcParams(market) };
}

/** Çalışma alanındaki (ülke, şehir, adet) kırılımı; pazar seçicisini besler. */
export function useMarketOptions() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  return useQuery({
    queryKey: ["market-options", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<MarketOption[]> => {
      const { data, error } = await supabase.rpc("market_options", { ws: workspaceId as string });
      if (error) throw error;
      return (data ?? []) as MarketOption[];
    },
  });
}
