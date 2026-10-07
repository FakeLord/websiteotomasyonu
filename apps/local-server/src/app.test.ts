import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequestListener, type AppDeps } from "./app";
import { createChunkedStore, type CredentialBackend } from "./secrets";

const memory = new Map<string, string>();
const backend: CredentialBackend = {
  get: (name) => memory.get(name) ?? null,
  set: (name, value) => void memory.set(name, value),
  delete: (name) => memory.delete(name),
};

const sendEmail = vi.fn<AppDeps["sendEmail"]>();
const fetchImap = vi.fn<AppDeps["fetchImap"]>();
const fetchPage = vi.fn<AppDeps["fetchPage"]>();

let server: http.Server;
let port = 0;
let staticDir = "";

beforeAll(async () => {
  staticDir = await mkdtemp(path.join(os.tmpdir(), "lbf-static-"));
  await mkdir(path.join(staticDir, "assets"));
  await writeFile(path.join(staticDir, "index.html"), "<!doctype html><title>LBF</title>");
  await writeFile(path.join(staticDir, "assets", "app.js"), "console.log(1)");
  await writeFile(path.join(path.dirname(staticDir), "lbf-gizli.txt"), "dışarıdaki dosya");

  server = http.createServer(
    createRequestListener({ staticDir, secrets: createChunkedStore(backend), sendEmail, fetchImap, fetchPage }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(staticDir, { recursive: true, force: true });
  await rm(path.join(path.dirname(staticDir), "lbf-gizli.txt"), { force: true });
});

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: () => Record<string, unknown>;
}

function request(opts: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method: opts.method ?? "GET", path: opts.path, headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) as Record<string, unknown> });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const goodHeaders = () => ({ host: `127.0.0.1:${port}`, "content-type": "application/json", "x-lbf": "1" });
const api = (apiPath: string, body: unknown, headers: Record<string, string> = {}) =>
  request({ method: "POST", path: apiPath, headers: { ...goodHeaders(), ...headers }, body: JSON.stringify(body) });

describe("güvenlik kapısı", () => {
  it("yabancı Host ile gelen isteği 403 ile reddeder ve işlem yapmaz", async () => {
    const reply = await api("/api/secrets/set", { key: "k", value: "v" }, { host: "evil.com" });
    expect(reply.status).toBe(403);
    expect(memory.size).toBe(0);
  });

  it("yabancı Origin'i reddeder", async () => {
    expect((await api("/api/secrets/get", { key: "k" }, { origin: "https://evil.com" })).status).toBe(403);
  });

  it("x-lbf başlığı olmayan isteği reddeder", async () => {
    expect((await api("/api/secrets/get", { key: "k" }, { "x-lbf": "" })).status).toBe(403);
  });

  it("hiçbir yanıta CORS başlığı eklemez", async () => {
    const reply = await api("/api/secrets/get", { key: "k" });
    expect(reply.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("OPTIONS (preflight) isteğini onaylamaz", async () => {
    const reply = await request({ method: "OPTIONS", path: "/api/secrets/get", headers: { host: `127.0.0.1:${port}`, origin: "https://evil.com" } });
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect(reply.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("/api uçları", () => {
  it("kasaya yazar, okur ve siler", async () => {
    expect((await api("/api/secrets/set", { key: "sb-oturum", value: "ş".repeat(3000) })).status).toBe(200);
    expect((await api("/api/secrets/get", { key: "sb-oturum" })).json()).toEqual({ value: "ş".repeat(3000) });
    expect((await api("/api/secrets/delete", { key: "sb-oturum" })).status).toBe(200);
    expect((await api("/api/secrets/get", { key: "sb-oturum" })).json()).toEqual({ value: null });
  });

  it("geçersiz gövdeyi 400 ile reddeder", async () => {
    expect((await api("/api/secrets/get", { key: "" })).status).toBe(400);
    expect((await api("/api/secrets/get", { anahtar: "x" })).status).toBe(400);
    expect((await api("/api/secrets/get", { key: "../../etc" })).status).toBe(400);
    const bad = await request({ method: "POST", path: "/api/secrets/get", headers: goodHeaders(), body: "{bozuk" });
    expect(bad.status).toBe(400);
  });

  it("256 KB'den büyük gövdeyi 413 ile reddeder", async () => {
    const reply = await api("/api/secrets/set", { key: "k", value: "a".repeat(300_000) });
    expect(reply.status).toBe(413);
  });

  it("bilinmeyen ucu 404 ile yanıtlar", async () => {
    expect((await api("/api/yok", {})).status).toBe(404);
  });

  it("e-postayı gönderir ve Message-ID döner", async () => {
    sendEmail.mockResolvedValueOnce("<abc@ajans.com>");
    const smtp = { host: "smtp.ajans.com", port: 587, username: "u", password: "p", from_name: "A", from_email: "a@ajans.com" };
    const message = { to_email: "x@y.com", subject: "s", body: "b", in_reply_to: null };
    const reply = await api("/api/email/send", { smtp, message });
    expect(reply.json()).toEqual({ messageId: "<abc@ajans.com>" });
    expect(sendEmail).toHaveBeenCalledWith(smtp, message);
  });

  it("e-posta hatasını 502 ve mesajıyla döner", async () => {
    sendEmail.mockRejectedValueOnce(new Error("e-posta gönderilemedi (SMTP sunucusu veya kimlik bilgileri reddedildi)"));
    const smtp = { host: "h", port: 587, username: "u", password: "p", from_name: "A", from_email: "a@ajans.com" };
    const reply = await api("/api/email/send", { smtp, message: { to_email: "x@y.com", subject: "s", body: "b" } });
    expect(reply.status).toBe(502);
    expect(reply.json().error).toMatch(/e-posta gönderilemedi/);
  });

  it("IMAP ve site isteklerini ilgili modüle iletir", async () => {
    fetchImap.mockResolvedValueOnce({ uid_validity: 1, last_uid: 5, messages: [] });
    const imap = { host: "h", port: 993, username: "u", password: "p" };
    const options = { since_uid: 4, since_date: null, limit: 10 };
    expect((await api("/api/imap/fetch", { imap, options })).json()).toEqual({ uid_validity: 1, last_uid: 5, messages: [] });
    expect(fetchImap).toHaveBeenCalledWith(imap, options);

    const page = { finalUrl: "https://a.com/", httpStatus: 200, redirectCount: 0, responseMs: 5, https: true, html: "<p>x</p>" };
    fetchPage.mockResolvedValueOnce(page);
    expect((await api("/api/website/fetch", { url: "https://a.com" })).json()).toEqual(page);
  });

  it("beklenmeyen hata ayrıntısını (kasa) istemciye sızdırmaz", async () => {
    const failing = http.createServer(
      createRequestListener({
        staticDir: null,
        secrets: { get: () => { throw new Error("CRED_E_NOTFOUND C:\\gizli\\yol"); }, set: () => undefined, delete: () => undefined },
        sendEmail, fetchImap, fetchPage,
      }),
    );
    await new Promise<void>((resolve) => failing.listen(0, "127.0.0.1", resolve));
    const p = (failing.address() as AddressInfo).port;
    const text = await new Promise<string>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: p, method: "POST", path: "/api/secrets/get", headers: { host: `127.0.0.1:${p}`, "content-type": "application/json", "x-lbf": "1" } }, (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c.toString()));
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.end(JSON.stringify({ key: "k" }));
    });
    failing.close();
    expect(text).not.toContain("gizli");
    expect(text).toContain("Kasa okunamadı");
  });
});

describe("statik arayüz", () => {
  it("index.html'i CSP ve güvenlik başlıklarıyla sunar", async () => {
    const reply = await request({ path: "/", headers: { host: `127.0.0.1:${port}` } });
    expect(reply.status).toBe(200);
    expect(reply.text).toContain("<title>LBF</title>");
    expect(reply.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    expect(reply.headers["x-frame-options"]).toBe("DENY");
    expect(reply.headers["cache-control"]).toBe("no-cache");
  });

  it("varlıkları doğru içerik türü ve uzun önbellekle sunar", async () => {
    const reply = await request({ path: "/assets/app.js", headers: { host: `127.0.0.1:${port}` } });
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toContain("text/javascript");
    expect(reply.headers["cache-control"]).toContain("immutable");
  });

  it("klasör dışına çıkma denemelerini engeller", async () => {
    for (const bad of ["/../lbf-gizli.txt", "/%2e%2e/lbf-gizli.txt", "/assets/%2e%2e/%2e%2e/lbf-gizli.txt", "/..%2f..%2flbf-gizli.txt"]) {
      const reply = await request({ path: bad, headers: { host: `127.0.0.1:${port}` } });
      expect(reply.text).not.toContain("dışarıdaki dosya");
    }
  });

  it("olmayan varlık için 404, uzantısız bilinmeyen yol için index.html verir", async () => {
    expect((await request({ path: "/assets/yok.js", headers: { host: `127.0.0.1:${port}` } })).status).toBe(404);
    const spa = await request({ path: "/leads/123", headers: { host: `127.0.0.1:${port}` } });
    expect(spa.status).toBe(200);
    expect(spa.text).toContain("<title>LBF</title>");
  });

  it("statik yola POST'u reddeder", async () => {
    expect((await request({ method: "POST", path: "/", headers: { host: `127.0.0.1:${port}` } })).status).toBe(405);
  });
});
