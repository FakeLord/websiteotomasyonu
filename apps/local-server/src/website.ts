import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";
import { isBlockedIp } from "@lbf/core";

export interface FetchPageResult {
  finalUrl: string;
  httpStatus: number;
  redirectCount: number;
  responseMs: number;
  https: boolean;
  html: string;
}

export interface FetchPageDeps {
  /** Ad → tüm IP adresleri. Varsayılan: sistem DNS'i. */
  resolve?: (host: string) => Promise<string[]>;
  isBlocked?: (ip: string) => boolean;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

const USER_AGENT = "LocalBusinessFinderBot/1.0 (+https://hostlysisletme.com)";

async function systemResolve(host: string): Promise<string[]> {
  return (await dns.lookup(host, { all: true })).map((a) => a.address);
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** Doğrulanan IP'yi çözümleyici olarak verir: bağlantı tam bu adrese kurulur (DNS rebinding'e karşı). */
function pinnedLookup(address: string): NonNullable<http.RequestOptions["lookup"]> {
  const family = net.isIPv6(address) ? 6 : 4;
  return ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options?.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  }) as NonNullable<http.RequestOptions["lookup"]>;
}

function decodeStream(res: http.IncomingMessage): Readable {
  switch ((res.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return res.pipe(zlib.createGunzip());
    case "deflate":
      return res.pipe(zlib.createInflate());
    case "br":
      return res.pipe(zlib.createBrotliDecompress());
    default:
      return res;
  }
}

async function readCapped(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    chunks.push(buffer);
    total += buffer.length;
    if (total >= maxBytes) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, maxBytes);
}

interface HopResponse {
  status: number;
  location: string | null;
  body: Buffer;
}

/**
 * Sunucu ara sertifikayı göndermiyorsa tarayıcılar onu kendisi bulup siteyi açar, Node açamaz.
 * Yalnızca bu iki durum "tarayıcıda açılan site" sayılır; süresi dolmuş veya ada uymayan
 * sertifikalar bilerek hata olarak kalır.
 */
export function isIncompleteChainError(error: Error | undefined): boolean {
  return /UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY/.test(error?.message ?? "");
}

function requestOnce(
  current: URL,
  address: string,
  timeoutMs: number,
  maxBytes: number,
  verifyCertificate: boolean,
): Promise<HopResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = current.protocol === "https:";
    const hostname = stripBrackets(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const req = (isHttps ? https : http).request(
      {
        host: hostname,
        port: current.port || (isHttps ? 443 : 80),
        path: `${current.pathname}${current.search}`,
        method: "GET",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-encoding": "gzip, deflate, br" },
        lookup: pinnedLookup(address),
        // Her istek yeni bağlantı kurar: havuzdaki (keep-alive) bir soket, doğrulanan IP'ye sabitlemeyi atlardı.
        agent: false,
        signal: controller.signal,
        // SNI ve sertifika doğrulaması orijinal ada göre yapılır; bağlantı sabit IP'ye gider.
        ...(isHttps && !net.isIP(hostname) ? { servername: hostname } : {}),
        ...(isHttps && !verifyCertificate ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          clearTimeout(timer);
          resolve({ status, location: res.headers.location, body: Buffer.alloc(0) });
          return;
        }
        readCapped(decodeStream(res), maxBytes)
          .then((body) => resolve({ status, location: null, body }))
          .catch(() => reject(new Error("gövde okunamadı")))
          .finally(() => clearTimeout(timer));
      },
    );
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(controller.signal.aborted ? "istek zaman aşımına uğradı" : `istek başarısız: ${(error as NodeJS.ErrnoException).code ?? "bağlantı hatası"}`));
    });
    req.end();
  });
}

/**
 * Pasif website fetch (SPEC.md → H): Rust `commands/website.rs::fetch_page` ile aynı
 * sınırlar ve SSRF engeli — yalnızca http/https; her hop'ta ad yeniden çözülür, çözülen
 * IP'lerden biri bile özel/loopback/link-local/CGNAT ise reddedilir ve bağlantı doğrulanan
 * IP'ye sabitlenir; en çok 5 yönlendirme; hop başına 10 sn; gövde en çok 2 MB.
 * Sınıflandırma mantığı burada değil, `packages/core/website-analyzer`'dadır.
 */
export async function fetchPage(rawUrl: string, deps: FetchPageDeps = {}): Promise<FetchPageResult> {
  const resolve = deps.resolve ?? systemResolve;
  const isBlocked = deps.isBlocked ?? isBlockedIp;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const maxRedirects = deps.maxRedirects ?? 5;
  const maxBytes = deps.maxBytes ?? 2 * 1024 * 1024;
  const started = Date.now();

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new Error("geçersiz URL");
  }

  let redirectCount = 0;
  for (;;) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new Error("yalnızca http/https desteklenir");

    const host = stripBrackets(current.hostname);
    if (!host) throw new Error("URL'de host yok");
    const addresses = net.isIP(host) ? [host] : await resolve(host).catch(() => []);
    if (addresses.length === 0) throw new Error("DNS çözümlenemedi");
    if (addresses.some((address) => isBlocked(address))) throw new Error("özel/yerel IP adreslerine istek engellendi");

    // Ad birden çok adrese çözülebilir (ör. önce IPv6); makinede o yol yoksa site yine de
    // tarayıcıda açılır. Doğrulanmış adreslerin hepsi sırayla denenir, son hata verilir.
    const attempt = async (verifyCertificate: boolean) => {
      let found: HopResponse | undefined;
      let failure: Error | undefined;
      for (const address of addresses) {
        try {
          found = await requestOnce(current, address, timeoutMs, maxBytes, verifyCertificate);
          break;
        } catch (error) {
          failure = error instanceof Error ? error : new Error("istek başarısız");
        }
      }
      return { found, failure };
    };

    let { found: response, failure: lastError } = await attempt(true);
    // Eksik ara sertifika: pasif, kimlik bilgisi göndermeyen bir GET olduğu için sertifika doğrulaması
    // olmadan bir kez daha denenir (sayfa yalnızca analiz için okunur).
    if (!response && isIncompleteChainError(lastError)) ({ found: response, failure: lastError } = await attempt(false));
    if (!response) throw lastError ?? new Error("istek başarısız");

    if (response.location) {
      redirectCount += 1;
      if (redirectCount > maxRedirects) throw new Error("çok fazla yönlendirme");
      try {
        current = new URL(response.location, current);
      } catch {
        throw new Error("geçersiz yönlendirme");
      }
      continue;
    }

    return {
      finalUrl: current.toString(),
      httpStatus: response.status,
      redirectCount,
      responseMs: Date.now() - started,
      https: current.protocol === "https:",
      html: new TextDecoder("utf-8").decode(response.body),
    };
  }
}
