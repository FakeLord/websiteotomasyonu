import { getCountryProfile, placeToBusinessPayload, scanTile, type SearchJobClock } from "@lbf/core";
import type { ImportBusinessResult } from "@lbf/contracts";
import { getDeviceId } from "../lib/device-id";
import { createPlacesSearchAdapter } from "../lib/places-provider";
import { useScanStore } from "../lib/scan-store";
import { supabase } from "../lib/supabase-client";
import { createScanLoop, type ClaimedTile, type ScanLoopState } from "./scan-loop";

/** Bir kare en kötü durumda 3 çağrı + 60 kayıt sürer; sahiplik bu süre dolmadan başka cihaza geçmez. */
const TILE_TTL_SECONDS = 600;

const realClock: SearchJobClock = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Loop = ReturnType<typeof createScanLoop>;
const loops = new Map<string, Loop>();

function loopFor(workspaceId: string): Loop {
  let loop = loops.get(workspaceId);
  if (loop) return loop;

  const deviceId = getDeviceId();
  loop = createScanLoop({
    async claim() {
      const { data, error } = await supabase.rpc("claim_next_scan_tile", {
        ws: workspaceId,
        p_device_id: deviceId,
        p_ttl_seconds: TILE_TTL_SECONDS,
      });
      if (error) throw new Error(error.message);
      return (data as ClaimedTile | null) ?? null;
    },
    scan(tile) {
      const market = {
        regionCode: tile.countryCode,
        languageCode: getCountryProfile(tile.countryCode).defaultLanguage ?? "en",
      };
      return scanTile(createPlacesSearchAdapter(workspaceId, undefined, market, tile.bounds), realClock, tile);
    },
    async importPlace(tile, place) {
      // Şehir adres bileşenlerinden gelir; plan şehri yalnızca bileşen yoksa yedektir.
      const payload = placeToBusinessPayload(place, {
        city: tile.city,
        // Elle aramayla aynı: Türkiye'de Türkçe etiket, diğer pazarlarda Places sorgusundaki terim.
        category: tile.textQuery,
        countryCode: tile.countryCode,
      });
      const { data, error } = await supabase.rpc("import_business", { ws: workspaceId, p_payload: payload });
      if (error) throw new Error(error.message);
      // Puan burada hesaplanmaz: arka plan analizi her yeni işletmeyi analiz edip puanlar.
      return (data as ImportBusinessResult | null)?.status === "DUPLICATE_MERGED" ? "DUPLICATE" : "NEW";
    },
    async complete(tile, completion) {
      const { data, error } = await supabase.rpc("complete_scan_tile", {
        p_tile_id: tile.tileId,
        p_device_id: deviceId,
        p_outcome: completion.outcome,
        p_result_count: completion.resultCount,
        p_new_count: completion.newCount,
        p_api_calls: completion.apiCalls,
        p_error: completion.error,
      });
      if (error) throw new Error(error.message);
      return { budgetPaused: (data as { budgetPaused?: boolean } | null)?.budgetPaused === true };
    },
    onState: (state) => useScanStore.getState().setScan(state),
  });
  loops.set(workspaceId, loop);
  return loop;
}

/**
 * Etkin tarama planlarının karelerini arka planda tarar; hangi sayfada olunduğundan bağımsızdır.
 * Uygulama açılışında, plan oluşturulunca/sürdürülünce ve aralıklarla çağrılır.
 */
export function kickScan(workspaceId: string): Promise<ScanLoopState> {
  return loopFor(workspaceId).kick();
}
