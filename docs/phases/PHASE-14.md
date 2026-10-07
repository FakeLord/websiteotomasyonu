# PHASE 14 (G2) — Küresel veri modeli

**Dal:** `feature/p14-global-data-model` · **Zorluk:** Yüksek · **Bağımlılık:** G1
**Referans:** `docs/adr/0010-global-pivot.md` (D2) · BACKLOG #1

## Durum (2026-10-08)
Kod tarafı bitti: `packages/core/src/geo/*` (ülke, saat dilimi, tatil, adres), 4 migration (`20260929100000…103000`), `places-search`
ülke/dil parametreli, pazar filtresi 7 ekranda, bayrak yerine ülke kodu, yerel saat, uluslararası telefon, para birimine göre toplamlar.
Yerelde doğrulandı (529 birim, 192 pgTAP, 16 Deno testi; tarayıcıda ABD filtresi). **Bekleyen:** bulut `db push`, `places-search` yayını ve
küçük gerçek Places denemesi (`docs/qa/phase-14-global-model.md`). ADR 0012.

## Amaç
Her işletme bir ülkeye, saat dilimine, dile ve para birimine bağlıdır; Türkiye'ye sabitlenmiş her kural parametreli olur.
Sonraki tüm fazların temeli.

## Veritabanı (yeni migration'lar)
- `businesses` += `country_code` (ISO-3166-1 alpha-2, `text + CHECK` uzunluk), `region`, `postal_code`, `timezone` (IANA),
  `language` (BCP-47), `places_refreshed_at`. Mevcut satırlar `TR` / `Europe/Istanbul` / `tr` ile doldurulur.
- İndeksler: `(workspace_id, country_code, city)`, `(workspace_id, category)`, ad araması için `pg_trgm`.
- `import_business` yeni alanları kabul eder; `outreach_guard` gönderim penceresini `businesses.timezone`'a göre hesaplar.
- `report_metrics`, `dashboard_metrics`, `shell_counters`: isteğe bağlı ülke/şehir filtresi; gelir toplamları para birimine göre.
- pgTAP: yeni alanlar, saat dilimi penceresi (ör. Sydney ve Los Angeles aynı anda farklı sonuç), filtreler, izolasyon.

## `packages/core`
- `geo/countries.ts`: ülke kodu, Türkçe ad, diller, saat dilimleri, para birimi, hafta sonu günleri, telefon kodu (+ testler).
- `dedupe/normalize-phone.ts`: `normalizePhone(input, countryCode)` (bugün `"TR"` sabit).
- `discovery/place-to-business.ts`: `parseTurkishAddress` yerine Places `addressComponents`'ten genel ayrıştırıcı
  (ülke, bölge, şehir, ilçe, posta kodu); `titleCaseTr` yalnızca Türkçe kayıtlarda.
- `followup/compute-due-date.ts`: saat dilimi ve ülke tatili parametreli; `tr-holidays.ts` → ülke bazlı sağlayıcı.
- Arama: `turkishLikePattern` → dil bağımsız normalizasyon (aksan ve büyük/küçük harf).

## Arayüz
- Üst çubuk: "Şehir" → **Pazar filtresi** (ülke → şehir); Leadler, Dashboard, Raporlar, Kampanyalar, Konuşmalar'da geçerli.
- Lead listesi/detayı: ülke bayrağı ve yerel saat; telefon uluslararası biçimde; para birimi ülkeye göre.
- `lib/format.ts`: tarih kullanıcı saatinde, "işletmenin yerel saati" ayrıca gösterilir.

## Acceptance criteria
- [x] Mevcut Türkiye akışı değişmeden çalışır (tüm eski testler yeşil).
- [ ] ABD, İngiltere, Kanada, Avustralya'dan birer kayıt doğru ülke, saat dilimi, telefon ve adresle görünür.
- [x] Pazar filtresi seçilince dört ekran da yalnızca o pazarı gösterir (yerelde Dashboard + Leadler doğrulandı; kalanı bulut QA'sında).
- [x] Gönderim penceresi işletmenin yerel saatine göre açılır/kapanır (pgTAP).

## VERIFY_CURRENT_DOCS
- Places `addressComponents` alanının SKU'su ve biçimi; ülke tatili veri kaynağı (lisans, kapsam);
  Postgres `pg_trgm`/`unaccent` eklentilerinin Supabase'de varlığı. Bulgular `docs/adr/0012-global-data-model.md`.
