//! Kişisel SMTP hesabından e-posta gönderimi (SPEC.md → Faz 7). Şifre bu
//! komuta yalnızca çağıran tarafından (Windows Credential Manager'dan okunmuş
//! olarak) parametre ile geçirilir; hiçbir yerde dosyaya/loga yazılmaz.
//! İş mantığı (gönderim izni, DNC, limit) burada değil — masaüstü önce
//! `outreach_guard()` ile izin alır, teslimden sonra `mark_message_sent()`
//! RPC'sine bu komutun döndürdüğü `Message-ID`'yi yazar (SPEC.md → L: gelen
//! cevaplar `In-Reply-To` ile bu kimliğe eşlenir). CLAUDE.md #9: Rust'ta iş
//! kuralı yazma.

use lettre::message::header::ContentType;
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

    let email = builder
        .header(ContentType::TEXT_PLAIN)
        .body(message.body)
        .map_err(|e| format!("e-posta oluşturulamadı: {e}"))?;

    let creds = Credentials::new(smtp.username, smtp.password);

    let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp.host)
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
    use super::build_message_id;

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
