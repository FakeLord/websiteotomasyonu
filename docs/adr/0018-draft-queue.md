# ADR 0018 — Taslak kuyruğu ("Onay Bekleyenler")

**Durum:** Kabul · 2026-10-10 (kullanıcı onayı: "MVP'yi bitirene kadar yap")
**İlgili:** ADR 0013 (ilk mesaj, varsayılan dil yok), ADR 0014 Adım 2, ADR 0017 (yurtdışı e-posta kilidi)

## Bağlam
Fırsatlar'daki her işletme için taslağı tek tek istemek yavaş. ADR 0014 "Adım 2" arka planda taslak hazırlanmasını,
gönderimin ise her zaman insanda kalmasını öngörür.

## Karar
- **Tablo `draft_jobs`:** işletme + kanal başına tek satır (`unique(business_id, channel)`); kanal şimdilik yalnızca EMAIL;
  `language` kuyruğa alırken kullanıcı tarafından seçilir (varsayılan yok); durumlar QUEUED/RUNNING/DONE/FAILED/CANCELLED.
  İstemci yalnızca `select` alır, yazma RPC ile.
- **RPC'ler:** `enqueue_opportunity_drafts` (Fırsat kuralı + e-postası var + taslak/mesajı yok + yurtdışı kilidi; en yüksek
  puandan, en çok 100), `claim_next_draft_job` (sahiplik süresi, 3 denemede FAILED), `complete_draft_job`
  (DONE/FAILED/QUEUED=bırak), `cancel_draft_jobs`, `retry_failed_draft_jobs`, `draft_queue_progress`.
- **Çalıştırıcı:** tarama/analiz gibi açık sekmede çalışır (`draft-loop.ts` saf orkestrasyon, `draft-runner.ts` G/Ç).
  Mevcut `generateFirstMessageDraft` kullanılır (aynı prompt, aynı `validateDraft`, en çok 3 yeniden üretim). Başarılı taslak
  `DRAFT` mesaj (author AI) olarak kaydedilir; reddedilen FAILED olur, kullanıcıya gösterilmez.
- **Durma kuralları:** günlük AI kotası dolarsa veya Şirket kaydı yoksa iş başarısız sayılmadan kuyruğa bırakılır ve tur
  durur; art arda 5 hata turu durdurur.
- **Arayüz:** Leadler → Fırsatlar'da "Taslakları hazırla" (dil zorunlu seçim, adet, pazar süzgeci); İşler kutusunda
  "Taslak kuyruğu"; kenar çubuğunda "Onay Bekleyenler" (rozet) sayfası: oku, gerekirse Konuşmalar'da düzenle, onayla ve gönder,
  reddet, Türkçesini göster.
- **Gönderim:** hiçbir zaman otomatik değildir; mevcut `sendDraftMessage` (outreach_guard, tekrar kontrolü) kullanılır.

## Sonuçlar
- Çeviri kaydedilmez (ADR 0013); "Türkçesini göster" isteğe bağlı ve kota kullanır.
- Kuyruk yalnızca sekme açıkken ilerler; sunucu tarafı çalıştırma G7'dedir.
- Günlük AI kotası (varsayılan 300) tüm AI işleriyle paylaşılır; bir işletme 1–3 üretim + isteğe bağlı 1 çeviri harcar.
