# Proje durumu (2026-10-11)

## MVP mi?
**Kod tarafında MVP tamam; "bitti" işareti bulutta kabul testinden sonra konur** (`docs/qa/mvp-acceptance.md`). Yayın (`.app`
adresi) bilerek yapılmıyor.

SPEC'teki MVP döngüsü: *Google Maps'ten bul → analiz et → puanla → AI taslak → elle gönder → cevabı işle → teklife devret.*

| Adım | Durum |
|---|---|
| Bul (elle arama + şehir taraması) | Var; kodda ve yerelde doğrulandı. Bulutta ilk gerçek tarama denendi. |
| Analiz (arka planda, otomatik) | Var |
| Puanlama | Var |
| AI taslak (Türkçe/İngilizce) | Var; **ücretsiz NVIDIA** ile çalışır. Taslak kuyruğu + Onay Bekleyenler eklendi. |
| İletişime geç + temas kaydı + sonuç + aşama ilerlemesi | Var |
| Ülke uyumu | Var: ülke kuralları, gönderen kimliği + e-posta alt bilgisi, bastırma listesi, kalıcı silme, yurtdışı e-posta kilidi |
| Takip, zaman çizelgesi, filtreler, raporlar (CSV) | Var |
| Devir kartı, müşteri, anlaşma silme | Var |

## Kodun durumu
- `main` GitHub'da güncel; tüm özellik dalları `main`'e birleşti (`feature/p14…p19a`, `p16a`, `p18a/b`).
- Testler (son çalıştırma): **766** birim, **433** pgTAP, Deno (Edge Function) değişmedi. Tip kontrolü ve lint temiz.
- Yerel yedek provası (2026-10-11): 582 işletme + 2.193 kanal temiz veritabanına birebir geri yüklendi (`docs/qa/backup-restore.md`).

## Buluta gitmesi gerekenler (senin `db push`'un)
Yeni migration'lar: `20261010100000_foreign_email_lock`, `…101000_draft_queue`, `…102000_draft_queue_release`,
`…103000_country_compliance`, `…104000_delete_customer_deal`. Her `db push` sonrası `.\baslat.cmd build` ve `Ctrl+F5`.

## Faz tablosu (BACKLOG ile uyumlu)
| Faz | Durum |
|---|---|
| G0 temizlik, G1 buluta taşıma | ☑ |
| G2 küresel veri modeli | ☑ kod; bulutta kullanımda |
| G3 keşif motoru + taslak kuyruğu (ADR 0014/0018) | ☑ kod |
| G4 çok dilli AI | ◐ TR/EN taslak ve cevap sınıflandırma ✔; değerlendirme seti ve koşucu hazır (ADR 0020), **gerçek ölçüm sonucu bekleniyor** |
| G5 ülke bazlı uyum (ADR 0019) | ☑ kod; listeden çıkma bağlantısı da eklendi (ADR 0023, bulutta denenmedi) |
| G6 günlük kullanım eksikleri | ☑ MVP kapsamı; kalanlar gerekçeyle "MVP sonrası" |
| G7 sunucu tarafı otomasyon, G8 yeni kanallar, G9 Jarvis işlemleri, G10 üretim | ☐ MVP sonrası |

## MVP sonrası (bilinçli ertelenen)
1. Uygulama kapalıyken çalışma: tarama, taslak kuyruğu, e-posta okuma (G7).
2. (Yapıldı: listeden çıkma bağlantısı, ADR 0023.)
3. Instagram/Messenger otomatik cevap, WhatsApp Cloud API, reklam veren keşfi (G8).
4. Jarvis işlemleri (G9); yayın, otomatik güncelleme, tam yedekten geri yükleme provası, maliyet paneli (G10).
5. Kanal modu ayarları, zamanlı ikinci kanal, Haritalar linkiyle ekleme, presence, kayıtlı aramalar.
