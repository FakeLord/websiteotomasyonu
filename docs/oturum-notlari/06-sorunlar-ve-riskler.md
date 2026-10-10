# Bilinen sorunlar, sınırlar ve riskler

## Yapay zekâ
- **Türkçe kalitesi** kullanılan modele bağlı. NVIDIA'nın küçük modeli bozuk cümle kurabiliyor ("değerli müşterilerinizi olan",
  "layık", yabancı kelime karışması). Yabancı kelime artık yakalanıyor; **dil bilgisi hatası kodla yakalanamaz**.
  OpenAI anahtarı tanımlı ve ilk sıradaysa kalite belirgin iyileşir (zincir sırası: openai → nvidia).
- Reddedilen taslak 3 kez yeniden üretilir; kötü durumda taslak süresi 3 katına çıkabilir.
- Referans kontrolü katı: işletme adının küçük yazım farkları ("Mesut Aksoy" → "Akyol") reddedilir. Bu doğru davranıştır
  (yanlış adla mesaj gitmesin); yeniden üretim çoğunlukla çözer.

## Google Places
- Maliyet: arama alanları (web sitesi, telefon, puan) **Enterprise** kademesidir; 1000 çağrı/ay ücretsiz kota, sonrası ücretli
  (güncel fiyatı resmi sayfadan doğrula). Bir çağrı en çok 20 işletme döndürür.
- Saklama koşulları: `place_id` süresiz; diğer içerik sınırlı; enlem/boylam en çok 30 gün. Politika kararı bekliyor (`03-kararlar.md`).
- Çok fazla yoğun bölgede kare 6 kez bölünür; çok yoğun şehir × çok kategori saatler sürebilir.
- **Tarama yalnızca uygulama sekmesi açıkken ilerler.**
- Şu an yerelde gerçek Google anahtarı olmadığı için tarama **bulutta hiç denenmedi**.

## İletişim
- Instagram/WhatsApp'ta cevabın gelip gelmediğini uygulama göremez (otomatik DM okuma yok); "Cevap verdi"yi sen işaretlersin.
- Cep numarası WhatsApp kullanmıyor olabilir; bunu önceden doğrulamanın izinli yolu yok.
- İki kişi aynı işletme için aynı anda bağlantı açarsa iki temas kaydı oluşur (engellenmez, zaman çizelgesinde görünür).
- Sonucu girilmiş temastan vazgeçilemez; aşama geri alınmaz.
- İçe aktarma, aynı alan adı/telefon/e-posta/sosyal hesabı paylaşan kayıtları **tek kayıtta birleştirir**; yani zincirin şubeleri
  çoğunlukla ayrı kayıt olmaz. Zincir tespiti yalnızca birebir aynı adı yakalar ("Özel Dentpark Kadıköy/Şişli" gibi ada ilçe eklenmişleri yakalamaz).

## Uyum / hukuk
- **Yurtdışına soğuk e-posta için ülke kuralları yok (G5).** CAN-SPAM, PECR, CASL, Spam Act ve KVKK/İYS gibi kurallar doğrulanmadı;
  hukuk danışmanı yok. Bu yüzden yabancı ülkeye e-posta gönderimini açmadan önce karar gerekir.
- Kalıcı veri silme (silme talebi) ve bastırma listesi yok.

## Altyapı
- Yerel Node sunucusu (site analizi, SMTP, IMAP, kişisel kasa) buluta taşınmadı → yayın ve "uygulama kapalıyken çalışma" yok (G7/G10).
- Otomatik DB yedeği, yedekten geri yükleme, otomatik güncelleme, kod imzalama yok (G10).
- Buluta gitmeyen değişiklikler yalnızca bu bilgisayarda commit'li; **GitHub'a gönderilmedi**.

## Veri kalitesi
- Bulut verisindeki eski puanlar sahte sosyal medya kanallarına göre hesaplanmıştı. `db push` sonrası **Ayarlar → Puanlama ve Limitler → Kaydet**
  tüm puanları yeniden hesaplar.
- Yeni bulunan işletmeler analizleri bitene kadar "yazılamaz" görünür (e-posta/sosyal medya sitelerinden çıkarılır).

## 2026-10-11 ek: ülke uyumu ve kapanış turu
- **Hukuk danışmanı yok.** Ülke kuralları resmi/ikincil kaynaklardan derlenmiş muhafazakâr varsayılanlardır; CASL "10 iş günü" ve
  Avustralya ceza rakamı doğrulanamadı. Ayrıntı: `docs/adr/0019-country-compliance.md`.
- **Tüzel kişi / şahıs ayırt edilemez** (İngiltere, Türkiye esnaf). Türkiye İYS kaydı ve ret sorgusu otomatik değil, gönderendedir.
- **Listeden çıkma bağlantısı yok**, yalnızca yanıtla çıkma; uygulama kapalıyken gelen çıkma cevapları açılınca işlenir.
- **`activity_logs` yalnızca-ekle** olduğu için kalıcı silmeden önce yazılmış kayıtların özetinde işletme adı kalabilir.
- **Ücretsiz NVIDIA** hız/kota belirsizdir; taslak 5–25 sn sürer, bazen JSON dışı yanıt verir (yeniden denenir). Türkçe dil bilgisi
  hatası kodla yakalanamaz; Onay Bekleyenler'deki insan okuması son süzgeçtir.
- **Kuyruk sekme açıkken ilerler** (tarama, analiz, taslak). Sunucu tarafı çalıştırma G7'dedir.
