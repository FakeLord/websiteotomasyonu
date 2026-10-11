# ADR 0024 — Müşteri detay sayfası: hizmet hesapları, paket içeriği ve belgeler/faturalar

**Durum:** Kabul · 2026-10-11 (kullanıcı onayı; şifre kararı: **A**, şifre alanı yok); kod hazır, bulutta denenmedi
**İlgili:** `customer_deals` (20260927102000), ADR 0019 (kişisel veri/silme), CLAUDE.md kural 3 (RLS + pgTAP)

## Amaç
Müşteriler (WON) sayfasında şu an yalnızca tek satırlık anlaşma var. İstenen: her müşteri için ayrıntılı bir sayfa;
istenen kadar "+" ile hesap/hizmet eklenebilsin (domain, hosting, e-posta, site, paket içeriği…), fatura ve belge
yüklenebilsin.

## Karar
1. **`customer_services`** — müşterinin hizmet/hesap kalemleri (sınırsız satır):
   `kind` (DOMAIN, HOSTING, EMAIL, WEBSITE, SOCIAL, PACKAGE_ITEM, OTHER), `title`, `provider`, `identifier`
   (alan adı, sunucu adı, hesap adı), `login_url`, `username`, `status` (ACTIVE/PAUSED/ENDED), `starts_on`, `renews_on`
   (yenileme tarihi), `cost_amount` + `currency`, `note`. Paket içeriği de `PACKAGE_ITEM` satırlarıdır.
2. **`customer_documents`** — fatura/sözleşme/diğer: `kind` (INVOICE/CONTRACT/OTHER), `title`, `invoice_number`,
   `amount` + `currency`, `issued_on`, `service_id` (isteğe bağlı), dosya bilgisi (`file_path`, `file_name`, `mime`, `size`).
3. **Depolama:** özel (private) `customer-files` kovası; yol `{workspace_id}/{business_id}/{uuid}-{ad}`; en çok 10 MB;
   PDF, PNG, JPG, DOCX, XLSX. Erişim yalnızca çalışma alanı üyelerine (Storage RLS: yolun ilk parçası üyelik kontrolü).
   İndirme kısa ömürlü imzalı bağlantıyla.
4. **Yazma yolu RPC:** `upsert_customer_service`, `delete_customer_service`, `register_customer_document`,
   `delete_customer_document`. Yalnızca WON aşamasındaki işletme için; log (`activity_logs`) düşer. Tablolara doğrudan
   INSERT/UPDATE/DELETE kapalı (mevcut desenle aynı).
5. **Arayüz:** `/customers/:businessId`. Sekmeler: **Genel** (anlaşma özeti + paket içeriği), **Hesaplar ve hizmetler**
   (liste + "+ Hesap ekle", yenileme tarihi yaklaşana rozet), **Belgeler** (yükle, indir, sil), **Geçmiş** (etkinlik).
   Müşteriler listesinde satıra tıklayınca açılır.
6. **Erişim:** üyeler ekler ve düzenler; silmeyi yalnızca ADMIN yapar.

## Kararı bekleyen konu: şifreler
Müşterinin hosting/alan adı **şifrelerini** veritabanında saklamak risklidir (sızıntıda tüm müşterilerin hesapları
açığa çıkar).

| Seçenek | Açıklama | Öneri |
| --- | --- | --- |
| A | Şifre alanı **yok**. Giriş adresi, kullanıcı adı ve not tutulur; şifre bir şifre yöneticisinde (Bitwarden vb.) kalır, nota "şifre yöneticisinde: X kaydı" yazılır. | **Önerilen** |
| B | Şifre alanı var, ayrı şifreli saklanır (Supabase Vault), yalnızca ADMIN görür, her görüntüleme loglanır. Ek tablo, Edge Function ve test gerektirir. | İhtiyaç netse sonraki adım |

## Adımlar
| # | Adım | Doğrulama |
| --- | --- | --- |
| 1 | Migration: 2 tablo, RPC'ler, `customer-files` kovası ve Storage politikaları | pgTAP (yalıtım, yetki, WON şartı, silme yetkisi) |
| 2 | Veri katmanı + belge yükleme/indirme yardımcıları | vitest |
| 3 | Müşteri detay sayfası ve "+ Hesap ekle" / belge paneli | tip, lint, elle kontrol |
| 4 | Müşteriler listesinden detaya geçiş, kabul listesi ve belge güncellemesi | — |

## Kullanıcıdan gereken (Claude yapmaz)
- `npx supabase db push` (yeni migration + kova)
- Gerçek bir PDF yükleyip indirmek.

## Riskler
- Belgelerde kişisel/finansal veri bulunur: kova özel, bağlantılar kısa ömürlüdür; yine de dosya içeriği taranmaz.
- Storage politikaları pgTAP ile yalnızca tablo düzeyinde test edilir; gerçek yükleme/indirme bulutta elle doğrulanmalıdır.
- Müşteri silinirse (`erase_business`) kovadaki dosyalar kendiliğinden silinmez; temizlik ayrı işlev gerektirir (adım 1'e dahil).
