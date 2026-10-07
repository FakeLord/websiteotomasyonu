# ADR 0009 — Tarayıcı modu: yerel Node sunucusu ve platform katmanı

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-07
- **Bağlam:** Kullanıcı uygulamanın masaüstü kurulumu yerine, yine kendi bilgisayarında çalışan
  web tabanlı sürümünü istedi. SPEC.md → B (mimari), F/P.2 (secret saklama), H (site analizi),
  L (e-posta gönderim/alım) ile ilişkilidir.

## Karar

1. **Tek sözleşme, iki kabuk.** Arayüz `@tauri-apps/*` içe aktarmaz; `apps/desktop/src/lib/platform`
   (secrets, sendEmail, imapFetch, fetchPage, openExternal, log) kullanılır. Tauri kabuğu mevcut
   Rust komutlarına, tarayıcı kabuğu yerel sunucuya gider. Masaüstü build'i korunur.
2. **`apps/local-server`**: tek bir Node süreci, `127.0.0.1`'e bağlanır; derlenmiş arayüzü ve
   `/api/*` uçlarını **aynı origin**'den sunar (CORS yok). Tarayıcı SMTP/IMAP soketi açamaz, başka
   sitelerin HTML'ini CORS'suz çekemez ve işletim sistemi kasasına erişemez; bu 4 iş sunucuya taşındı.
3. **Sırlar yine Windows Credential Manager'da** (`@napi-rs/keyring`), masaüstüyle **aynı servis adı
   ve parçalama şeması** (`{key}__chunks`, `{key}__{i}`) → CLAUDE.md #1 ve SPEC P.2 korunur;
   tarayıcının localStorage'ı kullanılmaz. İki kabuk aynı kayıtları okuyabilir.
4. **Yeni iş kuralı yok.** SSRF IP kuralı (`isBlockedIp`), kasa parçalama (`splitIntoChunks`) ve
   Message-ID biçimi (`buildMessageId`) `packages/core`'a alındı ve unit testlidir; Rust ile aynıdır.

## Güvenlik modeli

- Yalnızca `127.0.0.1` dinlenir. `Host` ve (varsa) `Origin` başlığı `127.0.0.1:<port>` / `localhost:<port>`
  değilse 403 → DNS rebinding ve başka sitelerin localhost'u çağırması engellenir.
- `/api` yalnızca `POST` + `application/json` + `x-lbf: 1` ister; özel başlık, çapraz-site isteği
  preflight'a zorlar ve sunucu hiçbir CORS başlığı vermediği için reddedilir. `Sec-Fetch-Site`
  `cross-site`/`same-site` ise 403.
- Gövde en çok 256 KB. Hata yanıtları parametre/şifre içermez. Sunucu şifreleri loglamaz.
- `fetch_page` SSRF engeli Rust'tan birebir: http/https, her hop'ta DNS çözümü + **bağlantı doğrulanan
  IP'ye sabitlenir** (Node `lookup` seçeneği; DNS rebinding'e karşı), 5 yönlendirme, 10 sn, 2 MB.

## VERIFY_CURRENT_DOCS bulguları (2026-10-07, context7 + paket tipleri)

- **nodemailer 10.0.16:** `secure` yalnızca 465 için (örtük TLS); 587 için `secure: false` + `requireTLS: true`
  (STARTTLS zorunlu). `messageId`, `inReplyTo`, `references` mail seçenekleridir. Testte
  `createTransport({ jsonTransport: true })` ağsız çalışır.
- **imapflow 2.2.7:** `getMailboxLock("INBOX", { readOnly: true })` = `EXAMINE`; `uidValidity` **bigint**;
  `search({ uid: "42:*" }, { uid: true })` ve `{ since: Date }`; `fetch(range, { uid: true, source: true }, { uid: true })`
  async iterator; `logout()`. `UID n:*` sunucuda en az bir (son) mesaj döndürür → istemci tarafında `> since_uid` süzülür.
- **@napi-rs/keyring 2.1.0:** senkron `Entry(service, user)`: `getPassword(): string | null`,
  `setPassword`, `deleteCredential(): boolean`. Windows blob sınırı 2560 bayt → parçalama gerekir.
- **undici kullanılmadı:** Node'un `http/https.request` `lookup` seçeneği IP sabitlemek için yeterli;
  ek bağımlılık yok.

## Bulunan hata (kapsam dışı, ayrı düzeltilecek)

Rust `send_email` `AsyncSmtpTransport::relay()` kullanıyor; bu **her portta örtük TLS** (465 davranışı)
demektir. Varsayılan port 587 (STARTTLS) olduğundan masaüstünde 587'li hesaplarla gönderim bağlantı
kuramaz. Web sunucusu 465 dışında STARTTLS kullanır. Rust düzeltmesi (`starttls_relay`) ayrı bir commit.

## Sonuçlar

- Sunucu kullanıcının bilgisayarında çalışır; ekip üyeleri kendi makinelerinde ayrı çalıştırır (hepsi
  aynı Supabase'e bağlanır). Tek adresten ortak barındırma ayrı bir karardır: orada sırlar kasa yerine
  sunucuda tutulmalı ve kimlik doğrulama eklenmelidir.
- IMAP poller ve sekans kapatıcı sekme açıkken çalışır; `pnpm web` süreci kapalıyken e-posta/IMAP/analiz çalışmaz.
