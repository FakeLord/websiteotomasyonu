# ADR 0017 — Yurtdışına e-posta kilidi

**Durum:** Kabul · 2026-10-10
**İlgili:** ADR 0010 (küresel dönüşüm), D1, D21, BACKLOG G5 (`docs/phases/PHASE-17.md`)

## Bağlam
Kapsam küreseldir ama ülke bazlı soğuk e-posta kuralları (CAN-SPAM, PECR, CASL, Spam Act, KVKK/İYS) henüz uygulanmıyor
ve hukuk danışmanı yoktur (D1). `outreach_guard` ülkeye bakmadan e-postaya izin veriyordu.

## Karar
- `outreach_guard`, kanal `EMAIL` iken işletmenin `country_code`'u `TR` değilse ve
  `workspace_settings.outreach_limits.allow_foreign_email` `true` değilse `FOREIGN_EMAIL_DISABLED` sebebiyle reddeder.
- Anahtar yoksa kapalı sayılır; mevcut çalışma alanları ek veri düzeltmesi olmadan kilitlenir.
- Ayarı yalnızca ADMIN değiştirir (mevcut `workspace_settings` güncelleme politikası).
- Asistanlı/elle kanallar (WhatsApp, Instagram, ...) etkilenmez; taslak üretimi serbesttir.
- Kural `mark_message_sent` içinde de `outreach_guard` üzerinden uygulanır; arayüz atlansa bile veritabanı reddeder.

## Sonuçlar
- G5 (ülke kuralları, alt bilgi, listeden çıkma) bitince bu ayar ülke bazlı kurallarla değiştirilecek; ayar sıkılaştırma
  yönünde kalır, gevşetme için G5 kuralı da `ALLOWED` olmalıdır.
- Açıldığında sorumluluk ekipte kalır; arayüz bunu ayar açıklamasında söyler.
