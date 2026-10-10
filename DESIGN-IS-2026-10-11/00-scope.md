# Kapsam (Phase 0)

- **Denetlenen yüzey:** `apps/desktop` arayüzünün görsel sistemi — renk/tipografi/bileşenler (`src/index.css`, `src/components/ui/*`,
  `src/components/charts`, `src/components/domain`) ve ana ekranlar (Dashboard, Leadler, Raporlar, kenar çubuğu/üst çubuk).
- **Birincil kullanıcı:** 2–3 kişilik yazılım ajansı ekibi (satış). **Birincil görev:** işletme bul → incele → yaz → takip et.
- **Kullanıcı isteği (2026-10-11):** "Çok basit, yapay zekâ yapımı gibi görünüyor; tasarımı baştan ele alalım, renkleri tamamen
  kurumsal yapalım; veriler analiz kutularıyla görünsün, geliştirelim."
- **Kısıtlar:** Tailwind v4 + `@theme` token'ları, shadcn tarzı kendi bileşenleri, Recharts, Türkçe arayüz tek dosyada
  (`i18n/tr.ts`); iş mantığı ve veri katmanı değişmeyecek. Yayın/marka kılavuzu yok (marka rengi tanımsız).
- **Girdi:** kullanıcının gönderdiği Leadler ekran görüntüsü (koyu lacivert, mavi vurgu) + kaynak kod. Çalışan örneğe giriş
  yapılamadığı için ek ekran görüntüsü alınmadı (bulut girişi kullanıcıya ait).
