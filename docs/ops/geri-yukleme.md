# Yedekten geri yükleme (prova ve gerçek durum)

ADR 0026. Haftalık yedek her pazartesi 03:00 UTC'de GitHub Actions'ta alınır (`Haftalık veritabanı yedeği`). İki çıktı üretir:

| Çıktı | İçerik | Dosya |
| --- | --- | --- |
| `db-backup` | Veritabanı (`public` + `auth` şemaları: tablolar, veri, işlevler, RLS politikaları) | `backup-YYYYMMDD.dump.gpg` |
| `storage-backup` | Müşteri belgeleri / faturalar (`customer-files` kovası) | `storage-YYYYMMDD.tar.gz.gpg` |

İkisi de AES-256 ile `BACKUP_PASSPHRASE` parolasıyla şifrelidir. **Parola kaybolursa yedek açılamaz**; parola yöneticisinde saklayın.
Actions çıktıları **30 gün** saklanır: ayda bir en az bir yedeği bilgisayarınıza/Drive'a indirin.

## Yedekte olmayanlar
| Ne | Neden | Geri yüklemede |
| --- | --- | --- |
| API anahtarları (Vault: NVIDIA, Places, SMTP şifresi vb.) | Bilerek dışarıda | Ayarlar'dan yeniden girilir |
| Edge Function'lar | Kod depoda | `npx supabase functions deploy ...` |
| Şema/migration geçmişi | Kod depoda | `npx supabase db push` |
| Bu bilgisayardaki e-posta hesabı şifresi | Windows kasasında | Ayarlar → E-posta Hesabı'ndan yeniden girilir |

## A) Prova (ayda bir / yılda en az bir kez): yerel Docker ile
Gerçek verinize dokunmaz; yedeğin açılabildiğini ve içinin dolu olduğunu kanıtlar.

1. GitHub → Actions → **Haftalık veritabanı yedeği** → son çalışma → **db-backup** çıktısını indirin ve zip'i açın.
2. Docker Desktop'ı açın.
3. PowerShell'de proje klasöründe:
   ```powershell
   .\scripts\ops\restore-backup.ps1 -BackupFile C:\Yedekler\backup-20261012.dump.gpg
   ```
   Yedek parolası sorulur (ekranda görünmez).
4. Çıktıda **"Geri yükleme provası BAŞARILI"** ve tablo satır sayılarını görmelisiniz (işletme, kanal, mesaj, müşteri…).
   Sayıları son bildiğiniz değerlerle kabaca karşılaştırın.
5. İncelemek isterseniz `-Keep` ekleyin; veritabanı `localhost:54329`'da (kullanıcı `supabase_admin`) açık kalır. İşiniz bitince:
   ```powershell
   docker rm -f lbf-restore-test
   ```

**Prova kaydı:** tarih, kullanılan yedek, sonuç ve satır sayılarını `docs/qa/geri-yukleme-provasi.md` dosyasına ekleyin.

## B) Gerçek felaket: yeni Supabase projesine geri yükleme
> Bu yol **bulutta henüz denenmedi.** İlk denemeyi gerçek bir felaketten önce, ücretsiz **ikinci bir Supabase projesinde** yapın.

1. Supabase'de yeni (boş) proje açın. **Mevcut projenin üzerine yüklemeyin.**
2. Terminalde yeni projeye bağlanın ve şemayı migration'larla kurun:
   ```bash
   npx supabase link --project-ref <yeni-proje-ref>
   npx supabase db push
   ```
   Bu adım tabloları, RLS politikalarını, işlevleri ve `customer-files` kovasını oluşturur.
3. Yedeği çözün (parola sorulur):
   ```bash
   gpg --output backup.dump --decrypt backup-YYYYMMDD.dump.gpg
   ```
4. **Yalnızca veriyi** yeni projeye yükleyin (bağlantı dizesi: Supabase → Project → Connect → *Session pooler*):
   ```bash
   pg_restore --data-only --no-owner --no-privileges --disable-triggers --schema=public --schema=auth \
     --dbname "<SESSION_POOLER_BAGLANTI_DIZESI>" backup.dump
   ```
   `--disable-triggers` bazı barındırılan ortamlarda yetki hatası verebilir; bu durumda ilgili tabloları sırayla
   (`auth.users` → `profiles` → `workspaces` → `workspace_members` → `businesses` → diğerleri) yükleyin.
5. Storage dosyalarını geri koyun: `storage-*.tar.gz.gpg` dosyasını çözüp açın ve her dosyayı aynı yolla
   `customer-files` kovasına yükleyin (Supabase panelinden veya `supabase storage cp`).
6. Edge Function'ları yeni projeye gönderin: `npx supabase functions deploy` (ve `unsubscribe` için `--no-verify-jwt`).
7. Uygulamada **Ayarlar → API / E-posta** anahtarlarını yeniden girin.
8. `.env` dosyasındaki `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini yeni projenin değerleriyle değiştirip
   `.\baslat.cmd build` çalıştırın (kurulumlu .exe için yeni sürüm yayınlanır).
9. Giriş yapıp işletme sayısını ve bir müşteri kaydını kontrol edin.

## C) GitHub sırları (storage yedeği için, bir kez)
GitHub → Settings → Secrets and variables → Actions:
- `SUPABASE_URL` — `https://<proje-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API (gizli anahtar; yalnızca bu sırda durur, sohbete/depoya yazmayın)

Tanımlı değilse storage yedeği uyarıyla atlanır; veritabanı yedeği etkilenmez.
