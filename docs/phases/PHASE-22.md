# PHASE 22 (G10) — Üretim

**Dal:** `feature/p22-production` · **Zorluk:** Orta · **Bağımlılık:** tüm fazlar
**Referans:** `docs/SPEC.md` → V, D13, D14 · BACKLOG #26, #27

## Amaç
Güvenle dağıtılan, güncellenen, yedekten dönülebilen ve maliyeti görülen bir ürün.

## Kapsam
- Masaüstü: otomatik güncelleme (imzalı paketler), sürüm notları, isteğe bağlı kod imzalama; kurulum adı ve simge yeni ürün adıyla.
- **Yedekten geri yükleme:** şifreli dökümden yeni projeye geri yükleme adımları ve betiği; yılda en az bir kez denenir.
- **Maliyet ve kullanım paneli:** Places çağrıları ve tahmini tutar, AI çağrıları (sağlayıcı bazında), e-posta hacmi, DB boyutu;
  eşik uyarıları.
- İzleme: Edge Function hata oranı, zamanlanmış iş sağlığı, gönderen alan adı durumu.
- **Pilot QA:** `docs/qa/` altındaki "gerçek hesapla doğrulanmalı" maddelerinin tamamı gerçek hesaplarla geçilir.

## Acceptance criteria
- [ ] Eski sürüm kurulu bir makine yeni sürüme kendiliğinden güncellenir.
- [ ] Yedekten boş bir projeye geri yükleme belgelenen adımlarla başarılır.
- [ ] Panel, ay içi Places ve AI harcamasını gösterir; eşikte uyarır.
- [ ] Tüm QA listelerinde açık kritik madde kalmaz.

## VERIFY_CURRENT_DOCS
- `tauri-plugin-updater` imzalama akışı; Windows kod imzalama seçenekleri ve maliyeti. Bulgular `docs/adr/0018-production.md`.
