# Faz 3 — Manuel QA Listesi

Kaynak: `docs/SPEC.md` → G.1, P.3 (bu faz için ayrı bir `PHASE-03.md` sağlanmadı —
bkz. `docs/adr/0004-places-vault.md`).

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil — 12 test dosyası, 62 test.
- [x] `cargo check` hatasız (Faz 3'te Rust değişikliği yok, regresyon kontrolü).
- [x] `pnpm --filter @lbf/desktop exec vite build` hatasız.
- [x] `packages/core/discovery`: `placeToBusinessPayload` (Instagram/Facebook/link-in-bio
      websiteUri ayrımı, opsiyonel alanlar) ve `runSearchJob` (sayfalama, `maxPages` sınırı,
      429'da üstel geri çekilme, `maxRetries` tükenince sessizce durma) unit test edildi.
- [x] Migration `20260925192000_worker_leases_and_places_queue.sql` SPEC G.1/P.3 ile satır satır
      karşılaştırıldı: `worker_leases` tek aktif worker kilidi (RLS SELECT-only, yazma yalnızca
      RPC), `enqueue_search_job` aylık kota kontrolü + 30 gün tekrar uyarısı, Vault secret
      RPC'leri (`admin_set_secret`/`admin_get_secret_status`/`internal_get_secret`) yalnızca
      admin/service_role tarafından çağrılabiliyor.
- [x] `places-search` ve `admin-secrets` Edge Function'ları kodu incelendi: service role key
      yalnızca `internal_get_secret` çağrısı için kullanılıyor, ham API anahtarı hiçbir zaman
      istemciye dönmüyor (yalnızca `configured`/`last4`).
- [x] Masaüstü tarafı: `places-provider.ts` adapter'ı 429'u core'un beklediği `rateLimited: true`
      şekline çeviriyor; `search-queue-runner.ts` lease alıp/bırakıyor ve her sonucu
      `import_business()` RPC'sine yazıyor (iş mantığı istemciye değil SQL'e güveniyor).
- [x] Secret-scan (CI) `admin-secrets`/`places-search` Edge Function kaynak dosyalarında düz
      metin anahtar bulunmadığını doğrular; kod incelemesiyle de teyit edildi.

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [x] **pgTAP testleri** (`worker_lease_and_quota.test.sql`): Docker kurulup gerçek Postgres'e
      karşı çalıştırıldı (2026-09-26). İlk çalıştırmada `enqueue_search_job()`'da gerçek bir bug
      bulundu (`outreach_limits->'places_monthly_cap'` explicit JSON null'ı `::integer`'a cast
      edemiyordu) ve düzeltildi (`20260926100200_fix_enqueue_search_job_null_cap.sql`). 16/16
      dosya, 82/82 test PASS.
- [ ] **Deno testleri** (`admin-invite`, gerekirse yeni Edge Function testleri): Deno kurulu
      değil.
- [x] **Gerçek Google Places çağrısı, arama+dönüşüm katmanı** (2026-09-26, `scripts/smoke/
      google-places.ts`, gerçek API key ile): `places:searchText` (New) uç noktasına
      `places-search` Edge Function'ıyla birebir aynı field mask'la çağrı yapıldı — 5 gerçek
      sonuç, doğru E.164 telefon normalizasyonu (`+90...`), website/OPERATIONAL durumu ile
      `placeToBusinessPayload()` ile dönüşüm hatasız çalıştı. NVIDIA smoke testinin aksine
      **hiçbir bug bulunmadı**.
      **Hâlâ eksik:** Settings → Vault akışı, Discover sayfasından gerçek bir arama başlatıp
      sonuçların Leads'e düştüğü, `search_jobs.status`/`api_calls`/`result_count`/`new_count`/
      `duplicate_count` alanlarının gerçek bir Supabase projesinde (worker/queue dahil) uçtan uca
      doğrulanması hâlâ kullanıcı tarafından yapılmalı.
- [ ] **429 / rate limit senaryosu**: Gerçek API'de tetiklemek zor; `runSearchJob` birim testinde
      simüle edildi ama uçtan uca (Edge Function → adapter → worker) davranışı gerçek bir kotayı
      zorlamadan doğrulanamadı.
- [ ] **Kota aşımı**: `workspace_settings.outreach_limits.places_monthly_cap` düşük bir değere
      ayarlanıp (`admin_set_secret` değil, ayrı bir admin ekranı gerektirir — bu fazda yok, SQL'den
      elle güncellenmeli) `enqueue_search_job`'ın `quota_exceeded` hatası verdiği ve Discover
      sayfasının bunu gösterdiği doğrulanmalı.
- [ ] **Tekrar uyarısı**: Aynı `textQuery` ile 30 gün içinde ikinci kez arama yapıldığında
      `repeatWarning` banner'ının göründüğü doğrulanmalı.
- [ ] **Worker lease çakışması**: İki farklı cihazdan aynı anda "Kuyruğu Çalıştır" tetiklendiğinde
      yalnızca birinin işi işlediği, diğerinin `leaseHeldElsewhere` ile sessizce çıktığı
      doğrulanmalı.
- [ ] **Admin olmayan kullanıcı Settings'te API anahtarı göremiyor**: `tr.settings.adminOnly`
      mesajının MEMBER/AGENT rolündeki kullanıcıya gösterildiği, admin-secrets çağrısının hiç
      yapılmadığı doğrulanmalı.

## Notlar

- `places_monthly_cap`'i ayarlamak için Faz 3'te ayrı bir UI yok (SPEC'te bu fazın kapsamında
  belirtilmemiş); admin şimdilik `workspace_settings.outreach_limits` içindeki değeri SQL'den
  güncelliyor. İleri bir fazda Settings'e eklenmesi gerekirse `docs/adr/` altına not düşülmeli.
- `search-queue-runner.ts` cihaz kimliğini (`lbf.device_id`) `localStorage`'da tutar; bu bir
  secret değildir, yalnızca lease sahipliğini ayırt etmek için kullanılır (CLAUDE.md #1 kapsamı
  dışında — session/anon key gibi bir kimlik bilgisi değil).
- Discover sayfasındaki "Ara" butonu, işi kuyruğa aldıktan hemen sonra `processSearchQueue`'yu
  otomatik tetikler; bu bir UX kısayolu — arka planda birden fazla masaüstü örneği açık olsa da
  `worker_leases` kilidi sayesinde aynı işi iki kez işleyen olmaz.
