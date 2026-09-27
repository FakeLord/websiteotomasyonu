# ADR 0007 — Koyu tema yeniden tasarım, OpenAI → NVIDIA AI zinciri ve kapsam genişletmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-27
- **Bağlam:** MVP (Faz 0–8) sonrası kullanıcı isteği. SPEC.md → D (modüller), S (MVP kapsamı),
  D5 (AI sağlayıcı), O (Jarvis) ile ilişkilidir.

## Sorun

Kullanıcı üç şey istedi:

1. Uygulamanın paylaşılan 12 ekranlık tasarım görseliyle birebir aynı olması (koyu tema).
2. ChatGPT Plus aboneliğinin token'larının kullanılması; bittiğinde NVIDIA'ya geçilmesi.
3. Görseldeki MVP dışı ekranların da (Kampanyalar, Raporlar, Jarvis AI Asistan, Discover
   haritası, Teklif Aşaması kanbanı, Müşteriler) çalışır olması.

## Karar

1. **Tasarım:** Tailwind v4 tema token'ları (lacivert zemin, mavi/mor vurgular), Radix tabanlı
   bileşenler, recharts grafikleri, Leaflet + OpenStreetMap haritası. Tüm ekranlar yeniden yazıldı.
2. **AI sağlayıcı zinciri (D5 güncellemesi):** ChatGPT Plus aboneliği resmi olarak API erişimi
   vermez; Plus kotasını üçüncü parti uygulamadan kullanmak OpenAI'ın gayriresmi iç uç noktalarını
   taklit etmeyi gerektirir (kullanım şartlarına aykırı, hesap kapatma riski, her an bozulabilir).
   Bu yüzden **OpenAI API anahtarı (kullandıkça ödenir) → NVIDIA fallback** zinciri uygulandı.
   `workspace_settings.ai_config.providers` sıralı listedir; `ai-gateway` sırayla dener, anahtarı
   olmayanı atlar, 429/kota/5xx/zaman aşımı/ağ hatasında sıradakine geçer, geçersiz JSON'da aynı
   sağlayıcıyı bir kez daha dener (J.3). Saf karar mantığı `packages/core/src/ai/provider-chain.ts`.
3. **Kapsam genişletmesi (SPEC → D/S güncellemesi):**
   - **Kampanyalar** (Faz 11'den öne alındı, **otomatik gönderim olmadan**): segment + kanal + üye
     listesi; taslaklar toplu hazırlanır, gönderim mevcut insan-onaylı akıştan geçer; üye
     SENT/REPLIED durumu mesaj trigger'larıyla güncellenir. Level 2 (otomatik gönderim) hâlâ Faz 11.
   - **Jarvis AI Asistan** (Faz 12'den kısmen öne alındı, **salt-okunur**): `jarvis-chat` Edge
     Function'ı bağlamı çağıranın RLS yetkisiyle okur, yalnızca cevap + izin listesindeki ekran/
     filtre önerisi döner. Mutasyon yapan action katmanı (SPEC → O) Faz 12'de kalır.
   - **Müşteriler:** `customer_deals` tablosu (WON işletme başına tek anlaşma). D8 ("teklif modülü
     yok") korunur: bu bir teklif/sözleşme modülü değil, kazanılan işin kaydıdır.
   - **Raporlar:** `report_metrics` RPC'si; **Teklif Aşaması:** mevcut `transition_stage` üzerinde kanban.
   - **İşletme Bul haritası:** OSM karoları (atıflı); yarıçaplı arama Places `locationBias`.
   - Meta/Google Ads sekmeleri yalnızca reklam kütüphanesini tarayıcıda açar ve CSV içe aktarıma
     yönlendirir; platform taranmaz (CLAUDE.md #9, SPEC → G.2/G.3 assisted).

## Gerekçe

- Plus token'ları için yasal/istikrarlı bir yol yok; OpenAI API aynı model ailesine resmi erişim
  sağlar ve `gpt-4o-mini` ile ilk mesaj taslağı başına maliyet kuruş düzeyindedir.
- NVIDIA varsayılan modeli çok yavaştı (~3 dk) ve llama-3.x serisi 2026-08-26'da emekliye ayrıldı;
  `nvidia/nemotron-3.5-lightning-30b-a3b` düşünme modu kapalıyken 1–10 sn'de geçerli JSON döndü
  (`scripts/smoke/nvidia.ts`, 2026-09-27).
- Kampanya ve Jarvis'in "otomatik/mutasyonlu" kısımları risklidir (hesap kısıtlama, yanlış işlem);
  bu yüzden yalnızca insan onayını koruyan kısımları öne alındı.

## Sonuçlar

- Edge Function'lar `packages/core`'u doğrudan içe aktaramaz (runtime yalnızca `supabase/functions`'ı
  paketler); saf dosyalar `pnpm sync:edge` ile `_shared/core`'a kopyalanır, sapmayı
  `edge-shared-sync.test.ts` yakalar.
- `tauri.conf.json` CSP'si katıdır (`connect-src 'self' https: wss:`); yerel Supabase ile test için
  `pnpm --filter @lbf/desktop build:local` (`tauri.local.conf.json`) kullanılır.
- OSM karo kullanım politikası düşük hacimli kullanıma izin verir; kullanıcı sayısı artarsa ücretli
  bir karo sağlayıcıya geçilmelidir.
- OpenAI anahtarı girilene kadar zincir fiilen yalnızca NVIDIA'dır (ADR 0006'daki NVIDIA "yalnızca
  pilot" uyarısı geçerliliğini korur).

## Kaynaklar

- OpenAI: ChatGPT abonelikleri ve API faturalandırması ayrıdır (help.openai.com — "ChatGPT Plus
  API erişimi içerir mi?").
- OpenStreetMap Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/
- Google Places API (New) Text Search `locationBias`: https://developers.google.com/maps/documentation/places/web-service/text-search
