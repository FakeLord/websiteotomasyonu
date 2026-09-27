# Yeniden Tasarım + AI Zinciri + Kapsam Genişletmesi — Manuel QA Listesi

Kaynak: `docs/adr/0007-redesign-and-scope-extension.md` (2026-09-27).

## Bu oturumda doğrulananlar

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil (269 test), `pnpm test:db` 124/124 pgTAP,
      `pnpm test:edge` 10/10 Deno testi.
- [x] AI zinciri gerçek çağrıyla: OpenAI anahtarı yokken atlandı, NVIDIA (`nemotron-3.5-lightning`)
      ~4 sn'de şemaya uygun JSON döndü; `ai_runs`'a sağlayıcı bazında satır yazıldı.
- [x] Jarvis: "Esenyurt'ta 50+ skorlu web sitesi olmayan diş klinikleri" → doğru Leadler filtresi
      önerisi (2–5 sn); haftalık performans sorusu bağlamdaki sayılarla cevaplandı.
- [x] Tarayıcı önizlemesinde (Tauri dışı, yerel Supabase): Dashboard, Leadler (URL filtreleri),
      Lead detayı → AI taslak → "Konuşmaya Kaydet" → Konuşmalar'da taslak görünüyor; İşletme Bul
      gerçek arama (60 sonuç, 19 yeni, 41 tazelendi, puanlar kaydedildi); Kampanya oluştur → segment
      doldur → detay; Raporlar; Ayarlar → API ve Yapay Zeka.
- [x] Bulunan ve düzeltilen hatalar (her biri önce kırmızı testle):
  - Places puanı/yorum sayısı/işletme durumu hiç kaydedilmiyordu (skor kuralları tetiklenmiyordu).
  - İlçe/şehir aramaya yazılan metinden alınıyordu; artık Google adresinden ayrıştırılıyor.
  - Follow-up "Onayla ve Gönder" mesajı iletmeden SENT işaretliyordu.
  - `outreach_guard` teslimden sonra çalışıyordu; müşteri cevap verse bile yanıtı 72 saat engelliyordu.
  - `validateDraft` alıcının kendi adının kısaltmasını ve ilçe/kategori adlarını referans sayıyordu.
  - AI sınıflandırma başarısız olunca yapıştırılan müşteri cevabı kayboluyordu.
  - Aynı tabloyu iki ekran dinleyince realtime aboneliği çöküyordu.

## Kullanıcı tarafından doğrulanmalı (kurulu uygulamada)

- [ ] `pnpm --filter @lbf/desktop build:local` ile kurulum → giriş → tüm menüler açılıyor.
- [ ] Ayarlar → API ve Yapay Zeka'ya OpenAI API anahtarı girilince taslakların OpenAI'dan geldiği
      (Raporlar → Ekip → AI kullanımı'nda `openai · başarılı`); anahtar geçersizken NVIDIA'ya düştüğü.
- [ ] Ayarlar → E-posta → "Test e-postası gönder" gerçek SMTP ile.
- [ ] Konuşmalar'da e-posta taslağını "Onayla ve Gönder" → e-posta ulaşıyor; Instagram taslağında
      panoya kopyalanıp ig.me açılıyor; 1. follow-up planlanıyor.
- [ ] Teklif Aşaması kanbanında sürükle-bırak; Kazanıldı'ya bırakınca anlaşma diyaloğu, Müşteriler'de görünüm.
- [ ] Kampanya: başlat → "Sıradaki N taslağı hazırla" → Konuşmalar'da gönder → kampanyada üye SENT;
      müşteri cevabı eklenince REPLIED.
- [ ] İşletme Bul haritası kurulu uygulamada (CSP: yalnızca `tile.openstreetmap.org`) karoları yüklüyor.
- [ ] Mevcut 15 eski kaydın puanları hâlâ boş: aynı aramayı tekrar çalıştırmak veya Ayarlar → Puanlama
      "Kaydet" ile toplu yeniden skorlama.

## Bilinçli sınırlamalar

- Otomatik gönderim (Level 2), WhatsApp Cloud API, Meta webhook, updater/imzalama yok.
- Places fotoğrafları kullanılmıyor (ücretli); işletmeler baş harf avatarıyla gösteriliyor.
- Müşteri gelir toplamlarında yalnızca TRY anlaşmalar toplanıyor (kur tutulmuyor).
