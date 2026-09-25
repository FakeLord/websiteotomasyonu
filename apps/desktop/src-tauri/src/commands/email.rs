//! Kişisel SMTP hesabından e-posta gönderimi (SPEC.md → Faz 7). Şifre bu
//! komuta yalnızca çağıran tarafından (Windows Credential Manager'dan okunmuş
//! olarak) parametre ile geçirilir; hiçbir yerde dosyaya/loga yazılmaz.
//! İş mantığı (gönderim izni, DNC, limit) burada değil — masaüstü önce
//! `mark_message_sent()` RPC'sini çağırıp izin aldıktan sonra bu komutu
//! çağırır (CLAUDE.md #9: Rust'ta iş kuralı yazma).

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
}

#[tauri::command]
pub async fn send_email(smtp: SmtpConfig, message: OutboundEmail) -> Result<(), String> {
    let email = Message::builder()
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

    Ok(())
}
