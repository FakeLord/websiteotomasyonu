import { describe, expect, it } from "vitest";
import { checkRequest } from "./security";

const PORT = 5174;

function req(overrides: { method?: string; url?: string; headers?: Record<string, string> } = {}) {
  return {
    method: overrides.method ?? "POST",
    url: overrides.url ?? "/api/secrets/get",
    headers: {
      host: `127.0.0.1:${PORT}`,
      origin: `http://127.0.0.1:${PORT}`,
      "content-type": "application/json",
      "x-lbf": "1",
      ...overrides.headers,
    },
  };
}

describe("checkRequest (yerel sunucu güvenlik ara katmanı)", () => {
  it("aynı origin'den gelen geçerli API isteğine izin verir", () => {
    expect(checkRequest(req(), PORT)).toEqual({ ok: true });
  });

  it("localhost adıyla gelen isteğe de izin verir", () => {
    const r = req({ headers: { host: `localhost:${PORT}`, origin: `http://localhost:${PORT}` } });
    expect(checkRequest(r, PORT)).toEqual({ ok: true });
  });

  it("Origin başlığı olmayan (aynı origin GET/ form dışı) isteğe izin verir", () => {
    const r = req();
    delete (r.headers as Record<string, string | undefined>).origin;
    expect(checkRequest(r, PORT)).toEqual({ ok: true });
  });

  it("yabancı Host'u reddeder (DNS rebinding)", () => {
    expect(checkRequest(req({ headers: { host: "evil.com", origin: "http://evil.com" } }), PORT)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(req({ headers: { host: "evil.com:5174" } }), PORT)).toMatchObject({ ok: false, status: 403 });
  });

  it("başka porttaki localhost'u reddeder", () => {
    expect(checkRequest(req({ headers: { host: "127.0.0.1:9999" } }), PORT)).toMatchObject({ ok: false, status: 403 });
  });

  it("yabancı Origin'i reddeder (başka sitenin localhost'u çağırması)", () => {
    expect(checkRequest(req({ headers: { origin: "https://evil.com" } }), PORT)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(req({ headers: { origin: "null" } }), PORT)).toMatchObject({ ok: false, status: 403 });
  });

  it("çapraz-site Sec-Fetch-Site'ı reddeder", () => {
    expect(checkRequest(req({ headers: { "sec-fetch-site": "cross-site" } }), PORT)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(req({ headers: { "sec-fetch-site": "same-site" } }), PORT)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest(req({ headers: { "sec-fetch-site": "same-origin" } }), PORT)).toEqual({ ok: true });
  });

  it("x-lbf başlığı olmayan API isteğini reddeder", () => {
    const r = req({ headers: { "x-lbf": "" } });
    expect(checkRequest(r, PORT)).toMatchObject({ ok: false, status: 403 });
  });

  it("API'de yalnızca POST'a izin verir", () => {
    expect(checkRequest(req({ method: "GET" }), PORT)).toMatchObject({ ok: false, status: 405 });
  });

  it("API'de JSON olmayan içerik türünü reddeder", () => {
    expect(checkRequest(req({ headers: { "content-type": "text/plain" } }), PORT)).toMatchObject({ ok: false, status: 415 });
    expect(checkRequest(req({ headers: { "content-type": "application/x-www-form-urlencoded" } }), PORT)).toMatchObject({ ok: false, status: 415 });
  });

  it("statik dosyalar için yalnızca GET/HEAD'e izin verir ve x-lbf istemez", () => {
    const base = { headers: { host: `127.0.0.1:${PORT}`, "x-lbf": "" } };
    expect(checkRequest({ method: "GET", url: "/", ...base }, PORT)).toEqual({ ok: true });
    expect(checkRequest({ method: "HEAD", url: "/assets/a.js", ...base }, PORT)).toEqual({ ok: true });
    expect(checkRequest({ method: "POST", url: "/", ...base }, PORT)).toMatchObject({ ok: false, status: 405 });
  });
});
