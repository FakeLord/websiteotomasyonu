# Oturumda yapılanlar

Konuya göre gruplanmıştır (kronoloji için `git log` bakınız).

## 1. Hız ve kararlılık
- **Toplu analiz donması:** kök neden `extractContacts` içindeki e-posta düzenli ifadesinin felaket geri izlemesiydi (34 sn → 1 sn).
  Düzenli ifadeler sınırlandırıldı; analiz Web Worker'da çalışıyor.
- **Arka plan analizi:** analiz edilmemiş her işletme sayfadan bağımsız, kilitli (lease) bir kuyrukla otomatik analiz edilir.
  Üst çubukta ilerleme gösterilir.
- **"Açılmıyor" yanlışları:** bot korumalı siteler (401/403/406/429) ayrı etiketlenir; SSL zinciri eksik siteler yeniden denenir.

## 2. Yapay zekâ taslakları
- İlk mesaj baştan tasarlandı: yazılım şirketi, premium "canlı hissiyatlı" siteler, mobil uygulama, otomasyon. Teklif: kısa görüşme +
  işletmeye özel ücretsiz örnek tasarım.
- **Yalnızca Türkçe ve İngilizce; varsayılan dil yok.** Türkçe çeviri arka planda gösterilir.
- Uzunluk iki kez ayarlandı: e-posta 60–80 kelime, DM 35–45 kelime.
- Hız: önbellek, kısa prompt, ayrı çeviri çağrısı.
- Güvenlik kontrolü (`validateDraft`) yanlış alarmları azaltıldı (işletme adı varyantları, selamlama, para birimleri).
- **Yeni:** kontrolden geçemeyen taslak kullanıcıya gösterilmeden en çok 3 kez yeniden üretilir; Türkçe metne karışan İngilizce
  kelime ("strengthen" vakası) yakalanır (prompt sürüm 8).

## 3. Müşteri bulma (G3 / ADR 0014, 0015)
- **Şehir taraması:** şehir sınırı Places'tan alınır, kategori başına kareler taranır; 60 sonuç dönen kare dörde bölünür.
  Aylık Places çağrı sınırı **sunucuda** zorlanır; sınır dolunca tarama durur (sınır yükselince/ay değişince sürer).
- **İşler kutusu** (üst çubuk): tarama, analiz, aylık Places sayacı; duraklat/sürdür/iptal/yeniden dene.
- **Fırsatlar** (Leadler): sitesi yok/açılmıyor/zayıf + faaliyette + henüz yazılmamış. Varsayılan "Yazılabilenler"
  (e-posta, cep numarası, gerçek sosyal medya). Zincirler gizlenir; "Min. yorum" süzgeci ve yoruma göre sıralama.
- **Sahte sosyal medya düzeltmesi:** analiz, sayfadaki `#çapa`/`mailto:`/göreli bağlantıları Instagram vb. sanıyordu
  (yerelde 3.422 sahte kayıt). Kök neden düzeltildi, eski kayıtlar yedeklenip temizlenir (migration).
- Cep/sabit hat ayrımı: sabit hatta WhatsApp önerilmez.
- Sektör ve şehir raporu (cevap oranı; 20'den az yazıda "az veri").

## 4. İletişim ve ilerleme takibi (ADR 0016)
- **İletişime geç** menüsü: işletmenin tüm adresleri (e-posta, WhatsApp, Instagram, Facebook, LinkedIn, TikTok, telefon) + Google Haritalar.
  Seçilen adres açılır ve temas kaydedilir.
- **"Ne oldu?" kutusu:** Yazdım / Cevap verdi / Ulaşılamadı / İlgilenmedi / Sonra (tarihli) / Vazgeçtim + not.
  Aşama otomatik ilerler (asla geriye gitmez), takip tarihi konur.
- **İlerleme sekmesi** (detay): son temas, sonraki takip, tek zaman çizelgesi.
- **Takip** sekmesi + Dashboard **"Bugünün işleri"** (Hepsi / Benim işlerim).
- Leadler süzgeçleri: son temas, son sonuç, kanal, yazan kişi. Raporlar: "Elle yapılan temaslar".

## 5. Günlük kullanım eksikleri (G6)
Lead düzenleme · toplu atama/eleme · devir kartı (devral/ata/kapat) · ekipten üye çıkarma + daveti yeniden gönderme ·
şifre değiştirme · çalışma alanı adı · kampanya düzenleme/silme.

## 6. Veri ve operasyon
- **Sıfırlama betiği** `scripts/ops/reset-app-data.sql`: tüm işletme/arama/konuşma verisini siler; API anahtarları, ayarlar,
  Bilgi Bankası ve ekip korunur; her çalıştırmada tarihli yedek şeması açar.
- NVIDIA/OpenAI sağlayıcı zinciri doğrulandı (smoke betiği); hata mesajları artık gerçek nedeni gösterir.

## 7. Başvuru ve yayın
- Claude Startups formu için iki soru (API ile ne yapılacak / Claude ile ne yapılacak) ≤500 karakter cevaplandı.
- `.app` yayını değerlendirildi: yerel Node sunucusu (site analizi, SMTP, IMAP, kişisel kasa) buluta taşınmadan statik barındırma
  olmaz. **Karar: şimdilik yayına alınmıyor.**
