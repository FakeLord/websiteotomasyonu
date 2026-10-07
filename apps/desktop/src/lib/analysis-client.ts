import type { WebsiteAnalysisResult } from "@lbf/core";

export interface AnalysisInput {
  websiteUrl: string | null;
  category?: string | undefined;
}

export type AnalysisWorkerReply =
  | { id: number; result: WebsiteAnalysisResult }
  | { id: number; error: string };

/** Web Worker'ın bu istemcinin kullandığı yüzeyi (testte sahte ile değiştirilir). */
export interface AnalysisWorkerLike {
  postMessage(message: { id: number } & AnalysisInput): void;
  terminate(): void;
  onmessage: ((event: { data: AnalysisWorkerReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface AnalysisClientDeps {
  /** Worker üretici; `null` ise (Tauri, test, eski tarayıcı) analiz doğrudan çalıştırılır. */
  createWorker: (() => AnalysisWorkerLike) | null;
  runInline: (input: AnalysisInput) => Promise<WebsiteAnalysisResult>;
}

interface Pending {
  input: AnalysisInput;
  resolve: (result: WebsiteAnalysisResult) => void;
  reject: (error: Error) => void;
}

/**
 * Site analizi HTML'i birkaç kez ayrıştırır; onlarca site art arda analiz edilince bunu ana
 * iş parçacığında yapmak arayüzü dondurur. Hesap tek bir Web Worker'da çalışır; worker açılamazsa
 * veya çökerse bekleyen ve sonraki istekler kaldığı yerden ana iş parçacığında sürer.
 */
export function createAnalysisClient(deps: AnalysisClientDeps) {
  let worker: AnalysisWorkerLike | null = null;
  let broken = deps.createWorker === null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function fallBack(): void {
    broken = true;
    worker?.terminate();
    worker = null;
    const waiting = [...pending.values()];
    pending.clear();
    for (const item of waiting) deps.runInline(item.input).then(item.resolve, item.reject);
  }

  function ensureWorker(): AnalysisWorkerLike | null {
    if (broken || !deps.createWorker) return null;
    if (worker) return worker;
    try {
      const created = deps.createWorker();
      created.onmessage = (event) => {
        const reply = event.data;
        const item = pending.get(reply.id);
        if (!item) return;
        pending.delete(reply.id);
        if ("error" in reply) item.reject(new Error(reply.error));
        else item.resolve(reply.result);
      };
      created.onerror = () => fallBack();
      worker = created;
      return created;
    } catch {
      broken = true;
      return null;
    }
  }

  return {
    run(input: AnalysisInput): Promise<WebsiteAnalysisResult> {
      const active = ensureWorker();
      if (!active) return deps.runInline(input);
      return new Promise<WebsiteAnalysisResult>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { input, resolve, reject });
        try {
          active.postMessage({ id, ...input });
        } catch {
          pending.delete(id);
          broken = true;
          deps.runInline(input).then(resolve, reject);
        }
      });
    },
  };
}
