# Faz 7 — Manuel QA Listesi

Kaynak: `docs/SPEC.md` → E (conversations/messages/human_handoffs), Faz 7 özeti (T bölümü) — bu faz
için ayrı bir `PHASE-07.md` sağlanmadı. Bkz. `docs/adr/0005-scoring-and-outreach-guard.md`
(Faz 7 güncellemesi: `outreach_guard()`'ın kanal bazlı soğuma + duplicate koruması bu fazda
tamamlandı).

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil — 25 test dosyası, 199 test (Faz 7 için 9
      yeni test: `email/match-thread`).
- [x] `cargo check` ve `pnpm --filter @lbf/desktop exec vite build` hatasız; yeni `lettre` (SMTP,
      `tokio1-rustls-tls` — OpenSSL/native-tls bağımlılığı yok) bağımlılığı sorunsuz derleniyor.
- [x] `conversations`/`messages`/`human_handoffs` migration'ı (`20260925196000_conversations.sql`)
      SPEC.md → E ile satır satır karşılaştırıldı: `messages.status` (SENT/FAILED/content_hash/
      external_message_id) yalnızca `mark_message_sent()`/`mark_message_failed()` RPC'leriyle
      değişebiliyor (`REVOKE UPDATE`), `human_handoffs` için lead başına tek `OPEN` kısıtı
      (partial unique index), her conversation mutasyonu activity log'a düşüyor.
- [x] `record_inbound()`: STOP niyeti (kural tabanlı anahtar kelime **veya** AI classify_reply
      çıktısı, "asimetrik düşük eşik" — SPEC.md → J.3) DNC'ye dönüyor; `mark_message_sent()`:
      yalnızca APPROVED mesaj gönderilebiliyor, `outreach_guard()` kontrolü yeniden yapılıyor,
      aynı `content_hash` 30 gün içinde ikinci kez reddediliyor, ilk gönderen otomatik
      `assigned_to` oluyor (D16), yalnızca `OUTREACH_READY` aşamasındaysa `CONTACTED`'a otomatik
      geçiyor (pipeline tablosunda başka bir öncül aşamadan doğrudan `CONTACTED`'a geçiş yok).
- [x] `outreach_guard()` bu fazda tamamlandı: kanal bazlı soğuma (`conversations.last_outbound_at`,
      artık kanal başına ayrı satır), kanal başına günlük limit (`messages` üzerinden gerçek SENT
      sayısı). `MAX_FOLLOWUPS` hâlâ ertelenmiş (`follow_ups` tablosu Faz 8'de).
- [x] `packages/core/email`: `.eml` başlık ayrıştırıcı (katlanmış/folded başlıkları birleştiriyor,
      gövdeyi hiç okumuyor) ve thread eşleme (`In-Reply-To`/`References` → normalize edilmiş konu
      fallback'i, `Re:`/`Fwd:`/`Ynt:`/`İlt:` önekleri atılıyor) 4 gerçekçi `.eml` fixture'ıyla
      (biri katlanmış `References` başlıklı) 9 test ile doğrulandı.
- [x] Rust `send_email` komutu (`src-tauri/src/commands/email.rs`) kod incelemesiyle doğrulandı:
      SMTP şifresi yalnızca çağıran tarafından (Credential Manager'dan okunmuş) parametre olarak
      geçiriliyor, hiçbir yerde loglanmıyor/dosyaya yazılmıyor; iş kuralı (gönderim izni) Rust'ta
      değil, önce çağrılan `mark_message_sent()` RPC'sinde.
- [x] Masaüstü: Settings → E-posta Hesabı (kişisel SMTP, Credential Manager'da), Conversations
      sayfası (konuşma listesi, mesaj akışı, "Gelen Cevabı Yapıştır" → `classify_reply` +
      `record_inbound` + `update_summary`, "Taslak Oluştur" → `draft_reply` + `validateDraft`,
      "Onayla ve Gönder" → e-posta için gerçek SMTP gönderimi, asist kanallar için pano kopyalama +
      derin link açma + `mark_message_sent`).

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [ ] **pgTAP testi** (`conversations.test.sql`): Docker yok, `pnpm test:db` çalıştırılamadı.
      **Önemli not:** bu test dosyasındaki `mark_message_sent()` senaryoları gerçek `now()`'a
      bağlıdır (`outreach_guard()`'ın gönderim saati kontrolü); test yalnızca **hafta içi
      09:00–18:30 Europe/Istanbul** aralığında çalıştırılırsa güvenilir sonuç verir. CI'da bu
      dosya için ya zaman sahteciliği (`pg_mock_time` benzeri) eklenmeli ya da yalnızca elle,
      uygun saatte çalıştırılmalı — bu oturumda düzeltilmedi (zaman kısıtı).
- [ ] **Gerçek SMTP gönderimi uçtan uca**: Settings'te gerçek bir SMTP hesabı girilip
      Conversations'tan bir e-posta taslağının onaylanıp gönderildiği, alıcının gerçekten aldığı
      doğrulanmalı (SPF/DKIM/DMARC kurulumu — SPEC.md → D9 — bu fazın kapsamı dışında).
- [ ] **"Gönderilen e-postaya gelen cevap ≤ 5 dk içinde doğru conversation'a düşer"** (acceptance
      kriteri): IMAP otomatik okuma bu fazda **uygulanmadı** (bkz. Notlar); bu kriter yalnızca
      "Cevap Yapıştır" manuel akışıyla test edilebilir, otomatik IMAP poller olmadan tam
      karşılanmıyor.
- [ ] **"İki kullanıcı aynı mesajı iki kez gönderemez"**: `content_hash` 30 gün duplicate
      korumasının, aynı conversation'da iki farklı kullanıcının aynı taslağı eşzamanlı
      onaylayıp göndermeye çalıştığı bir senaryoda çalıştığı gerçek bir Supabase projesinde
      doğrulanmalı.
- [ ] **Handoff kartı**: `create_handoff()` RPC'si ve "lead başına tek OPEN" kısıtı yazıldı ama
      masaüstünde bir "Devret" butonuna bağlanmadı (bkz. Notlar) — bu UI parçası eksik.

## Notlar / bilinçli kapsam kararları

- **IMAP otomatik okuma bu fazda uygulanmadı.** SPEC.md → C, `async-imap` + TLS altyapısını
  (rustls manuel wrap veya `async-native-tls`/OpenSSL) sıfırdan kurmak, kalan oturum bütçesiyle
  güvenilir şekilde tamamlanamayacak kadar büyük bir iş olarak değerlendirildi. Bunun yerine D
  bölümünde zaten birinci sınıf bir özellik olarak listelenen **"gelen cevabı yapıştır/içe al"**
  akışı tam olarak uygulandı (Conversations sayfası, `record_inbound()` üzerinden). IMAP poller,
  bu akışın üzerine sonradan eklenebilecek bir otomasyon katmanıdır; eklenmesi gerekirse ayrı bir
  görev olarak planlanmalı ve `packages/core/email/match-thread.ts` (bu fazda yazılıp test edildi)
  doğrudan kullanılabilir.
- **Handoff UI'ı yok:** `generate_handoff` (Faz 6'da yazıldı) ve `create_handoff()` RPC'si (bu
  fazda yazıldı) mevcut ama Conversations/Lead detayında bunları tetikleyen bir buton eklenmedi;
  zaman kısıtı nedeniyle ertelendi.
- **`email_thread_ref` henüz yazılmıyor:** `conversations.email_thread_ref` kolonu var ama
  `mark_message_sent()` onu doldurmuyor (SMTP gönderiminde henüz gerçek `Message-ID` üretilip
  kaydedilmiyor); IMAP eklenene kadar bu alan kullanılmıyor, o yüzden şimdilik önemli değil.
- **Assisted kanal gönderimi** (Instagram/Facebook/WhatsApp) yalnızca pano kopyalama + derin link
  açma + `mark_message_sent()` çağrısından oluşur; gerçek teslim durumu bilinmediği için
  `mark_message_sent()` her zaman başarılı sayılır (kullanıcı manuel "Gönderdim" onayı verir).
