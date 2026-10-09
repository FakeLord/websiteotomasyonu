# Teknik notlar

## Komutlar
```
pnpm install
pnpm typecheck && pnpm lint && pnpm test      # birim testler
pnpm test:db                                  # pgTAP (Docker + supabase start gerekir)
npx -y deno@2 test --no-config --no-lock supabase/functions
pnpm --filter @lbf/desktop build              # baslat.cmd'nin sunduğu dist'i derler
pnpm dev:web                                  # Vite (localhost:1420); VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY gerekir
npx supabase migration up                     # yerel DB'ye yeni migration (sıfırlamadan)
```
Yerel doğrulama düzeni: Docker Desktop aç → `supabase start` → `supabase status -o env` ile URL/anahtar al → `pnpm dev:web` →
tarayıcı panelinde http://localhost:1420. İş bitince `supabase stop` ve Docker'ı kapat.

## Mimari özet
- İş mantığı `packages/core` (saf TypeScript; masaüstü ve Edge Function aynı kodu kullanır). Arayüz metinleri tek dosyada: `apps/desktop/src/i18n/tr.ts`.
- Yetki veritabanında: RLS, `SECURITY DEFINER` RPC'ler, tetikleyiciler. İstemci güvenilmez; kolon bazlı UPDATE beyaz listesi.
- Paylaşılan sırlar (Google Places, NVIDIA) Supabase Vault'ta; yalnızca Edge Function'lar okur.
- Arka plan işleri sekmede çalışır; çakışmayı `worker_leases` (analiz) ve `claim_next_scan_tile` (tarama, `FOR UPDATE SKIP LOCKED`) önler.

## Önemli tasarım noktaları
- **Aşama ilerlemesi** `stagePathForOutcome` (core) ve `set_contact_attempt_outcome` (SQL) iki yerde aynı kuralı uygular; biri değişirse diğeri de.
- **Tarama kareleri:** `TILE_RESULT_CAP = 60`, `MAX_TILE_DEPTH = 6`; kare 60 sonuç dönerse dörde bölünür; ardışık 3 hatada tur durur.
- **Aylık sayaç** `places_usage`, `consume_places_call` ile Google'a gitmeden ÖNCE düşülür; başarısız çağrıda iade edilir (402 `QUOTA_EXCEEDED`).
- **Tek etkin devir kartı:** kısmi benzersiz indeks `status in ('OPEN','ACCEPTED')`.
- **Zincir:** `businesses.chain_size`, tetikleyiciyle (`recompute_chain_size`) tutulur; istemci yazamaz.

## Bu oturumda öğrenilen dersler
1. **Önce yeniden üret, sonra yama yap.** Analiz donmasını dört tahmini düzeltme çözmedi; gerçek veriyle yerelde yeniden üretince kök neden
   (regex geri izlemesi) bulundu. Bellek notu: `reproduce-before-patching`.
2. **UI değişikliğinden sonra `dist` yeniden derlenmeli.** Kullanıcı `baslat.cmd` ile derlenmiş dist'i görür; eski derlemeyi görüp "düğme yok" dedi.
   Derledikten sonra pakette **yeni** metni `grep` ile doğrula. Bellek notu: `rebuild-dist-before-telling-user`.
3. **Tarayıcı açılır pencere engeli:** bağlantı, tıklamanın hemen içinde açılmalı; kayıt (RPC) bağlantıdan SONRA yapılır.
4. **pgTAP tuzakları:** `bootstrap_workspace` bir kez; üye eklerken `request.jwt.claim.sub` boşaltılmalı; `is(..., null)` yerine `ok(x is null)`;
   plan sayısı tam tutmalı; `now()` işlem içinde sabittir → sıralama gereken yerde `clock_timestamp()`; tarih sınırı testleri çalışma
   alanı saat dilimine (Europe/Istanbul) duyarlıdır (21:00 UTC'den sonra gün değişir) → geniş aralık kullan.
5. **`psql -c` ile `\gset` çalışmaz;** değişkenli betikler `docker exec -i ... psql` ile stdin'den verilir. Tek `-c` içindeki hata tüm işlemi geri alır.
6. **İçe aktarma dedupe'u** alan adı/telefon/e-posta/sosyal hesap eşleşmesini tek kayıtta birleştirir; test verisinde aynı değeri paylaşan iki kayıt beklenemez.
7. **Doğrudan UPDATE** politikası olmayan tabloda hata vermez, 0 satıra etki eder; testte `throws_ok` değil "değişmedi" doğrulanır.
8. `Array.prototype.at` TS hedefinde yok; Python `str.replace` sessiz başarısız olabilir → doğrulamalı yama betikleri (assert) kullanıldı.
9. Satır sonu uyarıları (`LF will be replaced by CRLF`) zararsızdır.

## Dosya haritası (yeni)
- Çekirdek: `packages/core/src/discovery/{tiling,scan-tile}.ts`, `pipeline/{opportunity,contact-outcome}.ts`,
  `routing/{quick-contact,reachability}.ts`, `business/edit-patch.ts`, `ai/{retry-rejected,foreign-words}.ts`
- Arayüz: `apps/desktop/src/app/jobs-menu.tsx`, `features/discover/ScanPlanDialog.tsx`, `features/leads/{EditLeadDialog,BulkActionsBar}.tsx`,
  `features/leads/detail/{ContactOutcomePanel,ProgressTab,HandoffCard}.tsx`, `features/dashboard/TodayTasksCard.tsx`,
  `features/campaigns/EditCampaignDialog.tsx`, `workers/{scan-loop,scan-runner}.ts`
- Belgeler: `docs/adr/0013…0016`, `docs/qa/phase-15-automated-prospecting.md`, `docs/BACKLOG.md`
