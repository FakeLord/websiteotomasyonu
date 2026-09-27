import { describe, expect, it } from "vitest";
import { resolveBounceTarget, resolveInboundTarget, type InboundMatchContext } from "./resolve-inbound";

const context: InboundMatchContext = {
  outbound: [
    { conversationId: "conv-a", businessId: "biz-a", externalMessageId: "<out-1@ajans.com>" },
    { conversationId: "conv-a", businessId: "biz-a", externalMessageId: "<out-2@ajans.com>" },
    { conversationId: "conv-b", businessId: "biz-b", externalMessageId: "<out-3@ajans.com>" },
  ],
  emailChannels: [
    { businessId: "biz-a", address: "info@a-klinik.com" },
    { businessId: "biz-c", address: "Destek@C-Kuafor.com" },
  ],
};

const base = { inReplyTo: null, references: [] as string[], fromAddress: null as string | null };

describe("resolveInboundTarget", () => {
  it("matches In-Reply-To to a sent Message-ID first", () => {
    expect(resolveInboundTarget({ ...base, inReplyTo: "<out-3@ajans.com>", fromAddress: "info@a-klinik.com" }, context)).toEqual({
      businessId: "biz-b",
      conversationId: "conv-b",
      matchedBy: "THREAD",
    });
  });

  it("matches any id in References", () => {
    expect(resolveInboundTarget({ ...base, references: ["<x@y>", "<out-2@ajans.com>"] }, context)).toMatchObject({
      businessId: "biz-a",
      matchedBy: "THREAD",
    });
  });

  it("falls back to the sender address in contact channels (case-insensitive)", () => {
    expect(resolveInboundTarget({ ...base, fromAddress: "destek@c-kuafor.com" }, context)).toEqual({
      businessId: "biz-c",
      conversationId: null,
      matchedBy: "SENDER",
    });
  });

  it("ignores mail that belongs to no known lead (personal mail is never imported)", () => {
    expect(resolveInboundTarget({ ...base, fromAddress: "annem@gmail.com" }, context)).toBeNull();
  });

  it("does not match an address shared by several businesses", () => {
    const shared: InboundMatchContext = {
      outbound: [],
      emailChannels: [
        { businessId: "biz-1", address: "info@zincir.com" },
        { businessId: "biz-2", address: "info@zincir.com" },
      ],
    };
    expect(resolveInboundTarget({ ...base, fromAddress: "info@zincir.com" }, shared)).toBeNull();
  });
});

describe("resolveBounceTarget", () => {
  it("uses the original Message-ID and the failed recipient", () => {
    expect(resolveBounceTarget({ originalMessageId: "<out-1@ajans.com>", failedRecipient: "info@a-klinik.com" }, context)).toEqual({
      businessId: "biz-a",
      address: "info@a-klinik.com",
    });
  });

  it("falls back to the failed recipient when the original id is missing", () => {
    expect(resolveBounceTarget({ originalMessageId: null, failedRecipient: "destek@c-kuafor.com" }, context)).toEqual({
      businessId: "biz-c",
      address: "destek@c-kuafor.com",
    });
  });

  it("returns null when nothing can be matched", () => {
    expect(resolveBounceTarget({ originalMessageId: "<zzz@x>", failedRecipient: null }, context)).toBeNull();
  });
});
