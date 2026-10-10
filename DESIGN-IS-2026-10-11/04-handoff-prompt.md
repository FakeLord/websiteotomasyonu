# /make-plan devir istemi (REDESIGN)

````
/make-plan Global Business Finder arayüzünün görsel sistemini baştan kur (kurumsal, sakin, veri yoğun). Mevcut tasarım Dieter Rams
denetiminde 14/30 aldı; kritik boşluklar #3 estetik, #5 gösterişsiz, #7 kalıcı, #10 en az tasarım.

Karar (03-verdict.md): REDESIGN — bilgi mimarisi, bileşen API'leri ve veri katmanı korunur; renk, yüzey, dekor ve analiz kutuları baştan.

Neden refine değil: tek tek yama değil, 211 kaçak onaltılık renk + 115 arbitrary class + 8 canlı ton + gradyanlar yüzünden tema tek
noktadan yönetilemiyor ve "şablon yapay zekâ ürünü" izlenimi sistemik.

Korunacaklar (Preserve):
- Sayfa/rota yapısı ve `navItems` (apps/desktop/src/app/nav-items.ts), Türkçe metinlerin tek dosyada kalması (i18n/tr.ts).
- Bileşen API'leri: Card/CardHeader/CardBody, Badge(tone), Button(variant,size), StatCard, Table/Th/Td/Tr, Progress, PageHeader
  (components/ui/*) — çağıran dosyalar değişmeden yeni görünümü alacak.
- Tailwind v4 `@theme` token mekanizması (src/index.css:4-26), Inter Variable, odak halkası ve prefers-reduced-motion kuralları.
- Tüm veri RPC'leri ve hook'lar (report_metrics, dashboard metrics, draft_queue_progress, places_usage_status …) — backend değişmez.

Atılacaklar (Discard):
- Gün batımı gradyanlı İstanbul silüeti (features/dashboard/CitySkyline.tsx) ve karşılama bandı. Kanıt: DashboardPage.tsx:82. #5/#10.
- Gradyan düğme varyantı `violet` ve gradyanlı logo/Jarvis kartları (button.tsx:17, app-logo.tsx, DashboardPage.tsx:119-121). #7.
- Mor/pembe/camgöbeği vurgular ve pastel-neon rozet tonları (badge.tsx:11-18). #3.
- Koyu-lacivert tek tema ve 211 kaçak hex / 115 `text-[#…]` sınıfı. #8.

Hedef palet (tek doğruluk kaynağı `@theme`; başka yerde renk yazılmaz):
- Zemin `#f4f6f9`, yüzey `#ffffff`, ikinci yüzey `#f8fafc`, üçüncü `#eef2f6`, kenar `#e2e8f0`, güçlü kenar `#cbd5e1`.
- Metin `#0f172a`, ikincil `#475569`, soluk `#64748b` (beyaz üstünde ≥ 4.5:1).
- Kenar çubuğu derin lacivert `#0b1f3a` (metin `#cbd5e1`, etkin öğe `#14305a`, üzerinde beyaz).
- Vurgu tek mavi `#1d4ed8` (hover `#1e40af`). Anlamsal: başarı `#15803d`, uyarı `#b45309`, hata `#b91c1c`, bilgi `#0369a1`.
- Rozetler düz: açık zemin tonu + koyu metin (örn. başarı `bg #dcfce7 / text #166534`); en çok 5 ton (gray, blue, green, amber, red).
- Grafik serileri: `#1d4ed8, #0f766e, #b45309, #475569, #334155`; gradyan, gölge efekti ve parlama yok. Köşe yarıçapı 8 px, ince 1 px kenarlık.

Dashboard analiz kutuları (veri hazır, yeni backend yok):
1. KPI şeridi (6 kutu): Bulunan, Fırsat, Yazılan, Cevap oranı, Kazanılan, Gelir — her birinde dönem kıyası (▲▼ %) ve mini trend çizgisi.
2. Satış hunisi (found → contacted → replied → engaged → proposal → won) yatay çubuk + adımlar arası dönüşüm %.
3. Kanal ve kaynak dağılımı (halka + tablo), sektör/şehir performansı (en iyi 5, örneklem ≥ 20).
4. Operasyon kutusu: Onay bekleyen taslak, taslak kuyruğu, aylık Places kullanımı (çubuk), günlük AI kullanımı.
5. Bugünün işleri ve geciken takipler tablosu; ekip performansı tablosu (yönetici).
Her kutuda: başlık, tek cümle açıklama, boş durum, yükleniyor iskeleti, hata durumu, "Raporlar'da aç" bağlantısı.

Teslimatlar:
- Token sistemi + tema dosyası (açık tema birincil; koyu tema ileride aynı token'lardan türetilebilir).
- Kaçak renk temizliği: 211 hex ve 115 arbitrary class için anlamsal sınıflara dönüşüm tablosu + `rg` ile sıfır kontrol testi.
- Bileşen güncellemeleri (Card, Badge, Button, StatCard + Sparkline, Table yoğunluğu, Progress), kenar çubuğu ve üst çubuk.
- Dashboard yeniden düzeni (yukarıdaki kutular), Raporlar ve Leadler'de tutarlılık.
- Doğrulama: lint/typecheck/test yeşil; WCAG AA kontrast tablosu; tarayıcıda ekran görüntüsü karşılaştırması (önce/sonra);
  `rg "#[0-9a-fA-F]{6}" apps/desktop/src` yalnızca token dosyası ve grafik sabitinde sonuç verir.

Kaçınılacaklar (REDESIGN'a özgü):
- Eski yapıyı yeni renklerle taşımak; iki tasarımı bayrakla sonsuza dek yaşatmak; trend takip etmek (gradyan, cam efekti, neon).
- "Korunacaklar" listesini isteğe bağlı saymak; backend/RPC'lere dokunmak; iş mantığı veya i18n anahtarlarını bozmak.
````
