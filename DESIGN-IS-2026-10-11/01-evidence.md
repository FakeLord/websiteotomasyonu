# Kanıtlar (Phase 1) — kaynak: kod okuma ve kullanıcı ekran görüntüsü

## Yapısal
- Token'lar tek yerde: `src/index.css:4-26` (`@theme`). Bileşen API'leri sabit: `Card`, `Badge`(8 ton), `Button`(5 varyant), `StatCard`, `Table`.
- **Kaçak renkler:** `.tsx/.ts` içinde 211 onaltılık renk değeri ve 115 `text|bg|border-[#…]` sınıfı (örn. `Badge` tonları
  `badge.tsx:11-18`, hata metni `text-[#f87171]` onlarca yerde) → tema tek noktadan değiştirilemiyor.

## Görsel
- Zemin `#060a17`, kenar çubuğu `#080d1d`, yüzeyler `#0c1326/#111a31/#17213b` — koyu lacivert tek tema, açık tema yok (`index.css:6-14`, `color-scheme: dark`).
- Vurgu mavi `#2f6bff` + **mor `#8b5cf6`, pembe `#ec4899`, camgöbeği `#06b6d4`** birlikte kullanılıyor (50 kullanım); rozetler pastel-neon.
- **Gradyan:** birincil eylem düğmesi `violet` varyantı `from-primary to-violet` (`button.tsx:17`), Jarvis kartı ve logo
  gradyanları (`DashboardPage.tsx:119-120`, `app-logo.tsx`, `layout.tsx`), Raporlar başlığı.
- **Dekor:** Dashboard karşılama bandında gün batımı gradyanlı İstanbul silüeti SVG'si (`CitySkyline.tsx`, 61 satır) ve "Sparkles" simgeleri.
- Tipografi: Inter Variable (tek aile), ölçek tutarlı; sayılar `tabular-nums`. İyi.
- Grafik paleti: `SERIES_COLORS` mavi/turuncu/pembe/yeşil/mor (`charts.tsx:6`), doğrulanmış kontrastlı ama kurumsal değil.

## Veri sunumu
- Dashboard: 4–5 `StatCard` (etiket + sayı + ▲▼ yüzde) ve birkaç kart; **kıyas yalnızca yüzde oku**, mini grafik/dağılım/hedef yok.
- Raporlar: çizgi grafik + halka grafik + tablolar var; Dashboard'da bu kuvvet yok, ekranlar arası tutarsız.
- Veri kaynakları hazır: `report_metrics`, `dashboard metrics`, `market_performance`, `scan_plan_progress`, `draft_queue_progress`,
  `places_usage_status` RPC'leri — yeni backend gerekmeden zengin analiz kutuları kurulabilir.

## Ağırlık / dikkat
- Üretim derlemesi: bazı parçalar > 500 kB uyarısı veriyor (tek paket; Leaflet + Recharts dahil). Boşta animasyon: `prefers-reduced-motion` saygılı.
- Durumlar: boş/yükleniyor/hata ve odak halkası var (`index.css:46`); devre dışı durumlar tutarlı.

## Bilinen boşluklar
- Canlı ekran görüntüsü Dashboard için alınamadı (giriş gerekiyor); Dashboard değerlendirmesi kod ve kullanıcı görüntüsünden çıkarıldı (INFERRED).
