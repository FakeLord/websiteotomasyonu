import { isHoliday } from "../geo/holidays";

const DEFAULT_TIME_ZONE = "Europe/Istanbul";
const DEFAULT_COUNTRY = "TR";

export interface SendWindow {
  /** ISO hafta günleri: 1 = Pazartesi … 7 = Pazar. */
  days: number[];
  /** "09:00" biçiminde. */
  from: string;
}

export interface DueDateOptions {
  /** IANA saat dilimi (işletmenin yerel saati); varsayılan `Europe/Istanbul`. */
  timeZone?: string;
  /** Tatil takvimi için ISO ülke kodu; varsayılan `TR`. */
  countryCode?: string;
}

interface CalendarDate {
  y: number;
  m: number; // 0..11
  d: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(date: Date, timeZone: string): Record<string, number> {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, fmt);
  }
  const out: Record<string, number> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out;
}

function toCalendarDate(date: Date, timeZone: string): CalendarDate {
  const p = partsIn(date, timeZone);
  return { y: p.year!, m: p.month! - 1, d: p.day! };
}

/** `timeZone`'da o anki UTC farkı (ms). */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Yerel duvar saatini (örn. 09:00) gerçek UTC anına çevirir; yaz saati geçişine dayanıklıdır. */
function wallTimeToUtc(cal: CalendarDate, time: string, timeZone: string): Date {
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(cal.y, cal.m, cal.d, hh, mm);
  let instant = guess - offsetMs(new Date(guess), timeZone);
  instant = guess - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
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

/**
 * M bölümündeki `due_at` hesabı: `baseDate + afterDays`, sonra gönderim penceresine (`sendWindow.days`) ve
 * isteğe bağlı resmî tatillere göre bir sonraki uygun güne kaydırılır, saat `sendWindow.from`'a sabitlenir.
 * Takvim günü ve saat, `opts.timeZone` (işletmenin yerel saati) içinde hesaplanır; tatiller `opts.countryCode`'a göredir.
 * Varsayılanlar eski davranışla aynıdır (İstanbul/TR).
 */
export function computeFollowUpDueDate(
  baseDate: Date,
  afterDays: number,
  sendWindow: SendWindow,
  skipHolidays: boolean,
  opts: DueDateOptions = {},
): Date {
  const timeZone = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const countryCode = opts.countryCode ?? DEFAULT_COUNTRY;
  let candidate = addCalendarDays(toCalendarDate(baseDate, timeZone), afterDays);

  while (
    !sendWindow.days.includes(isoWeekday(candidate)) ||
    (skipHolidays && isHoliday(calendarDateAsUtcMidnight(candidate), countryCode))
  ) {
    candidate = addCalendarDays(candidate, 1);
  }

  return wallTimeToUtc(candidate, sendWindow.from, timeZone);
}
