# ADR 0008 — IMAP ile e-posta cevaplarının ve bounce'ların otomatik yakalanması

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-28
- **Bağlam:** SPEC.md → L (gelen akış tablosu), M (durma koşulları), S ("Cevap yakalama: IMAP").
  Faz 7'de ertelenmişti (`docs/qa/phase-07.md`).

## VERIFY_CURRENT_DOCS bulgusu (2026-09-28, docs.rs)

- `async-imap` güncel sürüm **0.11.3** (2026-07-17). Varsayılan özellik `runtime-async-std`'dir;
  tokio için `default-features = false, features = ["runtime-tokio"]` gerekir.
- Crate TLS içermez; akış tipi `AsyncRead + AsyncWrite + Unpin + Debug + Send` olmalıdır. Belgedeki
  örnek `async-native-tls` kullanır; biz lettre'nin zaten kullandığı rustls yığınını
  (`tokio-rustls` 0.26 + `webpki-roots`) kullanıyoruz — OpenSSL/Schannel bağımlılığı eklenmez.
- `Session::uid_search(query) -> HashSet<Uid>`, `Session::uid_fetch(set, query) -> Stream<Fetch>`;
  `BODY.PEEK[]` mesajı okundu olarak işaretlemez.

## Karar

- Rust `imap_fetch` komutu yalnızca taşıma yapar: TLS bağlan → INBOX `EXAMINE` (salt-okunur) →
  `UID SEARCH UID <since>:*` (+ `SINCE <tarih>`) → `BODY.PEEK[]` ile en fazla 50 ham mesaj döner.
  Şifre parametre olarak gelir, loglanmaz. İş kuralı yok (CLAUDE.md: Rust ince).
- MIME ayrıştırma, bounce/otomatik yanıt tespiti ve konuşma eşleştirmesi `packages/core/email`
  içinde saf TS'dir ve fixture'larla test edilir. MIME için `postal-mime` (bağımlılıksız, tarayıcı
  ve Node'da çalışır) kullanılır.
- Poller masaüstünde, uygulama açıkken 5 dakikada bir çalışır (SPEC → L). Son UID ve UIDVALIDITY
  cihaz başına `localStorage`'da tutulur (kolaylık); tekrar içe aktarım güvenliği DB'dedir
  (`record_inbound` aynı `external_message_id`'yi ikinci kez yazmaz).
- Yalnızca bilinen bir konuşmaya/işletmeye eşleşen e-postalar içe alınır; kişisel posta asla
  kaydedilmez.

## Sonuçlar

- Gmail/Outlook için kullanıcı uygulama şifresi girmelidir (SMTP ile aynı kayıt, Windows Kimlik
  Bilgisi Yöneticisi). IMAP'i kapalı hesaplarda poller hata verir, Ayarlar'da gösterilir.
- Uygulama kapalıyken cevaplar yakalanmaz; açıldığında son UID'den devam edilir.
