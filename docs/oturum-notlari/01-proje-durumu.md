# Proje durumu (2026-10-09)

## MVP mi?
**MVP'nin kapsadığı satış döngüsü uygulamada çalışıyor; "tam sürüm / yayına hazır" değil.** Yayın (`.app` adresi) bilerek yapılmıyor.

SPEC'teki MVP döngüsü: *Google Maps'ten bul → analiz et → puanla → AI taslak → elle gönder → cevabı işle → teklife devret.*

| Adım | Durum |
|---|---|
| Bul (elle arama + şehir taraması) | Var. Şehir taraması bulutta henüz denenmedi. |
| Analiz (arka planda, otomatik) | Var; yerelde 160 işletmede hatasız. |
| Puanlama | Var. |
| AI taslak (Türkçe/İngilizce) | Var; Türkçe kalitesi modele bağlı. |
| İletişime geç + temas kaydı + sonuç + aşama ilerlemesi | Var. |
| Takip, zaman çizelgesi, filtreler, raporlar | Var. |
| Devir kartı, müşteri | Var. |

## Kodun durumu
- Dal: `feature/p15-automated-prospecting` (**yalnızca bu bilgisayarda**; GitHub'a gönderilmedi, `main`'e birleştirilmedi).
  `feature/p14-global-data-model` (G2) de birleştirilmedi.
- Testler (son çalıştırma): **734** birim, **375** pgTAP (veritabanı), **22** Deno (Edge Function). Tip kontrolü ve lint temiz.
- Uygulama `apps/desktop/dist` olarak derlendi (baslat.cmd bunu sunar).

## Bulutta (Supabase) olmayanlar
Bu oturumda yazılan tüm veritabanı değişiklikleri **yalnızca yerelde** uygulandı. Buluta `db push` ile gitmesi gerekiyor:

`20261009100000_scan_plans`, `…101000_places_refund`, `…102000_scan_retry`, `…103000_clean_bogus_social_channels`,
`…104000_chain_size_and_segment_performance`, `…105000_contact_attempts`, `…106000_update_business_details`,
`…107000_bulk_actions`, `…108000_handoff_actions`, `…109000_remove_member`, `…110000_rename_workspace`,
`…111000_campaign_edit_delete` — ve G2'ye ait daha eski `20260929*` migration'ları.
`places-search` Edge Function'ı da yeniden yayınlanmalı.

## Faz tablosu (BACKLOG ile uyumlu)
| Faz | Durum |
|---|---|
| G0 temizlik, G1 buluta taşıma | ☑ |
| G2 küresel veri modeli | Kod hazır, yerelde doğrulandı; bulut `db push` + gerçek Places denemesi bekliyor |
| G3 keşif motoru (ADR 0014) | Kısmen: kare tarama, aylık sayaç, İşler kutusu, Fırsatlar. **Adım 2 (taslak kuyruğu / "Onay bekleyenler") yapılmadı.** |
| G4 çok dilli analiz/AI | Kısmen (TR/EN taslak, çeviri); değerlendirme seti yok |
| G5 ülke bazlı uyum | ☐ (yapılmadı) |
| G6 günlük kullanım eksikleri | Büyük kısmı ☑ (bkz. `02-yapilanlar.md`) |
| G7 sunucu tarafı otomasyon, G8 yeni kanallar, G9 Jarvis işlemleri, G10 üretim | ☐ |

## MVP'den hâlâ eksik olanlar
1. Bulutta hiçbir yeni özellik denenmedi.
2. Ülke bazlı gönderim uyumu (G5): yabancı ülkeye soğuk e-posta için kurallar, listeden çıkma bağlantısı, kalıcı veri silme.
3. Küçük eksikler: anlaşma silme, raporlarda dışa aktarma, kanal modu ayarları, kayıtlı aramalar, bildirim sesi.
4. Uygulama kapalıyken hiçbir şey çalışmıyor (tarama, e-posta okuma).
5. Bilgi Bankası'nın gerçek içeriği (kullanıcı dolduracak).
