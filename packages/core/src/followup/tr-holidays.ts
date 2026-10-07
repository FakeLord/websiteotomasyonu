import { isHoliday } from "../geo/holidays";

/**
 * TR resmî tatil takvimi. Kural ve tablolar `geo/holidays.ts` içindedir (ülke bazlı sağlayıcı);
 * bu işlev eski çağıranlar için korunur.
 */
export function isTurkishHoliday(date: Date): boolean {
  return isHoliday(date, "TR");
}
