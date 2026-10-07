import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import packageJson from "./package.json";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;
// `pnpm dev:web`: arayüzü Vite sunar, /api uçlarını yerel sunucu (LBF_DEV_API_PORT) karşılar (ADR 0009).
const devApiPort = process.env.LBF_DEV_API_PORT ?? "8787";
const devApiTarget = `http://127.0.0.1:${devApiPort}`;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  // Site analizi Web Worker'ında çalışır (src/workers/analysis.worker.ts); modül worker'ı kod bölmeyi destekler.
  worker: { format: "es" as const },

  // Monorepo kökündeki tek .env dosyasını okur (CLAUDE.md/README.md ile tutarlı;
  // apps/desktop/.env yerine repo kökü .env kullanılır).
  envDir: fileURLToPath(new URL("../..", import.meta.url)),

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    proxy: {
      "/api": {
        target: devApiTarget,
        changeOrigin: true, // Host başlığını sunucunun adresine çevirir
        configure: (proxy) => {
          // Sunucu yalnızca kendi origin'ini kabul eder; tarayıcının Vite origin'i geliştirmede buna çevrilir.
          proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("origin", devApiTarget));
        },
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
