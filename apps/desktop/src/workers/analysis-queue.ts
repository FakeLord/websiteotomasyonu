export interface AnalysisTarget {
  id: string;
  websiteUrl: string | null;
  category: string | null;
}

export interface AnalysisQueueState {
  running: boolean;
  /** Bu turda tamamlanan (başarılı + başarısız) işletme sayısı. */
  done: number;
  /** Bu turda sıraya alınan işletme sayısı (yeni parti geldikçe artar). */
  total: number;
  failed: number;
  /** İlk hatanın metni; analiz hatası veya bekleyenleri okuma hatası olabilir. */
  firstError: string | null;
  /** `lease`: analiz başka bir cihazda sürüyor (aynı işletme iki kez analiz edilmesin). */
  blockedBy: "lease" | null;
}

export interface AnalysisQueueDeps {
  /** Analiz edilmemiş işletmelerden en çok `limit` tanesini döner (en yenisi önce). */
  fetchPending(limit: number): Promise<AnalysisTarget[]>;
  analyze(target: AnalysisTarget): Promise<unknown>;
  /** Kilidi alır veya yeniler; başka cihazdaysa `false`. */
  acquireLease(): Promise<boolean>;
  releaseLease(): Promise<void>;
  onState(state: AnalysisQueueState): void;
  batchSize?: number;
  /** SPEC.md → H: eş zamanlı en fazla 4 domain. */
  concurrency?: number;
}

const IDLE: AnalysisQueueState = { running: false, done: 0, total: 0, failed: 0, firstError: null, blockedBy: null };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Bilinmeyen hata";
}

/**
 * Arka plan analiz kuyruğu: analiz edilmemiş işletmeleri partiler halinde, sayfadan bağımsız olarak analiz eder.
 * Saf orkestrasyondur (I/O `deps` ile verilir). Başarısız olan işletme aynı oturumda tekrar denenmez; aksi halde
 * durumu hiç dolmadığı için kuyruk sonsuza kadar aynı işletmeyi denerdi. `retryFailed()` bu listeyi sıfırlar.
 */
export function createAnalysisQueue(deps: AnalysisQueueDeps) {
  const batchSize = deps.batchSize ?? 40;
  const concurrency = deps.concurrency ?? 4;
  const failedIds = new Set<string>();
  let current: Promise<AnalysisQueueState> | null = null;
  let state: AnalysisQueueState = IDLE;

  const emit = (patch: Partial<AnalysisQueueState>) => {
    state = { ...state, ...patch };
    deps.onState(state);
  };

  async function runBatch(batch: AnalysisTarget[]): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < batch.length) {
        const target = batch[next++]!;
        try {
          await deps.analyze(target);
        } catch (error) {
          failedIds.add(target.id);
          emit({ failed: state.failed + 1, firstError: state.firstError ?? messageOf(error) });
        } finally {
          emit({ done: state.done + 1 });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));
  }

  async function run(): Promise<AnalysisQueueState> {
    state = { ...IDLE, running: true };
    deps.onState(state);

    if (!(await deps.acquireLease())) {
      emit({ running: false, blockedBy: "lease" });
      return state;
    }

    try {
      for (let round = 0; ; round += 1) {
        // Uzun turlarda kilit her partiden önce yenilenir; alınamazsa başka cihaz devralmıştır.
        if (round > 0 && !(await deps.acquireLease())) {
          emit({ blockedBy: "lease" });
          break;
        }
        let batch: AnalysisTarget[];
        try {
          const pending = await deps.fetchPending(batchSize + failedIds.size);
          batch = pending.filter((t) => !failedIds.has(t.id)).slice(0, batchSize);
        } catch (error) {
          emit({ firstError: state.firstError ?? messageOf(error) });
          break;
        }
        if (batch.length === 0) break;
        emit({ total: state.total + batch.length });
        await runBatch(batch);
      }
    } finally {
      await deps.releaseLease();
      emit({ running: false });
    }
    return state;
  }

  return {
    /** Kuyruğu başlatır; zaten çalışıyorsa süren turu döner (ikinci tur açılmaz). */
    kick(): Promise<AnalysisQueueState> {
      current ??= run().finally(() => {
        current = null;
      });
      return current;
    },
    /** Bu oturumda başarısız olanları bir sonraki turda yeniden denemeye açar. */
    retryFailed(): void {
      failedIds.clear();
    },
    state: () => state,
  };
}
