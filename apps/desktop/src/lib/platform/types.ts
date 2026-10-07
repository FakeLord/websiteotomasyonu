import type { WebsiteFetchResult } from "@lbf/core";

/**
 * Uygulamanın işletim sistemi/ağ düzeyinde ihtiyaç duyduğu tüm yetenekler tek
 * sözleşmede toplanır. İki uygulama vardır: Tauri masaüstü kabuğu (Rust komutları)
 * ve tarayıcı modu (yerel Node sunucusu, `apps/local-server`). Arayüz kodu
 * `@tauri-apps/*` paketlerini doğrudan içe aktarmaz; yalnızca `platform` kullanır
 * (ADR 0009). Alan adları Rust komutlarının beklediği snake_case biçimindedir.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
}

export interface OutboundEmail {
  to_email: string;
  subject: string;
  body: string;
  /** Cevap e-postalarında müşterinin son mesajının Message-ID'si (aynı thread). */
  in_reply_to?: string | null;
}

export interface ImapConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface ImapFetchOptions {
  since_uid: number | null;
  /** IMAP `SINCE` biçimi (ör. `21-Sep-2026`); ilk çalıştırmada kullanılır. */
  since_date: string | null;
  limit: number;
}

export interface ImapFetchResult {
  uid_validity: number | null;
  last_uid: number | null;
  messages: Array<{ uid: number; raw_base64: string }>;
}

export interface Platform {
  kind: "tauri" | "web";
  /** Windows Credential Manager (parçalı; Supabase oturumu ve kişisel SMTP/IMAP şifreleri). */
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  /** SMTP ile gönderir; üretilen `Message-ID`'yi döner. */
  sendEmail(smtp: SmtpConfig, message: OutboundEmail): Promise<string>;
  imapFetch(imap: ImapConfig, options: ImapFetchOptions): Promise<ImapFetchResult>;
  fetchPage(url: string): Promise<WebsiteFetchResult>;
  /** Harici bir adresi (ig.me, wa.me, reklam kütüphanesi…) varsayılan tarayıcıda açar. */
  openExternal(url: string): Promise<void>;
  /** Uygulama günlüklerini (Tauri: dosya, tarayıcı: konsol) başlatır. */
  attachLogs(): void;
  logError(message: string): void;
}
