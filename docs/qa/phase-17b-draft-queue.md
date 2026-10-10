# Taslak kuyruğu / Onay Bekleyenler (ADR 0018) — manuel test listesi

Ön koşul (bulut): `npx supabase db push` (20261010101000_draft_queue, 20261010102000_draft_queue_release),
sonra `baslat.cmd build` ve `Ctrl+F5`. Bilgi Bankası'nda aktif bir "Şirket" kaydı olmalı.

## Otomatik doğrulananlar
- pgTAP: `draft_queue.test.sql` (22 doğrulama: seçim kuralı, yurtdışı kilidi, sahiplik, iptal/yeniden dene, bırakma, yalıtım).
- Birim: `draft-loop.test.ts` (sıralı üretim, başarısızlık, kota/kurulum durması, art arda hata, tek tur), `nav-items.test.ts`.

## Elle (bulutta)
- [ ] Leadler → Fırsatlar → "Taslakları hazırla": dil seçilmeden "Kuyruğa al" pasif.
- [ ] Dil seç, adet 3 → "3 işletme için taslak kuyruğa alındı"; İşler kutusunda "Taslak kuyruğu" ilerler.
- [ ] Hazırlanan taslaklar Onay Bekleyenler'de görünür; kenar çubuğu rozeti sayıyı gösterir.
- [ ] Taslak metni seçilen dilde ve Bilgi Bankası dışında fiyat/referans içermiyor.
- [ ] "Türkçesini göster" İngilizce taslağın çevirisini getirir.
- [ ] "Düzenle (Konuşmalar)" konuşmayı açar; orada düzenleyip gönderebilirsiniz.
- [ ] "Onayla ve gönder" (kendi adresinize bağlı bir test işletmesiyle): e-posta gider, taslak listeden kalkar, aşama ilerler.
- [ ] "Reddet": taslak listeden kalkar.
- [ ] Yurtdışı e-posta kapalıyken ABD işletmeleri kuyruğa alınmaz; Ayarlar'dan açınca alınır.
- [ ] Şirket kaydı yokken kuyruk "Şirket kaydı yok" ile durur, iş başarısız sayılmaz; kayıt eklenince sürer.
- [ ] Başarısız iş varsa "Başarısızları yeniden dene" çalışır; "Bekleyenleri iptal et" bekleyenleri iptal eder.
- [ ] Aynı işletme ikinci kez kuyruğa alınmaz.
