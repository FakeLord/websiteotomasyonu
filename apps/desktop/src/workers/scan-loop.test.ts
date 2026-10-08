import { describe, expect, it, vi } from "vitest";
import type { GooglePlaceResult, ScanTileResult } from "@lbf/core";
import { createScanLoop, type ClaimedTile, type ScanLoopDeps, type ScanLoopState } from "./scan-loop";

const tile = (id: string, overrides: Partial<ClaimedTile> = {}): ClaimedTile => ({
  tileId: id,
  planId: "plan-1",
  categoryLabel: "Diş Kliniği",
  textQuery: "Dentist",
  depth: 0,
  bounds: { low: { lat: 30, lng: -98 }, high: { lat: 30.4, lng: -97.6 } },
  countryCode: "US",
  city: "Austin",
  ...overrides,
});

const places = (...ids: string[]): GooglePlaceResult[] => ids.map((id) => ({ id }));

const scanResult = (overrides: Partial<ScanTileResult> = {}): ScanTileResult => ({
  outcome: "DONE",
  places: [],
  apiCalls: 1,
  error: null,
  ...overrides,
});

function build(queue: ClaimedTile[], overrides: Partial<ScanLoopDeps> = {}) {
  const states: ScanLoopState[] = [];
  const remaining = [...queue];
  const deps: ScanLoopDeps = {
    claim: vi.fn(async () => remaining.shift() ?? null),
    scan: vi.fn(async () => scanResult()),
    importPlace: vi.fn(async () => "NEW" as const),
    complete: vi.fn(async () => ({ budgetPaused: false })),
    onState: (s) => states.push(s),
    ...overrides,
  };
  return { loop: createScanLoop(deps), deps, states };
}

describe("createScanLoop", () => {
  it("kuyruk boşalana kadar kareleri sırayla tarar ve kapatır", async () => {
    const { loop, deps } = build([tile("t1"), tile("t2")], {
      scan: vi.fn(async () => scanResult({ places: places("a", "b") })),
      importPlace: vi
        .fn()
        .mockResolvedValueOnce("NEW")
        .mockResolvedValueOnce("DUPLICATE")
        .mockResolvedValue("NEW"),
    });

    const state = await loop.kick();

    expect(deps.complete).toHaveBeenCalledTimes(2);
    expect(deps.complete).toHaveBeenNthCalledWith(1, expect.objectContaining({ tileId: "t1" }), {
      outcome: "DONE",
      resultCount: 2,
      newCount: 1,
      apiCalls: 1,
      error: null,
    });
    expect(state).toMatchObject({ running: false, tilesDone: 2, newBusinesses: 3, current: null, error: null });
  });

  it("dolu kareyi SPLIT ile kapatır", async () => {
    const { loop, deps } = build([tile("t1")], { scan: vi.fn(async () => scanResult({ outcome: "SPLIT", apiCalls: 3 })) });

    await loop.kick();

    expect(deps.complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: "SPLIT", apiCalls: 3 }));
  });

  it("aylık sınır dolunca geleni kaydeder, kareyi QUOTA ile kapatır ve durur", async () => {
    const { loop, deps } = build([tile("t1"), tile("t2")], {
      scan: vi.fn(async () => scanResult({ outcome: "QUOTA", places: places("a"), error: "Aylık sınır doldu" })),
      complete: vi.fn(async () => ({ budgetPaused: true })),
    });

    const state = await loop.kick();

    expect(deps.importPlace).toHaveBeenCalledTimes(1);
    expect(deps.claim).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: "QUOTA" }));
    expect(state).toMatchObject({ running: false, budgetPaused: true, newBusinesses: 1 });
  });

  it("başarısız kare planı durdurmaz; hata görünür kalır", async () => {
    const { loop, deps } = build([tile("t1"), tile("t2")], {
      scan: vi
        .fn()
        .mockResolvedValueOnce(scanResult({ outcome: "FAILED", error: "Google Places'a ulaşılamadı", apiCalls: 0 }))
        .mockResolvedValueOnce(scanResult()),
    });

    const state = await loop.kick();

    expect(deps.complete).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ outcome: "FAILED" }));
    expect(deps.complete).toHaveBeenCalledTimes(2);
    expect(state.tilesDone).toBe(2);
    expect(state.error).toBe("Google Places'a ulaşılamadı");
  });

  it("üst üste üç kare başarısız olursa durur (bağlantı yokken bütün plan yanmasın)", async () => {
    const { loop, deps } = build([tile("t1"), tile("t2"), tile("t3"), tile("t4")], {
      scan: vi.fn(async () => scanResult({ outcome: "FAILED", error: "ağ yok", apiCalls: 0 })),
    });

    const state = await loop.kick();

    expect(deps.claim).toHaveBeenCalledTimes(3);
    expect(state).toMatchObject({ running: false, error: "ağ yok" });
  });

  it("kayıt hatasında kareyi FAILED ile kapatır", async () => {
    const { loop, deps } = build([tile("t1")], {
      scan: vi.fn(async () => scanResult({ places: places("a", "b") })),
      importPlace: vi.fn().mockResolvedValueOnce("NEW").mockRejectedValueOnce(new Error("kayıt reddedildi")),
    });

    const state = await loop.kick();

    expect(deps.complete).toHaveBeenCalledWith(expect.anything(), {
      outcome: "FAILED",
      resultCount: 2,
      newCount: 1,
      apiCalls: 1,
      error: "kayıt reddedildi",
    });
    expect(state.error).toBe("kayıt reddedildi");
  });

  it("kare alma hatasını durumda gösterir ve durur", async () => {
    const { loop, deps } = build([], { claim: vi.fn().mockRejectedValue(new Error("oturum kapalı")) });

    const state = await loop.kick();

    expect(deps.scan).not.toHaveBeenCalled();
    expect(state).toMatchObject({ running: false, error: "oturum kapalı" });
  });

  it("çalışırken ikinci kick yeni tur açmaz", async () => {
    const { loop, deps } = build([tile("t1")]);

    const [a, b] = await Promise.all([loop.kick(), loop.kick()]);

    expect(a).toBe(b);
    expect(deps.claim).toHaveBeenCalledTimes(2);
  });

  it("tarama sırasında hangi şehir ve kategorinin tarandığını bildirir", async () => {
    const { loop, states } = build([tile("t1", { city: "Leeds", categoryLabel: "Berber" })]);

    await loop.kick();

    expect(states.some((s) => s.running && s.current?.city === "Leeds" && s.current.categoryLabel === "Berber")).toBe(true);
  });
});
