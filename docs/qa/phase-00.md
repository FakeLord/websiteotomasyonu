# Faz 0 — Manuel QA Listesi

Kaynak: `docs/phases/PHASE-00.md` → Acceptance criteria.

## Otomatik doğrulanabilenler (bu oturumda kontrol edildi)

- [x] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` temiz makinede yeşil.
  - `pnpm lint`: 0 hata.
  - `pnpm typecheck`: 4/4 workspace paketi (`core`, `providers`, `contracts`, `desktop`) yeşil.
  - `pnpm test`: 4 test dosyası, 11 test, hepsi geçti.
- [x] `pnpm dev` uygulamayı açar; sidebar'daki 9 sayfa arasında gezilebilir.
  - Native Tauri penceresi bu geliştirme ortamında (headless CI benzeri) doğrudan gözlemlenemedi; bunun yerine `vite build` + `vite preview` ile React uygulaması tarayıcıda açıldı, sidebar'daki 9 sayfanın tamamına (`/`, `/discover`, `/leads`, `/conversations`, `/follow-ups`, `/activity-log`, `/team`, `/knowledge-base`, `/settings`) gidildi ve her biri doğru "Yakında" içeriğini gösterdi. Rust tarafı `cargo check` ile ayrıca derleme hatasız doğrulandı.
  - **Kullanıcı tarafından tamamlanmalı:** gerçek Windows makinede `pnpm tauri dev` çalıştırılıp native pencerenin açıldığı teyit edilmeli.
- [x] Repoda secret yok.
  - `.env.example` yalnızca `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` içeriyor (boş değerlerle).
  - Servis rolü anahtarı veya benzeri desenler için grep taraması `ci.yml` içinde otomatikleştirildi (bkz. CI job'u).

## Kullanıcı tarafından elle doğrulanması gerekenler

- [ ] CI'daki setup.exe temiz bir Windows 10/11'de yönetici yetkisi istemeden kurulur, Başlat menüsünden açılır ve Program Ekle/Kaldır'dan kaldırılır.
  - GitHub Actions `ci.yml` her PR'da `windows-latest` runner'da NSIS installer üretip artifact olarak yüklüyor; bu artifact indirilip gerçek bir Windows makinede denenmeli.
- [ ] `supabase start` ile lokal Supabase'in ayağa kalktığı doğrulanmalı (bu geliştirme ortamında Docker/Podman kurulu değildi; `DockerLifecycleInspectError` alındı). Docker Desktop kurulu bir makinede `supabase start` ve `supabase test db` çalıştırılıp `smoke.test.sql`'in geçtiği teyit edilmeli.
- [ ] Uygulama logları `%APPDATA%\com.hostlysisletme.localbusinessfinder\logs\` altında oluşuyor mu (native `pnpm tauri dev`/`pnpm tauri build` sonrası kontrol edilmeli — bu ortamda native pencere çalıştırılamadı).

## Notlar

- `docs/adr/0001-tauri-setup.md`: `installMode` için web dokümanı ile kurulu Tauri crate'i arasında çelişki bulundu ve kurulu crate esas alındı (`currentUser` doğru değer). `tauri-plugin-log`'un yalnızca boyut tabanlı rotasyon desteklediği, native 7 günlük zaman bazlı temizlik olmadığı not edildi.
- Bu geliştirme ortamı Linux benzeri bir bash katmanında (Git Bash/MSYS) çalıştığı ve Docker kurulu olmadığı için CI'daki `windows-latest` job'u ve kullanıcının kendi Windows makinesi, yukarıdaki işaretlenmemiş maddeler için asıl doğrulama noktasıdır.
