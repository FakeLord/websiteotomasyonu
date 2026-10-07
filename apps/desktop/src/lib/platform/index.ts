import { tauriPlatform } from "./tauri";
import { webPlatform } from "./web";
import type { Platform } from "./types";

export type { Platform, SmtpConfig, OutboundEmail, ImapConfig, ImapFetchOptions, ImapFetchResult } from "./types";

const insideTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Tauri kabuğunda çalışıyorsa Rust komutları, aksi halde yerel sunucu (ADR 0009). */
export const platform: Platform = insideTauri ? tauriPlatform : webPlatform;
