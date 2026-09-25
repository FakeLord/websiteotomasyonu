# Faz 5 — Manuel QA Listesi

Kaynak: `docs/SPEC.md` → I (Lead Scoring, Contact Discovery + Channel Routing) — bu faz için ayrı
bir `PHASE-05.md` sağlanmadı. Bkz. `docs/adr/0005-scoring-and-outreach-guard.md` (bu fazın kapsam
sınırlaması).

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil — 21 test dosyası, 156 test (Faz 5 için 19
      yeni test: `compute-score` 8, `choose-channel` 11).
- [x] `cargo check` ve `pnpm --filter @lbf/desktop exec vite build` hatasız (Faz 5'te Rust
      değişikliği yok, regresyon kontrolü).
- [x] `packages/core/scoring/compute-score.ts`: I.1 tablosundaki tüm kurallar (NO_WEBSITE …
      NO_CONTACT_CHANNEL), NOT_OPERATIONAL için skor=0 zorlaması, HIGH_RATING/HIGH_REVIEW_COUNT
      eşikleri (≥4.3 / ≥50), 0–100 kırpma, eksik kural için 0 puan fallback unit test edildi.
- [x] `packages/core/routing/choose-channel.ts`: DNC sert durdurma, öncelik sırasına göre seçim,
      INVALID/BOUNCED/düşük confidence (<0.5) elenmesi, 72 saatlik cooldown, günlük kanal/toplam
      limiti, "ilk temas kurulan kanal dışına sessizce geçmeme" kuralı unit test edildi.
- [x] `update_lead_score()` ve `outreach_guard()` RPC'leri (`20260925194000_scoring_and_outreach_guard.sql`)
      kod incelemesiyle SPEC ile karşılaştırıldı: `lead_score`/`score_breakdown`/`scoring_version`
      Faz 2'den beri zaten REVOKE UPDATE'liydi, bu RPC onları yazan tek yol; `outreach_guard()`'ın
      bu fazda hangi kontrolleri yaptığı/yapmadığı ADR 0005'te belgelendi.
- [x] Masaüstü: skor/kanal/limit ayarları için admin-only Settings bölümü (`ScoringSettingsSection`),
      kaydedince `scoring_version` artırıp tüm workspace'i yeniden puanlıyor
      (`recomputeAllScores`); lead detayında "Önerilen Kanal" kartı (`chooseChannel` ile, client-side
      öneri — gerçek zorlama DB'de); website analizi/manuel ekleme/CSV import/Places import sonrası
      otomatik skor yeniden hesaplama (`recomputeScore`) eklendi.

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [x] **pgTAP testi** (`outreach_guard.test.sql`): Docker kurulup gerçek Postgres'e karşı
      çalıştırıldı (2026-09-26); test fixture'larındaki (geçersiz UUID, stale JWT claim) hatalar
      düzeltildi, ürün mantığında (`outreach_guard()`) bu dosyaya özgü bir bug bulunmadı. 16/16
      dosya, 82/82 test PASS.
- [ ] **"DNC'li lead için hiçbir yol gönderime izin vermez"** (acceptance kriteri): gerçek bir
      Supabase projesinde `outreach_guard()` çağrısıyla, ve ayrıca "Önerilen Kanal" kartının DNC
      işaretli bir lead'de hiçbir kanal önermediği doğrulanmalı.
- [ ] **"Kural değişikliği tüm skorları yeniden hesaplar"**: Settings'te bir skor kuralı
      değiştirilip kaydedildiğinde tüm lead'lerin `lead_score`/`scoring_version`'ının güncellendiği,
      ilerleme göstergesinin (`recalculatingScores`) doğru çalıştığı gerçek bir workspace'te (50+
      lead) doğrulanmalı.
- [ ] **"Limit aşımında açık sebep mesajı görülür"**: `outreach_guard()`'ın döndürdüğü `reasons`
      dizisinin gerçek bir gönderim akışında (Faz 7'de) kullanıcıya Türkçe, anlaşılır bir mesaj
      olarak gösterildiği — bu faz yalnızca RPC'yi sağlıyor, UI entegrasyonu Faz 7'nin kapsamında.

## Notlar / bilinçli basitleştirmeler

- **`outreach_guard()` eksik kontroller:** `MAX_FOLLOWUPS` ve `DUPLICATE_MESSAGE_PROTECTION`
  `follow_ups`/`messages` tabloları olmadan uygulanamaz; bu fazda hiç reddetmiyorlar (bkz. ADR
  0005). `CHANNEL_COOLDOWN`, kanal bazlı değil `businesses.last_contacted_at` üzerinden tüm
  kanallar için tek bir soğuma penceresi uyguluyor (daha kısıtlayıcı, güvenli taraf).
- **`DAILY_OUTREACH_LIMIT` proxy'si:** Gerçek "gönderilen ilk mesaj" sayısı yerine bugünkü
  `CONTACTED` stage geçiş sayısı kullanılıyor; bu iki değer normal akışta örtüşür ama birebir aynı
  garantiyi vermez.
- **"Önerilen Kanal" kartı** client-side bir öneridir (`chooseChannel`), gerçek gönderim izni
  değildir — DB'deki `outreach_guard()` her zaman son sözü söyler (CLAUDE.md #9). Kart şu an
  `history`'yi boş geçiyor (gerçek mesaj geçmişi Faz 7'ye kadar yok), bu yüzden cooldown/fallback
  guard'ları bu kartta henüz devrede değil — yalnızca DNC, kanal durumu/confidence ve öncelik
  sırası uygulanıyor.
- **`needsBooking` kategori listesi** (`score-runner.ts`), SPEC'in I.1 tablosundaki "randevu
  kategorisi" tanımını `workspace_settings.target_categories`'teki randevu-ağırlıklı kategorilerle
  eşleştiren sabit bir liste; admin UI'dan değiştirilemiyor (ileride gerekirse eklenebilir).
