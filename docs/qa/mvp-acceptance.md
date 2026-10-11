# MVP kabul testi (uçtan uca) — tek liste

Bu liste MVP'nin "bitti" sayılması için baştan sona bir kez, gerçek bulut ortamında yapılır. Her adım geçilince kutuyu
işaretleyin; takılan adımın ekran görüntüsünü (anahtar/şifre görünmeden) paylaşın. Ayrıntılı kontroller faz listelerindedir
(`docs/qa/phase-*.md`).

## 0. Hazırlık (bir kez)
- [ ] `npx supabase db push` hatasız ("Applying migration" satırları, "Finished").
- [ ] `npx supabase functions deploy places-search` hatasız.
- [ ] `.\baslat.cmd build` ile açıldı, tarayıcıda `Ctrl+F5` yapıldı; giriş çalışıyor.
- [ ] Ayarlar → Puanlama ve Limitler: **Aylık Places çağrısı** dolu (öneri 1000).
- [ ] Ayarlar → API: NVIDIA anahtarı **yenilenmiş** ve girilmiş (ekran görüntüsünde görünen eski anahtar iptal edildi).
- [ ] Bilgi Bankası: "Şirket" kaydı (ne yaptığınız, teklifiniz) + varsa hizmet/paket, fiyat aralığı, gerçek referans, SSS.
- [ ] Ayarlar → Genel → **Gönderen kimliği**: şirket adı ve posta adresi.
- [ ] Ayarlar → E-posta Hesabı: SMTP/IMAP test bağlantısı başarılı.

## 1. Bul → analiz et → puanla
- [ ] Keşfet: küçük bir şehir + 1 kategori ile "Bütün şehri tara" → İşler kutusunda ilerleme ve "Bu ay X / Y çağrı".
- [ ] Bulunan işletmeler Leadler'e düşer, birkaç dakika içinde analiz edilip puanlanır.
- [ ] Leadler → Fırsatlar: sitesi olmayan/zayıf, yazılabilir işletmeler listelenir.

## 2. Taslak (ücretsiz NVIDIA)
- [ ] Bir lead'de "AI Taslak": dil seç → taslak gelir (TR veya EN), güvenlik kontrolünden geçmeyen gösterilmez.
- [ ] Fırsatlar → "Taslakları hazırla" (3 işletme) → İşler kutusunda "Taslak kuyruğu" → Onay Bekleyenler'e düşer.
- [ ] Bilgi Bankası dışında fiyat/referans/indirim içeren taslak yok.

## 3. Gönder (yalnızca kendi adresinize bağlı test işletmesiyle)
- [ ] Test işletmesi ekle (e-postası kendi ikinci adresiniz). Onay Bekleyenler → "Onayla ve gönder" → e-posta gider.
- [ ] Giden e-postanın sonunda şirket adı, posta adresi ve çıkma satırı var.
- [ ] Aynı işletmeye hemen ikinci gönderim engellenir (soğuma / aynı içerik).
- [ ] Yurtdışı işletmeye e-posta kapalıyken reddedilir; Ayarlar'dan açınca (ve gönderen adresi varken) ülke kuralına göre geçer.

## 4. Cevabı işle
- [ ] Test adresinden cevap yazın → gelen kutusu cevabı konuşmaya düşürür, zilde sayaç artar (ses açıksa çalar).
- [ ] "İlgileniyorum" tipi cevapta niyet doğru; "bir daha yazmayın / unsubscribe" cevabında işletme DNC olur.
- [ ] Giden e-postanın altında "Listeden çıkmak için tıklayın" bağlantısı var; tıklayınca "Listeden çıkarıldınız" yazar ve işletme DNC olur (Gmail'de başlıkta "Abonelikten çık" da görünür). İkinci tıklamada "zaten çıkarıldınız" yazar.
- [ ] "Ne oldu?" kutusu ve İlerleme sekmesi: aşama ilerler, takip tarihi konur, Dashboard "Bugünün işleri"nde çıkar.

## 5. Devret ve kapat
- [ ] Lead'i teklif aşamasına taşıyıp devir kartını devral/ata/kapat.
- [ ] Müşteri (WON) → Müşteriler'de anlaşma kaydı; yönetici anlaşmayı silebilir.
- [ ] Raporlar'da sekmeler dolu ve "CSV'ye aktar" çalışır.

## 6. Güvenlik ve veri
- [ ] Üye (MEMBER) hesabı: ayar değiştiremez, kalıcı silme/anlaşma silme görünmez.
- [ ] Yönetici: bir test işletmesini "Kalıcı sil" → kayıt gider; aynı e-postayla yeniden eklenince DNC olur.
- [ ] Ayarlar → Veri: JSON dışa aktarma ve tanılama özeti çalışır.
- [ ] GitHub → Actions → "Haftalık veritabanı yedeği" elle çalıştırıldı ve başarılı (SUPABASE_DB_URL, BACKUP_PASSPHRASE sırları tanımlı).

## 7. Müşteri detay sayfası (ADR 0024)
- [ ] Müşteriler → bir satıra tıkla: detay sayfası açılır (Genel, Hesaplar ve hizmetler, Belgeler, Geçmiş).
- [ ] "Hesap ekle" ile Alan adı, Hosting ve Paket kalemi ekle; istediğin kadar eklenebilir, düzenlenir. Yenileme tarihini 10 gün sonraya ver: Genel'de "Yaklaşan yenilemeler"de çıkar.
- [ ] Belgeler → "Belge yükle": bir PDF fatura yükle (fatura no + tutar); listede görünür, indir simgesi dosyayı açar.
- [ ] 10 MB'tan büyük veya .exe dosyası reddedilir.
- [ ] Yönetici olmayan üye silme simgesini görmez; yönetici belgeyi silince dosya da kalkar.
- [ ] Şifre alanı yoktur (bilinçli): not alanına şifre yöneticisi kaydı yazılır.

## 8. Kapanış
- [ ] `docs/BACKLOG.md` içinde MVP kapsamındaki maddelerin hepsi ☑ veya gerekçeli "MVP sonrası".
- [ ] Bu liste tamamlandıysa MVP "bitti" olarak işaretlenir; `docs/oturum-notlari/01-proje-durumu.md` güncellenir.

> **Yerelde doğrulananlar (2026-10-11, yerel Supabase + web kipi, bulut verisine dokunulmadı):** Bölüm 4 → listeden çıkma
> bağlantısı (ilk tıklama, ikinci tıklama, POST; işletme DNC, log düştü); Bölüm 6 → kalıcı silmede dosya kovadan da kalktı;
> Bölüm 7 → hesap ekleme, yenileme uyarısı, belge yükleme/indirme, .exe ve 10 MB üstü reddi; Onay Bekleyenler kanal etiketi.
> Gerçek bulut, SMTP/IMAP, NVIDIA ve GitHub yedeği bu turda denenemedi; kutular işaretsiz bırakıldı.

## 9. Ekip: kullanıcı oluşturma ve profil
- [ ] Ekip → **Kullanıcı Oluştur**: e-posta + rol gir, şifre boş bırak → hesap oluşur, üretilen şifre bir kez gösterilir; o e-posta ve şifreyle (başka bilgisayarda/tarayıcıda) giriş yapılır, davet kodu istenmez.
- [ ] Aynı e-postayla ikinci kez oluşturmak "zaten kayıtlı" der (davet yolunu önerir).
- [ ] Yönetici olmayan üye "Kullanıcı Oluştur"u görmez.
- [ ] Üst sağdaki kullanıcı menüsü → **Profilim**: ad soyad değiştirilir, şifre değiştirilir.
