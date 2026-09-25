# Faz 8 — Manuel QA Listesi (MVP Sertleştirme)

Kaynak: `docs/SPEC.md` → M (Follow-Up Automation), D (Dashboard), Faz 8 özeti (T bölümü). Bu faz,
`docs/SPEC.md`'nin tanımladığı **MVP'yi tamamlar** (Faz 0–8).

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil — 27 test dosyası, 217 test (Faz 8 için 18
      yeni test: `compute-due-date` 6, `should-cancel-followups` 12).
- [x] `cargo check` ve `pnpm --filter @lbf/desktop exec vite build` hatasız (Faz 8'de Rust
      değişikliği yok, regresyon kontrolü).
- [x] `packages/core/followup/compute-due-date.ts`: `afterDays` ekleme, hafta sonuna denk gelince
      bir sonraki Pazartesi'ye kayma, sabit resmi tatilleri (örn. 29 Ekim) atlama, dini bayram +
      hafta sonu zincirini doğru atlama, saatin `sendWindow.from`'a (Europe/Istanbul, UTC+3 sabit —
      Türkiye 2016'dan beri yaz saati uygulamıyor) sabitlenmesi 6 test ile doğrulandı.
- [x] `packages/core/followup/should-cancel-followups.ts`: M bölümündeki tüm durma koşulları
      (yeni gelen mesaj, ENGAGED/PROPOSAL_READY/HANDED_OFF/WON/LOST/DISQUALIFIED aşamaları, DNC,
      INVALID/BOUNCED kanal) 12 test ile doğrulandı; SQL trigger'ların (`cancel_followups_on_*`)
      aynası olarak SQL tarafıyla karşılaştırıldı.
- [x] `follow_ups` migration'ı (`20260925197000_followups_and_dashboard.sql`) kod incelemesiyle
      SPEC ile karşılaştırıldı: yazma yalnızca RPC'lerle (`schedule_next_followup`,
      `mark_followup_drafted`, `mark_followup_sent`, `skip_followup`, `snooze_followup`), sekans
      adım 2'nin süresi adım 1'in gerçek gönderim anından sayılıyor (`mark_followup_sent` bir
      sonraki adımı yalnızca kendisi çağrıldığında planlıyor), aynı conversation+step ikinci kez
      planlanamıyor (unique constraint), durma koşulları iki trigger ile (gelen mesaj, aşama/DNC
      değişikliği) tek yerde (DB) zorlanıyor.
- [x] `analytics_summary()` RPC'si Dashboard'daki tüm sayı kartlarını (D bölümü listesi) tek
      sorguda döndürüyor.
- [x] Masaüstü: Dashboard sayfası (kartlar + bugünün işleri listesi, tıklayınca lead detayına
      gider), Follow-Ups sayfası (Gecikmiş/Yaklaşan gruplandırması, Taslak Oluştur/Onayla ve
      Gönder/Ertele/Atla), Conversations sayfasına ilk giden mesaj gönderildiğinde otomatik
      adım 1 follow-up planlaması eklendi, Settings → Veri Dışa Aktarımı (JSON, tarayıcı indirme).
- [x] **Offline banner** (`OnlineBanner`, Faz 0'da yazılmıştı) ve TanStack Query'nin varsayılan
      `retry`/`refetchOnReconnect` davranışı kod incelemesiyle doğrulandı; bu faz onu değiştirmedi.
- [x] **Installer Türkçe metinleri**: `tauri.conf.json`'da `nsis.languages: ["Turkish", "English"]`
      zaten Faz 0'da ayarlanmıştı (NSIS'in yerleşik Türkçe çevirisi); bu fazda ek bir değişiklik
      gerekmedi.

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [x] **pgTAP testi** (`followups.test.sql`): Docker kurulup gerçek Postgres'e karşı çalıştırıldı
      (2026-09-26); test fixture'ındaki geçersiz UUID hatası düzeltildi, ürün mantığında bu
      dosyaya özgü bir bug bulunmadı. 16/16 dosya, 82/82 test PASS.
- [ ] **"Cevap gelen lead'in follow-up'ı kalmaz"** (acceptance kriteri): gerçek bir Supabase
      projesinde bir follow-up bekleyen lead'e `record_inbound()` ile bir mesaj kaydedilip
      follow-up'ın gerçekten `CANCELLED` olduğu, "Bugünün İşleri"/Follow-Ups listesinden
      kaybolduğu doğrulanmalı.
- [ ] **"Wi-Fi kapatılıp açıldığında uygulama çökmez ve veri tutarlıdır"**: gerçek Windows
      makinesinde ağ kesintisi simülasyonu (manuel test listesi, SPEC.md → U) bu ortamda
      yapılamadı.
- [ ] **Kurulum dosyası uçtan uca**: CI'dan indirilen `setup.exe`'nin temiz bir Windows
      makinesinde kurulup Türkçe arayüzle açıldığı doğrulanmalı (installer ikonu hâlâ Tauri
      varsayılanı — özel bir ikon tasarım varlığı sağlanmadı, bkz. Notlar).
- [ ] **Veri dışa aktarımının Tauri webview'ında gerçekten dosya indirdiği**: `Blob` +
      `<a download>` yaklaşımının Tauri'nin WebView2 tabanında (tarayıcıdan farklı olarak)
      beklenen "Downloads" klasörüne kaydettiği gerçek bir Windows makinesinde doğrulanmalı;
      doğrulanamazsa `@tauri-apps/plugin-dialog` + `plugin-fs` ile bir kaydetme diyaloğuna
      geçilmesi gerekebilir.

## Notlar / bilinçli kapsam kararları

- **Dini bayram tarihleri statik ve yalnızca 2026'yı kapsar** (`tr-holidays.ts`); her yıl elle
  güncellenmelidir (sabit tarihli resmi tatiller otomatik, dini bayramlar değil — ay takvimine
  göre kayar).
- **Kanal INVALID/BOUNCED durma tetikleyicisi trigger olarak eklenmedi** (yalnızca
  `should-cancel-followups.ts`'de saf mantık olarak var, testli); `contact_channels.status`
  değişince otomatik follow-up iptali şu an çalışmıyor. Gerekçe: `contact_channels.status`'ün ne
  zaman INVALID/BOUNCED'a döneceği (örn. e-posta bounce algılama) henüz uygulanmadı (IMAP/bounce
  işleme Faz 7'de kapsam dışı bırakıldı — bkz. `docs/qa/phase-07.md`), bu yüzden bu trigger şu an
  hiçbir zaman tetiklenmeyecek ölü kod olurdu.
- **Installer ikonu** hâlâ Tauri'nin varsayılan placeholder ikonu; özel bir marka ikonu (ajans
  logosu) tasarım varlığı bu oturumda sağlanmadı, ayrı bir görev olarak eklenmelidir.
- **7 gün cevapsızlıkta otomatik LOST (NO_RESPONSE)** (SPEC.md → M: "Sekans bittiğinde ve 7 gün
  daha cevap yoksa lead LOST olur") bu fazda uygulanmadı — ayrı bir zamanlanmış kontrol (ör. uygulama
  açılışında veya periyodik bir client-side job) gerektirir; zaman kısıtı nedeniyle ertelendi,
  ayrı bir görev olarak eklenmeli.

## MVP durumu

Faz 0–8 tamamlandı: SPEC.md → S bölümündeki MVP özellik listesinin kod tarafı (Discover, Leads,
Website Analyzer, Scoring/Routing, Knowledge Base/AI, Conversations, Follow-Ups, Dashboard) bu
oturumda uygulandı. Docker/gerçek Supabase projesi/gerçek API anahtarları olmadığı için pgTAP,
Deno testleri ve uçtan uca senaryoların büyük kısmı **çalıştırılamadı** — yalnızca kod incelemesiyle
doğrulandı. Pilota (Faz 9) geçmeden önce bu QA dokümanlarındaki (`docs/qa/phase-0{1..8}.md`)
"Bu ortamda çalıştırılamayanlar" listelerinin tamamı gerçek bir ortamda elle doğrulanmalıdır.
