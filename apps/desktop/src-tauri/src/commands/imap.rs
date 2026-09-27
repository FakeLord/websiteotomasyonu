//! Kişisel IMAP gelen kutusundan ham e-postaları okur (SPEC.md → L, ADR 0008).
//! Yalnızca taşıma: TLS bağlantısı, INBOX'u salt-okunur açma, UID ile yeni
//! mesajları `BODY.PEEK[]` (okundu işaretlemez) ile çekme. Ayrıştırma, bounce/
//! otomatik yanıt tespiti ve konuşma eşleştirmesi `packages/core/email`'dedir
//! (CLAUDE.md: Rust'ta iş kuralı yazma). Şifre yalnızca parametre olarak gelir,
//! hiçbir yere yazılmaz.

use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

const MAX_LIMIT: u32 = 50;
const TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Deserialize)]
pub struct ImapConfig {
    host: String,
    port: u16,
    username: String,
    password: String,
}

#[derive(Deserialize)]
pub struct ImapFetchOptions {
    /// Bu UID'den büyük mesajlar istenir; `None` ise `since_date`'ten beri.
    since_uid: Option<u32>,
    /// IMAP `SINCE` biçiminde tarih (ör. `21-Sep-2026`); ilk çalıştırmada kullanılır.
    since_date: Option<String>,
    limit: Option<u32>,
}

#[derive(Serialize)]
pub struct RawEmail {
    uid: u32,
    /// Ham RFC 5322 mesajı, base64. 8-bit gövdeler (ör. ISO-8859-9) bayt bayt
    /// korunur; karakter kümesi çözümü TS tarafındaki MIME ayrıştırıcısındadır.
    raw_base64: String,
}

#[derive(Serialize)]
pub struct ImapFetchResult {
    uid_validity: Option<u32>,
    /// Kutudaki en büyük UID; bir sonraki çağrıda `since_uid` olarak kullanılır.
    last_uid: Option<u32>,
    messages: Vec<RawEmail>,
}

/// `UID SEARCH` sorgusu. `since_uid` verilmişse ondan sonrakiler, yoksa
/// `SINCE <tarih>`, ikisi de yoksa yalnızca son 7 günün kapsamı çağırana aittir.
pub fn build_search_query(since_uid: Option<u32>, since_date: Option<&str>) -> Result<String, String> {
    match (since_uid, since_date) {
        (Some(uid), _) => Ok(format!("UID {}:*", uid.saturating_add(1))),
        (None, Some(date)) => {
            let valid = date.len() <= 11 && date.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
            if !valid {
                return Err("geçersiz tarih biçimi".into());
            }
            Ok(format!("SINCE {date}"))
        }
        (None, None) => Err("since_uid veya since_date gerekli".into()),
    }
}

/// UID'leri artan sırada, `since_uid`'den büyük olanlar ve en fazla `limit`
/// tanesi (en eskiler önce — poller kaldığı yerden devam eder).
pub fn select_uids(mut uids: Vec<u32>, since_uid: Option<u32>, limit: u32) -> Vec<u32> {
    uids.sort_unstable();
    uids.dedup();
    uids.into_iter()
        .filter(|u| since_uid.map_or(true, |s| *u > s))
        .take(limit as usize)
        .collect()
}

fn tls_connector() -> TlsConnector {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = ClientConfig::builder_with_provider(Arc::new(tokio_rustls::rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("rustls varsayılan protokolleri")
        .with_root_certificates(roots)
        .with_no_client_auth();
    TlsConnector::from(Arc::new(config))
}

async fn fetch_inner(imap: ImapConfig, options: ImapFetchOptions) -> Result<ImapFetchResult, String> {
    let limit = options.limit.unwrap_or(MAX_LIMIT).clamp(1, MAX_LIMIT);
    let query = build_search_query(options.since_uid, options.since_date.as_deref())?;

    let tcp = TcpStream::connect((imap.host.as_str(), imap.port))
        .await
        .map_err(|e| format!("IMAP sunucusuna bağlanılamadı: {e}"))?;
    let server_name = ServerName::try_from(imap.host.clone()).map_err(|_| "geçersiz IMAP sunucu adı".to_string())?;
    let tls = tls_connector()
        .connect(server_name, tcp)
        .await
        .map_err(|e| format!("IMAP TLS bağlantısı kurulamadı: {e}"))?;

    let mut client = async_imap::Client::new(tls);
    client
        .read_response()
        .await
        .map_err(|e| format!("IMAP karşılama okunamadı: {e}"))?
        .ok_or_else(|| "IMAP sunucusu bağlantıyı kapattı".to_string())?;

    let mut session = client
        .login(&imap.username, &imap.password)
        .await
        .map_err(|(e, _)| format!("IMAP girişi başarısız: {e}"))?;

    let mailbox = session
        .examine("INBOX")
        .await
        .map_err(|e| format!("Gelen kutusu açılamadı: {e}"))?;

    let found: Vec<u32> = session
        .uid_search(&query)
        .await
        .map_err(|e| format!("IMAP araması başarısız: {e}"))?
        .into_iter()
        .collect();
    let uids = select_uids(found, options.since_uid, limit);

    let mut messages = Vec::with_capacity(uids.len());
    if !uids.is_empty() {
        let set = uids.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        let fetches: Vec<_> = session
            .uid_fetch(&set, "(UID BODY.PEEK[])")
            .await
            .map_err(|e| format!("IMAP mesajları alınamadı: {e}"))?
            .try_collect()
            .await
            .map_err(|e| format!("IMAP mesajları okunamadı: {e}"))?;
        for fetch in &fetches {
            if let (Some(uid), Some(body)) = (fetch.uid, fetch.body()) {
                messages.push(RawEmail { uid, raw_base64: BASE64.encode(body) });
            }
        }
        messages.sort_by_key(|m| m.uid);
    }

    let _ = session.logout().await;

    let last_uid = messages.last().map(|m| m.uid).or(options.since_uid);
    Ok(ImapFetchResult { uid_validity: mailbox.uid_validity, last_uid, messages })
}

#[tauri::command]
pub async fn imap_fetch(imap: ImapConfig, options: ImapFetchOptions) -> Result<ImapFetchResult, String> {
    tokio::time::timeout(TIMEOUT, fetch_inner(imap, options))
        .await
        .map_err(|_| "IMAP isteği zaman aşımına uğradı".to_string())?
}

#[cfg(test)]
mod tests {
    use super::{build_search_query, select_uids};

    #[test]
    fn search_query_continues_after_last_uid() {
        assert_eq!(build_search_query(Some(41), None).unwrap(), "UID 42:*");
    }

    #[test]
    fn search_query_uses_since_date_on_first_run() {
        assert_eq!(build_search_query(None, Some("21-Sep-2026")).unwrap(), "SINCE 21-Sep-2026");
    }

    #[test]
    fn search_query_rejects_injection() {
        assert!(build_search_query(None, Some("1 OR ALL")).is_err());
        assert!(build_search_query(None, None).is_err());
    }

    /// Elle çalıştırılan smoke testi (gerçek ağ; CLAUDE.md #6):
    /// `cargo test --lib imap_smoke -- --ignored`. Var olmayan bir hesapla
    /// TLS el sıkışması + karşılama + LOGIN reddinin doğru hataya dönüştüğünü doğrular.
    #[tokio::test]
    #[ignore]
    async fn imap_smoke_tls_and_login_rejection() {
        let result = super::fetch_inner(
            super::ImapConfig {
                host: "imap.gmail.com".into(),
                port: 993,
                username: "lbf-smoke-nonexistent-user@gmail.com".into(),
                password: "not-a-real-password".into(),
            },
            super::ImapFetchOptions { since_uid: Some(1), since_date: None, limit: Some(1) },
        )
        .await;
        let err = result.err().expect("sahte hesapla giriş reddedilmeli");
        assert!(err.starts_with("IMAP girişi başarısız"), "beklenmeyen hata: {err}");
    }

    #[test]
    fn select_uids_sorts_filters_and_limits() {
        // "UID n:*" en az bir sonuç döndürür (son mesaj) — daha küçükleri elenir.
        assert_eq!(select_uids(vec![9, 3, 7, 5, 5], Some(4), 2), vec![5, 7]);
        assert_eq!(select_uids(vec![4], Some(4), 50), Vec::<u32>::new());
    }
}
