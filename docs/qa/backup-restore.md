# Yedekten geri yükleme (ön sürüm — G10'da boş projede tam deneme yapılır)

Yedek: `backup-YYYYMMDD.dump.gpg` (AES-256, `public` + `auth` şemaları). Vault (API anahtarları) yedekte yoktur.

1. Dosyayı aç (parolayı sen girersin):
   ```
   gpg --output backup.dump --decrypt backup-YYYYMMDD.dump.gpg
   ```
2. İçeriği listele (bozuk mu diye bak): `pg_restore --list backup.dump | head`
3. Yeni, **boş** bir Supabase projesi aç; `supabase db push` ile şemayı kur.
4. Veriyi yükle (bağlantı dizesi: Dashboard → Connect → Session pooler):
   ```
   pg_restore --data-only --no-owner --disable-triggers --schema=public --dbname "<bağlantı dizesi>" backup.dump
   ```
5. Kullanıcılar (`auth`) için: yedekteki `auth.users` yeni projeye bire bir taşınmayabilir; sorun olursa yöneticiyi yeniden
   oluşturup üyeleri davetle ekle. (G10'da bu adım denenip kesinleştirilir.)
6. Ayarlar'dan Google Places ve NVIDIA anahtarlarını yeniden gir.

## Prova sonucu (2026-10-11, yerel)
Yerel Supabase veritabanından aynı bayraklarla (`--format=custom --no-owner --no-privileges --schema=public --schema=auth`)
dökülüp boş bir veritabanına `pg_restore` ile yüklendi:
- Dump 0,9 MB, 702 nesne; **582 işletme ve 2.193 iletişim kanalı birebir** geri geldi (`workspace_settings` dahil).
- 2 hata: `public` şeması zaten vardı (zararsız) ve prova veritabanında `extensions` şeması olmadığı için `pg_trgm` dizini
  (`businesses_name_trgm_idx`) oluşmadı. Gerçek bir Supabase projesinde `extensions` şeması hazırdır; dizin eksik kalırsa
  `supabase db push` / migration'larla yeniden oluşur.
- Henüz denenmeyenler (G10): boş **bulut** projesine tam geri yükleme, `auth.users` taşıma ve Vault anahtarlarının yeniden girilmesi.
