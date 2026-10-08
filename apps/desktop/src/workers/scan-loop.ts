import type { GooglePlaceResult, ScanTileOutcome, ScanTileResult, TileBounds } from "@lbf/core";

/** `claim_next_scan_tile` RPC'sinin döndürdüğü kare. */
export interface ClaimedTile {
  tileId: string;
  planId: string;
  categoryLabel: string;
  textQuery: string;
  depth: number;
  bounds: TileBounds;
  countryCode: string;
  city: string;
}

export interface TileCompletion {
  outcome: ScanTileOutcome;
  resultCount: number;
  newCount: number;
  apiCalls: number;
  error: string | null;
}

export interface ScanLoopState {
  running: boolean;
  /** Bu turda kapatılan kare sayısı. */
  tilesDone: number;
  /** Bu turda ilk kez kaydedilen işletme sayısı. */
  newBusinesses: number;
  current: { city: string; categoryLabel: string } | null;
  /** Aylık Places sınırı doldu; plan sınır yükseltilince veya yeni ayda kendiliğinden sürer. */
  budgetPaused: boolean;
  /** Bu turdaki son hata (başarısız kare, kayıt veya kare alma hatası). */
  error: string | null;
}

export interface ScanLoopDeps {
  /** Sıradaki kareyi bu cihaza alır; kuyruk boşsa `null`. */
  claim(): Promise<ClaimedTile | null>;
  scan(tile: ClaimedTile): Promise<ScanTileResult>;
  importPlace(tile: ClaimedTile, place: GooglePlaceResult): Promise<"NEW" | "DUPLICATE">;
  complete(tile: ClaimedTile, completion: TileCompletion): Promise<{ budgetPaused: boolean }>;
  onState(state: ScanLoopState): void;
}

const IDLE: ScanLoopState = { running: false, tilesDone: 0, newBusinesses: 0, current: null, budgetPaused: false, error: null };

/** Bağlantı kesikken bütün kareler FAILED olmasın diye üst üste bu kadar başarısızlıkta tur durur. */
const MAX_CONSECUTIVE_FAILURES = 3;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Bilinmeyen hata";
}

/**
 * Tarama planı çalıştırıcısı (ADR 0014): kareleri sırayla alır, tarar, bulunan işletmeleri kaydeder ve kareyi kapatır.
 * Saf orkestrasyondur (I/O `deps` ile verilir). Kuyruk boşalınca, bütçe dolunca veya art arda hata olunca durur;
 * yeniden `kick()` edildiğinde kaldığı yerden sürer (durum veritabanındadır).
 */
export function createScanLoop(deps: ScanLoopDeps) {
  let current: Promise<ScanLoopState> | null = null;
  let state: ScanLoopState = IDLE;

  const emit = (patch: Partial<ScanLoopState>) => {
    state = { ...state, ...patch };
    deps.onState(state);
  };

  async function runTile(tile: ClaimedTile): Promise<TileCompletion> {
    const scanned = await deps.scan(tile);
    let newCount = 0;
    let outcome = scanned.outcome;
    let error = scanned.error;

    // QUOTA/FAILED durumunda da o ana kadar gelen sonuçlar kaydedilir: çağrıların ücreti ödendi.
    for (const place of scanned.places) {
      try {
        if ((await deps.importPlace(tile, place)) === "NEW") {
          newCount += 1;
          emit({ newBusinesses: state.newBusinesses + 1 });
        }
      } catch (importError) {
        outcome = "FAILED";
        error = messageOf(importError);
        break;
      }
    }

    return { outcome, resultCount: scanned.places.length, newCount, apiCalls: scanned.apiCalls, error };
  }

  async function run(): Promise<ScanLoopState> {
    state = { ...IDLE, running: true };
    deps.onState(state);
    let consecutiveFailures = 0;

    try {
      while (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        const tile = await deps.claim();
        if (!tile) break;
        emit({ current: { city: tile.city, categoryLabel: tile.categoryLabel } });

        const completion = await runTile(tile);
        const { budgetPaused } = await deps.complete(tile, completion);
        emit({ tilesDone: state.tilesDone + 1, ...(completion.error ? { error: completion.error } : {}) });

        if (completion.outcome === "QUOTA" || budgetPaused) {
          emit({ budgetPaused: true });
          break;
        }
        consecutiveFailures = completion.outcome === "FAILED" ? consecutiveFailures + 1 : 0;
      }
    } catch (error) {
      emit({ error: messageOf(error) });
    } finally {
      emit({ running: false, current: null });
    }
    return state;
  }

  return {
    /** Taramayı başlatır; zaten çalışıyorsa süren turu döner. */
    kick(): Promise<ScanLoopState> {
      current ??= run().finally(() => {
        current = null;
      });
      return current;
    },
    state: () => state,
  };
}
