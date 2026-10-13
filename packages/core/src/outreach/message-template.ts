/**
 * Sabit mesaj şablonu: "İletişime geç → WhatsApp" mesajı yazılmış olarak açmak için. Yapay zekâ taslağından farklı olarak metin
 * her işletmede aynıdır; yalnızca yer tutucular (işletme adı vb.) değişir. Mesajı kullanıcı kendi WhatsApp'ında okur ve gönderir
 * (CLAUDE.md #9: otomatik gönderim yok).
 */

export type TemplateLanguage = "tr" | "en";

export const PLACEHOLDERS = ["isletme", "sirket", "kategori", "sehir"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type TemplateVars = Partial<Record<Placeholder, string>>;

export interface MessageTemplates {
  tr: string;
  en: string;
}

/**
 * Varsayılan şablonlar. Kısa, tek net çağrı; fiyat, indirim, süre veya referans içermez (Bilgi Bankası dışı iddia yok).
 * `{sirket}` Ayarlar'daki gönderen şirket adından gelir.
 */
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
  tr:
    "Merhaba, {isletme} ekibine yazıyorum. Biz {sirket}; işletmelere premium, canlı hissiyatlı yeni nesil web siteleri, mobil uygulamalar ve " +
    "otomasyon çözümleri hazırlıyoruz. {isletme} için size özel ücretsiz bir örnek tasarım hazırlayıp kısa bir görüşmede paylaşmak isteriz. " +
    "Müsait olduğunuz bir zaman var mı?",
  en:
    "Hi, I'm writing to the {isletme} team. We're {sirket}: we build premium, lively next-generation websites, mobile apps and automation for " +
    "businesses. We'd love to prepare a free sample design made just for {isletme} and share it in a short call. " +
    "Would you have a few minutes this week?",
};

const MAX_NAME_LENGTH = 50;
/** Virgülden önceki kısım bundan kısaysa ("Ali, Veli ve Ortakları") virgülde kesilmez. */
const MIN_NAME_BEFORE_COMMA = 6;
// WhatsApp wa.me bağlantısında çok uzun metin kesilebilir; güvenli üst sınır.
const MAX_WHATSAPP_TEXT = 1500;

const SMALL_WORDS: Record<TemplateLanguage, Set<string>> = {
  tr: new Set(["ve", "ile", "için"]),
  en: new Set(["and", "of", "the", "for", "at", "in", "&"]),
};

const LOCALE: Record<TemplateLanguage, string> = { tr: "tr-TR", en: "en-US" };

function isMostlyUppercase(text: string): boolean {
  const upper = (text.match(/\p{Lu}/gu) ?? []).length;
  const lower = (text.match(/\p{Ll}/gu) ?? []).length;
  return upper + lower >= 4 && upper / (upper + lower) >= 0.8;
}

function toTitleCase(text: string, language: TemplateLanguage): string {
  const locale = LOCALE[language];
  const parts = text.split(/(\s+|-)/);
  let firstWord = true;
  return parts
    .map((part) => {
      if (!part || /^(\s+|-)$/.test(part)) return part;
      const lower = part.toLocaleLowerCase(locale);
      const word = !firstWord && SMALL_WORDS[language].has(lower) ? lower : lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
      firstWord = false;
      return word;
    })
    .join("");
}

/**
 * Mesajda geçecek işletme adı: Google'daki ad çoğu zaman anahtar kelime doludur ("Ecesu Beauty | Güzellik Salonu | …") veya
 * BÜYÜK HARFLİDİR. İlk bölümü alır, büyük harfliyse Başlık Biçimine çevirir (marka yazımlarına dokunmaz), 50 karaktere kısaltır.
 */
export function shortBusinessName(name: string, language: TemplateLanguage): string {
  const first = (name.split(/\s*\|\s*/)[0] ?? "").split(/\s[–—-]\s/)[0] ?? "";
  // Parantez içi çoğunlukla şube/tekrar bilgisidir; virgülden sonrası anahtar kelime listesidir (ilk parça yeterince uzunsa).
  const withoutParens = first.replace(/\([^)]*\)/g, " ");
  const beforeComma = withoutParens.split(/\s*,\s*/)[0] ?? "";
  const kept = beforeComma.trim().length >= MIN_NAME_BEFORE_COMMA ? beforeComma : withoutParens;
  let result = kept
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:\-–—&]+|[\s.,;:\-–—&]+$/g, "");
  if (isMostlyUppercase(result)) result = toTitleCase(result, language);
  if (result.length > MAX_NAME_LENGTH) {
    const cut = result.slice(0, MAX_NAME_LENGTH);
    const lastSpace = cut.lastIndexOf(" ");
    result = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return result;
}

const KNOWN_PLACEHOLDER = new RegExp(`\\{(${PLACEHOLDERS.join("|")})\\}`, "g");

/** Şablondaki tanınmayan `{…}` ifadeleri (yazım hataları). Ayarlar kaydederken uyarmak için. */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(PLACEHOLDERS.map((p) => `{${p}}`));
  const found = template.match(/\{[^{}\s]{1,30}\}/g) ?? [];
  return [...new Set(found.filter((token) => !known.has(token)))];
}

/**
 * Yer tutucuları doldurur. Tek geçişte çalışır (değerin içindeki `{…}` yeniden yorumlanmaz). Değeri boş olan yer tutucu silinir ve
 * ardında kalan çift boşluk / noktalama öncesi boşluk temizlenir. Bilinmeyen `{…}` olduğu gibi kalır.
 */
export function renderMessageTemplate(template: string, vars: TemplateVars): string {
  let anyEmpty = false;
  const filled = template.replace(KNOWN_PLACEHOLDER, (_match, key: Placeholder) => {
    const value = vars[key]?.trim() ?? "";
    if (!value) anyEmpty = true;
    return value;
  });
  const cleaned = anyEmpty ? filled.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:!?])/g, "$1").replace(/[ \t]+\n/g, "\n") : filled;
  return cleaned.trim();
}

/** Şablon dili: Türkiye veya Türkçe işletmeye Türkçe, diğerlerine İngilizce. */
export function templateLanguageFor(business: { language: string | null; countryCode: string }): TemplateLanguage {
  return business.language === "tr" || business.countryCode.toUpperCase() === "TR" ? "tr" : "en";
}

/** wa.me bağlantısı: numara (rakamlar) + önceden yazılmış mesaj. Numara geçersizse `null`. */
export function whatsappUrlWithText(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const message = text.trim().slice(0, MAX_WHATSAPP_TEXT);
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}
