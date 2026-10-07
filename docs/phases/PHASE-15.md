# PHASE 15 (G3) — Küresel keşif motoru

**Dal:** `feature/p15-global-discovery` · **Zorluk:** Yüksek · **Bağımlılık:** G2
**Referans:** `docs/SPEC.md` → G, D4, D20, D22 · BACKLOG #5, #13, #14

## Amaç
Seçilen ülke/şehir/kategorideki işletmelerin tamamını, bütçe sınırı içinde ve Google koşullarına uygun biçimde bulmak.

## Kapsam
- **Alan seçimi:** ülke → şehir/bölge; haritada dikdörtgen çizme. Şehir sınırı Places'tan alınan görünüm alanıdır.
- **`places-search` Edge Function:** `regionCode`, `languageCode`, `locationRestriction` (dikdörtgen), `includedType`,
  `strictTypeFiltering` parametreleri; `addressComponents` maskeye eklenir.
- **Karo tarama** (`packages/core/discovery/tiling.ts`, saf): dikdörtgen karolara bölünür; 60 sonuç dönen karo dörde
  bölünür (en küçük karo ve en fazla derinlik sınırı). `runSearchJob` karoları sırayla işler.
- **Bütçe (D22):** başlamadan önce tahmini çağrı ve maliyet; iş başına ve aylık USD sınırı DB'de zorlanır; kredi ve
  ücretsiz kota sayaçları; sınırda otomatik "yalnızca ücretsiz kota", o da bitince "CSV/elle" kipi.
- **Kategori sözlüğü:** Google yer tipleri + dile göre anahtar kelime; arayüzde Türkçe etiket.
- **Saklama politikası (D20):** `place_id` kalıcı; diğer Places alanları `places_refreshed_at` ile izlenir, süre dolunca
  yenilenir veya temizlenir; sitenin kendisinden toplanan iletişim verisi `WEBSITE` kaynağıyla kalıcıdır.
- Arama iptali ve kayıtlı aramalar; Google Haritalar bağlantısıyla tek işletme ekleme; ülke sütunlu CSV içe aktarım.
- Ölçek: liste ve harita sunucu tarafı sayfalama + harita kümeleme.

## Veritabanı
- `coverage_tiles` (iş, sınırlar, derinlik, durum, sonuç sayısı, çağrı sayısı) — RLS + pgTAP izolasyon; yazma RPC ile.
- `search_jobs` += bütçe, harcanan çağrı/maliyet, iptal; `workspace_settings.places_budget`.
- RPC'ler: `enqueue_coverage_job`, `claim_next_tile`, `complete_tile`, `cancel_search_job`, `save_search`.

## Testler
- Birim: karo bölme (sınır, derinlik, kutup/180° boylam kenarları), maliyet tahmini, bütçe kesme.
- pgTAP: bütçe aşımında kuyruğa alınmaz; iki istemci aynı karoyu alamaz; iptal; izolasyon.
- Mock sağlayıcıyla uçtan uca tarama; gerçek API yalnızca `scripts/smoke/` altında küçük bir karo.

## Acceptance criteria
- [ ] 60'tan fazla işletmesi olan bir bölge taraması tüm karoları bitirir ve yinelenen kayıt oluşturmaz.
- [ ] Bütçe sınırına gelince tarama durur, kaldığı yerden sürdürülebilir.
- [ ] Başlamadan önce gösterilen tahmin, gerçekleşen çağrı sayısının makul aralığındadır.
- [ ] 100.000 kayıtla Leadler ve harita akıcı çalışır.

## VERIFY_CURRENT_DOCS
- Güncel Text Search SKU fiyatları ve ücretsiz kota; Google Maps Platform Service Terms'te saklama/önbellek süreleri;
  yer tipi listesi (Table A). Bulgular `docs/adr/0013-global-discovery.md`.
