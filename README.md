# Local Business Finder

Windows masaüstü uygulaması (Tauri 2 + React + TypeScript) ve Supabase paylaşımlı backend. 2–3 kişilik ajans ekibi web sitesi müşterisi bulur, analiz eder, puanlar ve AI destekli, insan kontrollü satış süreci yürütür.

Tek doğruluk kaynağı: [`docs/SPEC.md`](docs/SPEC.md). Aktif faz spec'leri: [`docs/phases/`](docs/phases/). Çalışma kuralları: [`CLAUDE.md`](CLAUDE.md).

## Gereksinimler

- Node.js ≥ 20, pnpm 9 (`corepack enable pnpm` yeterli)
- Rust + Cargo (Tauri için) — [rustup.rs](https://rustup.rs)
- Windows'ta [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (genelde Windows 10/11'de kurulu)
- Docker Desktop veya Podman (lokal Supabase için)

## Kurulum

```bash
pnpm install
cp .env.example .env   # VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY doldurulur
```

## Tarayıcıda çalıştırma (web modu)

Aynı uygulama masaüstü kurulumu olmadan, kendi bilgisayarınızda tarayıcıdan da çalışır
([ADR 0009](docs/adr/0009-web-mode.md)). Küçük bir yerel sunucu arayüzü ve SMTP/IMAP/site analizi/kasa
uçlarını yalnızca `127.0.0.1`'den sunar; sırlar yine Windows Kimlik Bilgisi Yöneticisi'nde kalır.

- **Tek tık:** `baslat.cmd` (Docker + Supabase'i açar, arayüzü gerekirse derler, tarayıcıyı açar).
  Arayüz kodu değiştiyse `baslat.cmd build`.
- **Komutla:** Docker/Supabase açıkken `pnpm web` → <http://127.0.0.1:5174> (`LBF_PORT` ile port değişir).
- **Geliştirme (HMR):** `pnpm dev:web` → <http://localhost:1420>.

Yalnızca bu bilgisayardan erişilir; ekip arkadaşları kendi makinelerinde aynı şekilde çalıştırır
(hepsi aynı Supabase'e bağlanır). IMAP/otomasyon işleri sekme açıkken çalışır.

## Geliştirme komutları

```bash
pnpm dev          # Tauri masaüstü uygulamasını geliştirme modunda açar
pnpm web          # Arayüzü derleyip tarayıcı modunda sunar (127.0.0.1:5174)
pnpm dev:web      # Tarayıcı modu, Vite HMR ile (localhost:1420)
pnpm lint         # ESLint
pnpm typecheck    # Tüm workspace paketlerinde tsc --noEmit
pnpm test         # Vitest (tüm paketler)
supabase start    # Lokal Supabase (Docker gerekir)
pnpm test:db      # pgTAP testleri (lokal Supabase gerektirir)
pnpm tauri build  # Windows NSIS installer üretir
```

## Monorepo yapısı

```
apps/desktop/      Tauri + React uygulaması (tarayıcıda da çalışır)
apps/local-server/ Web modu için yerel Node sunucusu (SMTP/IMAP/site analizi/kasa)
packages/core/      Saf TypeScript domain mantığı
packages/contracts/ zod şemaları, action sözleşmeleri
packages/providers/ Dış servis interface'leri + Mock'lar
supabase/            migrations/, functions/, tests/ (pgTAP)
jarvis/              Jarvis entegrasyon iskeleti (Faz 12)
docs/                SPEC, faz spec'leri, ADR'ler, QA listeleri
```

Ayrıntılı mimari için [`docs/SPEC.md`](docs/SPEC.md) → B ve C bölümlerine bakın.
