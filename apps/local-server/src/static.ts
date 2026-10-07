import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** `tauri.conf.json`'daki CSP ile aynı kısıtlar; yerel Supabase için 127.0.0.1:54321 eklenir. */
export function buildCsp(extraConnectSrc = "http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321"): string {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
    `connect-src 'self' https: wss: ${extraConnectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
} as const;

/** URL yolunu `root` altında güvenli bir dosya yoluna çevirir; kökün dışına çıkarsa null. */
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]!.split("#")[0]!);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  const rootWithSep = path.resolve(root) + path.sep;
  return resolved === path.resolve(root) || resolved.startsWith(rootWithSep) ? resolved : null;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Derlenmiş arayüzü sunar. Uzantılı ama bulunamayan yol 404 verir; uzantısız
 * bilinmeyen yol `index.html`'e düşer (uygulama hash router kullanır).
 */
export async function serveStatic(root: string, urlPath: string, method: string, res: ServerResponse, csp: string): Promise<void> {
  const target = resolveStaticPath(root, urlPath);
  if (!target) {
    res.writeHead(403, { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" }).end("Geçersiz yol.");
    return;
  }

  let file = target;
  if (!(await isFile(file))) {
    if (path.extname(target) !== "") {
      res.writeHead(404, { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" }).end("Bulunamadı.");
      return;
    }
    file = path.join(root, "index.html");
    if (!(await isFile(file))) {
      res.writeHead(503, { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" }).end("Arayüz derlenmemiş. `pnpm web` komutunu kullanın.");
      return;
    }
  }

  const extension = path.extname(file).toLowerCase();
  const isHtml = extension === ".html";
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    // index.html her seferinde yeniden alınır; içerik-karmalı varlıklar önbelleğe alınabilir.
    "cache-control": isHtml ? "no-cache" : "public, max-age=31536000, immutable",
    ...(isHtml ? { "content-security-policy": csp } : {}),
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}
