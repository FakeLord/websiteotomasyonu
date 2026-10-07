import { ImapFlow } from "imapflow";

export interface ImapConfigInput {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface ImapFetchOptionsInput {
  since_uid: number | null;
  /** IMAP `SINCE` biçimi, ör. `21-Sep-2026`. */
  since_date: string | null;
  limit: number;
}

export interface ImapFetchOutput {
  uid_validity: number | null;
  last_uid: number | null;
  messages: Array<{ uid: number; raw_base64: string }>;
}

/** `ImapFlow`'un kullandığımız yüzeyi; testlerde sahte istemci verilir. */
export interface ImapClientLike {
  connect(): Promise<void>;
  getMailboxLock(path: string, options: { readOnly: boolean }): Promise<{ release(): void }>;
  readonly mailbox: { uidValidity?: bigint | undefined } | false;
  search(query: Record<string, unknown>, options: { uid: true }): Promise<number[] | false>;
  fetch(range: string, query: { uid: true; source: true }, options: { uid: true }): AsyncIterable<{ uid: number; source?: Buffer | undefined }>;
  logout(): Promise<void>;
  close?(): void;
}

const MAX_LIMIT = 50;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** `21-Sep-2026` → UTC tarihi; geçersiz girdi (enjeksiyon dahil) null. */
export function parseImapDate(value: string): Date | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]!.toLowerCase());
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (month === -1 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCDate() === day ? date : null;
}

export function buildSearchQuery(sinceUid: number | null, sinceDate: string | null): Record<string, unknown> {
  if (sinceUid !== null) return { uid: `${sinceUid + 1}:*` };
  if (sinceDate === null) throw new Error("since_uid veya since_date gerekli");
  const date = parseImapDate(sinceDate);
  if (!date) throw new Error("geçersiz tarih biçimi");
  return { since: date };
}

/**
 * UID'leri artan sırada, `sinceUid`'den büyük olanlar ve en fazla `limit` tanesi
 * (en eskiler önce — poller kaldığı yerden devam eder). `UID n:*` sunucuda en az
 * bir (son) mesaj döndürdüğü için eski mesaj burada elenir.
 */
export function selectUids(found: readonly number[], sinceUid: number | null, limit: number): number[] {
  return [...new Set(found)]
    .sort((a, b) => a - b)
    .filter((uid) => sinceUid === null || uid > sinceUid)
    .slice(0, limit);
}

function createClient(imap: ImapConfigInput): ImapClientLike {
  return new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: true,
    auth: { user: imap.username, pass: imap.password },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
  }) as unknown as ImapClientLike;
}

/**
 * Gelen kutusunu salt-okunur (`EXAMINE`) açıp yeni mesajları ham RFC 5322 olarak
 * döner (Rust `imap_fetch` ile aynı sözleşme). Okundu işaretlenmez. Ayrıştırma ve
 * lead eşleştirmesi istemcide (`packages/core/email`) yapılır.
 */
export async function fetchImap(
  imap: ImapConfigInput,
  options: ImapFetchOptionsInput,
  makeClient: (imap: ImapConfigInput) => ImapClientLike = createClient,
): Promise<ImapFetchOutput> {
  const limit = Math.min(Math.max(Math.trunc(options.limit) || 1, 1), MAX_LIMIT);
  const query = buildSearchQuery(options.since_uid, options.since_date);
  const client = makeClient(imap);

  try {
    await client.connect();
  } catch (error) {
    client.close?.();
    // Sunucu yanıtı kimlik bilgisi içerebilir; yalnızca türü bildirilir.
    const authFailed = (error as { authenticationFailed?: boolean }).authenticationFailed === true;
    throw new Error(authFailed ? "IMAP girişi başarısız (kullanıcı adı/şifre veya uygulama şifresi)" : "IMAP sunucusuna bağlanılamadı");
  }

  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uidValidity = client.mailbox ? client.mailbox.uidValidity : undefined;
      const found = (await client.search(query, { uid: true })) || [];
      const uids = selectUids(found, options.since_uid, limit);

      const messages: ImapFetchOutput["messages"] = [];
      if (uids.length > 0) {
        for await (const message of client.fetch(uids.join(","), { uid: true, source: true }, { uid: true })) {
          if (message.source) messages.push({ uid: message.uid, raw_base64: message.source.toString("base64") });
        }
        messages.sort((a, b) => a.uid - b.uid);
      }

      return {
        uid_validity: uidValidity === undefined ? null : Number(uidValidity),
        last_uid: messages.at(-1)?.uid ?? options.since_uid,
        messages,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close?.());
  }
}
