import { describe, expect, it } from "vitest";
import { createDraftLoop, MAX_CONSECUTIVE_FAILURES, type ClaimedDraftJob, type DraftJobResult, type DraftLoopState } from "./draft-loop";

function job(n: number): ClaimedDraftJob {
  return {
    jobId: `job-${n}`,
    businessId: `biz-${n}`,
    channel: "EMAIL",
    language: "en",
    name: `İşletme ${n}`,
    category: null,
    district: null,
    city: null,
    doNotContact: false,
  };
}

function setup(jobs: ClaimedDraftJob[], generate: (j: ClaimedDraftJob) => Promise<DraftJobResult> | DraftJobResult) {
  const queue = [...jobs];
  const completed: Array<{ jobId: string; result: DraftJobResult }> = [];
  const states: DraftLoopState[] = [];
  const loop = createDraftLoop({
    claim: async () => queue.shift() ?? null,
    generate: async (j) => generate(j),
    complete: async (j, result) => {
      completed.push({ jobId: j.jobId, result });
    },
    onState: (s) => states.push(s),
  });
  return { loop, completed, states };
}

describe("createDraftLoop", () => {
  it("işleri sırayla üretir ve kapatır", async () => {
    const { loop, completed } = setup([job(1), job(2)], (j) => ({ status: "DONE", messageId: `m-${j.jobId}` }));
    const state = await loop.kick();
    expect(completed.map((c) => c.jobId)).toEqual(["job-1", "job-2"]);
    expect(state).toMatchObject({ running: false, done: 2, failed: 0, stopped: null });
  });

  it("başarısız işi sayar ve devam eder", async () => {
    const { loop, completed } = setup([job(1), job(2)], (j) =>
      j.jobId === "job-1" ? { status: "FAILED", error: "Kontrolden geçemedi" } : { status: "DONE", messageId: "m" },
    );
    const state = await loop.kick();
    expect(completed).toHaveLength(2);
    expect(state).toMatchObject({ done: 1, failed: 1, error: "Kontrolden geçemedi", stopped: null });
  });

  it("generate hata fırlatırsa işi FAILED olarak kapatır", async () => {
    const { loop, completed } = setup([job(1)], () => {
      throw new Error("ağ koptu");
    });
    await loop.kick();
    expect(completed[0]?.result).toEqual({ status: "FAILED", error: "ağ koptu" });
  });

  it("kota dolunca işi bırakır ve turu durdurur", async () => {
    const { loop, completed } = setup([job(1), job(2)], () => ({ status: "RELEASE", reason: "QUOTA", error: "Günlük AI kotası doldu" }));
    const state = await loop.kick();
    expect(completed).toHaveLength(1);
    expect(state).toMatchObject({ stopped: "QUOTA", error: "Günlük AI kotası doldu", done: 0, failed: 0 });
  });

  it("kurulum eksikse (Şirket kaydı yok) durur", async () => {
    const { loop } = setup([job(1), job(2)], () => ({ status: "RELEASE", reason: "SETUP", error: "Şirket tanıtımı yok" }));
    expect((await loop.kick()).stopped).toBe("SETUP");
  });

  it("üst üste çok başarısızlıkta durur", async () => {
    const many = Array.from({ length: MAX_CONSECUTIVE_FAILURES + 3 }, (_, i) => job(i));
    const { loop, completed } = setup(many, () => ({ status: "FAILED", error: "sağlayıcı kapalı" }));
    const state = await loop.kick();
    expect(completed).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(state.stopped).toBe("FAILURES");
  });

  it("başarı arada gelirse başarısızlık sayacı sıfırlanır", async () => {
    const results: DraftJobResult[] = [
      { status: "FAILED", error: "x" },
      { status: "FAILED", error: "x" },
      { status: "DONE", messageId: "m" },
      { status: "FAILED", error: "x" },
    ];
    let i = 0;
    const { loop } = setup([job(1), job(2), job(3), job(4)], () => results[i++] as DraftJobResult);
    const state = await loop.kick();
    expect(state).toMatchObject({ done: 1, failed: 3, stopped: null });
  });

  it("aynı anda iki kick tek turu paylaşır", async () => {
    let claims = 0;
    const loop = createDraftLoop({
      claim: async () => (claims++ === 0 ? job(1) : null),
      generate: async () => ({ status: "DONE", messageId: "m" }),
      complete: async () => undefined,
      onState: () => undefined,
    });
    const [a, b] = await Promise.all([loop.kick(), loop.kick()]);
    expect(a).toBe(b);
    expect(claims).toBe(2);
  });

  it("kuyruk okuma hatasında turu hata ile bitirir", async () => {
    const loop = createDraftLoop({
      claim: async () => {
        throw new Error("bağlantı yok");
      },
      generate: async () => ({ status: "DONE", messageId: "m" }),
      complete: async () => undefined,
      onState: () => undefined,
    });
    const state = await loop.kick();
    expect(state).toMatchObject({ running: false, error: "bağlantı yok" });
  });
});
