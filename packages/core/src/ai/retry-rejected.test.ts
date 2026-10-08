import { describe, expect, it, vi } from "vitest";
import { retryRejected } from "./retry-rejected";

const rejected = (reason: string) => ({ ok: false, reasons: [reason] });
const accepted = { ok: true, reasons: [] as string[] };

describe("retryRejected", () => {
  it("ilk denemede geçen taslağı yeniden üretmez", async () => {
    const run = vi.fn().mockResolvedValue(accepted);

    expect(await retryRejected(run)).toBe(accepted);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(0);
  });

  it("reddedilen taslağı yeniden üretir ve geçeni döner", async () => {
    const run = vi.fn().mockResolvedValueOnce(rejected("UNVERIFIED_REFERENCE:Mesut Akyol")).mockResolvedValueOnce(accepted);

    expect(await retryRejected(run)).toBe(accepted);
    expect(run.mock.calls.map((call) => call[0])).toEqual([0, 1]);
  });

  it("üç denemede de reddedilirse son reddi döner", async () => {
    const last = rejected("PRICE_MISMATCH:5 TL");
    const run = vi.fn().mockResolvedValueOnce(rejected("a")).mockResolvedValueOnce(rejected("b")).mockResolvedValueOnce(last);

    expect(await retryRejected(run)).toBe(last);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("yeniden denemenin işe yaramayacağı durumda (aranmasın) tekrar denemez", async () => {
    const run = vi.fn().mockResolvedValue(rejected("STOP_REQUEST"));

    await retryRejected(run);

    expect(run).toHaveBeenCalledTimes(1);
  });
});
