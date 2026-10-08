import { describe, expect, it } from "vitest";
import { CONTACT_OUTCOMES, stagePathForOutcome } from "./contact-outcome";
import { BUSINESS_STAGES, isValidTransition, type BusinessStage } from "./stage";

describe("stagePathForOutcome", () => {
  it("'Yazdım' yeni işletmeyi adım adım İletişime geçilen'e taşır", () => {
    expect(stagePathForOutcome("NEW", "SENT")).toEqual(["QUALIFIED", "OUTREACH_READY", "CONTACTED"]);
    expect(stagePathForOutcome("QUALIFIED", "SENT")).toEqual(["OUTREACH_READY", "CONTACTED"]);
    expect(stagePathForOutcome("OUTREACH_READY", "SENT")).toEqual(["CONTACTED"]);
  });

  it("'Cevap verdi' en fazla Cevap veren'e kadar ilerletir", () => {
    expect(stagePathForOutcome("NEW", "REPLIED")).toEqual(["QUALIFIED", "OUTREACH_READY", "CONTACTED", "REPLIED"]);
    expect(stagePathForOutcome("CONTACTED", "REPLIED")).toEqual(["REPLIED"]);
  });

  it("aşamayı asla geriye almaz ve ilerlemiş işletmeye dokunmaz", () => {
    expect(stagePathForOutcome("CONTACTED", "SENT")).toEqual([]);
    expect(stagePathForOutcome("REPLIED", "SENT")).toEqual([]);
    expect(stagePathForOutcome("ENGAGED", "REPLIED")).toEqual([]);
    expect(stagePathForOutcome("PROPOSAL_READY", "SENT")).toEqual([]);
    expect(stagePathForOutcome("WON", "REPLIED")).toEqual([]);
    expect(stagePathForOutcome("LOST", "SENT")).toEqual([]);
    expect(stagePathForOutcome("DISQUALIFIED", "REPLIED")).toEqual([]);
  });

  it("'İlgilenmedi' işletmeyi Kapanan'a götürür; yeni işletme önce İletişime geçilen'e uğrar", () => {
    expect(stagePathForOutcome("NEW", "NOT_INTERESTED")).toEqual(["QUALIFIED", "OUTREACH_READY", "CONTACTED", "LOST"]);
    expect(stagePathForOutcome("CONTACTED", "NOT_INTERESTED")).toEqual(["LOST"]);
    expect(stagePathForOutcome("REPLIED", "NOT_INTERESTED")).toEqual(["LOST"]);
    expect(stagePathForOutcome("ENGAGED", "NOT_INTERESTED")).toEqual(["LOST"]);
    expect(stagePathForOutcome("HANDED_OFF", "NOT_INTERESTED")).toEqual(["LOST"]);
  });

  it("zaten kapanmış, müşteri olmuş veya LOST'a geçemeyen aşamada 'İlgilenmedi' bir şey yapmaz", () => {
    for (const stage of ["LOST", "WON", "DISQUALIFIED", "PROPOSAL_READY"] as const) {
      expect(stagePathForOutcome(stage, "NOT_INTERESTED")).toEqual([]);
    }
  });

  it("aşamayı değiştirmeyen sonuçlar boş yol döner", () => {
    for (const outcome of ["ATTEMPTED", "UNREACHABLE", "LATER", "CANCELLED"] as const) {
      expect(stagePathForOutcome("NEW", outcome)).toEqual([]);
    }
  });

  it("döndürülen her adım pipeline'ın geçerli geçişidir (SQL'deki kuralla aynı tablo)", () => {
    for (const from of BUSINESS_STAGES) {
      for (const outcome of CONTACT_OUTCOMES) {
        let current: BusinessStage = from;
        for (const next of stagePathForOutcome(from, outcome)) {
          expect(isValidTransition(current, next), `${from} + ${outcome}: ${current} → ${next}`).toBe(true);
          current = next;
        }
      }
    }
  });
});
