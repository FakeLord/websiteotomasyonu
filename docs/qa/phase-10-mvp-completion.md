# MVP Tamamlama (Faz 10) — Manuel QA Listesi

Kaynak: SPEC.md → K, L, M, S; `docs/adr/0008-imap-poller.md` (2026-09-28). Dal: `feature/p10-mvp-completion`.

Bu faz, Faz 7–8'de ertelenmiş ama SPEC → S'de MVP kapsamında olan parçaları tamamlar.

## Bu oturumda doğrulananlar

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil (307 test), `pnpm test:db` 157/157 pgTAP,
      `cargo test --lib` 12/12 (+1 elle çalıştırılan IMAP smoke testi).
- [x] **Niyetler:** `AUTO_REPLY`, `WRONG_CONTACT`, `ALREADY_HAS_PROVIDER` şemada ve prompt'ta.
      Otomatik yanıt follow-up'ı iptal etmez, 2 gün erteler, cevap sayılmaz, kampanyada REPLIED
      yapmaz (`inbound_intents.test.sql`).
- [x] **Message-ID:** `send_email` `<uuid@gönderen-domain>` üretip döndürür; ilk giden e-postanın
      kimliği `conversations.email_thread_ref`'e yazılır (`email_thread_ref.test.sql`); cevaplar
      `In-Reply-To`/`References` ile aynı thread'de gönderilir.
- [x] **Gönderdim / Gönderemedim:** asist kanallarda mesaj APPROVED kalır; tarayıcı önizlemesinde
      "Gönderemedim → Mesaj kutusu kapalı" → mesaj FAILED, Instagram kanalı INVALID, iki activity
      log satırı (sonra test verisi geri alındı). Kanal INVALID/BOUNCED olunca o kanalda geçerli adres
      kalmadıysa follow-up'lar iptal edilir (`channel_status.test.sql`).
- [x] **IMAP:** fixture'larla ISO-8859-9 quoted-printable, encoded-word başlıklar, alıntı kırpma,
      RFC 3464 DSN ve düz metin mailer-daemon bounce, otomatik yanıt tespiti; Message-ID/gönderen
      adresiyle lead eşleştirme; ortak adres birden çok işletmedeyse tahmin yapılmaz.
      Gerçek sunucu smoke testi: `imap.gmail.com:993` TLS el sıkışması + karşılama + sahte hesapla
      LOGIN reddi doğru hata mesajına dönüştü.
- [x] **Aşama otomasyonu:** gelen cevap CONTACTED → REPLIED (SYSTEM), STOP → DNC + LOST
      (NOT_INTERESTED), sekans bitti + 7 gün → LOST (NO_RESPONSE); bekleyen adım, eksik adım,
      7 gün dolmamışsa veya politika `KEEP` ise kapatılmaz (`stage_automation.test.sql`).
      Masaüstü açılışta `close_stale_sequences` çağırıyor (ağ isteği 200).
- [x] Ayarlar → E-posta'da IMAP alanları ve "Gelen kutusunu şimdi kontrol et" görünüyor.
- [x] Kurulum ikonu uygulama logosuyla değiştirildi (`icons/source/app-icon.svg`).

## Kullanıcı tarafından doğrulanmalı (kurulu uygulamada, gerçek hesapla)

- [ ] Ayarlar → E-posta: Gmail için SMTP `smtp.gmail.com:587`, IMAP `imap.gmail.com:993`,
      kullanıcı adı + **uygulama şifresi** → Kaydet → "Gelen kutusunu şimdi kontrol et" hatasız
      ("Son kontrol: … 0 yeni cevap").
- [ ] Kendi ikinci adresinizi bir lead'in e-postası olarak ekleyin → Konuşmalar'dan e-posta
      gönderin → o adresten **cevaplayın** → en geç 5 dk içinde (veya "şimdi kontrol et") cevap
      Konuşmalar'a düşer, niyet etiketi görünür, lead REPLIED olur, follow-up iptal edilir.
- [ ] Aynı kontrolü tekrar çalıştırın → cevap ikinci kez eklenmez.
- [ ] Var olmayan bir adrese (ör. `yok-12345@<sizin-domaininiz>`) gönderin → bounce gelince adres
      Lead detayında "BOUNCED" olur, follow-up iptal edilir.
- [ ] Otomatik yanıt açık bir adrese gönderin → mesaj "Otomatik yanıt" etiketiyle eklenir,
      follow-up 2 gün ertelenir, lead CONTACTED kalır.
- [ ] Instagram taslağında "Onayla ve Gönder" → ig.me açılır, kart "Gönderdiğinizi onaylayın"
      durumunda kalır → "Gönderdim" → SENT + 1. follow-up planlanır.
- [ ] Kişisel/lead dışı e-postaların Konuşmalar'a **eklenmediğini** ve gelen kutusunda okunmamış
      kaldığını doğrulayın.

## Bilinçli sınırlamalar

- Poller yalnızca uygulama açıkken çalışır (SPEC → L); kapalıyken gelen cevaplar açılışta alınır.
- Yalnızca INBOX okunur (Gmail "Tümü"/etiketler, spam klasörü okunmaz).
- Lead'e ait olmayan bir adresten gelen ve thread başlığı taşımayan cevaplar eşleşmez (ör. müşteri
  farklı bir adresten, yeni bir e-posta olarak yazarsa) — "Cevap yapıştır" ile elle eklenir.
- `NOT_INTERESTED` / `WRONG_CONTACT` niyetleri aşamayı otomatik değiştirmez (SPEC → K: Level 2+
  veya kullanıcı kararı); yalnızca STOP otomatik LOST yapar.
