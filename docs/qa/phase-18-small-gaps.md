# Küçük eksikler (G6'nın kalanı) — manuel test listesi

Ön koşul (bulut): `npx supabase db push` (20261010104000_delete_customer_deal), `.\baslat.cmd build`, `Ctrl+F5`.

## Otomatik doğrulananlar
- pgTAP: `delete_customer_deal.test.sql` (7 doğrulama: üye silemez, yönetici siler, log, işletme WON kalır).
- Birim: `report-export.test.ts`, `notify-sound.test.ts`, `diagnostics.test.ts`.

## Elle (bulutta)
- [ ] Müşteriler → bir anlaşmanın kalem simgesi → (yönetici) "Anlaşmayı sil" → onayla: anlaşma gider, işletme müşteri listesinde "Anlaşma yok" olarak kalır; yeniden kaydedilebilir.
- [ ] Üye hesabıyla aynı pencerede "Anlaşmayı sil" düğmesi görünmez.
- [ ] Raporlar → Genel/Kaynak/Kanal/Dönüşüm/Ekip sekmelerinde "CSV'ye aktar": Excel'de Türkçe karakterler doğru, sütunlar ayrılmış.
- [ ] Segmentler/Kampanyalar/Etkinlik sekmelerinde dışa aktarma düğmesi görünmez.
- [ ] Zil menüsünde "Yeni cevapta ses" aç/kapat; başka bir cihazdan/gelen kutusundan yeni cevap gelince kısa bir ses çalar, kapalıyken çalmaz.
- [ ] Ayarlar → Veri → "Tanılama bilgisini kopyala": yapıştırılan metinde sürüm ve iş durumları var; anahtar, e-posta, işletme adı yok.
