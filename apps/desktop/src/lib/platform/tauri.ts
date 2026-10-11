import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { attachConsole, error as logError } from "@tauri-apps/plugin-log";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { WebsiteFetchResult } from "@lbf/core";
import type { ImapFetchResult, Platform } from "./types";

let pendingUpdate: Update | null = null;

/** Masaüstü kabuğu: iş Rust komutlarına (`src-tauri/src/commands`) devredilir. */
export const tauriPlatform: Platform = {
  kind: "tauri",
  secrets: {
    get: (key) => invoke<string | null>("secret_get", { key }),
    async set(key, value) {
      await invoke("secret_set", { key, value });
    },
    async delete(key) {
      await invoke("secret_delete", { key });
    },
  },
  sendEmail: (smtp, message) => invoke<string>("send_email", { smtp, message }),
  imapFetch: (imap, options) => invoke<ImapFetchResult>("imap_fetch", { imap, options }),
  fetchPage: (url) => invoke<WebsiteFetchResult>("fetch_page", { url }),
  updates: {
    async check() {
      const update = await check();
      pendingUpdate = update;
      return update ? { version: update.version, notes: update.body ?? null } : null;
    },
    async install() {
      if (!pendingUpdate) throw new Error("Kurulacak güncelleme yok.");
      await pendingUpdate.downloadAndInstall();
    },
  },
  openExternal: (url) => openUrl(url),
  attachLogs() {
    void attachConsole();
  },
  logError(message) {
    void logError(message);
  },
};
