import { describe, expect, it, vi } from "vitest";
import { buildSearchQuery, fetchImap, parseImapDate, selectUids, type ImapClientLike } from "./imap";

const config = { host: "imap.ajans.com", port: 993, username: "satis@ajans.com", password: "gizli" };

function fakeClient(opts: { uids?: number[]; uidValidity?: bigint | undefined; connectError?: Error; sources?: Record<number, string> } = {}) {
  const calls = { search: [] as unknown[], fetch: [] as string[], lock: [] as unknown[], logout: 0, released: 0 };
  const client: ImapClientLike = {
    connect: async () => {
      if (opts.connectError) throw opts.connectError;
    },
    getMailboxLock: async (_path, options) => {
      calls.lock.push(options);
      return { release: () => void (calls.released += 1) };
    },
    mailbox: { uidValidity: opts.uidValidity ?? 99n },
    search: async (query) => {
      calls.search.push(query);
      return opts.uids ?? [];
    },
    fetch: (range) => {
      calls.fetch.push(range);
      const wanted = range.split(",").map(Number);
      return (async function* () {
        for (const uid of wanted) yield { uid, source: Buffer.from(opts.sources?.[uid] ?? `From: x@y.com\r\n\r\ngövde ${uid}`, "utf-8") };
      })();
    },
    logout: async () => void (calls.logout += 1),
  };
  return { client, calls };
}

describe("selectUids", () => {
  it("artan sırada, since_uid'den büyük olanları ve en fazla limit kadarını seçer", () => {
    expect(selectUids([9, 3, 7, 5, 5], 4, 2)).toEqual([5, 7]);
  });

  it("UID n:* sorgusunun döndürdüğü eski son mesajı eler", () => {
    expect(selectUids([4], 4, 50)).toEqual([]);
  });

  it("since_uid yoksa hepsini (limitle) alır", () => {
    expect(selectUids([3, 1, 2], null, 2)).toEqual([1, 2]);
  });
});

describe("parseImapDate / buildSearchQuery", () => {
  it("D-Mon-YYYY biçimini UTC tarihine çevirir", () => {
    expect(parseImapDate("21-Sep-2026")?.toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(parseImapDate("5-Dec-2026")?.toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("geçersiz tarihi (enjeksiyon dahil) reddeder", () => {
    expect(parseImapDate("1 OR ALL")).toBeNull();
    expect(parseImapDate("32-Sep-2026")).toBeNull();
    expect(parseImapDate("21-Foo-2026")).toBeNull();
    expect(parseImapDate("")).toBeNull();
  });

  it("since_uid varsa UID n+1:*, yoksa since tarihi kullanır, ikisi de yoksa hata verir", () => {
    expect(buildSearchQuery(41, null)).toEqual({ uid: "42:*" });
    expect(buildSearchQuery(null, "21-Sep-2026")).toEqual({ since: new Date("2026-09-21T00:00:00.000Z") });
    expect(() => buildSearchQuery(null, null)).toThrow(/since_uid veya since_date/);
    expect(() => buildSearchQuery(null, "1 OR ALL")).toThrow(/tarih/);
  });
});

describe("fetchImap", () => {
  it("INBOX'u salt-okunur açar, UID'leri çeker, base64 ham mesajı ve uid_validity'yi döner", async () => {
    const { client, calls } = fakeClient({ uids: [12, 10, 11], uidValidity: 777n, sources: { 10: "Merhaba ş" } });
    const result = await fetchImap(config, { since_uid: 9, since_date: null, limit: 50 }, () => client);

    expect(calls.lock).toEqual([{ readOnly: true }]);
    expect(calls.search).toEqual([{ uid: "10:*" }]);
    expect(calls.fetch).toEqual(["10,11,12"]);
    expect(result.uid_validity).toBe(777);
    expect(result.last_uid).toBe(12);
    expect(result.messages.map((m) => m.uid)).toEqual([10, 11, 12]);
    expect(Buffer.from(result.messages[0]!.raw_base64, "base64").toString("utf-8")).toBe("Merhaba ş");
    expect(calls.released).toBe(1);
    expect(calls.logout).toBe(1);
  });

  it("limit'e uyar ve kalanlar bir sonraki turda alınsın diye last_uid'yi son çekilen yapar", async () => {
    const { client } = fakeClient({ uids: [1, 2, 3, 4, 5] });
    const result = await fetchImap(config, { since_uid: 0, since_date: null, limit: 2 }, () => client);
    expect(result.messages.map((m) => m.uid)).toEqual([1, 2]);
    expect(result.last_uid).toBe(2);
  });

  it("yeni mesaj yoksa last_uid since_uid olarak kalır", async () => {
    const { client, calls } = fakeClient({ uids: [] });
    const result = await fetchImap(config, { since_uid: 50, since_date: null, limit: 10 }, () => client);
    expect(result).toEqual({ uid_validity: 99, last_uid: 50, messages: [] });
    expect(calls.fetch).toEqual([]);
  });

  it("limit 1–50 aralığına sıkıştırılır", async () => {
    const { client } = fakeClient({ uids: Array.from({ length: 80 }, (_, i) => i + 1) });
    const result = await fetchImap(config, { since_uid: 0, since_date: null, limit: 500 }, () => client);
    expect(result.messages).toHaveLength(50);
  });

  it("giriş hatasını şifre sızdırmadan 'IMAP girişi başarısız' olarak bildirir", async () => {
    const error = Object.assign(new Error("Invalid credentials gizli"), { authenticationFailed: true });
    const { client } = fakeClient({ connectError: error });
    const failure = await fetchImap(config, { since_uid: 1, since_date: null, limit: 5 }, () => client).then(() => new Error("hata beklenmişti"), (e: unknown) => e as Error);
    expect(failure.message).toMatch(/^IMAP girişi başarısız/);
    expect(failure.message).not.toContain("gizli");
  });

  it("bağlantı hatasında anlaşılır mesaj verir", async () => {
    const { client } = fakeClient({ connectError: new Error("getaddrinfo ENOTFOUND imap.yok.com") });
    await expect(fetchImap(config, { since_uid: 1, since_date: null, limit: 5 }, () => client)).rejects.toThrow(/IMAP sunucusuna bağlanılamadı/);
  });

  it("hata olsa da kilidi bırakır ve bağlantıyı kapatır", async () => {
    const { client, calls } = fakeClient();
    client.search = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(fetchImap(config, { since_uid: 1, since_date: null, limit: 5 }, () => client)).rejects.toThrow();
    expect(calls.released).toBe(1);
  });
});
