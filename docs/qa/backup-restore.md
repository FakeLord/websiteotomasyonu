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
