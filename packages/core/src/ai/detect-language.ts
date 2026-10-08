export type DetectedLanguage = "tr" | "en" | "unknown";

// Mesajlarda en sık geçen işlev kelimeleri; işletme adları ve özel adlar bu listelere girmez.
const TURKISH_WORDS = new Set([
  "ve", "bir", "bu", "için", "icin", "ile", "olarak", "sizin", "size", "sizi", "çok", "cok", "daha", "gibi", "biz",
  "merhaba", "saygılarımla", "saygilarimla", "web", "sitesi", "siteniz", "sitenizin", "isteriz", "istiyoruz", "ücretsiz",
  "ucretsiz", "görüşme", "gorusme", "hazırlamak", "hazirlamak", "olan", "var", "yok", "ya", "da", "de", "mi", "ne",
]);
const ENGLISH_WORDS = new Set([
  "the", "and", "your", "you", "for", "with", "we", "our", "to", "a", "of", "is", "are", "that", "would", "have",
  "this", "can", "be", "in", "on", "it", "hi", "hello", "regards", "best", "free", "from", "like", "love", "will",
]);

const MIN_SIGNAL = 3;

/**
 * Taslağın hangi dilde yazıldığını kaba ama deterministik biçimde tahmin eder: Türkçe ve İngilizce işlev
 * kelimelerini sayar. Model "İngilizce yaz" talimatını yok sayıp Türkçe yazdığında bunu yakalamak içindir;
 * gerçek bir dil tanıyıcı değildir. Yeterli sinyal yoksa veya sayılar eşitse "unknown" döner (o zaman engellemeyiz).
 */
export function detectDraftLanguage(text: string): DetectedLanguage {
  // tr-TR küçültmesi İngilizce "In/Is/It"i "ın/ıs/ıt" yapar; bu yüzden yalnızca "İ" elle çevrilir, gerisi dilsiz küçültülür.
  const words = text.replace(/İ/g, "i").toLowerCase().match(/[a-zçğıöşü]+/g) ?? [];
  let turkish = 0;
  let english = 0;
  for (const word of words) {
    if (TURKISH_WORDS.has(word)) turkish += 1;
    if (ENGLISH_WORDS.has(word)) english += 1;
  }
  if (Math.max(turkish, english) < MIN_SIGNAL || turkish === english) return "unknown";
  return turkish > english ? "tr" : "en";
}
