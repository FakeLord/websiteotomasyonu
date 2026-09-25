import { describe, expect, it, vi } from "vitest";
import { runSearchJob, type SearchJobClock, type SearchJobProvider } from "./run-search-job";

function instantClock(): SearchJobClock {
  return { sleep: vi.fn().mockResolvedValue(undefined) };
}

describe("runSearchJob", () => {
  it("paginates until nextPageToken is empty", async () => {
    const provider: SearchJobProvider = {
      search: vi
        .fn()
        .mockResolvedValueOnce({ places: [{ id: "a" }], nextPageToken: "p2" })
        .mockResolvedValueOnce({ places: [{ id: "b" }], nextPageToken: "p3" })
        .mockResolvedValueOnce({ places: [{ id: "c" }] }),
    };

    const result = await runSearchJob(provider, instantClock(), "diş kliniği kadıköy", {
      maxPages: 3,
    });

    expect(result.places.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(result.pages).toBe(3);
    expect(result.apiCalls).toBe(3);
  });

  it("stops at maxPages even if nextPageToken is still present", async () => {
    const provider: SearchJobProvider = {
      search: vi.fn().mockResolvedValue({ places: [{ id: "x" }], nextPageToken: "always-more" }),
    };

    const result = await runSearchJob(provider, instantClock(), "kuaför", { maxPages: 2 });

    expect(result.pages).toBe(2);
    expect(result.places).toHaveLength(2);
  });

  it("retries with backoff on rate limiting and eventually succeeds", async () => {
    const clock = instantClock();
    const provider: SearchJobProvider = {
      search: vi
        .fn()
        .mockResolvedValueOnce({ places: [], rateLimited: true })
        .mockResolvedValueOnce({ places: [{ id: "a" }] }),
    };

    const result = await runSearchJob(provider, clock, "veteriner", { maxPages: 1 });

    expect(result.places).toHaveLength(1);
    expect(result.apiCalls).toBe(2);
    expect(clock.sleep).toHaveBeenCalled();
  });

  it("gives up after maxRetries consecutive rate-limit responses", async () => {
    const provider: SearchJobProvider = {
      search: vi.fn().mockResolvedValue({ places: [], rateLimited: true }),
    };

    const result = await runSearchJob(provider, instantClock(), "restoran", {
      maxPages: 1,
      maxRetries: 2,
    });

    expect(result.places).toHaveLength(0);
    expect(result.apiCalls).toBe(2);
  });
});
