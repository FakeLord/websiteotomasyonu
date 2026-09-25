# PHASE 00 — Foundation

**Dal:** `feature/p00-foundation` · **Tag:** `v0.0.1` · **Zorluk:** Orta · **Bağımlılık:** yok
**Referans:** `docs/SPEC.md` → B, C, T (Faz 0), U, V, W.5

## Amaç

Claude Code'un güvenle çalışacağı monorepo iskeleti ve her PR'da CI'dan indirilebilen, çalışan bir Windows `setup.exe`.

## Kapsam

### 1. Monorepo
- pnpm workspaces: `apps/desktop`, `packages/core`, `packages/contracts`, `packages/providers`.
- Kök `tsconfig.base.json` (strict), ESLint + Prettier, `pnpm lint`, `pnpm typecheck` ve `pnpm test` script'leri.
- Vitest workspace config; her pakette en az bir örnek test.
- `.gitignore`: `.env*`, `node_modules/`, `target/`, `dist/`, `supabase/.temp`, `*.log`.
- `.env.example`: yalnızca `VITE_SUPABASE_URL=` ve `VITE_SUPABASE_ANON_KEY=`.

### 2. Desktop kabuğu (`apps/desktop`)
- Tauri 2 + React + TS + Vite. Tailwind + shadcn/ui kurulu.
- Layout: sol sidebar ve boş sayfalar (Dashboard, Discover, Leads, Conversations, Follow-Ups, Activity Log, Team, Knowledge Base, Settings). Her sayfada "Yakında" yer tutucusu bulunur.
- React Router, TanStack Query provider, Zustand store iskeleti, error boundary.
- `src/i18n/tr.ts`: tüm UI metinleri burada.
- Online/offline banner iskeleti (`navigator.onLine` + TanStack `onlineManager`).
- Tauri eklentileri: `tauri-plugin-log` (dosya logu, 7 gün rotasyon), `tauri-plugin-single-instance`, `tauri-plugin-opener`.
- Tauri capabilities: yalnızca kullanılan izinler.
- Uygulama adı "Local Business Finder", identifier `com.<ajans>.localbusinessfinder`. `<ajans>` değerini kullanıcıya sor.

### 3. Paket iskeletleri
- `packages/core/src/index.ts` ve örnek bir saf fonksiyon + testi (ör. `normalizeDomain`).
- `packages/providers/src/`: yalnızca interface'ler (`AIProvider`, `PlacesProvider`, `WebsiteFetcher`, `MessageSender`, `Clock`). Her birinin `mocks/` altında basit Mock'u olur.
- `packages/contracts/src/`: zod kurulumu ve boş `actions/` klasörü.

### 4. Supabase
- `supabase init`. `supabase/migrations/` boş, `supabase/tests/` klasörü ve pgTAP'ın çalıştığını gösteren tek örnek test.
- Uzak proje bağlantısı YOK (Faz 1'de). Bu fazda yalnızca lokal `supabase start` çalışır.

### 5. Dokümantasyon
- `docs/SPEC.md` (hazır), `docs/phases/`, `docs/adr/0000-template.md`, `docs/qa/phase-00.md`.
- `jarvis/SKILL.md` (yer tutucu) ve `jarvis/actions.json` (`{"version":"0.0.0","actions":[]}`).
- Kök `README.md`: kurulum ve geliştirme komutları.

### 6. CI (`.github/workflows/`)
- `ci.yml` (PR + main): ubuntu üzerinde lint, typecheck, test. windows-latest üzerinde `tauri-apps/tauri-action` ile NSIS build yapılır ve setup.exe artifact olarak yüklenir.
- `release.yml` (`v*` tag): setup.exe'yi taslak GitHub Release'e ekler.
- NSIS ayarları: `installMode: currentUser`, `languages: ["Turkish","English"]`, `webviewInstallMode: downloadBootstrapper`.
- Build'de service role key veya bilinen secret kalıbı var mı diye kontrol eden bir adım (grep veya gitleaks).

## Kapsam dışı
Auth, veritabanı tabloları, Supabase uzak projesi, gerçek provider'lar, iş özellikleri.

## Testler
- Her pakette en az bir Vitest testi.
- 1 pgTAP smoke testi.
- `cargo test` (boş da olsa çalışır).

## Acceptance criteria
- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` temiz makinede yeşil.
- [ ] `pnpm dev` uygulamayı açar; sidebar'daki 9 sayfa arasında gezilebilir.
- [ ] CI'daki setup.exe temiz bir Windows 10/11'de yönetici yetkisi istemeden kurulur, Başlat menüsünden açılır ve Program Ekle/Kaldır'dan kaldırılır.
- [ ] Repoda secret yok; CI secret kontrolü geçiyor.
- [ ] Uygulama logları `%APPDATA%` altında oluşuyor.
- [ ] `docs/qa/phase-00.md` doldurulmuş.

## VERIFY_CURRENT_DOCS
- Tauri 2 plugin adları/sürümleri ve NSIS bundle ayarları (masaüstü kısayolu davranışı dahil). Bulguları `docs/adr/0001-tauri-setup.md` dosyasına yaz.
