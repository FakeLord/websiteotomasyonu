# PHASE 20 (G8) — Yeni kanallar ve kaynaklar

**Dal:** `feature/p20-channels` · **Zorluk:** Yüksek · **Bağımlılık:** G5
**Referans:** `docs/SPEC.md` → G.2, G.3, I.3, L · BACKLOG #21, #22, #24

## Amaç
Resmi API'lerin izin verdiği ölçüde yeni keşif kaynakları ve otomatik cevap yakalama. Soğuk DM otomasyonu **yoktur** (CLAUDE.md #9).

## Kapsam
- **Meta webhook:** Instagram ve Messenger'da işletmenin **başlattığı veya cevapladığı** konuşmalarda gelen mesajlar
  `meta-webhook` Edge Function ile otomatik kaydedilir; izin verilen pencere içinde API ile cevap.
- **WhatsApp Cloud API (isteğe bağlı, ücretli):** onaylı şablonla iş başlatma, opt-in şartı; varsayılan `wa.me` asistanlı kalır.
- **Meta Reklam Kütüphanesi:** AB/İngiltere için resmi API ile reklam veren keşfi (`RUNS_ADS` sinyali); diğer ülkelerde
  önceden doldurulmuş arama bağlantısı + toplu yapıştırma (asistanlı).
- **Google reklam veren:** Şeffaflık Merkezi bağlantısı + alan adı yapıştırma (asistanlı); BigQuery kamu veri kümesi kapsıyorsa CSV içe aktarım.

## Testler
- Deno: webhook imza doğrulaması, yinelenen olay, pencere dışı cevap reddi. pgTAP: yeni tablolar için izolasyon.
- Gerçek API yalnızca `scripts/smoke/`.

## Acceptance criteria
- [ ] Bağlı Instagram hesabına gelen cevap elle yapıştırmadan konuşmaya düşer.
- [ ] İngiltere'de bir kategori için reklam veren işletmeler resmi API ile listelenir ve Places kaydıyla eşleşir.
- [ ] Uygulama hiçbir platformda oturum taklidi veya sayfa taraması yapmaz.

## VERIFY_CURRENT_DOCS
- Meta Graph API mesajlaşma pencereleri ve uygulama incelemesi; Ad Library API kapsamı ve kimlik doğrulama;
  WhatsApp Cloud API fiyat ve şablon kuralları; Ads Transparency veri kümesi kapsamı. Bulgular `docs/adr/0017-channels.md`.
