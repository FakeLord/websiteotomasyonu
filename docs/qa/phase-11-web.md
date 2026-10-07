# Web Modu (Faz 11) — Manuel QA Listesi

Kaynak: `docs/adr/0009-web-mode.md` (2026-10-07). Dal: `feature/p11-web-mode`.

## Bu oturumda doğrulananlar

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil (**435 test**; yerel sunucu 83, çekirdek +39, platform +6).
- [x] `pnpm --filter @lbf/desktop build` (tsc + vite) hatasız; `@tauri-apps/*` yalnızca `lib/platform/tauri.ts`'te.
- [x] Gerçek **Windows Credential Manager**: 3000 karakterlik değer 3 parçaya bölünüp yazıldı
      (`{key}__0..2`, `{key}__chunks`), aynen geri okundu, silinince hiç kayıt kalmadı; olmayan kaydı silmek hata vermedi.
- [x] Masaüstü kurulumun yazdığı Supabase oturumu (`sb-127-auth-token__*`) web modunda **giriş istemeden** okundu →
      iki kabuk aynı kasayı paylaşıyor; tarayıcının localStorage/sessionStorage'ı boş.
- [x] Güvenlik (canlı): yabancı `Host` → 403, `x-lbf` yok → 403, yabancı `Origin` → "Geçersiz istek kaynağı".
- [x] Site analizi (canlı): `https://example.com` 200 (149 ms); `http://github.com` → https'e 1 yönlendirme;
      `127.0.0.1`, `169.254.169.254`, `localhost`, `[::1]` engellendi; `file://` reddedildi.
      Arayüzden "Yeniden Analiz Et" → `/api/website/fetch` 200 → sonuç Supabase'e yazıldı (aynı sınıflandırma).
- [x] Gerçek Gmail sunucularıyla duman testi (`scripts/smoke/local-server-mail.ts`, sahte hesap): SMTP **587 STARTTLS**,
      SMTP **465 SSL** ve IMAP **993** el sıkışması çalışıyor; hatalar "giriş başarısız / bağlanılamadı" olarak ayırt
      ediliyor ve şifre içermiyor.
- [x] `baslat.cmd` (Docker → Supabase → sunucu) ve `pnpm dev:web` (Vite + proxy, yabancı origin reddi) çalıştı.

## Kullanıcı tarafından doğrulanmalı (gerçek hesapla)

- [ ] `baslat.cmd` çift tık → tarayıcı açılır, giriş yapılır (veya mevcut oturumla doğrudan açılır).
- [ ] Ayarlar → E-posta: Gmail için SMTP `smtp.gmail.com:587`, IMAP `imap.gmail.com:993`, **uygulama şifresi** →
      Kaydet → sayfayı yenile → alanlar dolu (şifre Credential Manager'dan geliyor) → "Test e-postası gönder" ulaşıyor.
- [ ] Bir lead'e e-posta gönderip aynı adresten cevaplayın → "Gelen kutusunu şimdi kontrol et" ile cevap Konuşmalar'a düşer.
- [ ] Instagram/WhatsApp "Onayla ve Gönder" → yeni sekmede sohbet açılır, kart "Gönderdiğinizi onaylayın" durumunda kalır.
- [ ] İşletme Bul → harita karoları görünür (CSP: yalnızca `tile.openstreetmap.org`); Leadler → CSV dışa aktarım iner.
- [ ] Ekip arkadaşının makinesinde aynı kurulum (Docker yok → aynı Supabase'e bağlanacak bulut kurulumu gerekir, bkz. sınırlamalar).

## Bilinçli sınırlamalar

- Sunucu yalnızca `127.0.0.1`'dedir; başka cihaz/kişi erişemez. Ortak barındırma ayrı bir karardır (ADR 0009).
- IMAP poller ve sekans kapatıcı **sekme açıkken** çalışır; `baslat.cmd` penceresi kapanınca e-posta/IMAP/analiz durur.
- Kurulu masaüstü uygulaması (NSIS) olduğu gibi çalışmaya devam eder; ikisi aynı oturum ve SMTP/IMAP kaydını paylaşır.
- **Bilinen masaüstü hatası (ayrı düzeltilecek):** Rust `send_email` `relay()` ile her portta örtük TLS kullanır;
  587 (STARTTLS) hesaplarla masaüstü gönderimi bağlantı kuramaz. Web modu 587/465'i doğru ele alır.
