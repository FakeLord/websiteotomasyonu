# PHASE 18 (G6) — Günlük kullanım eksikleri (CRM)

**Dal:** `feature/p18-crm-gaps` · **Zorluk:** Orta · **Bağımlılık:** G2
**Referans:** `docs/BACKLOG.md` #2, #3, #4, #6, #9, #10, #11, #12, #15, #16, #17, #18, #19, #20

## Amaç
Ekibin her gün takıldığı eksikleri kapatmak. Her mutasyon RPC + RLS ile yapılır ve activity log yazar.

## Kapsam
| # | İş | Not |
| --- | --- | --- |
| 9 | Lead düzenleme (ad, telefon, site, kategori, adres) | `update_business` RPC; telefon/alan adı yeniden normalize, duplicate kontrolü |
| 10 | Leadler: sütuna göre sıralama, çoklu seçim, toplu atama/aşama/DNC | toplu RPC; geçersiz geçişler satır bazında raporlanır |
| 11 | Dashboard "bugünün işleri" ve "benim işlerim" | follow-up, cevap bekleyen, açık devir; kişiye göre |
| 2 | Devir kartı: devral, ata, kapat | `accept_handoff`, `close_handoff`; `handled_by = HUMAN` |
| 3 | Yedek kanal: `secondChannelAfterDays` ve kanal INVALID olunca sıradaki kanal önerisi/taslağı | `chooseChannel` yeniden kullanılır |
| 4 | Telefon araması notu | PHONE konuşmasında not + sonuç (ulaşıldı/ulaşılamadı) |
| 6 | Bildirimler: yeni cevapta ses ve tarayıcı/masaüstü bildirimi | kullanıcı ayarı; Realtime |
| 15 | Ekip: üye çıkarma, daveti yeniden gönderme | son ADMIN koruması geçerli |
| 16 | Şifre değiştirme, profil, çalışma alanı adı | |
| 17 | Kampanya düzenleme/silme, anlaşma silme | yalnızca DRAFT kampanya silinir |
| 18 | Rapor dışa aktarma (CSV) | |
| 19 | "X düzenliyor" göstergesi | Realtime presence |
| 20 | Kanal modu ayarları AUTO / ASSISTED / MANUAL | platformun izin vermediği kip seçilemez |
| 12 | Tanılama log paketi | kabuk günlükleri + sürüm bilgisi; gizli veri temizlenir |

## Testler
- pgTAP: her yeni RPC için yetki, izolasyon, log; toplu işlemde kısmi başarı.
- Birim: sıralama/filtre yardımcıları, yedek kanal seçimi.
- Tarayıcıda uçtan uca: düzenle → toplu ata → devral → kapat.

## Acceptance criteria
- [ ] 14 maddenin her biri arayüzden kullanılabilir ve BACKLOG'da işaretlidir.
- [ ] Hiçbir korunan kolon (`stage`, `do_not_contact`, `lead_score`) doğrudan güncellenmez.
- [ ] MEMBER'ın yapamaması gereken işlemler (üye çıkarma, çalışma alanı adı) reddedilir.
