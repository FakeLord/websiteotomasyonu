# Faz 2 — Manuel QA Listesi

Kaynak: `docs/SPEC.md` → T (Faz 2 özeti), E, K, G.4 (bu faz için ayrı bir `PHASE-02.md` sağlanmadı — bkz. `docs/adr/0003-realtime-dedupe.md`).

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil — 10 test dosyası, 54 test.
- [x] `cargo check` hatasız (Phase 2'de Rust değişikliği yok, regresyon kontrolü).
- [x] `pnpm build` (Vite) hatasız.
- [x] `packages/core/pipeline`: 11 aşamalı geçiş tablosu tüm SPEC K senaryolarıyla test edildi (19 test) —
      SQL'deki `is_valid_stage_transition()` ile birebir aynı olmalı (bkz. migration yorumu).
- [x] `packages/core/dedupe`: `normalizePhone` (TR E.164 + mobil tespiti — `libphonenumber-js/max`
      gerektiği doğrulandı, ana paket tip bilgisi içermiyor), `normalizeSocial`, `classifyMatch`
      (trigram tabanlı bulanık eşleşme) test edildi.
- [x] Migration'lar SPEC E/K/G.4/P.1 ile satır satır karşılaştırıldı: kolon koruması (`REVOKE UPDATE`),
      RPC'lerin `workspace_id`'yi ebeveyn kayıttan türetmesi, iyimser kilit (`version`).
- [x] `docs/adr/0003-realtime-dedupe.md`: Realtime `postgres_changes`'in RLS'i uyguladığı ama
      DELETE olaylarının RLS'e tabi olmadığı doğrulandı; bu yüzden `merge_businesses` gerçek
      DELETE yapmaz, `merged_into` ile işaretler.

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [ ] **pgTAP testleri** (`dedupe_import.test.sql`, `transition_stage.test.sql`,
      `dnc_and_merge.test.sql`): Docker yok, `pnpm test:db` çalıştırılamadı. Docker Desktop
      kurulup doğrulanmalı.
- [ ] **CSV import uçtan uca**: Gerçek bir Supabase projesinde, örnek bir CSV (aynı işletmeyi
      farklı yazımlarla — örn. "ABC Diş Kliniği" / "Abc Dis Klinigi" aynı website ile — içeren)
      import edilip tek `businesses` kaydı oluştuğu Leads sayfasında doğrulanmalı.
- [ ] **Realtime senkron**: İki farklı kullanıcı/oturumla aynı workspace'e girilip birinin bir
      lead'i güncellemesinin diğerinde ≤ 3 sn içinde göründüğü doğrulanmalı (acceptance kriteri).
- [ ] **Merge ekranı**: Olası duplicate olarak işaretlenen bir kaydın detay sayfasındaki
      "Birleştir" butonuyla gerçek Supabase'de birleştiği, notların/kaynakların taşındığı
      doğrulanmalı.
- [ ] **Geçersiz stage geçişi UI'da reddedilir**: yalnızca `allowedNextStages()`'ın döndürdüğü
      butonlar gösterildiği için UI'dan geçersiz bir geçiş zaten denenemez; RPC seviyesinde
      reddin de çalıştığı pgTAP ile teyit edilmeli.

## Notlar

- `businesses.possible_duplicate_of` ve `merged_into` alanları SPEC'in E tablosunda birebir yok;
  gerekçesi `docs/adr/0003-realtime-dedupe.md`'de.
- CSV import önizlemesi (`ImportCsvDialog.tsx`) yalnızca UX amaçlıdır; asıl yetkili dedupe kontrolü
  `import_business()` SQL RPC'sindedir (istemciye güvenilmez ilkesi, CLAUDE.md #12).
