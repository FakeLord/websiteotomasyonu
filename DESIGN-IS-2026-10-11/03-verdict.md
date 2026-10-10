# Karar (Phase 3): **REDESIGN** (görsel sistem; ürün yapısı korunur)

Toplam 14/30 (< 20) kuralı gereği görsel sistem baştan kurulur: mevcut yapı (bilgi mimarisi, bileşen API'leri, veri katmanı)
iyi, ama renk, yüzey ve dekor "şablon yapay zekâ ürünü" izlenimi veriyor ve tema tek noktadan yönetilemiyor.

## En yüksek kaldıraçlı hamleler
1. **#3/#7 — Tek, kurumsal palet:** sakin açık yüzeyler + lacivert kenar çubuğu + tek mavi vurgu; mor/pembe/camgöbeği ve gradyan kaldırılır.
   Kanıt: `index.css:4-26`, `button.tsx:17`, `badge.tsx:11-18`.
2. **#8 — Kaçak renkleri token'a bağla:** 211 hex + 115 arbitrary class → anlamsal token'lar (`success/warning/danger/info`, `surface`, `border`).
   Kanıt: `rg "#[0-9a-f]{6}"` sayımı (01-evidence).
3. **#5/#10 — Dekoru kaldır:** İstanbul silüeti, gradyan hero, Sparkles ve gradyan düğme çıkar; yerine bilgi yoğun başlık şeridi.
   Kanıt: `CitySkyline.tsx`, `DashboardPage.tsx:82,119-121`.
4. **#2 — Analiz kutuları:** Dashboard'a KPI şeridi (mini trend + dönem kıyası), huni (funnel), kanal/kaynak/sektör dağılımı,
   takım ve bugünün işleri tablosu; veri RPC'leri hazır (01-evidence).
5. **#9 — Bundle/erişilebilirlik:** harita ve grafik kodunu rota bazlı ayır; WCAG AA kontrast ve yüksek yoğunluklu tablo.
