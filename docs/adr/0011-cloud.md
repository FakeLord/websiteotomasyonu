# ADR 0011 — Buluta taşıma (Supabase Cloud)

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-07
- **Bağlam:** ADR 0010 (D19), PHASE-13 (G1), SPEC.md → F, P.3, D13. Kullanıcı kendi Supabase projesini açtı
  (ücretsiz plan, proje kodu `lmnkvloucuofozxwroug`). Yerel Docker yalnızca geliştirme/test içindir.

## Doğrulanan bilgiler (VERIFY_CURRENT_DOCS, 2026-10-07, supabase.com/docs)

| Konu | Bulgu | Sonuç |
| --- | --- | --- |
| Yerleşik e-posta (SMTP) | Saatte yaklaşık **2 ileti**; yalnızca organizasyon üyelerinin adreslerine gider, güvence yok, "test amaçlı". Özel SMTP bağlanınca kısıt kalkar, başlangıç sınırı saatte 30 (Rate Limits sayfasından artar). | Davet ve şifre sıfırlama için **özel SMTP zorunlu** (kullanıcının Gmail uygulama şifresi; Dashboard → Authentication → SMTP; kullanıcı girer). |
| Yeni API anahtarları | `sb_publishable_…` supabase-js `createClient`'a anon anahtarı yerine verilir; oturumsuzken `anon`, oturumluyken `authenticated` rolü. | İstemci kodu değişmez; `VITE_SUPABASE_ANON_KEY` değerine publishable anahtar konur. |
| Edge Function ortamı | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` **hâlâ enjekte edilir** (eski anahtarlar; "kullanımdan kalkan yol"). Platformun `verify_jwt` denetimi kullanıcı belirtecini doğrular. | Fonksiyonlar değişmeden çalışır; kullanıcı belirteciyle çağrıldıkları için `verify_jwt` açık kalır. Eski anahtarlar kaldırılırsa `SUPABASE_SECRET_KEYS` + `@supabase/server`'a geçiş ayrı iş olarak izlenir (BACKLOG notu). |
| E-posta şablonu | `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .ConfirmationURL }}` değişkenleri; önerilen desen: bağlantıya `token_hash` + `type` koyup istemcide `verifyOtp` çağırmak. | Davet/sıfırlama bağlantısı `{{ .SiteURL }}/#/set-password?token_hash=…&type=invite|recovery`; hash router ile çakışan `#access_token` bağlantısı kullanılmaz. |
| Ücretsiz plan | DB **500 MB**, Edge Function **500.000 çağrı/ay**. Duraklatma kuralı ve yedek bilgisi sayfada yok → plana göre güvenilmez sayılır. | Kendi haftalık yedeğimiz şart (D13). Etkinsiz proje duraklayabilir → ekip için ücretli plan değerlendirilir (G3'te veri büyüyünce kesinleşir). |

Doğrulanamayanlar (kullanıcı Dashboard'dan teyit eder, `docs/qa/phase-13-cloud.md`): ücretsiz planda `pg_cron` ve Vault
varlığı, duraklatma süresi, pooler bağlantı dizesinin biçimi.

## Kararlar

1. **Temiz başlangıç:** yerel 578 kayıt test verisidir; buluta taşınmaz. İstenirse sonra tek seferlik betik yazılır.
2. **Auth ayarları Dashboard'dan** yapılır (kayıt kapalı, en az 12 karakter şifre, e-posta doğrulama açık, Site URL
   `http://127.0.0.1:5174`). `supabase config push` kullanılmaz: yerel `config.toml` test kolaylığı için gevşektir.
3. **Davetli kullanıcı akışı:** uygulama içinde `/set-password` sayfası. Belirteç sayfa açılışında değil, form gönderilirken
   doğrulanır (önizleyici/yeniden çizim belirteci tüketemesin); sonra `updateUser({password})`.
4. **Davet bağlantısı yerel adrese gider** (`127.0.0.1:5174`): davetli kendi bilgisayarında `baslat.cmd`'yi çalıştırmış olmalı.
   Barındırılan bir adres G10'da (üretim) ele alınır.
5. **Yedek:** GitHub Actions + `pg_dump` (pooler bağlantı dizesi, çünkü doğrudan bağlantı IPv6'dır ve Actions IPv4'tür) →
   simetrik şifreleme → 30 gün saklanan artifact. Bağlantı dizesi ve parola yalnızca repo secret'ında.
6. `db push` ve `functions deploy` bulutu değiştirir; yalnızca boş projeye ve kullanıcının açık onayıyla çalıştırılır.
