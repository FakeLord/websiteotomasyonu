# Faz 4 — Manuel QA Listesi

Kaynak: `docs/SPEC.md` → H (Website Analysis Engine), I.2 (Contact Discovery) — bu faz için ayrı bir
`PHASE-04.md` sağlanmadı.

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` yeşil — 19 test dosyası, 137 test (Faz 4 için 7 yeni
      dosya, 75 yeni test: `normalize-url`, `parked-page`, `extract-contacts`, `checks`, `classify`,
      `robots`, `run-website-analysis`).
- [x] `cargo check` hatasız — yeni bağımlılıklar (`reqwest`, `tokio`, `url`, `futures-util`) dahil.
- [x] `pnpm --filter @lbf/desktop exec vite build` hatasız.
- [x] `packages/core/website-analyzer`: 75+ senaryo (park/boş sayfa tespiti, tel/mailto/wa.me/JSON-LD/
      metin regex ile iletişim çıkarımı — gizlenmiş e-posta dahil, TR mobil → WhatsApp adayı kuralı,
      ajans imza linklerinin elenmesi, HTTPS/viewport/form/randevu/meta/eskimişlik/mixed-content
      kontrolleri, "sorun puanı" sınıflandırması, robots.txt ayrıştırma, uçtan uca orkestrasyon
      `MockWebsiteFetcher` benzeri sahte bir fetcher ile) unit test edildi.
- [x] Rust `fetch_page` komutu (`apps/desktop/src-tauri/src/commands/website.rs`) kod incelemesiyle
      doğrulandı: 10 sn timeout, 5 redirect sınırı, 2 MB gövde sınırı (stream + truncate), sabit
      User-Agent; her redirect hop'unda DNS yeniden çözülüp `reqwest::resolve()` ile doğrulanan IP'ye
      sabitleniyor (DNS rebinding'e karşı), loopback/private/link-local/multicast/CGNAT (100.64/10)
      aralıkları IPv4/IPv6 için reddediliyor.
- [x] `save_website_analysis()` RPC'si ve `website_analyses` tablosu SPEC ile karşılaştırıldı:
      `website_status` artık yalnızca bu RPC ile yazılabiliyor (`revoke update` eklendi — Faz 2'de bu
      kolon hiç kısıtlanmamıştı), bulunan iletişim kanalları `contact_channels`'a upsert ediliyor,
      her analiz `activity_logs`'a yazıyor (CLAUDE.md #8).
- [x] `<script>`/`<style>` içeriğinin görünür metne (ve dolayısıyla e-posta/telefon regex'lerine ve
      park/boş sayfa tespitine) sızmasına karşı bir regresyon testi eklendi (`visible-text.ts`
      yardımcı fonksiyonu, hem `extract-contacts.test.ts` hem `parked-page.test.ts`'te doğrulandı).

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [x] **pgTAP testi** (`website_analysis.test.sql`): Docker kurulup gerçek Postgres'e karşı
      çalıştırıldı (2026-09-26). **Gerçek bir güvenlik açığı bulundu**: `website_status` (ve
      Faz 2/7'deki `stage`/`lead_score`/`messages.status`) için kolon bazlı `REVOKE UPDATE`
      hiç etkili değildi, çünkü `authenticated` rolü tablo genelinde zaten UPDATE yetkisine
      sahipti (Postgres'te tablo-geneli yetki kolon reddinden önceliklidir) — bu kolonlar
      doğrudan client UPDATE'iyle değiştirilebiliyordu. Düzeltildi
      (`20260926100100_fix_protected_column_grants.sql`: tablo-geneli UPDATE kaldırılıp yalnızca
      korumasız kolonlara GRANT verildi). 16/16 dosya, 82/82 test PASS.
- [ ] **`cargo test`**: `fetch_page`'in gerçek ağ davranışı (timeout, redirect zinciri, özel IP
      reddi) yalnızca kod incelemesiyle doğrulandı; SPEC.md → U "Rust: fetch sınırları, özel IP
      engeli" testleri bu fazda yazılmadı (zaman kısıtı) — ayrı bir görev olarak eklenmeli.
- [ ] **100 gerçek sitelik manuel örneklem**: Acceptance kriteri "kategori doğruluğu ≥ %90" ve
      "100 site < 5 dk" gerçek internet erişimiyle, Discover'dan gelen gerçek lead'ler üzerinde
      doğrulanmalı.
- [ ] **robots.txt'e gerçekten uyma**: Gerçek bir sitede `/robots.txt`'te `Disallow: /iletisim`
      olduğunda iç sayfanın atlandığı; olmadığında `/iletisim`, `/contact`, `/hakkimizda`, `/randevu`
      gibi sayfaların bulunup okunduğu gerçek bir sitede doğrulanmalı.
- [ ] **SPA/JS-render tespiti**: Gerçek bir React/Vue SPA sitesinde `jsRendered` uyarısının
      göründüğü ve iletişim bilgisinin (varsa) kaçırıldığının fark edildiği doğrulanmalı.
- [ ] **SSRF engeli gerçek ortamda**: `http://127.0.0.1`, `http://169.254.169.254` (cloud metadata)
      gibi adreslerin Discover/Leads üzerinden analiz denendiğinde reddedildiği gerçek Windows
      makinesinde doğrulanmalı (bu ortamda ağ erişimi/gerçek DNS testi yapılamadı).
- [ ] **Toplu analiz performansı**: `LeadsPage`'teki "Toplu Analiz" butonunun 100 lead'lik gerçek
      bir workspace'te SPEC'in "< 5 dk" hedefini karşıladığı doğrulanmalı; 4'lü paralel grup şu anda
      tam "domain başına saniyede 1 istek" sınırını uygulamıyor (basitleştirme, bkz. Notlar).

## Notlar

- **Basitleştirmeler:** "Domain başına saniyede 1 istek, eş zamanlı en fazla 4 domain" kısıtı tam
  olarak uygulanmadı; bunun yerine 4'lü sıralı gruplar halinde paralel işleniyor
  (`website-analysis-runner.ts`). Aynı domain'e ait çok sayıda lead aynı toplu analizde olursa (örn.
  aynı zincirin farklı şubeleri) bu, tek domain'e karşı SPEC'in öngördüğünden daha yüksek eşzamanlı
  istek anlamına gelebilir. Gerçek kullanımda (farklı işletmeler, farklı domain'ler) bu senaryo
  nadir olduğundan MVP için kabul edilebilir görüldü; gerekirse ileride domain bazlı bir kuyruk
  eklenebilir.
- **`jsRendered` sinyali** yalnızca bir sezgidir (görünür metin < 200 karakter + `<script>` var +
  hiç iletişim bulunamadı); false positive/negative olabilir, `issues`'a "manuel kontrol önerilir"
  notu düşülür (SPEC.md → H: "Yapmadıkları" bölümüyle uyumlu — headless tarayıcı kullanılmıyor).
- **`website_status` kilidi:** Faz 2'nin `businesses` migration'ında bu kolon hiç `REVOKE UPDATE`
  listesine alınmamıştı; bu faz onu düzeltiyor (yeni migration, eski migration değiştirilmedi —
  CLAUDE.md #2).
- Contact discovery sonuçları `contact_channels`'a `on conflict ... do update set confidence =
  greatest(...)` ile yazılır; bu yüzden aynı kanal daha önce daha yüksek güvenle (örn. manuel
  eklenmiş) kaydedilmişse analiz onu düşürmez.
