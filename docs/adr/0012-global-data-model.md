# ADR 0012 — Küresel veri modeli (G2)

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-07
- **Bağlam:** ADR 0010 (D2), PHASE-14. Türkiye'ye gömülü kurallar (saat dilimi, tatil, telefon, adres, Places bölgesi,
  mükerrer kontrolü) ülkeye göre parametreli hâle getirilir.

## Doğrulanan bilgiler (VERIFY_CURRENT_DOCS, 2026-10-07)

| Konu | Bulgu | Sonuç |
| --- | --- | --- |
| Places `addressComponents` | Places API (New) alan tablosunda **Pro** SKU'su (`displayName`, `formattedAddress`, `location` ile aynı). Telefon, site, puan **Enterprise**. | İstekte zaten Enterprise alanları olduğundan `addressComponents` eklemek ek maliyet doğurmaz; ülke, bölge, şehir, posta kodu bundan okunur. |
| Tatil kütüphanesi | `date-holidays` 3.37: lisans ISC + CC-BY-3.0 (atıf şartı), paket **~11 MB**. | Arayüze/Edge'e gömülmez. **Kural tabanlı kendi sağlayıcımız** (`geo/holidays.ts`): ABD federal, İngiltere (İngiltere ve Galler), Kanada federal, Avustralya ulusal, Türkiye. Bilinmeyen ülkede tatil sayılmaz. |
| Türkiye dinî bayramları | 2026 Diyanet takvimiyle elle yazılı (arife dahil). | Diğer yıllar Hicri takvimden (`Intl` Umm al-Qura) **yaklaşık** hesaplanır, Diyanet ilanından ±1 gün sapabilir; yalnızca "tatil günü atla" sezgisi için kullanılır. Her yıl Diyanet takvimiyle doğrulanıp tabloya eklenmelidir. |
| Saat dilimi | `@photostructure/tz-lookup` 11.7: CC0, 88 KB, bağımlılıksız, tür tanımlı; enlem/boylamdan IANA adı. | ABD/Kanada/Avustralya çok dilimli olduğundan önce koordinattan, yoksa ülke varsayılanından. |

## Kararlar

1. **`businesses`** += `country_code` (NOT NULL, `^[A-Z]{2}$`), `region`, `postal_code`, `timezone`, `language`, `places_refreshed_at`.
   Mevcut kayıtlar `TR` / `Europe/Istanbul` / `tr`. Yeni sütunlar istemci UPDATE yetkisine eklenmez (düzenleme G6).
2. **`workspace_settings`** += `timezone` (ekibin saati: panel/rapor gün sınırları; varsayılan `Europe/Istanbul`) ve
   `default_country` (`TR`; ülkesiz eski çağrılar için `import_business` yedeği).
3. **Gönderim penceresi** işletmenin saat diliminde ve `followup_policy.sendWindow` ayarına göre hesaplanır
   (öncelik: `businesses.timezone` → `sendWindow.tz` → `Europe/Istanbul`).
4. **`computeFollowUpDueDate`** `opts: { timeZone, countryCode }` alır; varsayılanlar eski davranışı korur (İstanbul/TR).
5. **Mükerrer:** POSSIBLE eşleşme aynı ülkeyle sınırlıdır (ülkesi bilinmeyen eski kayıtlar hariç); EXACT katmanlar küresel.
6. **Ülke profili:** ABD, İngiltere, Kanada, Avustralya, Türkiye tam; diğer ülkeler "genel" (para birimi ve saat dilimi bilinmez).
7. **Pazar filtresi** (ülke → şehir) Zustand `ui-store`'da; sorgular sunucu tarafında süzülür.
