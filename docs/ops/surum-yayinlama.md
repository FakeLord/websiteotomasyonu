# Yeni sürüm yayınlama ve otomatik güncelleme

ADR 0026. Uygulama .exe kurulum sihirbazıyla dağıtılır ve her bilgisayarda yerel çalışır. Kurulu uygulama, açılışta ve altı
saatte bir yeni sürüm olup olmadığına bakar; varsa üstte "Yeni sürüm hazır" şeridi çıkar, **Şimdi güncelle** ile kurulur.

## Nasıl çalışır
```
git etiketi (v0.1.1)  →  GitHub Actions "Release"  →  imzalı kurulum dosyası
        →  Supabase Storage / app-updates (herkese açık):  latest.json + lbf_0.1.1_x64-setup.exe
        →  kurulu uygulamalar latest.json'ı kontrol eder, imzayı doğrular, indirip kurar
```
- **İmza** güncellemenin sahte olmasını engeller: uygulama yalnızca sizin özel anahtarınızla imzalanmış paketi kurar.
- Güncelleme adresi GitHub değil Supabase'tir, çünkü depo özeldir (özel depodan oturumsuz indirme yapılamaz).
- Güncelleme dosyaları herkese açıktır ama sır içermez (Supabase adresi ve anon anahtarı zaten uygulamaya gömülüdür).

## 1) Bir kez: imza anahtarı
Anahtar çifti `C:\Users\civan\.tauri\` klasöründe üretildi (depoya girmez):

| Dosya | Ne | Nereye |
| --- | --- | --- |
| `lbf-updater.key` | **Özel** anahtar | GitHub sırrı `TAURI_SIGNING_PRIVATE_KEY` |
| `lbf-updater.pass` | Anahtar parolası | GitHub sırrı `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| `lbf-updater.key.pub` | Genel anahtar | Zaten `tauri.conf.json`'da |

> **Özel anahtarı ve parolayı yedekleyin** (parola yöneticisi, ikinci bir yer). Kaybederseniz kurulu uygulamalara bir daha
> güncelleme gönderemezsiniz; herkes yeniden elle kurmak zorunda kalır. Anahtarı sohbete, e-postaya veya depoya yazmayın.

Anahtar dosyalarını GitHub'a yazdıktan sonra `lbf-updater.pass` dosyasını silin (parola yöneticisine taşıyın).

## 2) Bir kez: GitHub sırları
GitHub → depo → **Settings → Secrets and variables → Actions → New repository secret**:

| Sır | Değer |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | `lbf-updater.key` dosyasının **içeriği** (Not Defteri'nde açıp tamamını kopyalayın) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `lbf-updater.pass` içeriği |
| `VITE_SUPABASE_URL` | `.env` dosyanızdaki `VITE_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `.env` dosyanızdaki `VITE_SUPABASE_ANON_KEY` |
| `SUPABASE_URL` | `VITE_SUPABASE_URL` ile aynı |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** (gizli; yalnızca burada durur) |

(Yedek iş akışı da aynı `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` sırlarını kullanır.)

## 3) Bir kez: veritabanında güncelleme kovası
```bash
npx supabase db push
```
Bu, herkese açık `app-updates` kovasını oluşturur.

## 4) Her yeni sürümde
1. `apps/desktop/src-tauri/tauri.conf.json` içinde `"version"` değerini artırın (ör. `0.1.0` → `0.1.1`) ve
   `apps/desktop/package.json` içindeki `version` alanını aynı yapın. Sürüm her seferinde **artmalıdır**; aynı veya küçük
   sürüm güncelleme sayılmaz.
2. Commit edip `main`'e gönderin.
3. Etiketi atın:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. GitHub → Actions → **Release** çalışır (10–15 dakika). Başarılıysa:
   - GitHub → Releases'ta taslak sürüm (kurulum dosyası yedeği),
   - `app-updates` kovasında `latest.json` ve `lbf_0.1.1_x64-setup.exe`.
5. Kurulu uygulamalar bir sonraki kontrolde (açılış / 6 saat) güncellemeyi görür.

Etiket sürümü `tauri.conf.json` ile uyuşmazsa iş akışı bilerek durur.

## 5) İlk kurulum dosyasını dağıtmak
Release iş akışı bittikten sonra GitHub → Releases → taslak sürümdeki `*-setup.exe` dosyasını indirip kullanıcılara verin
(veya `app-updates` kovasındaki dosyayı kullanın). Kurulum **kullanıcı bazlıdır** (yönetici hakkı gerekmez); veri ve şifreler
o bilgisayarın Windows Kimlik Bilgisi Yöneticisi'nde kalır ve güncellemede korunur.

## Windows "Bilinmeyen yayımcı" uyarısı
Kurulum dosyası Windows kod imzalama sertifikasıyla **imzalı değildir** (ücretli, yılda yaklaşık 130–300 USD). İlk kurulumda
SmartScreen "Windows bilgisayarınızı korudu" gösterebilir: **Ek bilgi → Yine de çalıştır**. Uygulamanın kendi güncelleme
imzası bundan bağımsızdır ve çalışır. İleride sertifika alınırsa yalnızca `release.yml`'e imzalama adımı eklenir.

## Sorun giderme
| Belirti | Sebep / çözüm |
| --- | --- |
| Actions "Eksik depo sırrı" | Bölüm 2'deki sırlardan biri tanımlı değil |
| Actions "Etiket … sürümü … uyuşmuyor" | `tauri.conf.json` sürümünü etikete göre güncelleyin |
| Uygulama güncelleme görmüyor | Sürüm yeni mi? `app-updates/latest.json` herkese açık adresten açılıyor mu? Çevrimdışı mı? |
| "İmza doğrulanamadı" | Kurulu uygulamayı üreten anahtarla yayını imzalayan anahtar farklı; aynı anahtar kullanılmalı |
| Windows'ta derleme "yol bulunamıyor" (yerelde) | Yol çok uzun; `CARGO_TARGET_DIR=C:\lbf-target` kullanın (Actions'ta sorun olmaz) |
