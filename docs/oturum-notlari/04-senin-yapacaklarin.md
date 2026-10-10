# Senin yapman gerekenler

Ben (Claude) bulutta veritabanı değişikliği yapmam, giriş yapmam, hesap açmam, ödeme yapmam. Bunlar senin adımların.
PowerShell'de komutların başına `.\` koy (örn. `.\baslat.cmd build`); `npx`/`corepack` bulunamazsa önce
`$env:Path += ";C:\Program Files\nodejs;C:\nvm4w\nodejs"`.

## 1. Buluta yeni özellikleri gönder (en önemlisi)
Önce uygulamayı kapat. Sonra sırayla:

```bash
npx supabase db push
```

```bash
.\baslat.cmd build
```

Tarayıcıda `Ctrl+F5`. (`db push` listesinde `…foreign_email_lock`, `…draft_queue`, `…draft_queue_release`,
`…country_compliance`, `…delete_customer_deal` görünür; hepsine "Yes".)

## 2. Ayarlar
- **Ayarlar → Puanlama ve Limitler → "Aylık Places çağrısı":** sayı gir (öneri **1000**).
- **Ayarlar → Genel → Gönderen kimliği:** şirket adı ve posta adresi (ABD/İngiltere/Kanada/Avustralya için zorunlu).
- **Bilgi Bankası:** "Şirket" kaydı (zorunlu), hizmet/paket, fiyat aralığı, gerçek referans, SSS. Taslak kalitesi buna bağlı.
- **Ayarlar → API:** NVIDIA anahtarını **yenile** (ekran görüntüsünde görünen eski anahtarı iptal et), OpenAI'yi boş bırak
  (ücretsiz çalışma). Tek Google Cloud faturalandırma hesabı kullan.
- Yurtdışına e-posta göndermek istiyorsan: Ayarlar → Puanlama ve Limitler → "Yurtdışı işletmelere e-posta göndermeye izin ver"
  (varsayılan kapalı; ülke kuralları ayrıca uygulanır).

## 3. AI kalite ölçümü (ücretsiz NVIDIA)
Aynı PowerShell penceresinde, anahtarı **tırnak içinde** ve yalnızca kendi terminalinde gir:

```bash
$env:NVIDIA_API_KEY = "nvapi-YENI-ANAHTARIN"
```

```bash
npx tsx scripts/eval/run.ts
```

Çıkan **özet bölümünü** (anahtar görünmeden) paylaş; hedef: Türkçe ve İngilizce taslakta ≥ %90 kullanılabilir, "yazmayın"
yakalama %100.

## 4. Kabul testi
`docs/qa/mvp-acceptance.md` listesini bulutta baştan sona bir kez yap (test için kendi ikinci e-posta adresini kullan, gerçek
işletmeye mesaj gönderme). Takılan adımın ekran görüntüsünü at.

## 5. Yedek
GitHub → Actions → "Haftalık veritabanı yedeği" → Run workflow. Başarılıysa tamam; başarısızsa depo sırlarını kontrol et
(`SUPABASE_DB_URL` = Session pooler dizesi, `BACKUP_PASSPHRASE` = uzun parola; parolayı parola yöneticisine kaydet).

## 6. İsteğe bağlı
- Verileri sıfırlamak: `scripts/ops/reset-app-data.sql` (Supabase SQL Editor; silme yetkisi sendedir).
- Klasördeki `Yeni WinRAR ZIP arşivi.zip` git dışındadır; gereksizse sil.

## 7. Cevap vermen gereken kararlar
`03-kararlar.md` → "Cevap bekleyen kararlar" (Places saklama politikası, referans kontrolü).
