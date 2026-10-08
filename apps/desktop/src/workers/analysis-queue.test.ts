import { describe, expect, it, vi } from "vitest";
import { createAnalysisQueue, type AnalysisQueueState, type AnalysisTarget } from "./analysis-queue";

const target = (id: string): AnalysisTarget => ({ id, websiteUrl: `https://${id}.test`, category: null });

/** Analiz edilen işletme "bekleyenler"den düşer (gerçekte website_status dolar); başarısız olan kalır. */
function fakeBackend(ids: string[], failing: string[] = []) {
  const pending = new Set(ids);
  const analyzed: string[] = [];
  return {
    analyzed,
    fetchPending: vi.fn(async (limit: number) => [...pending].slice(0, limit).map(target)),
    analyze: vi.fn(async (t: AnalysisTarget) => {
      analyzed.push(t.id);
      if (failing.includes(t.id)) throw new Error(`patladı: ${t.id}`);
      pending.delete(t.id);
    }),
  };
}

function build(backend: ReturnType<typeof fakeBackend>, overrides: Partial<Parameters<typeof createAnalysisQueue>[0]> = {}) {
  const states: AnalysisQueueState[] = [];
  const acquireLease = vi.fn(async () => true);
  const releaseLease = vi.fn(async () => undefined);
  const queue = createAnalysisQueue({
    fetchPending: backend.fetchPending,
    analyze: backend.analyze,
    acquireLease,
    releaseLease,
    onState: (s) => states.push(s),
    batchSize: 3,
    concurrency: 2,
    ...overrides,
  });
  return { queue, states, acquireLease, releaseLease };
}

describe("createAnalysisQueue", () => {
  it("bekleyen tüm işletmeleri partiler halinde analiz eder ve bitince kilidi bırakır", async () => {
    const backend = fakeBackend(["a", "b", "c", "d", "e", "f", "g"]);
    const { queue, states, releaseLease } = build(backend);

    const summary = await queue.kick();

    expect(backend.analyzed.sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(summary).toMatchObject({ done: 7, total: 7, failed: 0, firstError: null, blockedBy: null });
    expect(states[states.length - 1]).toMatchObject({ running: false, done: 7, total: 7 });
    expect(states.some((s) => s.running)).toBe(true);
    expect(releaseLease).toHaveBeenCalledTimes(1);
  });

  it("aynı anda en fazla `concurrency` kadar analiz çalıştırır", async () => {
    let active = 0;
    let peak = 0;
    const backend = fakeBackend(["a", "b", "c", "d", "e"]);
    const { queue } = build(backend, {
      analyze: async (t) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        await backend.analyze(t);
      },
    });
    await queue.kick();
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("kilit başka cihazdaysa hiçbir şeyi analiz etmez ve bunu bildirir", async () => {
    const backend = fakeBackend(["a", "b"]);
    const { queue, releaseLease } = build(backend, { acquireLease: async () => false });
    const summary = await queue.kick();
    expect(backend.analyzed).toEqual([]);
    expect(summary.blockedBy).toBe("lease");
    expect(releaseLease).not.toHaveBeenCalled();
  });

  it("başarısız olanı sayar, nedenini saklar ve aynı oturumda tekrar DENEMEZ (sonsuz döngü yok)", async () => {
    const backend = fakeBackend(["a", "b", "c"], ["b"]);
    const { queue } = build(backend);

    const summary = await queue.kick();
    expect(summary).toMatchObject({ done: 3, total: 3, failed: 1, firstError: "patladı: b" });
    expect(backend.analyzed.filter((id) => id === "b")).toHaveLength(1);

    // İkinci tetiklemede başarısız olan yine denenmez; bekleyen başka iş yoksa hemen biter.
    const again = await queue.kick();
    expect(backend.analyzed.filter((id) => id === "b")).toHaveLength(1);
    expect(again).toMatchObject({ done: 0, total: 0, failed: 0 });
  });

  it("retryFailed çağrılınca başarısız olanlar yeniden denenir", async () => {
    const backend = fakeBackend(["a", "b"], ["b"]);
    const { queue } = build(backend);
    await queue.kick();
    queue.retryFailed();
    await queue.kick();
    expect(backend.analyzed.filter((id) => id === "b")).toHaveLength(2);
  });

  it("çalışırken gelen ikinci tetikleme yeni bir tur başlatmaz, aynı turu bekler", async () => {
    const backend = fakeBackend(["a", "b", "c", "d"]);
    const { queue, acquireLease } = build(backend);
    const [first, second] = await Promise.all([queue.kick(), queue.kick()]);
    expect(first).toEqual(second);
    expect(backend.analyzed.sort()).toEqual(["a", "b", "c", "d"]);
    // Kilit yalnızca tek tur için alınır/yenilenir; ikinci tetikleme ayrı bir tur açmaz.
    expect(acquireLease.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("bekleyenleri okurken hata olursa bunu sessizce yutmaz, nedenini bildirir ve kilidi bırakır", async () => {
    const backend = fakeBackend(["a"]);
    const { queue, releaseLease } = build(backend, {
      fetchPending: async () => {
        throw new Error("permission denied for table businesses");
      },
    });
    const summary = await queue.kick();
    expect(summary.firstError).toBe("permission denied for table businesses");
    expect(summary.running).toBe(false);
    expect(releaseLease).toHaveBeenCalledTimes(1);
  });

  it("kilit yenilenemezse (başka cihaz aldıysa) turu durdurur", async () => {
    const backend = fakeBackend(["a", "b", "c", "d", "e", "f"]);
    let calls = 0;
    const { queue } = build(backend, { acquireLease: async () => ++calls === 1 });
    const summary = await queue.kick();
    expect(backend.analyzed).toHaveLength(3);
    expect(summary.blockedBy).toBe("lease");
  });
});
