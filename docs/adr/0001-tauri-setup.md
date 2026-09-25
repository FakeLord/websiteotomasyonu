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
| Single instance | — (JS API yok) | `tauri-plugin-single-instance` |
| Opener | `@tauri-apps/plugin-opener` | `tauri-plugin-opener` |

Kurulum: `pnpm add @tauri-apps/plugin-<isim>` (JS tarafı) + Rust tarafında `cargo add tauri-plugin-<isim>` (`src-tauri/Cargo.toml`), `tauri-plugin-<isim>::init()` ile `lib.rs`/`main.rs`'te kaydedilir. **Not:** `single-instance` plugin'inin JavaScript API'si yoktur (npm paketi yayınlanmamıştır); yalnızca Rust tarafında (`Cargo.toml` + `lib.rs`) kurulur, capability dosyasında izin gerekmez.

### NSIS `installMode` — web dokümanı ile kurulu crate arasında çelişki, **kod kaynağı esas alındı**

Resmi web dokümanına göre (`v2.tauri.app/distribute/windows-installer/`) üç değer listeleniyordu: `"perUser"`, `"perMachine"`, `"both"` (`"currentUser"` yok deniyordu). Ancak bu değerle `cargo check` çalıştırıldığında **gerçek build hata verdi**:

```
unknown variant `perUser`, expected one of `currentUser`, `perMachine`, `both`
```

(kaynak: kurulu `tauri-utils 2.9.3` / `tauri 2.11.6`, 2026-09-25). Yani **kurulu crate'in kabul ettiği değer `"currentUser"`**; web dokümanı bu noktada güncel değil veya farklı bir sürüme ait. **SPEC.md ve PHASE-00.md'deki orijinal `installMode: currentUser` ifadesi doğruymuş** — bu ADR'nin ilk taslağındaki "düzeltme" hatalıydı ve derleme hatasıyla geri alındı. Ders: config enum değerleri için resmi web dokümanı yerine, mümkünse kurulu paketin gerçek davranışı (derleme/`cargo check`) esas alınmalı.

Uygulamada `nsis.installMode: "currentUser"` kullanılacak.

### `webviewInstallMode`

`tauri.bundle.windows.webviewInstallMode.type` değerleri: `downloadBootstrapper` (varsayılan), `embedBootstrapper`, `offlineInstaller`, `fixedVersion`, `skip`. SPEC'teki `downloadBootstrapper` doğru ve varsayılan değerle aynı; internet bağlantısı gerektirir, küçük installer boyutu sağlar.

### `languages` / `displayLanguageSelector`

`tauri.bundle.windows.nsis.languages` bir dil kodu dizisi alır (NSIS dil listesine göre; `"Turkish"`, `"English"` geçerli). `displayLanguageSelector: false` ile seçim ekranı atlanır ve ilk dil kullanılır — SPEC'teki ayarla birebir uyumlu.

### Masaüstü kısayolu / sihirbaz adımları

Tauri'nin varsayılan NSIS şablonu Welcome → Install Directory → Install → Finish adımlarını içerir; ayrı bir "Desktop Shortcut" onay sayfası varsayılan şablonda garanti değildir (resmi dokümanda bu adım ayrıca belgelenmemiştir). Gerekirse `installerHooks` (`.nsh` dosyası, `NSIS_HOOK_PREINSTALL`/`POSTINSTALL`/`PREUNINSTALL`/`POSTUNINSTALL`) ile özelleştirilebilir. Bu detay Faz 0 kapsamında kritik değildir; varsayılan şablon kullanılacak, gerekirse Faz 13'te (installer cilası) `installerHooks` ile ayrıntılandırılır.

### `tauri-plugin-log` — 7 günlük rotasyon sınırlaması

`tauri-plugin-log` (2.x) yalnızca **boyut tabanlı** rotasyon destekler (`max_file_size` + `RotationStrategy::KeepOne` / `KeepAll`); zaman/gün tabanlı ("7 gün") bir rotasyon stratejisi resmi API'de yoktur. PHASE-00.md'deki "dosya logu, 7 gün rotasyon" ifadesi bu haliyle native olarak karşılanamaz.

**Karar:** Faz 0'da `RotationStrategy::KeepAll` + makul bir `max_file_size` (10 MB) kullanılacak; log dosyaları `%APPDATA%/com.hostlysisletme.localbusinessfinder/logs/` altında tutulur. Gerçek 7 günlük zaman bazlı temizlik (eski log dosyalarını silme) gerekiyorsa, uygulama açılışında `created_at` kontrolü ile basit bir temizleme adımı ileri bir fazda eklenebilir; Faz 0 kapsamında bu ek mantık **yazılmayacak** (kapsam dışı, ADR'de not düşülüyor).

## Karar

- `apps/desktop/src-tauri/tauri.conf.json` içinde:
  - `bundle.windows.nsis.installMode: "currentUser"` (SPEC'teki değer doğrulandı; `cargo check` ile teyit edildi).
  - `bundle.windows.webviewInstallMode.type: "downloadBootstrapper"`.
  - `bundle.windows.nsis.languages: ["Turkish", "English"]`, `displayLanguageSelector: false`.
- Plugin kurulumları resmi paket adlarıyla yapılacak (`@tauri-apps/plugin-log`, Rust-only `tauri-plugin-single-instance`, `@tauri-apps/plugin-opener`).
- `tauri-plugin-log`: `RotationStrategy::KeepAll` + `max_file_size(10 MB)`, native 7 günlük temizlik yok (yukarıdaki bölüme bakınız).

## Sonuçlar

`docs/SPEC.md` ve `docs/phases/PHASE-00.md` içindeki `installMode: currentUser` ifadesi **doğru** çıktı; web dokümanına dayanan ilk "düzeltme" (`perUser`) `cargo check` ile yanlışlanıp geri alındı. Karar Kaydı'na (D14: Windows kurulumu, yönetici yetkisi gerekmez) bu ADR ile netlik getirildi; D14'ün davranışsal hedefi hiç değişmedi.

### CI action sürümleri

`.github/workflows/*.yml` yazılırken doğrulanan üçüncü taraf GitHub Action'lar: Rust kurulumu için `dtolnay/rust-toolchain@stable` (aranan `dtolnay/rust-action` diye bir action yok — yanlış hatırlama, gerçek isim `rust-toolchain`), release paketleme için `tauri-apps/tauri-action@v1`. PR'larda (release olmayan) `tauri-action` yerine doğrudan `pnpm tauri build` çalıştırılıp NSIS çıktısı `actions/upload-artifact` ile yükleniyor; bu, her PR'da gereksiz bir GitHub Release taslağı oluşturmayı önlüyor.

## Kaynaklar

- [Windows Installer | Tauri v2](https://v2.tauri.app/distribute/windows-installer/)
- [@tauri-apps/plugin-log — npm](https://www.npmjs.com/package/@tauri-apps/plugin-log)
- [tauri-plugin-log — crates.io](https://docs.rs/crate/tauri-plugin-log/latest)
