# Oturum Notları — Global Business Finder

Bu klasör, 2026-10-08/09 çalışma oturumlarındaki konuşmanın **önemli yerlerini** topluyor. Kod ve ayrıntılı kararlar zaten
`docs/adr/`, `docs/phases/`, `docs/qa/` ve `docs/BACKLOG.md` içinde; bu klasör "ne konuşuldu, ne karar verildi, sırada ne var"
sorusuna tek yerden cevap vermek için.

| Dosya | İçerik |
|---|---|
| `01-proje-durumu.md` | Şu an neredeyiz: MVP durumu, dallar, testler, bulutta olmayanlar |
| `02-yapilanlar.md` | Oturumda yapılan işler, konuya göre |
| `03-kararlar.md` | Alınan kararlar ve sebepleri; cevap bekleyen kararlar |
| `04-senin-yapacaklarin.md` | Kullanıcının (senin) yapması gereken adımlar ve komutlar |
| `05-gunluk-kullanim.md` | Uygulamayı gün içinde nasıl kullanırsın (müşteri bulmadan devre kadar) |
| `06-sorunlar-ve-riskler.md` | Bilinen sınırlar, riskler, açık sorunlar |
| `07-teknik-notlar.md` | Komutlar, test/doğrulama yöntemi, bu oturumda öğrenilen teknik dersler |

## Projenin tek cümlesi
2–3 kişilik bir yazılım ajansı (premium web sitesi, mobil uygulama, otomasyon satan) için: dünya genelinde sitesi olmayan,
açılmayan veya kötü durumdaki işletmeleri bulur, analiz eder, puanlar, kişiye özel taslak mesaj hazırlar; **gönderimi her zaman
insan yapar**. Tauri 2 + React 19 + TypeScript + Supabase (bulut). Kullanıcı yalnızca web modunu (`baslat.cmd`) kullanır; arayüz Türkçedir.

## Önemli kurallar (CLAUDE.md'den özet)
- Sır/anahtar kodda, repoda, sohbette yer almaz. `.env` okunmaz.
- Eski migration düzenlenmez; her değişiklik yeni migration.
- Her yeni tabloda RLS + pgTAP izolasyon testi. Yazma RPC ile, her mutasyon activity log yazar.
- Scraping, giriş atlatma, otomatik DM yok. Mesajı insan gönderir.
- Her hata düzeltmesi önce kırmızı bir testle başlar.
