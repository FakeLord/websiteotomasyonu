# Faz 6 — Manuel QA Listesi

Kaynak: `docs/SPEC.md` → J (AI Sales Agent) — bu faz için ayrı bir `PHASE-06.md` sağlanmadı.
Bkz. `docs/adr/0006-ai-integration.md` (NVIDIA VERIFY_CURRENT_DOCS bulgusu ve operasyon kapsamı).

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil — 24 test dosyası, 190 test (Faz 6 için 34
      yeni test: `validate-draft` 16, `prompts` 8, `contracts/ai/operations` 10).
- [x] `cargo check` ve `pnpm --filter @lbf/desktop exec vite build` hatasız (Faz 6'da Rust
      değişikliği yok, regresyon kontrolü).
- [x] **VERIFY_CURRENT_DOCS** (NVIDIA API): build.nvidia.com ücretsiz katmanının yalnızca
      prototipleme/değerlendirme için olduğu, gerçek işletmelere satış mesajı göndermenin
      "production" sayılabileceği ve 40 istek/dk gibi sınırlar olduğu doğrulandı; bulgular ve
      kod üzerindeki etkisi `docs/adr/0006-ai-integration.md`'de.
- [x] `packages/core/ai/validate-draft.ts` (J.3'ün kod seviyesi guardrail'ı — asıl güvence): kanal
      başına uzunluk sınırı (Instagram 600/e-posta 1200), fiyat kontrolü (₺/TL/$ + "bin" kısaltması,
      aktif paket aralığıyla eşleşmeli), indirim/yasak kelime listesi (workspace ayarına göre
      esnek), müşteri/marka referans kontrolü (KB'deki doğrulanmış REFERENCE listesiyle, alıcı
      işletmenin kendi adı hariç), teslim süresi kontrolü (gün/hafta, paket aralığıyla eşleşmeli),
      STOP_CONTACT'ta hiç taslak üretmeme — 16 test ile doğrulandı.
- [x] J.2'deki **6 operasyonun tamamı** (`draft_first_message`, `classify_reply`, `draft_reply`,
      `update_summary`, `generate_handoff`, `followup_draft`) saf context/prompt derleyicileri +
      JSON şemaları (`packages/contracts/src/ai/operations.ts`) olarak yazıldı ve test edildi;
      hangilerinin bu fazda gerçek bir UI'a bağlandığı (yalnızca `draft_first_message`) ve
      nedeni ADR 0006'da belgelendi.
- [x] `services`/`service_packages`/`kb_entries`/`ai_runs`/`ai_output_cache` migration'ı
      (`20260925195000_kb_and_ai.sql`) kod incelemesiyle SPEC.md → E tablosuyla karşılaştırıldı:
      yazma yalnızca admin (KB tabloları) veya yalnızca service_role (`ai_runs`/`ai_output_cache`),
      her KB mutasyonu `activity_logs`'a düşüyor (trigger), `ai_runs` yalnızca metadata tutuyor
      (prompt/yanıt metni `ai_output_cache`'te, istemciye hiç açılmıyor).
- [x] `ai-gateway` Edge Function kodu incelendi: üyelik kontrolü, günlük kota (varsayılan 300),
      24 saatlik `(operation, input_hash, prompt_version)` cache, NVIDIA anahtarını yalnızca
      `internal_get_secret` ile (mevcut Faz 3 Vault altyapısı, `nvidia_api_key` adıyla) okuyor,
      429'u `RATE_LIMITED` olarak eşliyor.
- [x] Masaüstü: Knowledge Base sayfası (hizmet/paket/KB girdisi CRUD, admin-only yazma,
      REFERENCE girdilerinde "doğrulanmamış" rozeti), lead detayında "Taslak Oluştur" butonu
      (`draft_first_message` → `ai-gateway` → `validateDraft`; reddedilirse sebepler listelenir,
      kabul edilirse taslak + kopyala butonu gösterilir).

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [x] **pgTAP testi** (`kb_and_ai.test.sql`): Docker kurulup gerçek Postgres'e karşı çalıştırıldı
      (2026-09-26). Bu çalıştırma sırasında `kb_write_log()` trigger'ının `name`/`title` kolonu
      olmayan tablolara (`conversations`, `followups`) da bağlı olduğu ve "record new has no
      field" hatasıyla patladığı bulundu; `to_jsonb(...)->>'...'` ile düzeltildi
      (`20260926100000_fix_kb_write_log_generic_fields.sql`). 16/16 dosya, 82/82 test PASS.
- [ ] **Deno testi** (`ai-gateway/validate.test.ts`): Deno kurulu değil.
- [ ] **Gerçek NVIDIA çağrısı uçtan uca**: Settings'te bir NVIDIA API anahtarı girilip lead
      detayından "Taslak Oluştur" ile gerçek bir taslak üretilip `validateDraft`'ın gerçek model
      çıktısını doğru şekilde kabul/reddettiği gerçek bir workspace'te doğrulanmalı.
- [ ] **"30 örnekte taslakların ≥ %90'ı düzenleme gerekmeden kullanılabilir"** (acceptance
      kriteri): gerçek model çıktılarıyla elle değerlendirilecek bir eval seti bu fazda
      oluşturulmadı (SPEC.md → J.4: "Faz 6'da 30 örnekli bir değerlendirme seti" — zaman kısıtı
      nedeniyle bu oturumda ertelendi, ayrı bir görev olarak eklenmeli).
- [ ] **24 saatlik cache**: Aynı taslağın (aynı işletme, aynı website analizi, değişmemiş
      paketler/kurallar) ikinci kez istenmesinde `ai_runs`'a `CACHED` statüsünde bir satır
      düştüğü ve gerçek bir API çağrısı yapılmadığı gerçek bir Supabase projesinde doğrulanmalı.
- [ ] **Günlük kota**: `ai_config.dailyLimit` düşük bir değere ayarlanıp aşıldığında
      `QUOTA_EXCEEDED` hatasının döndüğü ve masaüstünde görüldüğü doğrulanmalı.

## Notlar / bilinçli basitleştirmeler

- **Referans kontrolü sezgiseldir:** `findReferenceCandidates()` iki+ ardışık büyük harfle
  başlayan kelimeyi "olası marka/müşteri adı" sayar; gerçek bir NER değildir, yanlış pozitif/
  negatif üretebilir. Bilinçli bir mühendislik kısayolu — false positive (gereksiz red) tercih
  edilir, çünkü guardrail'in amacı uydurma referansı asla göstermemektir (CLAUDE.md #10).
- **Model seçimi:** `ai_config.routes[operation] ?? ai_config.model` ile operasyon bazlı model
  routing (J.4: "sınıflandırma/özet küçük modelde, mesaj yazma büyük modelde") mümkün ama
  varsayılan tek bir model adı (`meta/llama-3.1-70b-instruct`) kod içinde fallback olarak durur;
  gerçek model seçimi admin tarafından `workspace_settings.ai_config`'te yapılmalı.
- **`response_format: json_object`**, OpenAI-uyumlu her sağlayıcıda desteklenmeyebilir; NVIDIA
  NIM'in bunu desteklediği bu oturumda gerçek bir çağrı ile doğrulanamadı (ağ/anahtar yok).
  Desteklenmezse `ai-gateway` yine de ham metni JSON.parse etmeye çalışır ve başarısız olursa
  `PARSE_ERROR` döner (J.3 madde 1'deki "1 kez yeniden dene" orkestrasyonu bu fazda istemci
  tarafında uygulanmadı — tek deneme var, retry Faz 7'de eklenebilir).
- **KB sayfası** basit bir CRUD'dur; düzenleme/silme UI'ı yok (yalnızca ekleme + listeleme).
  Gerekirse ayrı bir görev olarak genişletilebilir.
