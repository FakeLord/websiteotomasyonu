import type { CountryCode } from "./countries";

/**
 * Kural tabanlı resmî tatil sağlayıcısı (ADR 0012). Takvim günü `date`'in UTC tarihidir (çağıranlar
 * yerel takvim gününü UTC gece yarısı olarak verir). Kapsam: ABD (federal), İngiltere (İngiltere ve
 * Galler), Kanada (federal), Avustralya (ulusal), Türkiye. Bilinmeyen ülkede `false` döner.
 */
type Ymd = { y: number; m: number; d: number }; // m: 1..12

const pad = (n: number) => String(n).padStart(2, "0");
const key = (c: Ymd) => `${c.y}-${pad(c.m)}-${pad(c.d)}`;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const isoDow = (y: number, m: number, d: number) => ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
const addDays = ({ y, m, d }: Ymd, n: number): Ymd => {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

/** Gregoryen Paskalya Pazarı (anonim algoritma). */
function easterSunday(y: number): Ymd {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y, m: month, d: day };
}

/** Ayın n. (1..) verilen haftaiçi günü; ISO: 1=Pzt. */
function nthWeekday(y: number, m: number, dow: number, n: number): Ymd {
  const offset = (dow - isoDow(y, m, 1) + 7) % 7;
  return { y, m, d: 1 + offset + (n - 1) * 7 };
}

function lastWeekday(y: number, m: number, dow: number): Ymd {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: lastDay - ((isoDow(y, m, lastDay) - dow + 7) % 7) };
}

const weekend = (c: Ymd) => isoDow(c.y, c.m, c.d) >= 6;

/** ABD: hafta sonuna düşen sabit tatil Cuma (Cumartesi) veya Pazartesi (Pazar) gününe kaydırılır. */
function usObserved(c: Ymd): Ymd {
  const dow = isoDow(c.y, c.m, c.d);
  if (dow === 6) return addDays(c, -1);
  if (dow === 7) return addDays(c, 1);
  return c;
}

/** Hafta sonuna düşen tatiller sıradaki boş iş gününe kaydırılır (GB/CA/AU ikame kuralı). */
function shiftToWeekday(dates: Ymd[]): Ymd[] {
  const taken = new Set<string>();
  const result: Ymd[] = [];
  for (const original of dates) {
    let c = original;
    while (weekend(c) || taken.has(key(c))) c = addDays(c, 1);
    taken.add(key(c));
    result.push(c);
  }
  return result;
}

function usHolidays(y: number): Ymd[] {
  const fixed: Ymd[] = [
    { y, m: 1, d: 1 },
    { y, m: 6, d: 19 },
    { y, m: 7, d: 4 },
    { y, m: 11, d: 11 },
    { y, m: 12, d: 25 },
  ];
  return [
    ...fixed,
    ...fixed.map(usObserved),
    nthWeekday(y, 1, 1, 3), // Martin Luther King
    nthWeekday(y, 2, 1, 3), // Presidents
    lastWeekday(y, 5, 1), // Memorial
    nthWeekday(y, 9, 1, 1), // Labor
    nthWeekday(y, 10, 1, 2), // Columbus
    nthWeekday(y, 11, 4, 4), // Thanksgiving
  ];
}

function gbHolidays(y: number): Ymd[] {
  const easter = easterSunday(y);
  return [
    ...shiftToWeekday([{ y, m: 1, d: 1 }]),
    addDays(easter, -2), // Good Friday
    addDays(easter, 1), // Easter Monday
    nthWeekday(y, 5, 1, 1), // Early May
    lastWeekday(y, 5, 1), // Spring
    lastWeekday(y, 8, 1), // Summer
    ...shiftToWeekday([
      { y, m: 12, d: 25 },
      { y, m: 12, d: 26 },
    ]),
  ];
}

function caHolidays(y: number): Ymd[] {
  const easter = easterSunday(y);
  // Victoria Day: 25 Mayıs'tan önceki Pazartesi.
  const may24 = { y, m: 5, d: 24 };
  const victoria = addDays(may24, -((isoDow(y, 5, 24) - 1 + 7) % 7));
  return [
    ...shiftToWeekday([{ y, m: 1, d: 1 }]),
    addDays(easter, -2),
    victoria,
    ...shiftToWeekday([{ y, m: 7, d: 1 }]),
    nthWeekday(y, 9, 1, 1), // Labour Day
    ...shiftToWeekday([{ y, m: 9, d: 30 }]), // Truth and Reconciliation
    nthWeekday(y, 10, 1, 2), // Thanksgiving
    ...shiftToWeekday([{ y, m: 11, d: 11 }]),
    ...shiftToWeekday([
      { y, m: 12, d: 25 },
      { y, m: 12, d: 26 },
    ]),
  ];
}

function auHolidays(y: number): Ymd[] {
  const easter = easterSunday(y);
  return [
    ...shiftToWeekday([{ y, m: 1, d: 1 }]),
    ...shiftToWeekday([{ y, m: 1, d: 26 }]),
    addDays(easter, -2),
    addDays(easter, 1),
    { y, m: 4, d: 25 }, // Anzac Day (ulusal düzeyde ikame yok)
    ...shiftToWeekday([
      { y, m: 12, d: 25 },
      { y, m: 12, d: 26 },
    ]),
  ];
}

const TR_FIXED = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];

// 2026 dinî bayramları (Diyanet takvimi, arife dahil). Diğer yıllar aşağıda yaklaşık hesaplanır.
const TR_RELIGIOUS_VERIFIED: Record<number, string[]> = {
  2026: ["2026-03-19", "2026-03-20", "2026-03-21", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29"],
};

const religiousCache = new Map<number, Set<string>>();

/**
 * Doğrulanmış tablo yoksa Hicri takvimden (Umm al-Qura) yaklaşık: Ramazan Bayramı (arife + 3 gün) ve
 * Kurban Bayramı (arife + 4 gün). Diyanet'in ilanından ±1 gün sapabilir; atlama sezgiseli için yeterlidir (ADR 0012).
 */
function turkishReligious(y: number): Set<string> {
  const verified = TR_RELIGIOUS_VERIFIED[y];
  if (verified) return new Set(verified);
  const cached = religiousCache.get(y);
  if (cached) return cached;
  const result = new Set<string>();
  let fmt: Intl.DateTimeFormat | null = null;
  try {
    fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", day: "numeric", timeZone: "UTC" });
  } catch {
    fmt = null;
  }
  if (fmt) {
    for (let day = 0; day < 366; day++) {
      const date = new Date(Date.UTC(y, 0, 1 + day));
      if (date.getUTCFullYear() !== y) break;
      const parts = fmt.formatToParts(date);
      const month = Number(parts.find((p) => p.type === "month")?.value);
      const dom = Number(parts.find((p) => p.type === "day")?.value);
      const fitr = (month === 9 && dom === 29) || (month === 10 && dom <= 3); // arife + 1–3 Şevval
      const adha = month === 12 && dom >= 9 && dom <= 13; // arife + 10–13 Zilhicce
      if (fitr || adha) result.add(dateKey(date));
    }
  }
  religiousCache.set(y, result);
  return result;
}

function turkishHoliday(date: Date): boolean {
  const iso = dateKey(date);
  if (TR_FIXED.includes(iso.slice(5))) return true;
  return turkishReligious(date.getUTCFullYear()).has(iso);
}

const RULES: Record<string, (y: number) => Ymd[]> = {
  US: usHolidays,
  GB: gbHolidays,
  CA: caHolidays,
  AU: auHolidays,
};

const yearCache = new Map<string, Set<string>>();

export function isHoliday(date: Date, countryCode: CountryCode): boolean {
  const code = countryCode.toUpperCase();
  if (code === "TR") return turkishHoliday(date);
  const rule = RULES[code];
  if (!rule) return false;
  const y = date.getUTCFullYear();
  const cacheKey = `${code}:${y}`;
  let set = yearCache.get(cacheKey);
  if (!set) {
    set = new Set(rule(y).map(key));
    yearCache.set(cacheKey, set);
  }
  return set.has(dateKey(date));
}
