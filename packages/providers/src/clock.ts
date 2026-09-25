/**
 * Zaman soyutlaması: follow-up tarih hesabı gibi saf fonksiyonların test
 * edilebilir olması için (SPEC.md → U, MockClock).
 */
export interface Clock {
  now(): Date;
}
