import { isTurkishHoliday } from "./tr-holidays";

// Türkiye 2016'dan beri yaz saati uygulamıyor; UTC+3 sabit ofset yıl boyu
// geçerlidir (SPEC.md → D2). Bu yüzden tam bir IANA tz veritabanı olmadan
// güvenle hesaplanabilir.
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface SendWindow {
  /** ISO hafta günleri: 1 = Pazartesi … 7 = Pazar. */
  days: number[];
  /** "09:00" biçiminde. */
  from: string;
}

interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

function toIstanbulCalendarDate(date: Date): CalendarDate {
  const shifted = new Date(date.getTime() + ISTANBUL_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

function addCalendarDays(cal: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(cal.y, cal.m, cal.d + days));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

function isoWeekday(cal: CalendarDate): number {
  const jsDay = new Date(Date.UTC(cal.y, cal.m, cal.d)).getUTCDay(); // 0=Sun..6=Sat
  return ((jsDay + 6) % 7) + 1; // 1=Mon..7=Sun
}

function calendarDateAsUtcMidnight(cal: CalendarDate): Date {
  return new Date(Date.UTC(cal.y, cal.m, cal.d));
}

function calendarDateAtIstanbulTime(cal: CalendarDate, time: string): Date {
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(cal.y, cal.m, cal.d, hh, mm) - ISTANBUL_OFFSET_MS);
}

/**
 * M bölümündeki `due_at` hesabı: `baseDate + afterDays`, sonra gönderim
 * penceresine (`sendWindow.days`) ve isteğe bağlı resmi tatillere göre bir
 * sonraki uygun güne kaydırılır, saat `sendWindow.from`'a sabitlenir.
 */
export function computeFollowUpDueDate(
  baseDate: Date,
  afterDays: number,
  sendWindow: SendWindow,
  skipHolidays: boolean,
): Date {
  let candidate = addCalendarDays(toIstanbulCalendarDate(baseDate), afterDays);

  while (
    !sendWindow.days.includes(isoWeekday(candidate)) ||
    (skipHolidays && isTurkishHoliday(calendarDateAsUtcMidnight(candidate)))
  ) {
    candidate = addCalendarDays(candidate, 1);
  }

  return calendarDateAtIstanbulTime(candidate, sendWindow.from);
}
