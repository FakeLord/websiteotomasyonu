# Senin yapman gerekenler

Ben (Claude) bulutta veritabanı değişikliği yapmam, giriş yapmam, hesap açmam, ödeme yapmam. Bunlar senin adımların.

## 1. Buluta yeni özellikleri gönder (en önemlisi)
Önce uygulamayı kapat. Sonra sırayla:

```bash
npx supabase db push
```

```bash
npx supabase functions deploy places-search
```

- `db push` bu oturumdaki ~12 yeni migration'ı (ve G2'nin bekleyenlerini) buluta uygular. Sahte sosyal medya kayıtlarını da siler
  (silinenler önce yedek tabloya kopyalanır).
- Ardından `baslat.cmd` ile aç. Tarayıcıda `Ctrl+F5` ile yenile.

## 2. Ayarlar
- **Ayarlar → Puanlama ve Limitler → "Aylık Places çağrısı":** sayı gir (önerilen **1000**). Boşken şehir taraması başlatılamaz.
- **Bilgi Bankası:** "Şirket" türünde bir kayıt oluştur (başlık = şirket adı; ne yaptığınız, hizmetler, teklifiniz). Yoksa AI taslak
  üretmez ("şirket tanıtımı yok" hatası).
- **Tek bir Google Cloud faturalandırma hesabı** kullan (birden çoğu koşullara aykırı).

## 3. Güvenlik
- NVIDIA API anahtarı bir ekran görüntüsünde göründü → **anahtarı yenile** (eskisini iptal et), yenisini Ayarlar → API'ye gir.
- Sohbette veya ekran görüntüsünde anahtar/şifre paylaşma.

## 4. İsteğe bağlı: verileri sıfırlamak
`scripts/ops/reset-app-data.sql` dosyasını Supabase SQL Editor'da çalıştır. API'ler, ayarlar, Bilgi Bankası ve ekip kalır; işletme, arama,
konuşma verisi silinir; tarihli yedek şeması açılır. (Silme yetkisi sendedir; ben buluttaki veriyi silmem.)

## 5. İlk gerçek deneme (bulutta)
1. Keşfet → şehir yaz → **Bütün şehri tara** → 1–2 kategori + dil → Şehri bul → Taramayı başlat.
2. Üst çubukta **İşler** kutusundan ilerlemeyi ve "Bu ay X / Y çağrı" sayacını izle; Google Cloud Console kullanımıyla karşılaştır.
3. Leadler → **Fırsatlar** → birkaç işletmeye **İletişime geç**; "Ne oldu?" kutusuyla sonucu işaretle.
4. `docs/qa/phase-15-automated-prospecting.md` içindeki "Bulutta elle" kutularını işaretle.

## 6. Cevap vermen gereken kararlar
`03-kararlar.md` → "Cevap bekleyen kararlar" (yurtdışına e-posta, Places saklama politikası, referans kontrolü, taslak kuyruğu).

## 7. Sonra
- Dalları `main`'e birleştirmek ve GitHub'a göndermek (yedek için) — istersen söyle, ben yaparım.
- Yayın (`.app`) şimdilik yapılmıyor.
