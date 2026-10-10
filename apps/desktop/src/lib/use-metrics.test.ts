import { describe, expect, it, vi } from "vitest";

// use-metrics.ts Supabase istemcisini içe aktarır; burada yalnızca saf huni hesabı sınanır.
vi.mock("./supabase-client", () => ({ supabase: {} }));

import { stageFunnel } from "./use-metrics";

describe("stageFunnel", () => {
  it("her adımı o aşamaya ve sonrasına ulaşanların toplamı olarak hesaplar", () => {
    const funnel = stageFunnel({ NEW: 50, QUALIFIED: 10, CONTACTED: 20, REPLIED: 8, ENGAGED: 4, PROPOSAL_READY: 2, WON: 1 });
    expect(funnel).toEqual({ found: 95, contacted: 35, replied: 15, engaged: 7, proposal: 3, won: 1 });
  });

  it("elenen ve kaybedilenleri yalnızca ilk adıma katar", () => {
    const funnel = stageFunnel({ NEW: 5, LOST: 3, DISQUALIFIED: 2, CONTACTED: 1 });
    expect(funnel.found).toBe(11);
    expect(funnel.contacted).toBe(1);
  });

  it("boş dağılımda sıfır döner", () => {
    expect(stageFunnel({})).toEqual({ found: 0, contacted: 0, replied: 0, engaged: 0, proposal: 0, won: 0 });
  });
});
