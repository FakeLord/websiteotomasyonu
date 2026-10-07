# QA — Faz 13 (G1): Buluta taşıma

Proje kodu: `lmnkvloucuofozxwroug`. Şifre ve anahtarları yalnızca sen girersin; bana yazma.

## A. Bağlantı (bir kez)
1. Proje klasöründe terminal aç.
2. `pnpm exec supabase login` → tarayıcıda onayla.
3. `pnpm exec supabase link --project-ref lmnkvloucuofozxwroug` → veritabanı şifresini sorar, kendin yaz.
4. `.env` dosyasını aç (örnek: `.env.example`):
   - `VITE_SUPABASE_URL=https://lmnkvloucuofozxwroug.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=` → Dashboard → Project Settings → API Keys → **Publishable key** (`sb_publishable_…`).
   - **Secret key'i bu dosyaya yazma.**

## B. Supabase paneli ayarları (Dashboard)
- Authentication → Sign In / Providers → **Allow new users to sign up: KAPALI**, **Confirm email: AÇIK**, **Minimum password length: 12**.
- Authentication → URL Configuration → **Site URL:** `http://127.0.0.1:5174`; **Redirect URLs:** aynı adres.
- Authentication → SMTP Settings → **Custom SMTP** aç: host `smtp.gmail.com`, port `465`, kullanıcı = Gmail adresin,
  parola = Google "uygulama şifresi" (2 adımlı doğrulama açıkken Google Hesabı → Güvenlik → Uygulama şifreleri), gönderen adı "Global Business Finder".
  (Yerleşik e-posta saatte ~2 ileti gönderir ve yalnızca ekip üyelerine gider — davet için yetmez.)
- Authentication → Email Templates → **Invite user** ve **Reset password**: konu ve içeriği sırasıyla
  `supabase/templates/invite.html` ve `supabase/templates/recovery.html` dosyalarından yapıştır.
- Authentication → Users → **Add user → Create new user**: kendi e-postan + şifren, **Auto Confirm User** işaretli. (İlk yönetici)

## C. Şemayı ve fonksiyonları yükleme (Claude ile birlikte)
Bu adımlar bulutu değiştirir; Claude çalıştırmadan önce onayını ister.
1. `pnpm exec supabase db push --dry-run` → 31 migration listelenmeli.
2. `pnpm exec supabase db push`
3. `pnpm sync:edge` (fark çıkmamalı) → `pnpm exec supabase functions deploy` (5 fonksiyon).
4. Dashboard → Advisors: Security'de **kırmızı** uyarı olmamalı.
5. `node --env-file=.env --import tsx scripts/smoke/cloud-health.ts` → tüm satırlar ✓.

## D. Uygulama kontrolleri
- [ ] Docker kapalıyken `baslat.cmd` açılır ("Bulut modu" yazar), giriş sayfası gelir.
- [ ] İlk yönetici giriş yapar → "Davet bekleniyor" → **İlk kurulum** ile workspace oluşturur.
- [ ] Ayarlar'dan Google Places ve NVIDIA anahtarları girilir (Vault'a gider); anahtar tekrar gösterilmez.
- [ ] Ekip → ikinci e-posta adresini davet et → e-posta gelir (Gmail kutusu/spam).
- [ ] Davet bağlantısı (uygulama açıkken) **Şifre belirle** sayfasını açar; 12 karakterden kısa şifre reddedilir; kaydedince giriş olur.
- [ ] Davetli, yöneticinin verdiği **davet kodunu** girer → aynı veriyi görür. Başka workspace görünmez.
- [ ] "Şifremi unuttum" e-postası gelir; bağlantı **Şifre belirle** sayfasını açar.
- [ ] Davet bağlantısına ikinci kez tıklamak "geçersiz veya süresi dolmuş" der.

## E. Yedek (GitHub)
1. Özel (private) bir GitHub deposu aç. Claude push için ayrıca soracak; sen onaylamadan hiçbir şey gönderilmez.
2. Depo → Settings → Secrets and variables → Actions → New repository secret:
   - `SUPABASE_DB_URL`: Dashboard → Connect → **Session pooler** bağlantı dizesi (şifre yerine kendi DB şifreni yaz).
   - `BACKUP_PASSPHRASE`: en az 20 karakterli rastgele parola; parola yöneticine de kaydet.
3. Actions → "Haftalık veritabanı yedeği" → **Run workflow**. Yeşil bitmeli, `db-backup` dosyası oluşmalı.
4. Dosyayı indirip `docs/qa/backup-restore.md` içindeki komutla açıldığını doğrula.
