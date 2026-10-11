# ADR 0025 — Meta ve Google reklam veren keşfi

**Durum:** Öneri · 2026-10-11 (kullanıcı onayı ve pazar kararı bekliyor)
**İlgili:** `docs/phases/PHASE-20.md` (G8), BACKLOG #21, CLAUDE.md "oturum taklidi ve sayfa taraması yok" kuralı

## Amaç
"Reklam veriyor" bilgisi güçlü bir satış sinyalidir (reklama para harcayan işletme, web sitesine/otomasyona da bütçe ayırır).
Bugün Keşfet'teki Meta Ads ve Google Ads sekmeleri yalnızca kütüphaneyi tarayıcıda açar ve CSV içe aktarma sunar; puanlamadaki
`RUNS_ADS` yalnızca kaynağı META_ADS/GOOGLE_ADS olan kayıtlarda çalışır. Gerçek keşif yoktur.

## Resmi veri kaynaklarının gerçeği (2026-10-11 araştırması; ikincil kaynaklara dayanır, uygulamadan önce resmi belgeyle doğrulanır)
| Kaynak | Ne veriyor | Türkiye için |
| --- | --- | --- |
| **Meta Ad Library API** (`ads_archive`) | Ticari reklamları yalnızca **AB ve Birleşik Krallık**'ta gösterilenler için; dünyanın geri kalanında yalnızca siyasi/toplumsal konulu reklamlar | **Kapsamaz.** Kütüphane web sitesi tüm ülkeleri gösterir ama API'si göstermez |
| Meta erişim şartı | Kimliği doğrulanmış geliştirici hesabı (1–3 iş günü), uygulama, `ads_read`, erişim belirteci (kısa ömürlü; 60 günlük yenileme) | — |
| **Google Reklam Şeffaflık Merkezi** | Resmi bir API **yok**. Yalnızca AEA (Avrupa Ekonomik Alanı) için BigQuery kamu veri kümesi (`google_ads_transparency_center`) | **Kapsamaz** |
| Sayfa tarama / otomatik tarayıcı | Kütüphane sitelerini scrape etmek şartlara aykırıdır | **Yapmayız** (proje kuralı) |

Sonuç: Türkiye'de "kütüphaneden otomatik liste çekme" mümkün değildir. Gerçekçi ve kurallara uygun yollar aşağıdadır.

## Karar: dört parça, değer sırasıyla
### Parça 1 — Reklam etiketi tespiti (otomatik, her ülke, ücretsiz) — ÖNERİLEN İLK ADIM
Web sitesi analizi zaten sayfanın HTML'ini alıyor. Orada reklam etiketleri aranır: Meta Pixel (`fbq(`, `fbevents.js`),
Google Ads (`AW-` kimliği, `googleadservices.com`, `gtag('config','AW-…')`), Google Tag Manager, TikTok Pixel, LinkedIn
Insight Tag. Bulgular mevcut `website_analyses.checks` JSON'una yazılır (şema değişikliği gerekmez). Puanlamada yeni sinyal
`HAS_AD_TAGS` ("reklam etiketi var") eklenir; `RUNS_ADS` etiket varsa da tetiklenir ama ağırlığı kütüphane doğrulamasından
düşüktür. Leadler'de rozet ve "Reklam veriyor" filtresi.
- Sınır: etiket reklam verildiğini kanıtlamaz (kurulu ama kapalı olabilir); "reklam veriyor olabilir" diye etiketlenir.

### Parça 2 — Asistanlı toplu içe aktarma (Meta ve Google, her ülke)
Keşfet → Meta Ads / Google Ads sekmesinde: arama bağlantısı ülke + anahtar kelimeyle hazır açılır (bugün sabit TR/boş);
kullanıcı kütüphanede gördüğü **reklam veren adlarını veya alan adlarını** kutuya yapıştırır (satır satır). Uygulama:
mevcut işletmelerle eşleştirir (ad/alan adı benzerliği, `import_business` yinelenen denetimi), eşleşenlere kaynak
META_ADS/GOOGLE_ADS ve `RUNS_ADS` ekler, eşleşmeyenleri önizlemede gösterip yeni lead olarak ekler. Hiçbir sayfa taranmaz.

### Parça 3 — Meta Ad Library API (yalnızca AB/İngiltere hedefliyorsan)
`meta-ad-library` Edge Function: belirteç `admin-secrets` kasasında; anahtar kelime + ülke (AB/GB) ile sorgu; sonuçlar
`ad_advertisers` aday tablosuna (RLS + pgTAP) yazılır, Places kaydıyla eşleştirilir. Belirteç yenileme hatırlatması.
- Koşul: kullanıcı Meta geliştirici kimlik doğrulamasını yapar (1–3 gün). Türkiye odaklıysan **gerek yok**.

### Parça 4 — Google için CSV içe aktarım (isteğe bağlı, AEA)
BigQuery kamu veri kümesinden kullanıcının çalıştırdığı bir sorguyla CSV alınır; mevcut CSV içe aktarma sütun eşlemesi
(reklam veren adı, alan adı, ülke) genişletilir. API çağrısı yapılmaz.

## Program
| # | Adım | Çıktı | Doğrulama |
| --- | --- | --- | --- |
| 1 | Reklam etiketi dedektörü + testler (saf fonksiyon) | `detectAdTags(html)` | vitest (örnek HTML'ler) |
| 2 | Analiz akışına bağla, `checks.adTags` yaz; puanlama sinyali | `HAS_AD_TAGS` | vitest + eval seti |
| 3 | Leadler rozeti + filtre + Ayarlar'da sinyal ağırlığı | arayüz | tip, lint, elle kontrol |
| 4 | Asistanlı yapıştır-içe aktar (Meta/Google) + eşleştirme önizlemesi | `AdvertiserPasteDialog` | vitest (eşleştirme), yerel deneme |
| 5 | (İsteğe bağlı) Meta API Edge Function + `ad_advertisers` | AB/GB keşfi | pgTAP, Deno testi, `scripts/smoke` |
| 6 | (İsteğe bağlı) Google BigQuery CSV şablonu | belge + sütun eşlemesi | vitest |
| 7 | Kabul listesi, ADR/BACKLOG güncellemesi | — | — |

Tahmini iş: 1–4 yaklaşık bir çalışma günü (benim tarafımda); 5 yaklaşık yarım gün + senin Meta doğrulaman; 6 küçük.

## Kullanıcıdan gereken (Claude yapmaz)
- Parça 3 için Meta geliştirici hesabı kimlik doğrulaması ve belirteç (yalnızca kendi terminalinde/uygulamada).
- `npx supabase db push` (yalnızca parça 3'te yeni tablo gelir).

## Karar bekleyen sorular
1. Hedef pazar yalnızca Türkiye mi, yoksa AB/İngiltere de var mı? (Parça 3 buna bağlı.)
2. Parça 1'de "reklam etiketi var" sinyali puana ne kadar etki etsin? (Öneri: kütüphane doğrulamasının yarısı.)

## Riskler
- Reklam etiketi yanlış pozitif verebilir (site eskiden reklam vermiş); arayüzde "olabilir" dili kullanılır.
- Meta API kapsamı ve kuralları değişebilir; uygulamadan önce `developers.facebook.com` belgeleri tekrar kontrol edilir.
- Yapıştırma akışı kullanıcı emeğine bağlıdır; toplu kaynak değildir, bilinçli olarak asistanlıdır.
