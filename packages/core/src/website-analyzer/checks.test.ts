import { describe, expect, it } from "vitest";
import { computeChecks } from "./checks";

const base = { https: true, redirectCount: 0, responseMs: 500, contactsFound: true };

describe("computeChecks", () => {
  it("detects a responsive page via the viewport meta tag", () => {
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>`;
    expect(computeChecks({ ...base, html }).responsive).toBe(true);
  });

  it("flags a page without a viewport tag as not responsive", () => {
    const html = `<html><head></head></html>`;
    expect(computeChecks({ ...base, html }).responsive).toBe(false);
  });

  it("detects a contact form with an email/tel input", () => {
    const html = `<form><input type="email"><textarea></textarea></form>`;
    expect(computeChecks({ ...base, html }).hasContactForm).toBe(true);
  });

  it("does not flag a form without email/tel/textarea as a contact form", () => {
    const html = `<form><input type="text" name="search"></form>`;
    expect(computeChecks({ ...base, html }).hasContactForm).toBe(false);
  });

  it("detects a known booking widget domain", () => {
    const html = `<iframe src="https://calendly.com/abcdis/30min"></iframe>`;
    expect(computeChecks({ ...base, html }).hasBookingWidget).toBe(true);
  });

  it("detects title/description within the expected length range", () => {
    const html = `<html><head>
      <title>ABC Diş Kliniği - Kadıköy'de İmplant ve Ortodonti</title>
      <meta name="description" content="${"Kadıköy'de 20 yıldır hizmet veren diş kliniği, implant ve ortodonti alanında uzman kadro. ".slice(0, 120)}">
    </head></html>`;
    const result = computeChecks({ ...base, html });
    expect(result.hasMetaTitle).toBe(true);
    expect(result.hasMetaDescription).toBe(true);
  });

  it("flags a missing meta title/description", () => {
    const html = `<html><head></head></html>`;
    const result = computeChecks({ ...base, html });
    expect(result.hasMetaTitle).toBe(false);
    expect(result.hasMetaDescription).toBe(false);
  });

  it("flags slow response time over 3 seconds", () => {
    const html = `<html></html>`;
    expect(computeChecks({ ...base, html, responseMs: 3500 }).slowResponse).toBe(true);
  });

  it("flags a stale copyright year", () => {
    const oldYear = new Date().getFullYear() - 5;
    const html = `<footer>&copy; ${oldYear} ABC Diş Kliniği</footer>`;
    expect(computeChecks({ ...base, html }).staleSignals).toBe(true);
  });

  it("does not flag a recent copyright year as stale", () => {
    const html = `<footer>&copy; ${new Date().getFullYear()} ABC Diş Kliniği</footer>`;
    expect(computeChecks({ ...base, html }).staleSignals).toBe(false);
  });

  it("flags an old jQuery version as a staleness signal", () => {
    const html = `<script src="https://code.jquery.com/jquery-1.7.2.min.js"></script>`;
    expect(computeChecks({ ...base, html }).staleSignals).toBe(true);
  });

  it("does not flag a modern jQuery version", () => {
    const html = `<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>`;
    expect(computeChecks({ ...base, html }).staleSignals).toBe(false);
  });

  it("flags a frameset as a staleness signal", () => {
    const html = `<frameset><frame src="a.html"></frameset>`;
    expect(computeChecks({ ...base, html }).staleSignals).toBe(true);
  });

  it("detects mixed content on an HTTPS page", () => {
    const html = `<html><body><img src="http://insecure.example.com/logo.png"></body></html>`;
    expect(computeChecks({ ...base, html, https: true }).mixedContent).toBe(true);
  });

  it("does not flag mixed content on an HTTP page", () => {
    const html = `<html><body><img src="http://insecure.example.com/logo.png"></body></html>`;
    expect(computeChecks({ ...base, html, https: false }).mixedContent).toBe(false);
  });

  it("flags a redirect problem beyond 3 redirects", () => {
    const html = `<html></html>`;
    expect(computeChecks({ ...base, html, redirectCount: 4 }).redirectProblem).toBe(true);
  });

  it("detects phone/email/whatsapp/social links independently", () => {
    const html = `
      <a href="tel:+905321234567">Ara</a>
      <a href="mailto:info@abc.com">Yaz</a>
      <a href="https://wa.me/905321234567">WA</a>
      <a href="https://instagram.com/abc">IG</a>`;
    const result = computeChecks({ ...base, html });
    expect(result.hasPhoneLink).toBe(true);
    expect(result.hasEmailLink).toBe(true);
    expect(result.hasWhatsappLink).toBe(true);
    expect(result.hasSocialLinks).toBe(true);
  });

  it("flags a likely SPA page as possibly JS-rendered", () => {
    const html = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(computeChecks({ ...base, html, contactsFound: false }).jsRendered).toBe(true);
  });

  it("does not flag jsRendered when contacts were already found", () => {
    const html = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(computeChecks({ ...base, html, contactsFound: true }).jsRendered).toBe(false);
  });
});
