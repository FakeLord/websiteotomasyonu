import type { WebsiteAnalysisResult } from "@lbf/core";
import { describe, expect, it } from "vitest";
import { createAnalysisClient, type AnalysisInput, type AnalysisWorkerLike } from "./analysis-client";

const result = (status: WebsiteAnalysisResult["status"]): WebsiteAnalysisResult => ({
  status,
  issues: [],
  checks: null,
  contacts: [],
  pagesFetched: 0,
  analyzerVersion: 1,
});

class FakeWorker implements AnalysisWorkerLike {
  onmessage: AnalysisWorkerLike["onmessage"] = null;
  onerror: AnalysisWorkerLike["onerror"] = null;
  posted: Array<{ id: number } & AnalysisInput> = [];
  terminated = false;
  postMessage(message: { id: number } & AnalysisInput) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}

describe("createAnalysisClient", () => {
  it("worker yoksa analizi doğrudan çalıştırır", async () => {
    const client = createAnalysisClient({ createWorker: null, runInline: async () => result("GOOD_WEBSITE") });
    expect((await client.run({ websiteUrl: "https://a.test" })).status).toBe("GOOD_WEBSITE");
  });

  it("işi worker'a gönderir ve yanıtı kimliğine göre eşler", async () => {
    const worker = new FakeWorker();
    const client = createAnalysisClient({ createWorker: () => worker, runInline: async () => result("NO_WEBSITE") });

    const first = client.run({ websiteUrl: "https://a.test" });
    const second = client.run({ websiteUrl: "https://b.test", category: "Dentist" });
    expect(worker.posted.map((m) => m.websiteUrl)).toEqual(["https://a.test", "https://b.test"]);

    // Yanıtlar ters sırada gelse de her iş kendi sonucunu alır.
    worker.onmessage?.({ data: { id: worker.posted[1]!.id, result: result("LOW_QUALITY_WEBSITE") } });
    worker.onmessage?.({ data: { id: worker.posted[0]!.id, result: result("GOOD_WEBSITE") } });
    expect((await first).status).toBe("GOOD_WEBSITE");
    expect((await second).status).toBe("LOW_QUALITY_WEBSITE");
  });

  it("worker hata yanıtını reddedilen söz olarak iletir", async () => {
    const worker = new FakeWorker();
    const client = createAnalysisClient({ createWorker: () => worker, runInline: async () => result("NO_WEBSITE") });
    const promise = client.run({ websiteUrl: "https://a.test" });
    worker.onmessage?.({ data: { id: worker.posted[0]!.id, error: "patladı" } });
    await expect(promise).rejects.toThrow("patladı");
  });

  it("worker çökerse bekleyen ve sonraki işler doğrudan çalışır", async () => {
    const worker = new FakeWorker();
    const inlineCalls: string[] = [];
    const client = createAnalysisClient({
      createWorker: () => worker,
      runInline: async (input) => (inlineCalls.push(input.websiteUrl ?? ""), result("GOOD_WEBSITE")),
    });
    const waiting = client.run({ websiteUrl: "https://a.test" });
    worker.onerror?.(new Error("yüklenemedi"));
    expect((await waiting).status).toBe("GOOD_WEBSITE");
    expect((await client.run({ websiteUrl: "https://b.test" })).status).toBe("GOOD_WEBSITE");
    expect(inlineCalls).toEqual(["https://a.test", "https://b.test"]);
    expect(worker.terminated).toBe(true);
  });

  it("worker üretilemezse doğrudan çalışır", async () => {
    const client = createAnalysisClient({
      createWorker: () => {
        throw new Error("CSP engelledi");
      },
      runInline: async () => result("GOOD_WEBSITE"),
    });
    expect((await client.run({ websiteUrl: "https://a.test" })).status).toBe("GOOD_WEBSITE");
  });
});
