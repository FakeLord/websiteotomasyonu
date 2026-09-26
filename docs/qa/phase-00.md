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

- [x] `pnpm tauri build` (2026-09-26): gerçek bir Windows makinesinde lokal olarak çalıştırıldı,
      `Local Business Finder_0.1.0_x64-setup.exe` (NSIS, imzasız) hatasız üretildi ve gerçekten
      kurulup çalıştırıldı. **Bulunan gerçek bug:** ilk build kök dizinde `.env` olmadan (yalnızca
      boş `.env.example`) yapılmıştı; `supabase-client.ts` eksik `VITE_SUPABASE_URL`/
      `VITE_SUPABASE_ANON_KEY`'de bir `Error` fırlatıyor, bu da React'in hiç mount olmadan
      çökmesine ve **kullanıcıya hiçbir hata mesajı gösterilmeden bembeyaz bir pencereye**
      (Tauri/WebView2'nin varsayılan boş sayfası) yol açıyor. Kök dizine gerçek `.env` (lokal
      Supabase URL/anon key) eklenip yeniden build edilince düzeltildi. **Ayrı bir iyileştirme
      önerisi (henüz uygulanmadı):** `supabase-client.ts`'deki bu throw, kullanıcıya görünür bir
      hata ekranı yerine sessiz bir beyaz ekrana düşüyor — bir React error boundary veya
      başlangıç-durumu kontrolü eklenmesi, gelecekte benzer bir yapılandırma hatasını çok daha
      hızlı teşhis edilebilir kılar.
      CI'daki (`windows-latest` runner) artifact ayrıca doğrulanmamıştır.
- [x] `supabase start` + `supabase test db` (2026-09-26): Docker Desktop kurulup lokal Supabase
      ayağa kaldırıldı, `smoke.test.sql` dahil **16/16 pgTAP dosyası (82/82 test) PASS**. Bu
      süreçte 3 gerçek üretim bug'ı bulunup düzeltildi (bkz. Faz 3/4/6 QA notları).
- [ ] Uygulama logları `%APPDATA%\com.hostlysisletme.localbusinessfinder\logs\` altında oluşuyor mu (native `pnpm tauri dev`/`pnpm tauri build` sonrası kontrol edilmeli — bu ortamda native pencere çalıştırılamadı).

## Notlar

- `docs/adr/0001-tauri-setup.md`: `installMode` için web dokümanı ile kurulu Tauri crate'i arasında çelişki bulundu ve kurulu crate esas alındı (`currentUser` doğru değer). `tauri-plugin-log`'un yalnızca boyut tabanlı rotasyon desteklediği, native 7 günlük zaman bazlı temizlik olmadığı not edildi.
- Bu geliştirme ortamı Linux benzeri bir bash katmanında (Git Bash/MSYS) çalıştığı ve Docker kurulu olmadığı için CI'daki `windows-latest` job'u ve kullanıcının kendi Windows makinesi, yukarıdaki işaretlenmemiş maddeler için asıl doğrulama noktasıdır.
