/**
 * TR resmi tatil takvimi — statik liste (SPEC.md → D2, M: "resmi tatillere
 * (statik liste) kaydırılır"). Sabit tarihli resmi tatiller her yıl aynıdır;
 * dini bayramlar (Ramazan/Kurban) ay takvimine göre kayar ve yıl başına elle
 * eklenmelidir — bu liste yalnızca 2026'yı kapsar, sonraki yıllar için
 * güncellenmelidir.
 */
const FIXED_HOLIDAYS_MM_DD = [
  "01-01", // Yılbaşı
  "04-23", // Ulusal Egemenlik ve Çocuk Bayramı
  "05-01", // Emek ve Dayanışma Günü
  "05-19", // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  "07-15", // Demokrasi ve Milli Birlik Günü
  "08-30", // Zafer Bayramı
  "10-29", // Cumhuriyet Bayramı
];

// 2026 için dini bayram tarihleri (Diyanet takvimine göre, yaklaşık).
const RELIGIOUS_HOLIDAYS_2026 = [
  "2026-03-19",
  "2026-03-20",
  "2026-03-21",
  "2026-05-26",
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isTurkishHoliday(date: Date): boolean {
  const mmDd = toIsoDate(date).slice(5);
  if (FIXED_HOLIDAYS_MM_DD.includes(mmDd)) return true;
  return RELIGIOUS_HOLIDAYS_2026.includes(toIsoDate(date));
}
