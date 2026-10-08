# ADR 0014 — Otomatik müşteri bulma hattı (tarama planı → fırsatlar → taslak kuyruğu)

Durum: kabul edildi (2026-10-09, kullanıcı onayı). Kapsam: G3'ün (PHASE-15) yeniden çerçevelenmesi + G4/G5'ten taslak kuyruğu.
PHASE-15'teki orijinal kapsamın bir kısmı ertelendi (aşağıda).

## Bağlam
Kullanıcı (yazılım ajansı) sitesi olmayan, açılmayan veya kötü durumda olan işletmeleri kategori fark etmeksizin hızlı bulmak
istiyor. Bugün her halka elle: kategori/şehir seç → ara (en çok 60 sonuç) → filtrele → işletmeyi aç → taslak iste.
Otomatik olan tek halka arka plan analizi + puanlama (ADR yok; commit d770a70).

## Karar
İki adımda, **B seviyesi** otomasyon: gönderim her zaman insan onayındadır (CLAUDE.md, D-kararları); uygulama kapalıyken
çalışma (sunucu zamanlayıcı) bu kapsamda değildir (G7).

### Adım 1 — Tarama planı + Fırsatlar + İşler kutusu
- **Tarama planı:** kullanıcı bir kez ülke/şehir, kategori listesi ve mesaj dilini seçer. Şehrin sınırı Places'tan alınır
  (`places.viewport`, Pro kademesi, 1 çağrı). Her kategori için kök kare = şehir sınırı.
- **Kare tarama:** kare `locationRestriction.rectangle` ile aranır (Text Search (New) yalnızca dikdörtgen kısıt kabul eder;
  sayfa başına 20, üç sayfa). 60 sonuç dönen kare dörde bölünür (en fazla derinlik 6). Saf mantık `packages/core/discovery/tiling.ts`.
- **Çalıştırıcı:** tarayıcıda, uygulama açıkken; kareler DB'den `claim` edilir (`FOR UPDATE SKIP LOCKED` + süreli sahiplik), iki
  cihaz aynı kareyi alamaz. Sekme kapanınca durur, açılınca kaldığı yerden sürer. Duraklat / sürdür / iptal.
- **Bütçe — D22'den sapma:** kullanıcı "iş başına + aylık USD" yerine **yalnızca aylık çağrı sınırı** seçti. Sınır
  `workspace_settings.outreach_limits.places_monthly_cap`'tir; sınır tanımlı değilken tarama planı oluşturulamaz.
  Sayaç artık istemcinin bildirdiği `search_jobs.api_calls` değil, **`places-search` Edge Function'ının kendisinin**
  tükettiği `places_usage` (çalışma alanı, ay) sayacıdır: her Google çağrısından önce `consume_places_call()`; sınır dolduysa
  fonksiyon Google'a gitmeden 429 `QUOTA_EXCEEDED` döner. Elle arama ve tarama aynı sayacı paylaşır. İstemci güvenilmez kalır.
  Sıfırlama betiği (`scripts/ops/reset-app-data.sql`) bu sayacı SİLMEZ (Google'ın saydığı çağrılar geri gelmez).
- **Fırsatlar:** Leadler'de hazır görünüm — `website_status ∈ {NO_WEBSITE, BROKEN_WEBSITE, LOW_QUALITY_WEBSITE}`, faaliyette,
  DNC değil, aşama `NEW`; sekmeler ulaşılabilir kanala göre (e-posta / telefon-WhatsApp / kanal yok); puana göre sıralı.
  Bot engeli olabilen (HTTP 401/403/406/429) "açılmıyor" kayıtları ayrı etiketlenir.
- **İşler kutusu:** üst çubukta tek kutu; tarama, analiz, taslak kuyruğu ve aylık Places sayacı; satır başına duraklat/iptal ve
  hata nedeni. Mevcut "Analiz: x/y" göstergesi bunun içine taşınır.

### Adım 2 — Taslak kuyruğu (Adım 1 doğrulandıktan sonra)
- Fırsatlar'daki en yüksek puanlı, e-postası olan işletmeler için planın dilinde taslak arka planda üretilir, `validateDraft`
  ve dil kontrolünden geçer, konuşmaya `DRAFT` olarak kaydedilir; reddedilen kuyruğa girmez.
- "Onay bekleyenler" görünümü; günlük AI sınırı (`ai_config.dailyLimit`) ve NVIDIA hızı (~10 sn/taslak) sınırlayıcıdır.
- ADR 0013 "varsayılan dil yok" kararı korunur: dil plan başına kullanıcı tarafından bir kez seçilir.

## Doğrulanan bilgiler (VERIFY_CURRENT_DOCS, 2026-10-09 — arama özetlerinden; resmi sayfa açılarak yeniden teyit edilmeli)
- Fiyat kademeleri faturalandırma hesabı başına aylık ücretsiz kota verir: Essentials 10.000, Pro 5.000, Enterprise 1.000 çağrı.
  Alan maskemiz `websiteUri`, telefon ve `rating` içerdiği için **Enterprise**'dır (ilk kademe ~35–40 USD / 1.000 çağrı).
  Bir çağrı en çok 20 işletme döner ⇒ ücretsiz kota ayda en çok ~20.000 işletme. Önerilen başlangıç sınırı: 1.000 çağrı/ay.
- Kotayı çoğaltmak için birden fazla faturalandırma hesabı açmak Google Maps Platform koşullarının ihlalidir; tek anahtar,
  tek hesap (Vault'taki ortak anahtar) doğru kurulumdur.
- **Saklama (D20):** `place_id` süresiz saklanabilir; diğer Places içeriği saklanamaz, enlem/boylam en çok 30 gün
  önbelleklenebilir. Bizim sitelerden topladığımız veri (`found_via = WEBSITE/JSON_LD`) ve kullanıcının girdiği veri bizimdir.

## Açık karar — saklama politikasının uygulanması (kullanıcıya soruldu)
Toplu tarama saklanan Places verisini büyütür. Seçenekler: (a) işlenen lead'leri 30 günde bir yenile (Place Details,
bütçeden), hiç dokunulmamışların Places alanlarını temizle (`place_id` kalır); (b) yalnızca "eski veri" uyarısı göster;
(c) Adım 1 dışında bırak. Karar gelene kadar `places_refreshed_at` izlenir, silme yapılmaz.

## Uygulama notları (2026-10-08)
- Sınır dolunca `places-search` 429 değil **402** `QUOTA_EXCEEDED` döner (429 hız sınırıdır ve yeniden denenir).
- Fırsatlar aşaması yalnızca `NEW` değil, henüz yazılmamış üç aşamadır (`NEW`, `QUALIFIED`, `OUTREACH_READY`);
  kural `packages/core/pipeline/opportunity.ts`. "Kanal yok" sekmesi ve bot engeli etiketi henüz yok.
- Başarısız kare planı durdurmaz; üst üste üç başarısızlıkta tur durur ve dakikada bir yeniden dener.
  Kalıcı FAILED kareler `retry_failed_scan_tiles()` ile ("Taranamayanları yeniden dene") kuyruğa döner.

## Ertelenenler (PHASE-15 orijinal kapsamından)
Haritada elle dikdörtgen çizme, `includedType`/kategori sözlüğü (Google yer tipleri), kayıtlı aramalar, Google Haritalar
bağlantısıyla tek işletme ekleme, 100.000 kayıt için sunucu tarafı sayfalama + harita kümeleme, USD bazlı maliyet tahmini.

## Riskler
- Çağrı tahmini kabadır (kaç karenin bölüneceği önceden bilinmez); gerçek güvence aylık sınırdır.
- 60 dönen kare için yapılan 3 çağrı, çocuk karelerde aynı işletmeleri yeniden getirir (mükerrer kayıt oluşmaz ama çağrı harcanır).
- Tarama sekme açıkken yürür; büyük şehir × çok kategori saatler sürebilir.
- Buluta `db push` ve `functions deploy places-search` kullanıcı onayıyla ve kullanıcı tarafından yapılır.
