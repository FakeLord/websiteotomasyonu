# ADR 0016 — Temas kaydı ve ilerleme takibi

Durum: kabul edildi (2026-10-08, kullanıcı onayı). ADR 0014/0015'in devamı.

## Bağlam
11 aşamalı hat, aşama geçmişi, Leadler'de aşama sekmeleri ve Pipeline panosu zaten vardı. Ama yalnızca taslak ekranından
gönderilen mesajlar aşamayı ilerletiyordu. "İletişime geç" menüsünden açılan Instagram DM, WhatsApp, arama veya e-posta hiçbir yere
kaydedilmiyordu; işletme "Yeni"de kalıyor, ekipte aynı işletmeye iki kez yazılabiliyordu.

## Karar
1. **`contact_attempts` tablosu + RPC'ler.** Menüden bir adres seçilince `log_contact_attempt()` kayıt düşer (sonuç: `ATTEMPTED`),
   sonra kullanıcı `set_contact_attempt_outcome()` ile sonucu bildirir: `SENT` (Yazdım), `REPLIED`, `UNREACHABLE`,
   `NOT_INTERESTED`, `LATER` (tarihli), `CANCELLED` (Vazgeçtim). Tablo istemciye salt okunurdur; yazma yalnızca RPC (CLAUDE.md #3, #8).
2. **Aşama kendiliğinden ilerler, asla geriye gitmez.** Kural `packages/core/pipeline/contact-outcome.ts` (`stagePathForOutcome`) ve
   SQL'de aynıdır; her adım pipeline'ın geçerli geçişidir ve `stage_transitions` + `activity_logs`'a yazılır. `SENT` → İletişime
   geçilen; `REPLIED` → Cevap veren; `NOT_INTERESTED` → Kapanan (sebep `NOT_INTERESTED`). ENGAGED ve ötesine temas kaydı taşımaz.
3. **Takip tarihi (`next_action_at`).** `SENT` +3 gün, `UNREACHABLE` +2 gün (varsayılan), `LATER` seçilen gün, `REPLIED` ve
   `NOT_INTERESTED` temizler. Leadler'de "Takip" görünümü: tarihi bugün veya geçmiş, bitmemiş aşamada, aranabilir işletmeler.
4. **Son temas özeti işletmede** (`last_contact_channel/outcome/by`, `last_contacted_at`): liste süzgeçleri için. İstemci
   güncelleyemez; `refresh_last_contact()` iptal edilmemiş temaslar ve gönderilmiş mesajlardan yeniden hesaplar.
5. **Arayüz.** Menü bağlantıyı AÇAR, sonra kaydı düşer (tarayıcı açılır pencereyi yalnızca tıklamanın içinde kabul eder).
   Köşede "Ne oldu?" kutusu çıkar; kapatılırsa temas "Denendi" kalır. Detayda "İlerleme" sekmesi: özet + tek zaman çizelgesi.
   Leadler'de Son temas / Son sonuç / Kanal / Yazan süzgeçleri. Raporlar → İletişim: "Elle yapılan temaslar".

## Bilinen sınırlar
- Instagram/WhatsApp'ta cevabın gelip gelmediğini uygulama göremez (otomatik DM okuma yok, CLAUDE.md #9); "Cevap verdi"yi kullanıcı işaretler.
- Bağlantıyı açıp vazgeçmek de kayıt düşürür; bu yüzden "Vazgeçtim" vardır. Sonucu girilmiş temaştan vazgeçilemez ve aşama geri alınmaz.
- Aynı işletme için ekipten iki kişi aynı anda bağlantı açarsa iki ayrı temas kaydı oluşur (engellenmez, zaman çizelgesinde görünür).
- Rapordaki cevap oranı yalnızca sonucu girilen temasları sayar; sonuç girilmeyen "Denendi" kayıtları paydada "Temas"ta görünür, "Yazılan"da görünmez.
