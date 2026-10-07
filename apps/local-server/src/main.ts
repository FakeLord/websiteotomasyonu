import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequestListener } from "./app";
import { sendEmail } from "./email";
import { fetchImap } from "./imap";
import { createChunkedStore, createKeyringBackend } from "./secrets";
import { buildCsp } from "./static";
import { fetchPage } from "./website";

/**
 * `pnpm web`: derlenmiş arayüzü ve /api uçlarını yalnızca 127.0.0.1'den sunar (ADR 0009).
 *   LBF_PORT   dinlenen port (varsayılan 5174)
 *   LBF_NO_UI  "1" ise yalnızca /api sunulur (geliştirmede Vite arayüzü sunar)
 *   LBF_CONNECT_SRC  CSP connect-src'e eklenecek ek adresler (varsayılan: yerel Supabase)
 *   --open veya LBF_OPEN=1   hazır olunca varsayılan tarayıcıda açar
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.LBF_PORT ?? 5174);
const staticDir = process.env.LBF_NO_UI === "1" ? null : path.resolve(here, "../../desktop/dist");

if (staticDir && !existsSync(path.join(staticDir, "index.html"))) {
  console.error("Arayüz derlenmemiş. Önce `pnpm --filter @lbf/desktop build` çalıştırın (veya `pnpm web` kullanın).");
  process.exit(1);
}

const server = http.createServer(
  createRequestListener({
    staticDir,
    secrets: createChunkedStore(createKeyringBackend()),
    sendEmail,
    fetchImap,
    fetchPage,
    csp: buildCsp(process.env.LBF_CONNECT_SRC),
  }),
);

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} dolu. Uygulama zaten açık olabilir (http://127.0.0.1:${port}) ya da LBF_PORT ile başka bir port seçin.`
      : `Sunucu başlatılamadı: ${error.message}`,
  );
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Local Business Finder hazır: ${url}`);
  console.log("Kapatmak için bu pencerede Ctrl+C.");
  if ((process.argv.includes("--open") || process.env.LBF_OPEN === "1") && process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  }
});
