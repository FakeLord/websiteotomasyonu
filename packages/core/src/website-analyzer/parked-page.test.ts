import { describe, expect, it } from "vitest";
import { detectParkedOrEmpty } from "./parked-page";

describe("detectParkedOrEmpty", () => {
  it("detects a GoDaddy-style parked domain page", () => {
    const html = `<html><body><h1>This domain is for sale</h1><p>Buy this domain today via GoDaddy.com</p></body></html>`;
    expect(detectParkedOrEmpty(html)).toBe("PARKED");
  });

  it("detects a Turkish parked domain page", () => {
    const html = `<html><body><h1>Bu alan adı satılıktır</h1></body></html>`;
    expect(detectParkedOrEmpty(html)).toBe("PARKED");
  });

  it("detects a default nginx welcome page", () => {
    const html = `<html><body><h1>Welcome to nginx!</h1><p>If you see this page, the web server is working.</p></body></html>`;
    expect(detectParkedOrEmpty(html)).toBe("PARKED");
  });

  it("detects an empty/near-empty page", () => {
    const html = `<html><body><p>Yakında</p></body></html>`;
    expect(detectParkedOrEmpty(html)).toBe("EMPTY");
  });

  it("does not count <script> code toward visible content length", () => {
    const html = `<html><body><p>Kısa</p><script>${"var x = 1; ".repeat(50)}</script></body></html>`;
    expect(detectParkedOrEmpty(html)).toBe("EMPTY");
  });

  it("returns null for a normal page with real content", () => {
    const html = `<html><body><h1>ABC Diş Kliniği</h1><p>${"Kadıköy'de 20 yıldır hizmet veren diş kliniğimiz, implant, ortodonti ve estetik diş hekimliği alanlarında uzman kadrosuyla hizmet vermektedir. ".repeat(3)}</p></body></html>`;
    expect(detectParkedOrEmpty(html)).toBeNull();
  });
});
