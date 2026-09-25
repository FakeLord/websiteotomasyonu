# ADR 0001 — Tauri 2 Plugin Adları ve NSIS Bundle Ayarları

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-25
- **Bağlam:** `docs/phases/PHASE-00.md` → VERIFY_CURRENT_DOCS maddesi

## Sorun

PHASE-00.md ve SPEC.md, Tauri 2 plugin adlarının ve NSIS bundle ayarlarının (özellikle `installMode: "currentUser"`) güncel resmi dokümanlarla doğrulanmasını istiyor.

## Araştırma Bulguları

### Plugin adları (npm / crate)

| Plugin | npm paketi | Rust crate |
| --- | --- | --- |
| Log | `@tauri-apps/plugin-log` | `tauri-plugin-log` |
| Single instance | `@tauri-apps/plugin-single-instance` | `tauri-plugin-single-instance` |
| Opener | `@tauri-apps/plugin-opener` | `tauri-plugin-opener` |

Kurulum: `pnpm add @tauri-apps/plugin-<isim>` (JS tarafı) + Rust tarafında `cargo add tauri-plugin-<isim>` (`src-tauri/Cargo.toml`), `tauri-plugin-<isim>::init()` ile `lib.rs`/`main.rs`'te kaydedilir.

### NSIS `installMode` — **DÜZELTME**

Resmi dokümana göre (`v2.tauri.app/distribute/windows-installer/`) `tauri.bundle.windows.nsis.installMode` üç değer alır:

- `"perUser"` **(varsayılan)** — `%LOCALAPPDATA%` altına kurar, yönetici yetkisi istemez.
- `"perMachine"` — `C:/Program Files`, yönetici yetkisi gerekir.
- `"both"` — kullanıcıya sorar (yönetici gerektirir).

**`"currentUser"` diye bir değer yok.** SPEC.md ve PHASE-00.md'deki `installMode: currentUser` ifadesi hatalı/eski terminoloji; doğru değer **`"perUser"`**'dır ve tam olarak istenen davranışı verir (yönetici yetkisi istemeden kullanıcı bazlı kurulum). Uygulamada `nsis.installMode: "perUser"` kullanılacak.

### `webviewInstallMode`

`tauri.bundle.windows.webviewInstallMode.type` değerleri: `downloadBootstrapper` (varsayılan), `embedBootstrapper`, `offlineInstaller`, `fixedVersion`, `skip`. SPEC'teki `downloadBootstrapper` doğru ve varsayılan değerle aynı; internet bağlantısı gerektirir, küçük installer boyutu sağlar.

### `languages` / `displayLanguageSelector`

`tauri.bundle.windows.nsis.languages` bir dil kodu dizisi alır (NSIS dil listesine göre; `"Turkish"`, `"English"` geçerli). `displayLanguageSelector: false` ile seçim ekranı atlanır ve ilk dil kullanılır — SPEC'teki ayarla birebir uyumlu.

### Masaüstü kısayolu / sihirbaz adımları

Tauri'nin varsayılan NSIS şablonu Welcome → Install Directory → Install → Finish adımlarını içerir; ayrı bir "Desktop Shortcut" onay sayfası varsayılan şablonda garanti değildir (resmi dokümanda bu adım ayrıca belgelenmemiştir). Gerekirse `installerHooks` (`.nsh` dosyası, `NSIS_HOOK_PREINSTALL`/`POSTINSTALL`/`PREUNINSTALL`/`POSTUNINSTALL`) ile özelleştirilebilir. Bu detay Faz 0 kapsamında kritik değildir; varsayılan şablon kullanılacak, gerekirse Faz 13'te (installer cilası) `installerHooks` ile ayrıntılandırılır.

## Karar

- `apps/desktop/src-tauri/tauri.conf.json` içinde:
  - `bundle.windows.nsis.installMode: "perUser"` (SPEC'teki `currentUser` yerine düzeltilmiş doğru değer).
  - `bundle.windows.webviewInstallMode.type: "downloadBootstrapper"`.
  - `bundle.windows.nsis.languages: ["Turkish", "English"]`, `displayLanguageSelector: false`.
- Plugin kurulumları resmi paket adlarıyla yapılacak (`@tauri-apps/plugin-log`, `@tauri-apps/plugin-single-instance`, `@tauri-apps/plugin-opener`).

## Sonuçlar

`docs/SPEC.md` ve `docs/phases/PHASE-00.md` içindeki `installMode: currentUser` ifadesi bilgi amaçlı yanlış; kod tarafında doğru değer (`perUser`) kullanılacak. Karar Kaydı'na (D14: Windows kurulumu, yönetici yetkisi gerekmez) bu ADR ile netlik getirildi; D14'ün davranışsal hedefi değişmedi, yalnızca doğru config anahtarı netleşti.

## Kaynaklar

- [Windows Installer | Tauri v2](https://v2.tauri.app/distribute/windows-installer/)
- [@tauri-apps/plugin-log — npm](https://www.npmjs.com/package/@tauri-apps/plugin-log)
- [tauri-plugin-log — crates.io](https://docs.rs/crate/tauri-plugin-log/latest)
