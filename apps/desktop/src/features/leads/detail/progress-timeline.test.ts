import { describe, expect, it } from "vitest";
import { buildProgressTimeline, summarizeContact, type ProgressSources } from "./progress-timeline";

const empty: ProgressSources = { attempts: [], transitions: [], notes: [], messages: [] };

describe("buildProgressTimeline", () => {
  it("temas, aşama, not ve mesajları tek listede yeniden eskiye sıralar", () => {
    const events = buildProgressTimeline({
      attempts: [{ id: "a1", channel: "INSTAGRAM", address: "@x", outcome: "SENT", note: null, follow_up_at: null, created_by: "u1", created_at: "2026-10-08T10:00:00Z" }],
      transitions: [{ id: "t1", from_stage: "NEW", to_stage: "QUALIFIED", reason: null, actor_type: "USER", created_at: "2026-10-08T10:00:01Z" }],
      notes: [{ id: "n1", body: "Sahibi öğleden sonra gelir", created_at: "2026-10-08T12:00:00Z", author_id: "u2" }],
      messages: [{ id: "m1", direction: "IN", status: "RECEIVED", sent_at: null, created_at: "2026-10-09T08:00:00Z", channel: "EMAIL" }],
    });

    expect(events.map((e) => `${e.kind}:${e.id}`)).toEqual(["reply:m1", "note:n1", "stage:t1", "contact:a1"]);
  });

  it("vazgeçilen temasları göstermez", () => {
    const events = buildProgressTimeline({
      ...empty,
      attempts: [{ id: "a1", channel: "EMAIL", address: "a@b.c", outcome: "CANCELLED", note: null, follow_up_at: null, created_by: null, created_at: "2026-10-08T10:00:00Z" }],
    });

    expect(events).toEqual([]);
  });

  it("taslak veya başarısız mesajları göstermez; gönderilen mesajı gönderim zamanıyla koyar", () => {
    const events = buildProgressTimeline({
      ...empty,
      messages: [
        { id: "draft", direction: "OUT", status: "DRAFT", sent_at: null, created_at: "2026-10-08T09:00:00Z", channel: "EMAIL" },
        { id: "failed", direction: "OUT", status: "FAILED", sent_at: null, created_at: "2026-10-08T09:30:00Z", channel: "EMAIL" },
        { id: "sent", direction: "OUT", status: "SENT", sent_at: "2026-10-08T11:00:00Z", created_at: "2026-10-08T09:45:00Z", channel: "EMAIL" },
      ],
    });

    expect(events.map((e) => [e.id, e.at])).toEqual([["sent", "2026-10-08T11:00:00Z"]]);
  });

  it("aynı anda olan olaylarda sıra kararlıdır (temas, aşamalardan sonra gelir)", () => {
    const at = "2026-10-08T10:00:00Z";
    const events = buildProgressTimeline({
      attempts: [{ id: "a", channel: "PHONE", address: "+90", outcome: "SENT", note: null, follow_up_at: null, created_by: null, created_at: at }],
      transitions: [{ id: "t", from_stage: "NEW", to_stage: "QUALIFIED", reason: null, actor_type: "USER", created_at: at }],
      notes: [],
      messages: [],
    });

    expect(events.map((e) => e.kind)).toEqual(["stage", "contact"]);
  });
});

describe("summarizeContact", () => {
  const attempt = (overrides: Partial<ProgressSources["attempts"][number]>): ProgressSources["attempts"][number] => ({
    id: "a",
    channel: "INSTAGRAM",
    address: "@x",
    outcome: "SENT",
    note: null,
    follow_up_at: null,
    created_by: "u1",
    created_at: "2026-10-08T10:00:00Z",
    ...overrides,
  });

  it("henüz temas yoksa null döner", () => {
    expect(summarizeContact([], null)).toEqual({ last: null, attempts: 0, nextActionAt: null });
  });

  it("son temas, temas sayısı ve sonraki takip tarihini verir; vazgeçilenler sayılmaz", () => {
    const summary = summarizeContact(
      [
        attempt({ id: "old", channel: "EMAIL", created_at: "2026-10-01T10:00:00Z" }),
        attempt({ id: "new", channel: "PHONE", outcome: "UNREACHABLE", created_at: "2026-10-08T10:00:00Z" }),
        attempt({ id: "cancel", outcome: "CANCELLED", created_at: "2026-10-09T10:00:00Z" }),
      ],
      "2026-10-10T10:00:00Z",
    );

    expect(summary.attempts).toBe(2);
    expect(summary.last?.id).toBe("new");
    expect(summary.nextActionAt).toBe("2026-10-10T10:00:00Z");
  });
});
