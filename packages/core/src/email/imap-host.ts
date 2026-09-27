const KNOWN: Record<string, string> = {
  "smtp.gmail.com": "imap.gmail.com",
  "smtp.googlemail.com": "imap.gmail.com",
  "smtp.office365.com": "outlook.office365.com",
  "smtp-mail.outlook.com": "outlook.office365.com",
  "smtp.mail.yahoo.com": "imap.mail.yahoo.com",
  "smtp.yandex.com": "imap.yandex.com",
  "smtp.yandex.com.tr": "imap.yandex.com.tr",
  "smtp.zoho.com": "imap.zoho.com",
  "smtp.zoho.eu": "imap.zoho.eu",
};

/** SMTP sunucusundan IMAP sunucusu önerir (Ayarlar → E-posta; kullanıcı değiştirebilir). */
export function suggestImapServer(smtpHost: string): { host: string; port: number } | null {
  const host = smtpHost.trim().toLowerCase();
  if (!host) return null;
  const known = KNOWN[host];
  if (known) return { host: known, port: 993 };
  return { host: host.replace(/^smtp\./, "imap."), port: 993 };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** IMAP `SEARCH SINCE` tarih biçimi (RFC 3501 date: `5-Sep-2026`, UTC günü). */
export function imapSinceDate(date: Date): string {
  return `${date.getUTCDate()}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}
