import { describe, expect, it } from "vitest";
import { isAutoReply } from "./auto-reply";

describe("isAutoReply", () => {
  it("detects RFC 3834 Auto-Submitted headers", () => {
    expect(isAutoReply({ "auto-submitted": "auto-replied" })).toBe(true);
    expect(isAutoReply({ "auto-submitted": "auto-generated" })).toBe(true);
  });

  it("treats Auto-Submitted: no as a human message", () => {
    expect(isAutoReply({ "auto-submitted": "no" })).toBe(false);
  });

  it("detects vendor auto-reply headers", () => {
    expect(isAutoReply({ "x-autoreply": "yes" })).toBe(true);
    expect(isAutoReply({ "x-autorespond": "1" })).toBe(true);
    expect(isAutoReply({ precedence: "auto_reply" })).toBe(true);
    expect(isAutoReply({ precedence: "bulk" })).toBe(true);
  });

  it("detects common Turkish/English out-of-office subjects", () => {
    expect(isAutoReply({}, "Otomatik yanıt: Web sitesi hakkında")).toBe(true);
    expect(isAutoReply({}, "Out of Office: Re: Teklif")).toBe(true);
    expect(isAutoReply({}, "Automatic reply: Merhaba")).toBe(true);
  });

  it("does not flag a normal reply", () => {
    expect(isAutoReply({ precedence: "normal" }, "Re: Web siteniz hakkında")).toBe(false);
  });
});
