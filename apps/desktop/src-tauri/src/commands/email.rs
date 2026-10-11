//! Kişisel SMTP hesabından e-posta gönderimi (SPEC.md → Faz 7). Şifre bu
//! komuta yalnızca çağıran tarafından (Windows Credential Manager'dan okunmuş
//! olarak) parametre ile geçirilir; hiçbir yerde dosyaya/loga yazılmaz.
//! İş mantığı (gönderim izni, DNC, limit) burada değil — masaüstü önce
//! `outreach_guard()` ile izin alır, teslimden sonra `mark_message_sent()`
//! RPC'sine bu komutun döndürdüğü `Message-ID`'yi yazar (SPEC.md → L: gelen
//! cevaplar `In-Reply-To` ile bu kimliğe eşlenir). CLAUDE.md #9: Rust'ta iş
//! kuralı yazma.

use lettre::message::header::{ContentType, HeaderName, HeaderValue};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct SmtpConfig {
    host: String,
    port: u16,
    username: String,
    password: String,
    from_name: String,
    from_email: String,
}

#[derive(Deserialize)]
pub struct OutboundEmail {
    to_email: String,
    subject: String,
    body: String,
    /// Cevap e-postalarında müşterinin son mesajının `Message-ID`'si; aynı
    /// thread'de kalmak için `In-Reply-To` ve `References` olarak eklenir.
    #[serde(default)]
    in_reply_to: Option<String>,
    /// Listeden çıkma bağlantısı (https). Varsa `List-Unsubscribe` ve `List-Unsubscribe-Post` (RFC 8058)
    /// başlıkları eklenir.
    #[serde(default)]
    list_unsubscribe_url: Option<String>,
}

/// RFC 5322 `Message-ID`: `<uuid@gönderen-domain>`. Domain gönderen adresinden
/// alınır; alınamazsa `localhost` kullanılır.
pub fn build_message_id(from_email: &str) -> String {
    let domain = from_email
        .rsplit_once('@')
        .map(|(_, d)| d.trim())
        .filter(|d| !d.is_empty() && !d.contains(['<', '>', ' ']))
        .unwrap_or("localhost");
    format!("<{}@{}>", uuid::Uuid::new_v4().simple(), domain)
}

#[derive(Debug, PartialEq, Eq)]
pub enum SmtpSecurity {
    /// Bağlantı baştan TLS'tir (SMTPS, port 465).
    ImplicitTls,
    /// Düz bağlanıp STARTTLS ile yükseltilir (587, 25…); sunucu desteklemezse gönderilmez.
    StartTls,
}

/// Porttan güvenlik kipini seçer. lettre'nin `relay()` fonksiyonu her portta
/// örtük TLS kullandığı için 587'li hesaplar (Gmail, Outlook) bağlanamıyordu.
/// Yerel sunucudaki `buildTransportOptions` ile aynı kural (ADR 0009).
pub fn smtp_security(port: u16) -> SmtpSecurity {
    if port == 465 {
        SmtpSecurity::ImplicitTls
    } else {
        SmtpSecurity::StartTls
    }
}

#[tauri::command]
pub async fn send_email(smtp: SmtpConfig, message: OutboundEmail) -> Result<String, String> {
    let message_id = build_message_id(&smtp.from_email);

    let mut builder = Message::builder()
        .from(
            format!("{} <{}>", smtp.from_name, smtp.from_email)
                .parse()
                .map_err(|e| format!("geçersiz gönderen adresi: {e}"))?,
        )
        .to(message
            .to_email
            .parse()
            .map_err(|e| format!("geçersiz alıcı adresi: {e}"))?)
        .subject(message.subject)
        .message_id(Some(message_id.clone()));

    if let Some(parent) = message.in_reply_to.filter(|p| !p.trim().is_empty()) {
        builder = builder.in_reply_to(parent.clone()).references(parent);
    }

    if let Some(url) = message
        .list_unsubscribe_url
        .filter(|u| u.starts_with("https://") && !u.contains(['\r', '\n', '<', '>', ' ']))
    {
        builder = builder
            .raw_header(HeaderValue::new(
                HeaderName::new_from_ascii_str("List-Unsubscribe"),
                format!("<{url}>"),
            ))
            .raw_header(HeaderValue::new(
                HeaderName::new_from_ascii_str("List-Unsubscribe-Post"),
                "List-Unsubscribe=One-Click".to_string(),
            ));
    }

    let email = builder
        .header(ContentType::TEXT_PLAIN)
        .body(message.body)
        .map_err(|e| format!("e-posta oluşturulamadı: {e}"))?;

    let creds = Credentials::new(smtp.username, smtp.password);

    let builder = match smtp_security(smtp.port) {
        SmtpSecurity::ImplicitTls => AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp.host),
        SmtpSecurity::StartTls => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp.host),
    };
    let transport = builder
        .map_err(|e| format!("SMTP sunucusuna bağlanılamadı: {e}"))?
        .port(smtp.port)
        .credentials(creds)
        .build();

    transport
        .send(email)
        .await
        .map_err(|e| format!("e-posta gönderilemedi: {e}"))?;

    Ok(message_id)
}

#[cfg(test)]
mod tests {
    use super::{build_message_id, smtp_security, SmtpSecurity};

    #[test]
    fn port_465_uses_implicit_tls() {
        assert_eq!(smtp_security(465), SmtpSecurity::ImplicitTls);
    }

    /// Hata: 587 (Gmail/Outlook varsayılanı) örtük TLS ile bağlanmaya
    /// çalışıyordu ve hiç bağlantı kuramıyordu; STARTTLS olmalı.
    #[test]
    fn port_587_and_others_require_starttls() {
        assert_eq!(smtp_security(587), SmtpSecurity::StartTls);
        assert_eq!(smtp_security(25), SmtpSecurity::StartTls);
        assert_eq!(smtp_security(2525), SmtpSecurity::StartTls);
    }

    /// Elle çalıştırılan smoke testi (gerçek ağ; CLAUDE.md #6):
    /// `cargo test --lib smtp_smoke -- --ignored`. Sahte hesapla Gmail'e 587
    /// (STARTTLS) ve 465 (SSL) üzerinden bağlanır; TLS kurulup kimlik doğrulamanın
    /// reddedildiğini (535) doğrular — yani bağlantı aşaması çalışıyor.
    #[tokio::test]
    #[ignore]
    async fn smtp_smoke_starttls_and_implicit_tls_reach_auth() {
        for port in [587u16, 465u16] {
            let result = super::send_email(
                super::SmtpConfig {
                    host: "smtp.gmail.com".into(),
                    port,
                    username: "lbf-smoke-nonexistent-user@gmail.com".into(),
                    password: "not-a-real-password".into(),
                    from_name: "Smoke".into(),
                    from_email: "lbf-smoke-nonexistent-user@gmail.com".into(),
                },
                super::OutboundEmail {
                    to_email: "lbf-smoke-alici@example.com".into(),
                    subject: "smoke".into(),
                    body: "smoke".into(),
                    in_reply_to: None,
                    list_unsubscribe_url: None,
                },
            )
            .await;
            let err = result.err().expect("sahte hesapla gönderim reddedilmeli");
            assert!(err.contains("535"), "port {port}: kimlik doğrulama reddi bekleniyordu, gelen: {err}");
        }
    }

    #[test]
    fn message_id_uses_sender_domain() {
        let id = build_message_id("satis@ajans.com.tr");
        assert!(id.starts_with('<'));
        assert!(id.ends_with("@ajans.com.tr>"));
        assert_eq!(id.len(), "<".len() + 32 + "@ajans.com.tr>".len());
    }

    #[test]
    fn message_id_falls_back_to_localhost() {
        assert!(build_message_id("gecersiz").ends_with("@localhost>"));
    }

    #[test]
    fn message_ids_are_unique() {
        assert_ne!(build_message_id("a@b.com"), build_message_id("a@b.com"));
    }
}
