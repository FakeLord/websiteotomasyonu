import type { WebsiteFetchResult } from "@lbf/core";
import type { ImapFetchResult, Platform } from "./types";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const SERVER_UNREACHABLE =
  "Yerel sunucuya ulaşılamadı. Uygulamayı `pnpm web` (veya baslat.cmd) ile başlattığınızdan emin olun.";

/**
 * Tarayıcı modu: arayüzü sunan yerel Node sunucusunun (`apps/local-server`)
 * `/api` uçlarına gider. Aynı origin olduğu için CORS yoktur; `x-lbf` başlığı
 * çapraz-site form gönderimlerini preflight'a zorlayarak engeller.
 */
export function createWebPlatform(fetchImpl: FetchLike = (input, init) => fetch(input, init)): Platform {
  async function call<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`/api/${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-lbf": "1" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(SERVER_UNREACHABLE);
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      /* JSON olmayan gövde */
    }
    if (!response.ok) {
      const message = (payload as { error?: unknown } | null)?.error;
      throw new Error(typeof message === "string" && message ? message : `Yerel sunucu hatası (${response.status})`);
    }
    return payload as T;
  }

  return {
    kind: "web",
    secrets: {
      async get(key) {
        return (await call<{ value: string | null }>("secrets/get", { key })).value;
      },
      async set(key, value) {
        await call("secrets/set", { key, value });
      },
      async delete(key) {
        await call("secrets/delete", { key });
      },
    },
    async sendEmail(smtp, message) {
      return (await call<{ messageId: string }>("email/send", { smtp, message })).messageId;
    },
    imapFetch: (imap, options) => call<ImapFetchResult>("imap/fetch", { imap, options }),
    fetchPage: (url) => call<WebsiteFetchResult>("website/fetch", { url }),
    async openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    attachLogs() {
      /* Tarayıcıda günlükler zaten konsola yazılır. */
    },
    logError(message) {
      console.error(message);
    },
  };
}

export const webPlatform = createWebPlatform();
