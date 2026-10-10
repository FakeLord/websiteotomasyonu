# Kararlar

## Verilmiş kararlar
| Konu | Karar | Neden |
|---|---|---|
| Mesaj dilleri | Yalnızca **Türkçe ve İngilizce**; **varsayılan dil yok**, her seferinde seçilir | Almanca kaldırıldı; yanlış dilde mesaj riski |
| Teklif | Kısa görüşme + işletmeye özel **ücretsiz örnek tasarım** | Şirket bir yazılım şirketi (premium siteler, mobil, otomasyon) |
| Mesaj uzunluğu | E-posta 60–80, DM 35–45 kelime | Kullanıcı "ne uzun ne kısa, temel bilgiler" istedi |
| Taslak hızı | "İlk üç öneri" uygulandı (önbellek, kısa prompt, ayrı çeviri) | Taslak çok yavaştı |
| Otomasyon seviyesi | **B**: tarama planı + taslak kuyruğu (iki adım); gönderim hep insanda | Güvenlik ve platform kuralları |
| Tarama bütçesi | **Aylık Places çağrı sınırı** (önerilen başlangıç 1000) | Sade; sunucu zorlar |
| Birden çok Google fatura hesabı | **Hayır** | Kotayı çoğaltmak Google koşullarına aykırı; tek hesap, tek anahtar |
| Sıfırlama | Tüm işletme/geçmiş silinir; **API'ler, ayarlar, Bilgi Bankası kalır** | Kullanıcı isteği; betik yedek alır |
| Zincir kuralı | Aynı ad + kategori + **en az 3 farklı ilçe** | Dar tutuldu: yanlış pozitif gerçek lead'i saklar |
| Fırsat varsayılanı | Yalnızca **yazılabilen** işletmeler | "Garanti iletişim adresi olanlar" isteği |
| Kampanya düzenleme | Kanal ve segment kilitli | Üyeler ve taslaklar ona göre hazırlanır |
| Devir kartı | İşletme başına tek **etkin** (açık/devralınmış) kart | Çift kart karışıklığı |
| Yayın | **Şimdilik yayına alınmıyor** | Kullanıcı kararı (2026-10-09) |
| Yurtdışına e-posta | **Varsayılan kapalı**; yalnızca yönetici açar (ADR 0017). Açık olsa bile ülke kuralları uygulanır (ADR 0019) | Hukuk danışmanı yok; en sıkı varsayılan (2026-10-10) |
| Taslak kuyruğu | Arka planda taslak + "Onay Bekleyenler"; gönderim hep insanda (ADR 0018) | ADR 0014 Adım 2 (2026-10-10) |
| AI sağlayıcısı | **Yalnızca ücretsiz NVIDIA**; OpenAI anahtarı yok (ADR 0020) | Kullanıcı kararı (2026-10-10) |
| Çıkma yolu | E-posta altında "yanıtla çık"; listeden çıkma bağlantısı G7'ye | Kimliği doğrulanmış herkese açık uç gerekir (ADR 0019) |
| Kalıcı silme | Yalnızca ADMIN, sebep zorunlu; özetler bastırma listesine yazılır | Silme talebi + yeniden içe aktarmayı önleme |
| Kanal modu ayarları, zamanlı ikinci kanal | MVP sonrası (G7 ile) | Sunucu otomasyonu olmadan işlevsiz |

## Cevap bekleyen kararlar
1. **Places verisi saklama politikası** (Google koşulları: `place_id` süresiz, diğer içerik sınırlı, enlem/boylam en çok 30 gün):
   - A: işlenen lead'leri 30 günde bir yenile, dokunulmamışların Places alanlarını temizle
   - B: yalnızca "eski veri" uyarısı
   - C: ertele
   *Cevap verilmedi; şimdilik `places_refreshed_at` izleniyor, silme yok.*
2. **Referans kontrolü:** her istisna için kural eklemek yerine tersine çevirmek (yalnızca Bilgi Bankası'nda doğrulanmayan
   referans adlarını reddet). *Cevap verilmedi.*
