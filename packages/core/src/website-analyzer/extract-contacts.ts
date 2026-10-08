import { parse } from "node-html-parser";
import { normalizePhone } from "../dedupe/normalize-phone";
import { normalizeSocialUrl, type SocialPlatform } from "../dedupe/normalize-social";
import { getVisibleText } from "./visible-text";
import type { ContactChannel, ExtractedContact } from "./types";

const AGENCY_SIGNATURE_PATTERN = /tasarım|designed by|developed by|yapılmıştır|powered by|geliştir/i;

const SOCIAL_PLATFORMS: SocialPlatform[] = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK"];

// Tüm niceleyiciler sınırlıdır ve desen bir kelime sınırından başlar: önceki `\s*…\s*…\s*` ve sınırsız `+`
// biçimleri, uzun boşluk/harf dizileri olan gerçek sayfalarda felaket geri izlemeye girip analizi (ve sayfayı)
// onlarca saniye kilitliyordu.
const EMAIL_REGEX = /(?<![a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63}){0,4}\.[a-zA-Z]{2,24}/g;

const LOCAL = "[a-zA-Z0-9._%+-]{1,64}";
const LABEL = "[a-zA-Z0-9-]{1,63}";
const GAP = "\\s{0,2}";
const BRACKET_AT = `[\\[({]${GAP}at${GAP}[\\])}]`;
const BRACKET_DOT = `[\\[({]${GAP}dot${GAP}[\\])}]`;
const WORD_DOT = "\\s{1,2}dot\\s{1,2}";
const ANY_DOT = `(?:${GAP}\\.${GAP}|${GAP}${BRACKET_DOT}${GAP}|${WORD_DOT})`;
const OBFUSCATED_DOT = `(?:${GAP}${BRACKET_DOT}${GAP}|${WORD_DOT})`;

// "info [at] example [dot] com", "info(at)example.com": "at" parantezliyse nokta düz veya gizlenmiş olabilir.
const BRACKETED_AT_EMAIL = new RegExp(
  `(?<![a-zA-Z0-9._%+-])(${LOCAL})${GAP}${BRACKET_AT}${GAP}(${LABEL}(?:${ANY_DOT}${LABEL}){1,4})`,
  "gi",
);
// "info at example dot com": düz "at" yalnızca nokta da gizlenmişse kabul edilir; aksi halde
// "contact us at example.com" gibi sıradan cümleler sahte e-postaya ("us@example.com") dönüşürdü.
const WORD_AT_EMAIL = new RegExp(
  `(?<![a-zA-Z0-9._%+-])(${LOCAL})\\s{1,2}at\\s{1,2}(${LABEL}${OBFUSCATED_DOT}${LABEL}(?:${ANY_DOT}${LABEL}){0,3})`,
  "gi",
);
const DOT_FORMS = new RegExp(`${BRACKET_DOT}|\\bdot\\b`, "gi");

/** Gizlenmiş e-postaları ("info [at] example (dot) com") bulur ve normal biçimde döner (SPEC.md → I.2). */
function findObfuscatedEmails(text: string): string[] {
  const found: string[] = [];
  for (const pattern of [BRACKETED_AT_EMAIL, WORD_AT_EMAIL]) {
    for (const match of text.matchAll(pattern)) {
      const domain = (match[2] ?? "").replace(DOT_FORMS, ".").replace(/\s+/g, "");
      const candidate = `${match[1] ?? ""}@${domain}`;
      const valid = candidate.match(EMAIL_REGEX);
      if (valid?.[0] === candidate) found.push(candidate);
    }
  }
  return found;
}

/** Metin regex'lerinin tarayacağı en uzun görünür metin; aşırı büyük sayfalarda süreyi sınırlar. */
const MAX_TEXT_SCAN_CHARS = 300_000;

// TR sabit hat (0212 xxx xx xx) ve mobil (0532 xxx xx xx / +90 532 xxx xx xx) kalıpları.
const TR_PHONE_TEXT_REGEX = /(?:\+90|0)?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}|(?:\+90|0)\s?\d{3}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/g;

// TR mobil numaralar WhatsApp adayı da sayılır; site üzerinde açık bir wa.me
// linki varsa o daha yüksek güvenle (0,9) zaten eklenmiştir, dedupe en
// yükseği tutar (SPEC.md → I.2).
function pushMobileWhatsappCandidate(
  contacts: ExtractedContact[],
  rawValue: string,
  e164: string,
  isMobile: boolean,
  foundVia: ExtractedContact["foundVia"],
): void {
  if (!isMobile) return;
  contacts.push({
    channel: "WHATSAPP",
    value: rawValue,
    normalizedValue: e164,
    foundVia,
    confidence: 0.5,
  });
}

function dedupe(contacts: ExtractedContact[]): ExtractedContact[] {
  const seen = new Map<string, ExtractedContact>();
  for (const contact of contacts) {
    const key = `${contact.channel}:${contact.normalizedValue}`;
    const existing = seen.get(key);
    if (!existing || contact.confidence > existing.confidence) {
      seen.set(key, contact);
    }
  }
  return [...seen.values()];
}

function isAgencySignature(anchor: { text: string; getAttribute(name: string): string | undefined }): boolean {
  const label = `${anchor.text} ${anchor.getAttribute("title") ?? ""}`;
  return AGENCY_SIGNATURE_PATTERN.test(label);
}

interface JsonLdEntity {
  "@type"?: string | string[];
  telephone?: string;
  email?: string;
  sameAs?: string | string[];
}

function extractFromJsonLd(html: string): ExtractedContact[] {
  const root = parse(html);
  const contacts: ExtractedContact[] = [];
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.rawText);
    } catch {
      continue;
    }

    const entities: JsonLdEntity[] = Array.isArray(parsed) ? parsed : [parsed];
    for (const entity of entities) {
      if (typeof entity !== "object" || entity === null) continue;
      const type = entity["@type"];
      const types = Array.isArray(type) ? type : type ? [type] : [];
      const isBusinessLike = types.some((t) => /LocalBusiness|Organization/i.test(t));
      if (!isBusinessLike) continue;

      if (entity.telephone) {
        const normalized = normalizePhone(entity.telephone);
        if (normalized) {
          contacts.push({
            channel: "PHONE",
            value: entity.telephone,
            normalizedValue: normalized.e164,
            foundVia: "JSON_LD",
            confidence: 0.9,
          });
          pushMobileWhatsappCandidate(contacts, entity.telephone, normalized.e164, normalized.isMobile, "JSON_LD");
        }
      }

      if (entity.email) {
        const match = entity.email.match(EMAIL_REGEX);
        if (match) {
          contacts.push({
            channel: "EMAIL",
            value: match[0],
            normalizedValue: match[0].toLowerCase(),
            foundVia: "JSON_LD",
            confidence: 0.9,
          });
        }
      }

      const sameAs = Array.isArray(entity.sameAs) ? entity.sameAs : entity.sameAs ? [entity.sameAs] : [];
      for (const link of sameAs) {
        for (const platform of SOCIAL_PLATFORMS) {
          const handle = typeof link === "string" ? normalizeSocialUrl(link, platform) : null;
          if (handle) {
            contacts.push({
              channel: platform,
              value: link,
              normalizedValue: handle,
              foundVia: "JSON_LD",
              confidence: 0.8,
            });
          }
        }
      }
    }
  }

  return contacts;
}

/**
 * Bir HTML sayfasından iletişim kanallarını çıkarır: `tel:`/`mailto:`/`wa.me`
 * linkleri, JSON-LD, header/footer sosyal linkleri, metin regex'i (gizlenmiş
 * e-posta dahil). Ajans imza linkleri ("Designed by X") elenir (SPEC.md → I.2).
 */
export function extractContacts(html: string): ExtractedContact[] {
  const root = parse(html);
  const contacts: ExtractedContact[] = [];

  const anchors = root.querySelectorAll("a");
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href")?.trim();
    if (!href) continue;

    if (href.startsWith("tel:")) {
      const raw = decodeURIComponent(href.slice(4));
      const normalized = normalizePhone(raw);
      if (normalized) {
        contacts.push({
          channel: "PHONE",
          value: raw,
          normalizedValue: normalized.e164,
          foundVia: "WEBSITE",
          confidence: 0.9,
        });
        pushMobileWhatsappCandidate(contacts, raw, normalized.e164, normalized.isMobile, "WEBSITE");
      }
      continue;
    }

    if (href.startsWith("mailto:")) {
      const raw = decodeURIComponent(href.slice(7).split("?")[0] ?? "");
      const match = raw.match(EMAIL_REGEX);
      if (match) {
        contacts.push({
          channel: "EMAIL",
          value: match[0],
          normalizedValue: match[0].toLowerCase(),
          foundVia: "WEBSITE",
          confidence: 0.9,
        });
      }
      continue;
    }

    if (/(?:wa\.me|api\.whatsapp\.com)\//i.test(href)) {
      const phoneMatch = href.match(/(?:wa\.me\/|phone=)(\d+)/i);
      if (phoneMatch?.[1]) {
        const normalized = normalizePhone(`+${phoneMatch[1]}`);
        if (normalized) {
          contacts.push({
            channel: "WHATSAPP",
            value: phoneMatch[1],
            normalizedValue: normalized.e164,
            foundVia: "WEBSITE",
            confidence: 0.9,
          });
        }
      }
      continue;
    }

    if (isAgencySignature(anchor)) continue;

    for (const platform of SOCIAL_PLATFORMS) {
      const handle = normalizeSocialUrl(href, platform);
      if (handle) {
        contacts.push({
          channel: platform as ContactChannel,
          value: href,
          normalizedValue: handle,
          foundVia: "WEBSITE",
          confidence: 0.7,
        });
      }
    }
  }

  contacts.push(...extractFromJsonLd(html));

  const visibleText = getVisibleText(html).slice(0, MAX_TEXT_SCAN_CHARS);
  for (const match of [...(visibleText.match(EMAIL_REGEX) ?? []), ...findObfuscatedEmails(visibleText)]) {
    contacts.push({
      channel: "EMAIL",
      value: match,
      normalizedValue: match.toLowerCase(),
      foundVia: "WEBSITE",
      confidence: 0.6,
    });
  }

  for (const match of visibleText.match(TR_PHONE_TEXT_REGEX) ?? []) {
    const normalized = normalizePhone(match);
    if (normalized) {
      contacts.push({
        channel: "PHONE",
        value: match,
        normalizedValue: normalized.e164,
        foundVia: "WEBSITE",
        confidence: 0.5,
      });
      pushMobileWhatsappCandidate(contacts, match, normalized.e164, normalized.isMobile, "WEBSITE");
    }
  }

  return dedupe(contacts);
}
