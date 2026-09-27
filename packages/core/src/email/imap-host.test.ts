import { describe, expect, it } from "vitest";
import { imapSinceDate, suggestImapServer } from "./imap-host";

describe("suggestImapServer", () => {
  it("knows the common providers", () => {
    expect(suggestImapServer("smtp.gmail.com")).toEqual({ host: "imap.gmail.com", port: 993 });
    expect(suggestImapServer("smtp.office365.com")).toEqual({ host: "outlook.office365.com", port: 993 });
    expect(suggestImapServer("smtp-mail.outlook.com")).toEqual({ host: "outlook.office365.com", port: 993 });
    expect(suggestImapServer("smtp.yandex.com.tr")).toEqual({ host: "imap.yandex.com.tr", port: 993 });
  });

  it("swaps the smtp/mail prefix for a hosting provider", () => {
    expect(suggestImapServer("smtp.ajans.com.tr")).toEqual({ host: "imap.ajans.com.tr", port: 993 });
    expect(suggestImapServer("mail.ajans.com.tr")).toEqual({ host: "mail.ajans.com.tr", port: 993 });
  });

  it("returns null for an empty host", () => {
    expect(suggestImapServer("  ")).toBeNull();
  });
});

describe("imapSinceDate", () => {
  it("formats an RFC 3501 date (English month, no leading zero needed)", () => {
    expect(imapSinceDate(new Date("2026-09-05T10:00:00Z"))).toBe("5-Sep-2026");
    expect(imapSinceDate(new Date("2026-12-21T23:30:00Z"))).toBe("21-Dec-2026");
  });
});
