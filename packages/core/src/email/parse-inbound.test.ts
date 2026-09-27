import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseInboundEmail, stripQuotedReply } from "./parse-inbound";

function loadFixture(name: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
}

describe("parseInboundEmail", () => {
  it("decodes ISO-8859-9 quoted-printable, encoded-word headers and strips the quoted history", async () => {
    const email = await parseInboundEmail(loadFixture("reply-iso88599-quoted.eml"));
    expect(email.fromAddress).toBe("ayse@ozturkoto.com.tr");
    expect(email.fromName).toBe("Ayşe Öztürk");
    expect(email.subject).toBe("Re: Öztürk Oto için website teklifimiz");
    expect(email.messageId).toBe("<reply-777@ozturkoto.com.tr>");
    expect(email.inReplyTo).toBe("<outbound-004@hostlysisletme.com>");
    expect(email.references).toEqual(["<outbound-004@hostlysisletme.com>"]);
    expect(email.text).toBe("Merhaba, teşekkürler. Fiyatı öğrenebilir miyiz?\nİyi çalışmalar.");
    expect(email.bounce).toBeNull();
    expect(email.autoReply).toBe(false);
  });

  it("detects an RFC 3464 delivery-status bounce with the original Message-ID and recipient", async () => {
    const email = await parseInboundEmail(loadFixture("bounce-dsn.eml"));
    expect(email.bounce).toEqual({
      originalMessageId: "<outbound-009@hostlysisletme.com>",
      failedRecipient: "info@yokboyle-klinik.com",
    });
  });

  it("detects a plain-text mailer-daemon bounce via X-Failed-Recipients", async () => {
    const email = await parseInboundEmail(loadFixture("bounce-gmail-simple.eml"));
    expect(email.bounce).toEqual({
      originalMessageId: "<outbound-010@gmail.com>",
      failedRecipient: "kapali@kuafor-ornek.com",
    });
  });

  it("flags an out-of-office reply as an automatic reply (not a bounce)", async () => {
    const email = await parseInboundEmail(loadFixture("auto-reply-ooo.eml"));
    expect(email.autoReply).toBe(true);
    expect(email.bounce).toBeNull();
    expect(email.text).toContain("izindeyim");
  });

  it("accepts a plain UTF-8 string", async () => {
    const email = await parseInboundEmail(readFileSync(fileURLToPath(new URL("./fixtures/reply-with-in-reply-to.eml", import.meta.url)), "utf-8"));
    expect(email.fromAddress).toBe("ahmet@abcdis.com");
    expect(email.text).toBe("Merhaba, teklifinizi inceledik. Fiyat konusunda görüşebilir miyiz?");
  });
});

describe("stripQuotedReply", () => {
  it("cuts at an English 'On ... wrote:' line", () => {
    expect(stripQuotedReply("Evet ilgileniyoruz.\n\nOn Fri, Sep 26, 2026 at 9:00 AM Satis <s@a.com> wrote:\n> eski")).toBe(
      "Evet ilgileniyoruz.",
    );
  });

  it("cuts at an Outlook original-message separator", () => {
    expect(stripQuotedReply("Tamam.\n\n-----Original Message-----\nFrom: x")).toBe("Tamam.");
    expect(stripQuotedReply("Tamam.\n\n-----Özgün İleti-----\nKimden: x")).toBe("Tamam.");
  });

  it("keeps the whole text when there is no quote", () => {
    expect(stripQuotedReply("  Sadece cevap.  ")).toBe("Sadece cevap.");
  });

  it("falls back to the full text if everything would be stripped", () => {
    expect(stripQuotedReply("> tamamen alıntı")).toBe("> tamamen alıntı");
  });
});
