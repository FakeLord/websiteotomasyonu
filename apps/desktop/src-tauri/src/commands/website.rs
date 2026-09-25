//! Pasif website fetch (SPEC.md → H): timeout/boyut/redirect sınırları ve
//! SSRF/özel-IP engeli burada uygulanır. Sınıflandırma mantığı burada değil,
//! `packages/core/website-analyzer` içindedir — bu komut yalnızca ham HTML'i
//! güvenle indirir ve `WebsiteFetcher` sözleşmesine (packages/providers)
//! karşılık gelen alanları döner.

use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use url::Url;

const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: u32 = 5;
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
const USER_AGENT: &str = "LocalBusinessFinderBot/1.0 (+https://hostlysisletme.com)";

#[derive(Serialize)]
pub struct FetchPageResult {
    #[serde(rename = "finalUrl")]
    final_url: String,
    #[serde(rename = "httpStatus")]
    http_status: u16,
    #[serde(rename = "redirectCount")]
    redirect_count: u32,
    #[serde(rename = "responseMs")]
    response_ms: u64,
    https: bool,
    html: String,
}

/// Loopback/yerel ağ/link-local/multicast/CGNAT aralıklarını reddeder — DNS
/// rebinding'e karşı her hop'ta yeniden çözülür ve `reqwest::resolve` ile
/// doğrulanan IP'ye sabitlenir (SPEC.md → H, P: "port tarama yok" ve dahili
/// ağlara istek atmama gereksinimi).
fn is_blocked_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || (v4.octets()[0] == 100 && (64..=127).contains(&v4.octets()[1]))
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_multicast()
                || v6.is_unspecified()
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

async fn resolve_safe(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("DNS çözümlenemedi: {e}"))?
        .collect();

    if addrs.is_empty() {
        return Err("DNS çözümlenemedi".to_string());
    }
    if addrs.iter().any(|a| is_blocked_ip(&a.ip())) {
        return Err("özel/yerel IP adreslerine istek engellendi".to_string());
    }
    Ok(addrs)
}

fn ensure_http_scheme(url: &Url) -> Result<(), String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("yalnızca http/https desteklenir".to_string());
    }
    Ok(())
}

async fn read_capped(response: reqwest::Response) -> Result<Vec<u8>, String> {
    let mut stream = response.bytes_stream();
    let mut buf = Vec::with_capacity(64 * 1024);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("gövde okunamadı: {e}"))?;
        buf.extend_from_slice(&chunk);
        if buf.len() > MAX_BODY_BYTES {
            buf.truncate(MAX_BODY_BYTES);
            break;
        }
    }
    Ok(buf)
}

#[tauri::command]
pub async fn fetch_page(url: String) -> Result<FetchPageResult, String> {
    let started = std::time::Instant::now();
    let mut current = Url::parse(&url).map_err(|e| format!("geçersiz URL: {e}"))?;
    ensure_http_scheme(&current)?;

    let mut redirect_count = 0u32;

    loop {
        let host = current.host_str().ok_or("URL'de host yok")?.to_string();
        let port = current
            .port_or_known_default()
            .ok_or("port belirlenemedi")?;

        let addrs = resolve_safe(&host, port).await?;

        let mut builder = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(USER_AGENT);
        for addr in &addrs {
            builder = builder.resolve(&host, *addr);
        }
        let client = builder.build().map_err(|e| e.to_string())?;

        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|e| format!("istek başarısız: {e}"))?;

        let status = response.status();

        if status.is_redirection() {
            redirect_count += 1;
            if redirect_count > MAX_REDIRECTS {
                return Err("çok fazla yönlendirme".to_string());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("yönlendirme adresi yok")?
                .to_string();
            current = current
                .join(&location)
                .map_err(|e| format!("geçersiz yönlendirme: {e}"))?;
            ensure_http_scheme(&current)?;
            continue;
        }

        let https = current.scheme() == "https";
        let final_url = current.to_string();
        let http_status = status.as_u16();
        let body_bytes = read_capped(response).await?;
        let html = String::from_utf8_lossy(&body_bytes).to_string();

        return Ok(FetchPageResult {
            final_url,
            http_status,
            redirect_count,
            response_ms: started.elapsed().as_millis() as u64,
            https,
            html,
        });
    }
}
