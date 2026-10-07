# BACKLOG — tek izleme listesi

Kaynak: 2026-10-07 kod/SPEC taraması ve `docs/adr/0010-global-pivot.md` (Yol Haritası v2).
Durum: ☐ bekliyor · ◐ sürüyor · ☑ bitti. Bir madde bitince buradan işaretlenir ve ilgili `docs/qa/phase-NN.md`'ye yazılır.

## Fazlar

| Kod | Faz | Ad | Durum |
| --- | --- | --- | --- |
| G0 | 12 | Temizlik ve karar kaydı | ☑ |
| G1 | 13 | Buluta taşıma | ☐ (kullanıcı adımı bekliyor) |
| G2 | 14 | Küresel veri modeli | ☐ |
| G3 | 15 | Küresel keşif motoru | ☐ |
| G4 | 16 | Çok dilli analiz ve yapay zekâ | ☐ |
| G5 | 17 | Ülke bazlı uyum ve gönderim güvenliği | ☐ |
| G6 | 18 | Günlük kullanım eksikleri (CRM) | ☐ |
| G7 | 19 | Sunucu tarafı otomasyon | ☐ |
| G8 | 20 | Yeni kanallar ve kaynaklar | ☐ |
| G9 | 21 | Jarvis işlemleri | ☐ |
| G10 | 22 | Üretim | ☐ |

## Maddeler (2026-10-07 analizindeki numaralarla)

### A. Yarım çalışan / pasif
| # | Madde | Faz | Durum |
| --- | --- | --- | --- |
| 1 | Üst çubuktaki şehir seçici yalnızca İşletme Bul ve Kampanya'da etkili → her ekranda geçerli pazar filtresi (ülke → şehir) | G2 | ☐ |
| 2 | Devir kartı devralınamıyor/kapatılamıyor/atanamıyor | G6 | ☐ |
| 3 | `secondChannelAfterDays` kullanılmıyor; kanal INVALID olunca otomatik yedek kanal yok | G6 | ☐ |
| 4 | Telefon kanalı için arama notu ekranı yok | G6 | ☐ |
| 5 | Arama iptali ve kayıtlı aramalar (`is_saved`) arayüzde yok | G3 | ☐ |
| 6 | Bildirim zili yalnızca sayaç; ses/masaüstü bildirimi yok | G6 | ☐ |
| 7 | Masaüstünde 587 portlu SMTP bağlanamıyor | G0 | ☑ (`62da7d3`) |

### B. Eksik özellikler
| # | Madde | Faz | Durum |
| --- | --- | --- | --- |
| 8 | Kalıcı veri silme RPC'si + bastırma listesi | G5 | ☐ |
| 9 | Lead düzenleme (ad, telefon, site, kategori) | G6 | ☐ |
| 10 | Leadler'de sıralama ve toplu işlem | G6 | ☐ |
| 11 | Dashboard "bugünün işleri" / "benim işlerim" | G6 | ☐ |
| 12 | Tanılama log paketi dışa aktarma | G6 | ☐ |
| 13 | Google Haritalar linkiyle işletme ekleme | G3 | ☐ |
| 14 | Google kredi/ücretsiz kota takibi ve otomatik geçiş | G3 | ☐ |
| 15 | Ekip: üye çıkarma, daveti yeniden gönderme | G6 | ☐ |
| 16 | Şifre değiştirme, profil, çalışma alanı adı | G6 | ☐ |
| 17 | Kampanya düzenleme/silme, anlaşma silme | G6 | ☐ |
| 18 | Raporlarda dışa aktarma | G6 | ☐ |
| 19 | "X düzenliyor" göstergesi (presence) | G6 | ☐ |
| 20 | Kanal modu ayarları (AUTO / ASSISTED / MANUAL) | G6 | ☐ |

### C. Büyük işler
| # | Madde | Faz | Durum |
| --- | --- | --- | --- |
| 21 | Meta ve Google reklam veren keşfi | G8 | ☐ |
| 22 | Instagram/Messenger cevaplarının otomatik gelmesi (Meta webhook) | G8 | ☐ |
| 23 | Otomatik e-posta gönderimi (sunucu tarafı, limitli) | G7 | ☐ |
| 24 | WhatsApp Cloud API (ücretli, isteğe bağlı) | G8 | ☐ |
| 25 | Jarvis'in işlem yapabilmesi | G9 | ☐ |
| 26 | Otomatik güncelleme, kod imzalama (G10) · otomatik DB yedeği (G1) | G1 / G10 | ☐ |
| 27 | Yedekten geri yükleme | G10 | ☐ |

### D. Üretim ve kullanım
| # | Madde | Faz | Durum |
| --- | --- | --- | --- |
| 28 | Buluttaki veritabanı (ekip kullanımı) | G1 | ☐ |
| 29 | IMAP ve zamanlanmış işlerin sekme kapalıyken çalışması | G7 | ☐ |
| 30 | AI taslak değerlendirme seti (TR + EN, 30'ar örnek) | G4 | ☐ |
| 31 | Bilgi Bankası'nın gerçek içeriği (hizmet, paket, fiyat, referans, SSS) | kullanıcı | ☐ |

### Küresel kapsamın getirdiği yeni işler
| Madde | Faz |
| --- | --- |
| Ülke, bölge, posta kodu, saat dilimi, dil alanları; ülke referans verisi | G2 |
| Ülkeye göre telefon ve adres ayrıştırma; dil bağımsız arama | G2 |
| İşletmenin saat diliminde gönderim penceresi ve ülke tatilleri | G2 |
| Karo tarama (60 sonuç sınırını aşma), kapsama takibi | G3 |
| Tarama bütçesi (iş başına ve aylık USD sınırı), maliyet tahmini | G3 |
| Kategori sözlüğü (Google yer tipleri + dile göre anahtar kelime) | G3 |
| Places verisi saklama/yenileme politikası | G3 |
| Dil tespiti, çok dilli site analizi | G4 |
| Hedef dilde taslak + Türkçe çeviri; dil bağımsız guardrail'ler | G4 |
| Çok dilli STOP ve otomatik yanıt tespiti | G4 |
| Ülke kuralları (soğuk e-posta durumu, alt bilgi, yerel saat) | G5 |
| Listeden çıkma bağlantısı (`List-Unsubscribe`) | G5 |
| Maliyet ve kullanım paneli (Places, AI, e-posta) | G10 |

### Gerçek hesapla denenmemiş (her fazın QA listesinde)
E-posta gönderme ve cevabın otomatik gelmesi · OpenAI anahtarı ve NVIDIA'ya düşme · kampanya akışı ·
harita karoları ve dosya indirme · iki kullanıcının aynı anda çalışması.
