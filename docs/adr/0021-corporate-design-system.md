# ADR 0021 — Kurumsal tasarım sistemi (açık tema, tek vurgu, veri yoğun Dashboard)

**Durum:** Kabul · 2026-10-11 (kullanıcı onayı: "açık tema")
**İlgili:** `DESIGN-IS-2026-10-11/` (Dieter Rams denetimi: 14/30 → REDESIGN), ADR 0007 (yeniden tasarım)

## Karar
- **Açık tema**, derin lacivert kenar çubuğu, tek mavi vurgu (`#1d4ed8`); anlamsal renkler yeşil/kehribar/kırmızı/bilgi.
  Mor, pembe, camgöbeği, gradyan, gün batımı silüeti ve süs simgeleri kaldırıldı.
- **Renkler tek yerde:** CSS tarafında `src/index.css` `@theme`, JS gerektiren yerlerde (grafik, harita) `src/lib/theme-colors.ts`.
  Bileşenlerde onaylı onaltılık renk yazılmaz (`rg "#[0-9a-fA-F]{6}" apps/desktop/src` yalnızca `theme-colors.ts` verir).
- **Rozetler** altı düz ton (gray, blue, navy, green, orange, red); düğmede gradyan varyantı yok.
- **Analiz kutuları:** Dashboard'da trend çizgili gösterge şeridi (dönem kıyası), satış hunisi (aşama dağılımından), lead durumları,
  operasyon (onay bekleyen taslak, taslak kuyruğu, aylık Places), asistan kısayolları, bugünün işleri, son hareketler.
  Yeni backend yok; mevcut RPC'ler kullanıldı. `StatCard` artık `delta`, `hint`, `trend` alır; `CardHeader` açıklama alır.

## Sonuçlar
- Koyu tema yok; ileride istenirse aynı token adlarıyla ikinci bir `@theme` bloğu eklenebilir.
- Tauri ve web aynı arayüzü paylaşır; ek yapılandırma gerekmez.
