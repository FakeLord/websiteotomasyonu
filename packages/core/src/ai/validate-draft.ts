import type { OutreachChannel, SalesRules, ServicePackageInfo } from "./types";

export interface ValidateDraftInput {
  body: string;
  channel: OutreachChannel;
  packages: ServicePackageInfo[];
  salesRules: SalesRules;
  verifiedReferenceNames: string[];
  /** Mesajın gönderildiği işletmenin adı; referans kontrolünden muaftır. */
  recipientBusinessName?: string | undefined;
  stopRequest: boolean;
}

export interface ValidateDraftResult {
  ok: boolean;
  reasons: string[];
}

const CHANNEL_MAX_LENGTH: Record<OutreachChannel, number> = {
  INSTAGRAM: 600,
  EMAIL: 1200,
  FACEBOOK: 600,
  WHATSAPP: 1000,
  LINKEDIN: 1000,
  TIKTOK: 600,
};

const MONEY_REGEX = /(?:₺|TL|\$)\s*[\d.,]+|[\d.,]+\s*(?:₺|TL|bin\s*TL|bin\s*₺)/gi;
const DELIVERY_REGEX = /(\d+)\s*(gün|hafta)/gi;

/**
 * Bir para ifadesini kabaca sayısal TL değerine çevirir ("bin" çarpanı dahil).
 * Kesin bir para ayrıştırıcı değildir; guardrail amaçlı bir yaklaşımdır.
 */
function parseMoneyAmount(match: string): number | null {
  const isBin = /bin/i.test(match);
  const numeric = match.replace(/[₺TL$]/gi, "").replace(/bin/gi, "").trim();
  const normalized = numeric.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  return isBin ? value * 1000 : value;
}

function findReferenceCandidates(body: string): string[] {
  // İki veya daha fazla ardışık Büyük-Harf-Başlangıçlı kelimeyi olası
  // müşteri/marka adı adayı sayar (basit bir sezgi — gerçek NER değildir).
  const matches = body.match(/(?:[A-ZÇĞİÖŞÜ][\wçğıöşü]+\s){1,3}[A-ZÇĞİÖŞÜ][\wçğıöşü]+/g) ?? [];
  return [...new Set(matches.map((m) => m.trim()))];
}

/**
 * J.3 bölümündeki kod seviyesi guardrail'lar. Prompt seviyesi talimatlar
 * (CLAUDE.md #10, SPEC.md → J.3) yalnızca bir öneridir; asıl güvence budur —
 * KB dışı fiyat/indirim/referans/teslim süresi içeren hiçbir taslak bu
 * kontrolden geçmeden kullanıcıya gösterilmez.
 */
export function validateDraft(input: ValidateDraftInput): ValidateDraftResult {
  const reasons: string[] = [];

  if (input.stopRequest) {
    return { ok: false, reasons: ["STOP_REQUEST"] };
  }

  const maxLength = CHANNEL_MAX_LENGTH[input.channel];
  if (input.body.length > maxLength) {
    reasons.push(`LENGTH_EXCEEDED:${input.channel}:${maxLength}`);
  }

  const moneyMatches = input.body.match(MONEY_REGEX) ?? [];
  for (const match of moneyMatches) {
    const amount = parseMoneyAmount(match);
    if (amount == null) continue;
    const withinAnyPackage = input.packages.some(
      (pkg) =>
        pkg.priceMin != null &&
        pkg.priceMax != null &&
        amount >= pkg.priceMin &&
        amount <= pkg.priceMax,
    );
    if (!withinAnyPackage) {
      reasons.push(`PRICE_MISMATCH:${match.trim()}`);
    }
  }

  if (!input.salesRules.allowDiscountMention) {
    const lowerBody = input.body.toLowerCase();
    for (const word of input.salesRules.forbiddenWords) {
      if (lowerBody.includes(word.toLowerCase())) {
        reasons.push(`FORBIDDEN_WORD:${word}`);
      }
    }
  }

  const referenceCandidates = findReferenceCandidates(input.body);
  const verifiedLower = new Set(input.verifiedReferenceNames.map((n) => n.toLowerCase()));
  const recipientLower = input.recipientBusinessName?.toLowerCase();
  for (const candidate of referenceCandidates) {
    const candidateLower = candidate.toLowerCase();
    if (candidateLower === recipientLower) continue;
    if (!verifiedLower.has(candidateLower)) {
      reasons.push(`UNVERIFIED_REFERENCE:${candidate}`);
    }
  }

  const deliveryMatches = [...input.body.matchAll(DELIVERY_REGEX)];
  for (const match of deliveryMatches) {
    const amount = Number.parseInt(match[1] ?? "0", 10);
    const unit = match[2]?.toLowerCase();
    const days = unit === "hafta" ? amount * 7 : amount;
    const withinAnyPackage = input.packages.some(
      (pkg) =>
        pkg.deliveryDaysMin != null &&
        pkg.deliveryDaysMax != null &&
        days >= pkg.deliveryDaysMin &&
        days <= pkg.deliveryDaysMax,
    );
    if (!withinAnyPackage) {
      reasons.push(`DELIVERY_MISMATCH:${match[0].trim()}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
