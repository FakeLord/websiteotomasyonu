import { parse } from "node-html-parser";
import { getVisibleText } from "./visible-text";
import type { WebsiteChecks } from "./types";

const BOOKING_WIDGET_HOSTS = [
  "calendly.com",
  "acuityscheduling.com",
  "squareup.com/appointments",
  "booksy.com",
  "randevu60.com",
  "setmore.com",
];

const OLD_JQUERY_PATTERN = /jquery[.-](\d+)\.(\d+)/i;

interface ChecksInput {
  html: string;
  https: boolean;
  redirectCount: number;
  responseMs: number;
  contactsFound: boolean;
}

function hasFramesetOrFlash(html: string): boolean {
  return /<frameset|<embed[^>]*\.swf|application\/x-shockwave-flash/i.test(html);
}

function hasOldJquery(html: string): boolean {
  const match = html.match(OLD_JQUERY_PATTERN);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major < 1 || (major === 1 && minor < 9);
}

function hasStaleCopyright(html: string): boolean {
  const currentYear = new Date().getFullYear();
  const matches = html.matchAll(/(?:©|&copy;|copyright)\D{0,10}(\d{4})/gi);
  for (const m of matches) {
    const year = Number(m[1]);
    if (year > 1990 && year <= currentYear - 3) return true;
  }
  return false;
}

function hasMixedContent(html: string, https: boolean): boolean {
  if (!https) return false;
  return /(?:src|href)\s*=\s*["']http:\/\/(?!localhost)/i.test(html);
}

/**
 * H bölümündeki kontrol listesini hesaplar. Sınıflandırma ayrı (`classify.ts`);
 * bu fonksiyon yalnızca gözlemlenebilir sinyalleri toplar.
 */
export function computeChecks(input: ChecksInput): WebsiteChecks {
  const root = parse(input.html);

  const viewport = root.querySelector('meta[name="viewport"]');
  const title = root.querySelector("title")?.text.trim() ?? "";
  const description = root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";

  const anchors = root.querySelectorAll("a");
  const hasPhoneLink = anchors.some((a) => a.getAttribute("href")?.startsWith("tel:"));
  const hasEmailLink = anchors.some((a) => a.getAttribute("href")?.startsWith("mailto:"));
  const hasWhatsappLink = anchors.some((a) => /(?:wa\.me|api\.whatsapp\.com)\//i.test(a.getAttribute("href") ?? ""));
  const hasSocialLinks = anchors.some((a) =>
    /(instagram|facebook|linkedin|tiktok)\.com/i.test(a.getAttribute("href") ?? ""),
  );

  const forms = root.querySelectorAll("form");
  const hasContactForm = forms.some(
    (form) =>
      form.querySelector('input[type="email"]') !== null ||
      form.querySelector('input[type="tel"]') !== null ||
      form.querySelector("textarea") !== null,
  );

  const lowerHtml = input.html.toLowerCase();
  const hasBookingWidget =
    BOOKING_WIDGET_HOSTS.some((host) => lowerHtml.includes(host)) ||
    (lowerHtml.includes("randevu") && (hasContactForm || anchors.some((a) => /randevu/i.test(a.text))));

  return {
    https: input.https,
    redirectProblem: input.redirectCount > 3,
    responsive: viewport !== null,
    hasPhoneLink,
    hasEmailLink,
    hasWhatsappLink,
    hasContactForm,
    hasBookingWidget,
    hasSocialLinks,
    hasMetaTitle: title.length >= 10 && title.length <= 70,
    hasMetaDescription: description.length >= 50 && description.length <= 160,
    slowResponse: input.responseMs > 3000,
    staleSignals: hasFramesetOrFlash(input.html) || hasOldJquery(input.html) || hasStaleCopyright(input.html),
    mixedContent: hasMixedContent(input.html, input.https),
    jsRendered: getVisibleText(input.html).trim().length < 200 && /<script/i.test(input.html) && !input.contactsFound,
  };
}
