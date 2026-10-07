import { describe, expect, it } from "vitest";
import { buildMessageId } from "./message-id";

describe("buildMessageId (RFC 5322 — Rust build_message_id ile aynı biçim)", () => {
  it("gönderen adresinin domain'ini kullanır", () => {
    const id = buildMessageId("satis@ajans.com.tr", () => "a".repeat(32));
    expect(id).toBe(`<${"a".repeat(32)}@ajans.com.tr>`);
  });

  it("varsayılan üretici 32 hex karakterlik benzersiz kimlik üretir", () => {
    const first = buildMessageId("a@b.com");
    expect(first).toMatch(/^<[0-9a-f]{32}@b\.com>$/);
    expect(buildMessageId("a@b.com")).not.toBe(first);
  });

  it("geçersiz veya domain'siz adreste localhost'a düşer", () => {
    expect(buildMessageId("gecersiz", () => "x")).toBe("<x@localhost>");
    expect(buildMessageId("a@", () => "x")).toBe("<x@localhost>");
    expect(buildMessageId("a@b c.com", () => "x")).toBe("<x@localhost>");
    expect(buildMessageId("a@<evil>.com", () => "x")).toBe("<x@localhost>");
  });
});
