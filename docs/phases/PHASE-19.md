# PHASE 19 (G7) — Sunucu tarafı otomasyon

**Dal:** `feature/p19-server-automation` · **Zorluk:** Yüksek · **Bağımlılık:** G1, G5
**Referans:** `docs/SPEC.md` → J.6, M, D12 · BACKLOG #23, #29

## Amaç
Uygulama kapalıyken de cevaplar alınır ve (açıkça etkinleştirilirse) e-postalar kurallara uygun biçimde otomatik gider.

## Kapsam
- **Sunucu tarafı gelen kutusu:** kullanıcının IMAP bilgisi Vault'ta (kullanıcı onayıyla); zamanlanmış Edge Function
  yeni postayı okur, `packages/core/email` ile ayrıştırır, `record_inbound` ile kaydeder. Tarayıcı poller'ı yedek olarak kalır.
- **Zamanlayıcı:** `pg_cron` → sekans kapatma (`close_stale_sequences`), vadesi gelen follow-up taslakları, Places yenileme.
- **Otomatik e-posta (Level 2):** otomasyon seviyesi ayarı (varsayılan kapalı; ADMIN açar). `email-sender` Edge Function:
  ülke kuralı + yerel saat + günlük limit + ısınma + bastırma listesi sunucuda; her gönderim `validateDraft`'tan geçmiş taslaktır.
  Geri dönme veya şikâyet oranı eşiği aşılınca otomatik durur ve ADMIN'e bildirir.
- Kampanya sekansları otomatik ilerler (yalnızca e-posta; asistanlı kanallar insan onayında kalır).
- Gönderen alan adı sağlığı: SPF/DKIM/DMARC denetimi, uyarı.

## Testler
- Deno: gönderici ve okuyucu fonksiyonları sahte SMTP/IMAP ile; limit ve kural reddi.
- pgTAP: limitlerin sunucuda zorlanması, otomasyon kapalıyken hiçbir gönderim, izolasyon.

## Acceptance criteria
- [ ] Uygulama kapalıyken gelen cevap en geç 5 dakikada konuşmaya düşer.
- [ ] Otomasyon kapalıyken tek bir e-posta bile otomatik gitmez; açıkken günlük limit aşılmaz.
- [ ] Geri dönme oranı eşiğinde gönderim kendiliğinden durur.

## VERIFY_CURRENT_DOCS
- Supabase `pg_cron` ve Edge Function süre/istek sınırları; Deno'da SMTP/IMAP kütüphaneleri veya alternatif (kuyruk işçisi);
  Gmail/Outlook gönderim limitleri. Bulgular `docs/adr/0016-server-automation.md`.
