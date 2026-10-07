import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchPage } from "./website";

let server: Server;
let port = 0;
const handlers = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>();

beforeAll(async () => {
  server = createServer((req, res) => {
    const handler = handlers.get(req.url ?? "/");
    if (handler) return handler(req, res);
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><body>yok</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Sahte DNS: her ad yerel test sunucusuna çözülür; yalnızca bu testlerde loopback'e izin verilir. */
const localDns = { resolve: async () => ["127.0.0.1"], isBlocked: () => false };
const url = (path: string) => `http://ornek.test:${port}${path}`;

describe("fetchPage — davranış (Rust fetch_page ile aynı sözleşme)", () => {
  it("HTML'i, nihai adresi, durum kodunu ve ölçümleri döner", async () => {
    handlers.set("/", (_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body>Merhaba ş</body></html>");
    });
    const result = await fetchPage(url("/"), localDns);
    expect(result).toMatchObject({ finalUrl: url("/"), httpStatus: 200, redirectCount: 0, https: false, html: "<html><body>Merhaba ş</body></html>" });
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
  });

  it("yönlendirmeleri izler ve sayar", async () => {
    handlers.set("/a", (_req, res) => void res.writeHead(301, { location: "/b" }).end());
    handlers.set("/b", (_req, res) => void res.writeHead(302, { location: url("/c") }).end());
    handlers.set("/c", (_req, res) => void res.writeHead(200).end("<p>son</p>"));
    const result = await fetchPage(url("/a"), localDns);
    expect(result).toMatchObject({ finalUrl: url("/c"), redirectCount: 2, httpStatus: 200, html: "<p>son</p>" });
  });

  it("5'ten fazla yönlendirmeyi reddeder", async () => {
    handlers.set("/loop", (_req, res) => void res.writeHead(302, { location: "/loop" }).end());
    await expect(fetchPage(url("/loop"), localDns)).rejects.toThrow(/çok fazla yönlendirme/);
  });

  it("404 gibi durumları hata saymaz, durum kodunu ve gövdeyi döner", async () => {
    const result = await fetchPage(url("/yok-boyle-bir-sayfa"), localDns);
    expect(result.httpStatus).toBe(404);
    expect(result.html).toContain("yok");
  });

  it("gövdeyi üst sınırda keser", async () => {
    handlers.set("/buyuk", (_req, res) => void res.writeHead(200).end("a".repeat(5000)));
    const result = await fetchPage(url("/buyuk"), { ...localDns, maxBytes: 1000 });
    expect(result.html).toHaveLength(1000);
  });

  it("gzip gövdeyi açar", async () => {
    handlers.set("/gzip", (_req, res) => void res.writeHead(200, { "content-encoding": "gzip" }).end(gzipSync("<h1>sıkıştırılmış</h1>")));
    expect((await fetchPage(url("/gzip"), localDns)).html).toBe("<h1>sıkıştırılmış</h1>");
  });

  it("yanıt vermeyen sunucuda zaman aşımına uğrar", async () => {
    handlers.set("/asili", () => undefined);
    await expect(fetchPage(url("/asili"), { ...localDns, timeoutMs: 150 })).rejects.toThrow(/zaman aşımı|istek başarısız/);
  });

  it("bağlantı kurulan IP'ye sabitlenir (DNS ikinci kez sorulmaz)", async () => {
    let lookups = 0;
    handlers.set("/pin", (_req, res) => void res.writeHead(200).end("ok"));
    await fetchPage(url("/pin"), { resolve: async () => (lookups += 1, ["127.0.0.1"]), isBlocked: () => false });
    expect(lookups).toBe(1);
  });
});

describe("fetchPage — SSRF engeli", () => {
  it("varsayılan kurallarla loopback adresini reddeder", async () => {
    await expect(fetchPage(`http://127.0.0.1:${port}/`)).rejects.toThrow(/özel\/yerel IP/);
  });

  it("bulut metadata ve özel ağ adreslerini reddeder", async () => {
    await expect(fetchPage("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/özel\/yerel IP/);
    await expect(fetchPage("http://10.0.0.5/")).rejects.toThrow(/özel\/yerel IP/);
    await expect(fetchPage("http://[::1]/")).rejects.toThrow(/özel\/yerel IP/);
  });

  it("ad çözümlemesi özel IP'ye giderse reddeder (DNS rebinding)", async () => {
    await expect(fetchPage("http://sahte.test/", { resolve: async () => ["10.1.2.3"] })).rejects.toThrow(/özel\/yerel IP/);
  });

  it("birden çok adresten biri özelse reddeder", async () => {
    await expect(fetchPage("http://karisik.test/", { resolve: async () => ["93.184.216.34", "192.168.1.5"] })).rejects.toThrow(/özel\/yerel IP/);
  });

  it("genel bir siteden özel adrese yönlendirmeyi reddeder", async () => {
    handlers.set("/ice", (_req, res) => void res.writeHead(302, { location: "http://169.254.169.254/" }).end());
    await expect(fetchPage(url("/ice"), { resolve: async () => ["127.0.0.1"], isBlocked: (ip) => ip !== "127.0.0.1" })).rejects.toThrow(/özel\/yerel IP/);
  });

  it("http/https dışı şemaları reddeder", async () => {
    await expect(fetchPage("file:///etc/passwd")).rejects.toThrow(/yalnızca http\/https/);
    await expect(fetchPage("ftp://ornek.com/")).rejects.toThrow(/yalnızca http\/https/);
  });

  it("geçersiz URL'yi reddeder", async () => {
    await expect(fetchPage("bu bir url degil")).rejects.toThrow(/geçersiz URL/);
  });

  it("DNS çözülemezse açık hata verir", async () => {
    await expect(fetchPage("http://yok.test/", { resolve: async () => [] })).rejects.toThrow(/DNS çözümlenemedi/);
  });
});
