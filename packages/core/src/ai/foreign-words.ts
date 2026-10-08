import type { OutreachLanguage } from "./prompts/draft-first-message";

/**
 * Modeller Türkçe cümlenin ortasına İngilizce kelime karıştırabiliyor ("dijital varlığınızı strengthen etmek").
 * Gerçek bir dil tanıyıcı değil: Türkçede hiç kullanılmayan, modelin sık sızdırdığı İngilizce kelimelerin ve
 * işlev kelimelerinin kısa bir listesi. Türkçede de geçen kelimeler (can, on, web, online, premium) bilerek yok.
 */
const ENGLISH_LEAKS = new Set([
  // işlev kelimeleri
  "the", "and", "your", "you", "our", "with", "for", "from", "that", "this", "would", "will", "have", "are", "is",
  "of", "we", "us", "it's",
  // modelin sık sızdırdığı fiil ve sıfatlar
  "strengthen", "strengthening", "enhance", "enhancing", "improve", "improving", "boost", "boosting", "elevate",
  "empower", "unlock", "leverage", "streamline", "grow", "growth", "build", "building", "create", "creating",
  "deliver", "delivering", "ensure", "provide", "providing", "offer", "attract", "engage", "engagement", "reach",
  "stunning", "seamless", "effortless", "discuss", "schedule", "meeting", "customers", "clients", "audience",
  "visitors", "reviews", "business", "success", "solution", "solutions", "experience", "quality", "help", "helping",
]);

/** Türkçe işlev kelimeleri: İngilizce metinde yeri yoktur. */
const TURKISH_LEAKS = new Set([
  "ve", "bir", "bu", "için", "ile", "olarak", "sizin", "size", "sizi", "çok", "daha", "gibi", "ücretsiz", "görüşme",
  "merhaba", "saygılarımla", "isteriz", "istiyoruz", "olan", "var", "yok", "mi", "mı",
]);

const TURKISH_LETTERS = /[çğıöşü]/;

const tokens = (text: string): string[] => text.replace(/İ/g, "i").toLowerCase().match(/[a-zçğıöşü']+/g) ?? [];

/**
 * Metindeki "yanlış dilden" kelimeleri döner (tekrarsız, ilk görülme sırasıyla). `allowedNames`: işletme, şirket, şehir
 * gibi özel adlar; bunların kelimeleri sızıntı sayılmaz.
 */
export function findForeignWords(text: string, language: OutreachLanguage, allowedNames: string[] = []): string[] {
  const allowed = new Set(allowedNames.flatMap(tokens));
  const found: string[] = [];
  for (const word of tokens(text)) {
    if (allowed.has(word) || found.includes(word)) continue;
    const leaked =
      language === "tr"
        ? ENGLISH_LEAKS.has(word)
        : TURKISH_LEAKS.has(word) || (TURKISH_LETTERS.test(word) && !ENGLISH_LEAKS.has(word));
    if (leaked) found.push(word);
  }
  return found;
}
