# ADR 0010 — Küresel kapsama geçiş ve Yol Haritası v2

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-07
- **Bağlam:** SPEC.md → Karar Kaydı D2 ("ilk sürüm yalnızca Türkiye"), G (keşif), I.5 (gönderim güvenliği),
  J (AI), T (fazlar). Kullanıcı kararı: uygulama yalnızca Türkiye'deki yerel işletmeler için değil, dünya
  genelindeki işletmeleri Google API ile bulup iletişim kuran küresel bir araç olacak; önceki analizde çıkan
  31 eksik/yarım maddenin tamamı da yapılacak.

## Kararlar (kullanıcı onaylı, 2026-10-07)

| # | Konu | Karar |
| --- | --- | --- |
| D2 (revize) | Coğrafya | **Küresel.** İlk test edilip ayarlanan pazarlar: ABD, İngiltere, Kanada, Avustralya. Türkiye çalışmaya devam eder. Altyapı tüm ülkeleri destekler. |
| D18 | Mesaj dili | İşletmenin **kendi dilinde** yazılır; onay ekranında her taslağın ve gelen mesajın **Türkçe çevirisi** yan yana gösterilir. |
| D17 (teyit) | Arayüz dili | Türkçe kalır (metinler tek dosyada; ileride İngilizce eklenebilir). |
| D19 | Barındırma | Veritabanı **buluta** (Supabase projesi) taşınır; yerel Docker yalnızca geliştirme/test içindir. |
| D20 | Places verisi | `place_id` kalıcıdır; Places'tan gelen diğer alanlar yenileme tarihiyle izlenir. İşletmenin kendi sitesinden bizim topladığımız iletişim verisi ayrı kaynakla kalıcıdır. Ayrıntı G3'te ADR ile kesinleşir. |
| D21 | Ülke kuralları | Soğuk iletişim kuralı ülke bazında **veritabanında zorlanır**; bilinmeyen ülkede en sıkı kural uygulanır. D1 (hukuk danışmanı yok) geçerlidir → varsayılanlar muhafazakârdır, risk kabul edilmiştir. |
| D22 | Bütçe | Tarama, iş başına ve aylık USD üst sınırı olmadan başlatılmaz; sınır DB'de zorlanır. |

## Doğrulanan kısıtlar (VERIFY_CURRENT_DOCS, 2026-10-07)

- **Text Search (New) en fazla 60 sonuç döner** (sayfa başı 20, 3 sayfa); `locationRestriction` yalnızca dikdörtgen
  kabul eder ve sert filtredir, `locationBias` yalnızca sıralamayı etkiler; `includedType` + `strictTypeFiltering`
  tip filtresi sağlar; `languageCode` varsayılanı `en`, `regionCode` varsayılanı yoktur.
  Kaynak: https://developers.google.com/maps/documentation/places/web-service/text-search
  → Bir bölgedeki işletmelerin tamamı ancak **karo karo** (60 dönen karo bölünerek) taranabilir.
- **Saklama:** "You can therefore store place ID values indefinitely" — place ID dışındaki Places içeriği
  "allowed exceptions" dışında önceden getirilemez, önbelleğe alınamaz, saklanamaz. Süre ayrıntısı Google Maps
  Platform Service Terms'tedir (G3'te ayrıca doğrulanacak).
  Kaynak: https://developers.google.com/maps/documentation/places/web-service/policies
- Meta Ad Library API ticari reklamları yalnızca AB/İngiltere için döndürür (SPEC → G.2) → küresel kapsamda bu
  ülkeler için resmi API ile keşif mümkün olur (G8).

## Yol Haritası v2

Sıralama ilkesi: temel → veri → keşif → dil → uyum → günlük kullanım → otomasyon → yeni kanallar → üretim.
Her faz ayrı dalda, kodlamadan önce ayrıntılı plan onayıyla yürür. Ayrıntı: `docs/phases/PHASE-12…22.md`,
madde eşlemesi: `docs/BACKLOG.md`.

| Kod | Faz | Dal | İçerik | Bağımlılık |
| --- | --- | --- | --- | --- |
| G0 | 12 | `feature/p12-global-foundation` | Dal birleştirme, SPEC v2, bu ADR, BACKLOG, SMTP 587 düzeltmesi | — |
| G1 | 13 | `feature/p13-cloud` | Buluta taşıma, haftalık yedek | G0 |
| G2 | 14 | `feature/p14-global-data-model` | Ülke/saat dilimi/dil/para birimi, telefon ve adres, pazar filtresi | G1 |
| G3 | 15 | `feature/p15-global-discovery` | Karo tarama, bütçe, kategori sözlüğü, saklama politikası | G2 |
| G4 | 16 | `feature/p16-multilingual-ai` | Çok dilli analiz, prompt'lar, çeviri, guardrail, eval seti | G2 |
| G5 | 17 | `feature/p17-compliance` | Ülke kuralları, listeden çıkma, kalıcı silme + bastırma listesi | G2, G4 |
| G6 | 18 | `feature/p18-crm-gaps` | Günlük kullanım eksikleri (14 madde) | G2 |
| G7 | 19 | `feature/p19-server-automation` | Sunucu tarafı IMAP/zamanlayıcı, otomatik e-posta | G1, G5 |
| G8 | 20 | `feature/p20-channels` | Meta webhook, WhatsApp Cloud API, reklam veren keşfi | G5 |
| G9 | 21 | `feature/p21-jarvis-actions` | Jarvis işlem katmanı | G6 |
| G10 | 22 | `feature/p22-production` | Güncelleme, imzalama, geri yükleme, maliyet paneli, pilot QA | hepsi |

## Riskler

- **Maliyet:** tarama ücretlidir ve hacimle doğrusal büyür; Supabase ücretsiz plan (500 MB) yüz binlerce kayıtta dolar.
- **Google kullanım şartları:** Places içeriğinin kalıcı saklanması kısıtlıdır; D20 riski azaltır, sıfırlamaz.
- **Hukuk:** ülke kuralının yanlış uygulanması ceza veya hesap kapatma riski taşır; varsayılanlar bilinçli olarak sıkıdır.
- **Ölçek:** "dünyadaki tüm işletmeler" pratikte ülke/şehir/kategori bazında ve bütçeyle sınırlı ilerler.
- Instagram/Facebook/LinkedIn'e otomatik soğuk DM yoktur (CLAUDE.md #9); bu kanallar asistanlı kalır.
