# Listeden çıkma bağlantısını kendi alan adından vermek (isteğe bağlı)

Varsayılan bağlantı `https://<proje>.supabase.co/functions/v1/unsubscribe?...` biçimindedir. E-postanın altında kendi alan
adınız (ör. `https://hostlys.com/cikis?...`) görünsün istiyorsanız aşağıdaki küçük yönlendirme dosyasını sunucunuza koyun.
Ücretsizdir; ek hizmet gerekmez.

## Kurulum (Plesk)
1. Plesk → **Dosyalar** → `hostlys.com` için `httpdocs` klasörü.
2. `cikis` adında bir klasör oluşturun.
3. İçine `index.php` adında bir dosya oluşturun ve aşağıdaki kodu yapıştırın.
4. Uygulamada **Ayarlar → Genel → Gönderen kimliği → Listeden çıkma bağlantısı adresi** alanına `https://hostlys.com/cikis`
   yazıp kaydedin.

```php
<?php
// Yalnızca sabit bir hedefe yönlendirir (açık yönlendirme yok); belirteç ve dil doğrulanır.
$t = isset($_GET['t']) ? $_GET['t'] : '';
$lang = (isset($_GET['lang']) && $_GET['lang'] === 'en') ? 'en' : 'tr';
if (!preg_match('/^[0-9a-f]{32,128}$/', $t)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Bu bağlantı geçersiz veya süresi dolmuş.';
    exit;
}
header('Cache-Control: no-store');
header('Location: https://lmnkvloucuofozxwroug.supabase.co/functions/v1/unsubscribe?t=' . $t . '&lang=' . $lang, true, 302);
exit;
```

## Notlar
- Posta başlığındaki `List-Unsubscribe` (Gmail/Outlook'un "Abonelikten çık" düğmesi) **her zaman doğrudan Supabase
  fonksiyonuna** gider: tek tıkla çıkma (RFC 8058) POST ister ve yönlendirme güvenilir izlenmez. Kendi alan adı yalnızca
  e-postanın altındaki görünen bağlantıdadır.
- Dosyayı koymadan adresi Ayarlar'a yazmayın; bağlantı 404 verir. Önce `https://hostlys.com/cikis?t=abc` adresinin "geçersiz"
  mesajı verdiğini tarayıcıda kontrol edin.
- Proje adresi değişirse dosyadaki `lmnkvloucuofozxwroug` kısmını güncelleyin.
