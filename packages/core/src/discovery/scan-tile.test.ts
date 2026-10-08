import { describe, expect, it, vi } from "vitest";
import type { SearchJobClock, SearchJobPage, SearchJobProvider } from "./run-search-job";
import { PlacesQuotaError, scanTile } from "./scan-tile";

const clock = (): SearchJobClock => ({ sleep: vi.fn().mockResolvedValue(undefined) });

function page(ids: string[], nextPageToken?: string): SearchJobPage {
  return { places: ids.map((id) => ({ id })), nextPageToken };
}

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

function providerOf(...responses: Array<SearchJobPage | Error>): SearchJobProvider {
  const search = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) search.mockRejectedValueOnce(response);
    else search.mockResolvedValueOnce(response);
  }
  return { search };
}

describe("scanTile", () => {
  it("az sonuçlu kare DONE olur", async () => {
    const result = await scanTile(providerOf(page(ids("a", 12))), clock(), { textQuery: "Dentist", depth: 0 });

    expect(result.outcome).toBe("DONE");
    expect(result.places).toHaveLength(12);
    expect(result.apiCalls).toBe(1);
    expect(result.error).toBeNull();
  });

  it("60 sonuç dönen kare SPLIT olur", async () => {
    const provider = providerOf(page(ids("a", 20), "p2"), page(ids("b", 20), "p3"), page(ids("c", 20)));

    const result = await scanTile(provider, clock(), { textQuery: "Dentist", depth: 2 });

    expect(result.outcome).toBe("SPLIT");
    expect(result.places).toHaveLength(60);
    expect(result.apiCalls).toBe(3);
  });

  it("en fazla derinlikte dolu kare bölünmez", async () => {
    const provider = providerOf(page(ids("a", 20), "p2"), page(ids("b", 20), "p3"), page(ids("c", 20)));

    const result = await scanTile(provider, clock(), { textQuery: "Dentist", depth: 6 });

    expect(result.outcome).toBe("DONE");
  });

  it("aynı işletme iki sayfada gelirse bir kez sayılır", async () => {
    const provider = providerOf(page(["a", "b"], "p2"), page(["b", "c"]));

    const result = await scanTile(provider, clock(), { textQuery: "Dentist", depth: 0 });

    expect(result.places.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("aylık sınır dolunca QUOTA döner ve o ana kadar gelenleri korur", async () => {
    const provider = providerOf(page(ids("a", 20), "p2"), new PlacesQuotaError("Aylık sınır doldu"));

    const result = await scanTile(provider, clock(), { textQuery: "Dentist", depth: 0 });

    expect(result.outcome).toBe("QUOTA");
    expect(result.places).toHaveLength(20);
    // Reddedilen çağrı Google'a gitmedi; sayılmaz.
    expect(result.apiCalls).toBe(1);
    expect(result.error).toBe("Aylık sınır doldu");
  });

  it("başka hatada FAILED döner ve hata metnini taşır", async () => {
    const result = await scanTile(providerOf(new Error("Google Places'a ulaşılamadı")), clock(), {
      textQuery: "Dentist",
      depth: 0,
    });

    expect(result.outcome).toBe("FAILED");
    expect(result.places).toEqual([]);
    expect(result.error).toBe("Google Places'a ulaşılamadı");
  });

  it("hız sınırı yüzünden hiç sayfa alınamazsa FAILED döner (boş kare sanılmaz)", async () => {
    const provider: SearchJobProvider = { search: vi.fn().mockResolvedValue({ places: [], rateLimited: true }) };

    const result = await scanTile(provider, clock(), { textQuery: "Dentist", depth: 0 });

    expect(result.outcome).toBe("FAILED");
    expect(result.error).toMatch(/hız sınırı/i);
  });

  it("gerçekten boş kare DONE olur", async () => {
    const result = await scanTile(providerOf(page([])), clock(), { textQuery: "Dentist", depth: 3 });

    expect(result.outcome).toBe("DONE");
    expect(result.places).toEqual([]);
  });
});
