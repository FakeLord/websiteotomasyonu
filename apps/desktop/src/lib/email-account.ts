import { platform } from "./platform";

const STORAGE_KEY = "email_account";

export interface EmailAccountConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  fromName: string;
  fromEmail: string;
  /** Gelen cevapları okumak için (ADR 0008). Boşsa IMAP poller çalışmaz. Kimlik bilgileri SMTP ile aynıdır. */
  imapHost?: string;
  imapPort?: number;
}

/**
 * Kişisel SMTP hesap bilgileri Windows Credential Manager'da (Rust `secret_*`
 * komutları) tutulur — düz metin dosyaya/DB'ye asla yazılmaz (CLAUDE.md #1, P.2).
 */
export async function getEmailAccount(): Promise<EmailAccountConfig | null> {
  const raw = await platform.secrets.get(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as EmailAccountConfig;
}

export async function setEmailAccount(config: EmailAccountConfig): Promise<void> {
  await platform.secrets.set(STORAGE_KEY, JSON.stringify(config));
}
