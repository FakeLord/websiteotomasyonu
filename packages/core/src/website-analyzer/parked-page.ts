import { getVisibleText } from "./visible-text";

const PARKED_KEYWORDS = [
  "domain for sale",
  "bu alan adı satılıktır",
  "domain is for sale",
  "buy this domain",
  "this domain is parked",
  "godaddy.com",
  "apache2 default page",
  "welcome to nginx",
  "index of /",
];

/**
 * Park sayfası/hosting varsayılan sayfası/boş sayfa tespiti (SPEC.md → H.4).
 * Görünür metin < 200 karakterse ya da bilinen park anahtar kelimeleri
 * bulunursa `PARKED`/`EMPTY` döner.
 */
export function detectParkedOrEmpty(html: string): "PARKED" | "EMPTY" | null {
  const visibleText = getVisibleText(html).replace(/\s+/g, " ").trim();
  const lowerHtml = html.toLowerCase();

  if (PARKED_KEYWORDS.some((kw) => lowerHtml.includes(kw))) {
    return "PARKED";
  }

  if (visibleText.length < 200) {
    return "EMPTY";
  }

  return null;
}
