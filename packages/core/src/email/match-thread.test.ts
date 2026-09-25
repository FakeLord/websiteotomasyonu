import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEmlHeaders } from "./parse-eml-headers";
import { matchEmailThread, type ConversationThreadRef } from "./match-thread";

function loadFixture(name: string): string {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, "utf-8");
}

const candidates: ConversationThreadRef[] = [
  { conversationId: "conv-abc", messageId: "<outbound-001@hostlysisletme.com>", subject: "ABC Diş Kliniği için website teklifimiz" },
  { conversationId: "conv-xyz", messageId: "<outbound-002@hostlysisletme.com>", subject: "XYZ Kuaför için website teklifimiz" },
  { conversationId: "conv-oztu", messageId: "<outbound-004@hostlysisletme.com>", subject: "Ozturk Oto Servis icin website teklifimiz" },
];

describe("parseEmlHeaders", () => {
  it("extracts Message-ID, In-Reply-To, References and Subject", () => {
    const headers = parseEmlHeaders(loadFixture("reply-with-in-reply-to.eml"));
    expect(headers.messageId).toBe("<reply-001@abcdis.com>");
    expect(headers.inReplyTo).toBe("<outbound-001@hostlysisletme.com>");
    expect(headers.references).toEqual(["<outbound-001@hostlysisletme.com>"]);
    expect(headers.subject).toBe("Re: ABC Diş Kliniği için website teklifimiz");
  });

  it("unfolds a References header split across multiple lines", () => {
    const headers = parseEmlHeaders(loadFixture("reply-folded-references.eml"));
    expect(headers.references).toEqual(["<outbound-003@hostlysisletme.com>", "<outbound-004@hostlysisletme.com>"]);
  });

  it("does not read anything from the message body", () => {
    const headers = parseEmlHeaders(loadFixture("reply-subject-only.eml"));
    expect(headers.inReplyTo).toBeUndefined();
    expect(headers.subject).toContain("XYZ Kuaför");
  });
});

describe("matchEmailThread", () => {
  it("matches via In-Reply-To/References (the reliable path)", () => {
    const headers = parseEmlHeaders(loadFixture("reply-with-in-reply-to.eml"));
    expect(matchEmailThread(headers, candidates)).toBe("conv-abc");
  });

  it("falls back to a normalized subject match when there is no In-Reply-To", () => {
    const headers = parseEmlHeaders(loadFixture("reply-subject-only.eml"));
    expect(matchEmailThread(headers, candidates)).toBe("conv-xyz");
  });

  it("prefers the References-based match over subject when both would match", () => {
    const headers = parseEmlHeaders(loadFixture("reply-folded-references.eml"));
    expect(matchEmailThread(headers, candidates)).toBe("conv-oztu");
  });

  it("returns null for a genuinely new inbound email (no match)", () => {
    const headers = parseEmlHeaders(loadFixture("unrelated-new-lead-reply.eml"));
    expect(matchEmailThread(headers, candidates)).toBeNull();
  });

  it("treats Re:/RE:/Fwd: prefixes as equivalent when subject-matching", () => {
    const headers = { references: [], subject: "fwd: XYZ Kuaför için website teklifimiz" };
    expect(matchEmailThread(headers, candidates)).toBe("conv-xyz");
  });

  it("does not match an unrelated subject", () => {
    const headers = { references: [], subject: "Tamamen alakasız bir konu" };
    expect(matchEmailThread(headers, candidates)).toBeNull();
  });
});
