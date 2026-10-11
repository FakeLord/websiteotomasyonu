import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { z } from "zod";
import type { EmailInput, SmtpInput } from "./email";
import type { ImapConfigInput, ImapFetchOptionsInput, ImapFetchOutput } from "./imap";
import type { FetchPageResult } from "./website";
import type { SecretStore } from "./secrets";
import { SECURITY_HEADERS, buildCsp, serveStatic } from "./static";
import { checkRequest } from "./security";

export interface AppDeps {
  /** Derlenmiş arayüz klasörü (`apps/desktop/dist`); null ise yalnızca /api sunulur (dev proxy). */
  staticDir: string | null;
  secrets: SecretStore;
  sendEmail(smtp: SmtpInput, message: EmailInput): Promise<string>;
  fetchImap(imap: ImapConfigInput, options: ImapFetchOptionsInput): Promise<ImapFetchOutput>;
  fetchPage(url: string): Promise<FetchPageResult>;
  csp?: string;
}

const MAX_BODY_BYTES = 256 * 1024;

const smtpSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
  from_name: z.string().max(255),
  from_email: z.string().min(3).max(255),
});
const emailSchema = z.object({
  to_email: z.string().min(3).max(255),
  subject: z.string().max(998),
  body: z.string().max(200_000),
  in_reply_to: z.string().max(998).nullable().optional(),
  list_unsubscribe_url: z.string().max(2048).nullable().optional(),
});
const imapSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
});
const imapOptionsSchema = z.object({
  since_uid: z.number().int().min(0).nullable(),
  since_date: z.string().max(11).nullable(),
  limit: z.number().int().min(1).max(500),
});
const keySchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:@-]+$/);

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "İstek gövdesi çok büyük.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw new HttpError(400, "Geçersiz JSON.");
  }
}

type Route = (body: unknown, deps: AppDeps) => Promise<unknown>;

function route<S extends z.ZodTypeAny>(schema: S, handler: (input: z.infer<S>, deps: AppDeps) => Promise<unknown> | unknown, failure?: string): Route {
  return async (body, deps) => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "Geçersiz istek gövdesi.");
    try {
      return await handler(parsed.data, deps);
    } catch (error) {
      // Kendi modüllerimizin hataları zaten Türkçe ve şifre içermez; beklenmeyenler genel mesaja çevrilir.
      throw new HttpError(502, failure ?? (error instanceof Error ? error.message : "İşlem başarısız."));
    }
  };
}

const routes: Record<string, Route> = {
  "/api/secrets/get": route(z.object({ key: keySchema }), ({ key }, deps) => ({ value: deps.secrets.get(key) }), "Kasa okunamadı."),
  "/api/secrets/set": route(
    z.object({ key: keySchema, value: z.string().max(100_000) }),
    ({ key, value }, deps) => {
      deps.secrets.set(key, value);
      return {};
    },
    "Kasa yazılamadı.",
  ),
  "/api/secrets/delete": route(
    z.object({ key: keySchema }),
    ({ key }, deps) => {
      deps.secrets.delete(key);
      return {};
    },
    "Kasa silinemedi.",
  ),
  "/api/email/send": route(z.object({ smtp: smtpSchema, message: emailSchema }), async ({ smtp, message }, deps) => ({
    messageId: await deps.sendEmail(smtp, message),
  })),
  "/api/imap/fetch": route(z.object({ imap: imapSchema, options: imapOptionsSchema }), ({ imap, options }, deps) => deps.fetchImap(imap, options)),
  "/api/website/fetch": route(z.object({ url: z.string().min(1).max(2048) }), ({ url }, deps) => deps.fetchPage(url)),
};

/** İstek işleyici: önce güvenlik kapısı, sonra /api uçları veya statik arayüz. */
export function createRequestListener(deps: AppDeps): RequestListener {
  const csp = deps.csp ?? buildCsp();

  return (req, res) => {
    void (async () => {
      const port = req.socket.localPort ?? 0;
      const verdict = checkRequest(req, port);
      if (!verdict.ok) {
        sendJson(res, verdict.status, { error: verdict.error });
        return;
      }

      const url = req.url ?? "/";
      if (url.startsWith("/api/")) {
        const handler = routes[url.split("?")[0]!];
        if (!handler) {
          sendJson(res, 404, { error: "Bilinmeyen uç." });
          return;
        }
        try {
          sendJson(res, 200, await handler(await readJson(req), deps));
        } catch (error) {
          const status = error instanceof HttpError ? error.status : 500;
          sendJson(res, status, { error: error instanceof HttpError ? error.message : "Sunucu hatası." });
        }
        return;
      }

      if (!deps.staticDir) {
        sendJson(res, 404, { error: "Arayüz bu sunucudan sunulmuyor (geliştirme modu: Vite)." });
        return;
      }
      await serveStatic(deps.staticDir, url, req.method ?? "GET", res, csp);
    })().catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "Sunucu hatası." });
      else res.end();
    });
  };
}
