import type { IncomingHttpHeaders } from "node:http";

export type Verdict = { ok: true } | { ok: false; status: number; error: string };

interface RequestLike {
  method?: string | undefined;
  url?: string | undefined;
  headers: IncomingHttpHeaders;
}

const deny = (status: number, error: string): Verdict => ({ ok: false, status, error });

/**
 * Yerel sunucunun tek güvenlik kapısı (ADR 0009). Amaç, bilgisayarda açık gezilen
 * başka bir sitenin `127.0.0.1`'e istek atıp e-posta hesabını veya kasayı
 * kullanmasını engellemektir:
 *  - `Host` ve `Origin` yalnızca bu sunucunun adresi olabilir (DNS rebinding + yabancı site),
 *  - `Sec-Fetch-Site` varsa aynı origin olmalı (tek istisna: başka siteden tıklanan bağlantıyla arayüz sayfasının
 *    üst düzey GET gezinmesi),
 *  - `/api` yalnızca `POST` + JSON + özel `x-lbf` başlığı kabul eder; özel başlık
 *    çapraz-site isteği preflight'a zorlar ve hiçbir CORS başlığı verilmediği için reddedilir.
 */
export function checkRequest(req: RequestLike, port: number): Verdict {
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  const host = req.headers.host;
  if (!host || !allowedHosts.includes(host.toLowerCase())) return deny(403, "Geçersiz istek adresi.");

  const origin = req.headers.origin;
  if (origin !== undefined && !allowedHosts.some((h) => origin.toLowerCase() === `http://${h}`)) {
    return deny(403, "Geçersiz istek kaynağı.");
  }

  const isApi = (req.url ?? "").startsWith("/api/");

  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite !== undefined && fetchSite !== "same-origin" && fetchSite !== "none") {
    // E-postadaki davet/sıfırlama bağlantısı başka siteden (Gmail) gelen üst düzey bir gezinmedir; arayüz
    // sayfasını açabilmeli. Yalnızca belge GET'i: iframe, alt kaynak ve /api hâlâ reddedilir.
    const isPageNavigation =
      !isApi &&
      (req.method === "GET" || req.method === "HEAD") &&
      req.headers["sec-fetch-mode"] === "navigate" &&
      req.headers["sec-fetch-dest"] === "document";
    if (!isPageNavigation) return deny(403, "Çapraz-site isteklere izin verilmez.");
  }

  if (!isApi) {
    return req.method === "GET" || req.method === "HEAD" ? { ok: true } : deny(405, "Yöntem desteklenmiyor.");
  }

  if (req.method !== "POST") return deny(405, "Yöntem desteklenmiyor.");
  if (req.headers["x-lbf"] !== "1") return deny(403, "Eksik istek başlığı.");
  if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return deny(415, "Yalnızca JSON kabul edilir.");
  }
  return { ok: true };
}
