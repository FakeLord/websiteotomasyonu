import type { OutreachChannel, SalesRules, ServicePackageInfo } from "./types";

export interface ValidateDraftInput {
  body: string;
  channel: OutreachChannel;
  packages: ServicePackageInfo[];
  salesRules: SalesRules;
  verifiedReferenceNames: string[];
  /** Mesajın gönderildiği işletmenin adı; referans kontrolünden muaftır. */
  recipientBusinessName?: string | undefined;
  /** Alıcının ilçe/şehir/kategori gibi referans sayılmaması gereken özel adları. */
  contextNames?: string[] | undefined;
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

const MONEY_REGEX =
  /(?:₺|TL|\$|€|£)\s*[\d.,]+|[\d.,]+\s*(?:₺|TL|bin\s*TL|bin\s*₺|€|£|\$|USD|EUR|GBP|CAD|AUD|dollars?|euros?|pounds?)/gi;
const DELIVERY_REGEX = /(\d+)\s*(gün|hafta|days?|weeks?)/gi;

/**
 * Bir para ifadesini kabaca sayısal TL değerine çevirir ("bin" çarpanı dahil).
 * Kesin bir para ayrıştırıcı değildir; guardrail amaçlı bir yaklaşımdır.
 */
function parseMoneyAmount(match: string): number | null {
  const isBin = /bin/i.test(match);
  const numeric = match
    .replace(/USD|EUR|GBP|CAD|AUD|dollars?|euros?|pounds?/gi, "")
    .replace(/[₺TL$€£]/gi, "")
    .replace(/bin/gi, "")
    .trim();
  const normalized = numeric.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  return isBin ? value * 1000 : value;
}

/**
 * Ad karşılaştırması için büyük/küçük harf, noktalı/noktasız i ve aksan farkını siler.
 * `tr-TR` küçültmesi İngilizce "HAIR"ı "haır"a çevirip "Hair" ile eşleşmesini bozuyordu; ayrıca
 * işletme adı çoğunlukla BÜYÜK HARFLE kayıtlı, model ise Başlık Biçiminde yazar.
 */
function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/ı/g, "i");
}

const MIN_STEM_LENGTH = 4;
const MAX_SUFFIX_LENGTH = 2;
/** Kayıtlı ada yapışmış ek ("CenterInc", "DentalLLC") modelin attığı kısımdır; en çok 3 harf. */
const MAX_DROPPED_LENGTH = 3;

/**
 * Model işletmenin adını küçük farklarla yazabilir: ek alarak ("DTLA Smile" → "DTLA Smiles") veya kayıtlı ada
 * yapışmış eki atarak ("Lopez Dental CenterInc" → "Lopez Dental Center"). Kök en az 4 harf olmalıdır; kısa
 * kelimelerde yalnızca tam eşleşme geçerlidir, yoksa alakasız adlar da kaçardı.
 */
function isOwnWord(word: string, ownWords: Set<string>): boolean {
  if (ownWords.has(word)) return true;
  for (const own of ownWords) {
    if (own.length >= MIN_STEM_LENGTH && word.startsWith(own) && word.length - own.length <= MAX_SUFFIX_LENGTH) return true;
    if (word.length >= MIN_STEM_LENGTH && own.startsWith(word) && own.length - word.length <= MAX_DROPPED_LENGTH) return true;
  }
  return false;
}

/** İmzada sık görülen genel unvanlar müşteri/marka adı değildir; referans kontrolünden muaftır. */
const GENERIC_ROLE_TITLES = new Set(
  ["satış asistanı", "müşteri temsilcisi", "satış ekibi", "müşteri hizmetleri", "satış temsilcisi", "dijital asistan"].map(foldName),
);

// Selamlama, kapanış ve "ekip" gibi cümle başı kelimeleri (TR + EN) marka adı adayına karışmasın.
const GREETING_WORDS = new Set(
  [
    "merhaba", "merhabalar", "selam", "sayın", "değerli", "günaydın", "iyi", "kolay", "saygılarımla",
    "hello", "hi", "hey", "dear", "good", "morning", "afternoon", "best", "kind", "warm", "regards",
    "sincerely", "cheers", "thanks", "thank", "you", "team", "staff",
    "ekibi", "ekibine", "ekibiniz", "ekibinize", "ekip", "yetkilisi", "yetkililerine", "yönetimi",
  ].map(foldName),
);

/** Hitap ekleri ("Hakan Bey") ve platform adları ("Google", "Instagram") müşteri/marka referansı değildir. */
const NON_NAME_WORDS = new Set(
  [
    "bey", "hanım", "hanımefendi", "bay", "bayan", "mr", "mrs", "ms", "dr", "doktor", "doç", "prof",
    "google", "maps", "haritalar", "instagram", "facebook", "whatsapp", "linkedin", "tiktok", "youtube", "messenger",
  ].map(foldName),
);

/** "Şirketinizin", "Kliniğiniz" gibi ikinci kişi iyelik ekli kelimeler özel ad değil, alıcıya hitaptır. */
const SECOND_PERSON_POSSESSIVE = /(?:iniz|ınız|unuz|ünüz)(?:in|ın|un|ün|e|a|de|da|den|dan|i|ı|u|ü)?$/;

function isNonNameWord(word: string): boolean {
  return GREETING_WORDS.has(word) || NON_NAME_WORDS.has(word) || (word.length > 6 && SECOND_PERSON_POSSESSIVE.test(word));
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
  const lower = foldName;
  const verifiedLower = new Set(input.verifiedReferenceNames.map(lower));
  // Alıcının kendi adı (kısaltılmış hali dahil) ve bağlamındaki yer/kategori
  // adları referans değildir: adayın tüm kelimeleri bu kümedeyse atlanır.
  const ownWords = new Set(
    [input.recipientBusinessName ?? "", ...(input.contextNames ?? [])].flatMap((name) => lower(name).split(/\s+/)).filter(Boolean),
  );
  for (const candidate of referenceCandidates) {
    // Cümle başındaki selamlama kelimeleri ("Merhaba Dişhekimi Tenzil") adaya karışır.
    const words = lower(candidate)
      .split(/\s+/)
      .filter((word) => !isNonNameWord(word));
    if (words.length < 2 || words.every((word) => isOwnWord(word, ownWords))) continue;
    const candidateLower = words.join(" ");
    if (GENERIC_ROLE_TITLES.has(candidateLower)) continue;
    if (!verifiedLower.has(candidateLower)) {
      reasons.push(`UNVERIFIED_REFERENCE:${candidate}`);
    }
  }

  const deliveryMatches = [...input.body.matchAll(DELIVERY_REGEX)];
  for (const match of deliveryMatches) {
    const amount = Number.parseInt(match[1] ?? "0", 10);
    const unit = match[2]?.toLowerCase();
    const days = unit === "hafta" || unit?.startsWith("week") ? amount * 7 : amount;
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
