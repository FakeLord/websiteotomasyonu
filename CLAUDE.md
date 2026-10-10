# CLAUDE.md — Global Business Finder

Tarayıcıda (web modu) ve Windows masaüstünde (Tauri 2) çalışan React + TypeScript uygulaması ve Supabase paylaşımlı backend.
2–3 kişilik ajans ekibi **dünya genelinde** web sitesi müşterisi bulur, analiz eder, puanlar ve AI destekli, insan kontrollü satış süreci yürütür.

**Tek doğruluk kaynağı:** `docs/SPEC.md`. Başlangıçtaki "Karar Kaydı" (D1–D22) bağlayıcıdır; küresel kapsam ve faz sırası `docs/adr/0010-global-pivot.md`'dedir.
**Aktif faz:** `docs/phases/PHASE-XX.md` (Yol Haritası v2: PHASE-12…22). Yalnızca aktif fazın kapsamında çalış. Açık işler: `docs/BACKLOG.md`.

## Mimari (özet)

- İş mantığı saf TypeScript olarak `packages/core` içinde durur. Desktop ve Supabase Edge Functions (Deno) aynı kodu kullanır.
- Rust (`apps/desktop/src-tauri`) ince tutulur: keyring (Windows Credential Manager), HTTP fetch (website analizi), SMTP/IMAP, URL açma, loglama, updater. Rust'ta iş kuralı yazma.
- Yetki veritabanında zorlanır: RLS, `transition_stage`, `outreach_guard`, `log_activity` RPC'leri ve trigger'lar. İstemci güvenilmez kabul edilir.
- Paylaşılan secret'lar (Google Places, NVIDIA) Supabase Vault'ta tutulur ve yalnızca Edge Function'lar üzerinden kullanılır. Kişisel secret'lar (SMTP/IMAP, oturum) Windows Credential Manager'da tutulur.
- Dış servislerin hepsi `packages/providers` içindeki interface'lerin arkasında durur. Her birinin bir Mock'u vardır.
- AI provider OpenAI-uyumludur (`OpenAICompatibleProvider`). Varsayılan NVIDIA'dır; model adları kodda değil, `workspace_settings.ai_config` içinde durur.

## Klasörler

```
apps/desktop/            Tauri + React uygulaması (src/, src-tauri/)
apps/local-server/       Web modu için yerel Node sunucusu (SMTP/IMAP/site analizi/kasa; iş kuralı yok)
packages/core/           Domain mantığı (scoring, dedupe, normalize, pipeline, routing, outreach-rules,
                         website-analyzer, followup, ai/prompts+validators, actions)
packages/contracts/      zod şemaları, DB tipleri, action sözleşmeleri
packages/providers/      Provider interface'leri + mocks/
supabase/                migrations/, functions/, tests/ (pgTAP), seed.sql
jarvis/                  SKILL.md, actions.json (üretilir, elle düzenlenmez)
scripts/                 smoke/ (gerçek servis duman testleri), eval/ (AI kalite ölçümü), ops/ (veri sıfırlama)
docs/                    SPEC.md, phases/, adr/, qa/
```

## Komutlar

```
pnpm install
pnpm dev                 # Tauri dev
pnpm web                 # tarayıcı modu: arayüz + yerel sunucu, 127.0.0.1:5174 (baslat.cmd tek tık)
pnpm dev:web             # tarayıcı modu, Vite HMR (localhost:1420)
pnpm test                # Vitest (tüm paketler)
pnpm lint && pnpm typecheck
supabase start           # lokal Supabase (Docker)
pnpm test:db             # pgTAP (supabase test db)
pnpm tauri build         # NSIS installer (Windows)
```

## Kesin kurallar

1. Secret'ları (service role key, API key, şifre, token) istemci koduna, repoya, `.env` commit'ine, loglara veya test fixture'larına koyma. İstemcide yalnızca `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` olur.
2. Eski migration dosyalarını düzenleme; her değişiklik yeni bir migration olur. RLS politikası, tablosuyla aynı migration'da yazılır.
3. Her yeni tabloda `ENABLE ROW LEVEL SECURITY` bulunur ve pgTAP izolasyon testi yazılır. RLS'i asla kapatma.
4. `activity_logs` yalnızca INSERT alır (RPC/trigger ile). UPDATE/DELETE yolu açma.
5. `stage`, `do_not_contact`, `lead_score` kolonları yalnızca RPC ile değişir.
6. Testlerde gerçek API çağrısı yapılmaz; Mock provider kullanılır. Gerçek API yalnızca `scripts/smoke/*` altında, elle çalıştırılır.
7. Her domain kuralı `packages/core` içinde yazılır ve unit testi olur. Her bug düzeltmesi önce kırmızı bir testle başlar.
8. Kullanıcıya dönük her mutasyon activity log yazar. `actor_type` istemciden alınmaz.
9. Scraping, login bypass, browser otomasyonuyla DM gönderme veya platform korumalarını aşma kodu yazma. Kanallar AUTO / ASSISTED / MANUAL capability modeline uyar.
10. AI çıktısı her zaman şemalı JSON'dur ve `validateDraft` kontrolünden geçer. KB dışı fiyat, indirim, referans veya teslim süresi içeren taslak kullanıcıya gösterilmez.
11. Aktif faz dışındaki dosyaları refactor etme. Kapsam dışı bir ihtiyaç görürsen `docs/adr/` altına not düş ve kullanıcıya sor.
12. `VERIFY_CURRENT_DOCS` etiketli bir konuda kod yazmadan önce resmi dokümanı kontrol et. Bulguyu `docs/adr/NNNN-*.md` olarak kaydet.

## Çalışma şekli

- Önce Plan Mode'da çalış: dosya listesi, migration'lar, testler ve riskler. Kullanıcı onaylamadan kod yazma.
- İşi alt adımlara böl. Her alt adımda: implement → `pnpm lint && pnpm typecheck && pnpm test` (gerekirse `pnpm test:db`) → `checkpoint: <adım>` commit'i.
- Faz sonunda acceptance criteria'nın her maddesini ve nasıl doğrulandığını raporla. `docs/qa/phase-XX.md` manuel test listesini güncelle.
- Commit formatı Conventional Commits: `feat:`, `fix:`, `test:`, `db:`, `chore:`, `docs:`. Dal adı: `feature/pXX-<ad>`.

## Kodlama standartları

- TypeScript `strict`; `any` yasak (gerekirse `unknown` + zod).
- UI: Tailwind + shadcn/ui. Sunucu durumu TanStack Query, UI durumu Zustand. Formlar react-hook-form + zod.
- Kullanıcıya görünen metinler Türkçedir ve tek bir `apps/desktop/src/i18n/tr.ts` dosyasında durur.
- Tarih ve saat UTC saklanır, `Europe/Istanbul` gösterilir. Telefonlar E.164 formatındadır (libphonenumber-js).
- DB enum'ları Postgres `enum` tipiyle değil, `text + CHECK` ile tanımlanır. PK'lar UUID'dir (`activity_logs` hariç).
