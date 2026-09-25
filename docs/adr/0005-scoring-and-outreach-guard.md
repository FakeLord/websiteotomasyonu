# ADR 0005 — Faz 5 skor/kanal seçimi ve `outreach_guard`'ın kısmi uygulanması

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-26
- **Bağlam:** Faz 5 (Lead Scoring + Channel Routing + Outreach Safety), ayrı bir `PHASE-05.md` yok.

## Sorun

SPEC.md → I.5, `outreach_guard(business_id, channel)`'ın şu korumaları DB'de zorlamasını ister:
DO_NOT_CONTACT, MAX_FOLLOWUPS, DAILY_OUTREACH_LIMIT, CHANNEL_COOLDOWN,
DUPLICATE_MESSAGE_PROTECTION, gönderim saatleri. Ancak `MAX_FOLLOWUPS` `follow_ups` tablosuna
(Faz 8), `DUPLICATE_MESSAGE_PROTECTION` (`content_hash`) ve doğru `CHANNEL_COOLDOWN` (kanal bazlı)
`messages`/`conversations` tablolarına (Faz 7) ihtiyaç duyar — bunların hiçbiri henüz yok.
Benzer şekilde I.4'teki `chooseChannel`'ın "fallback yalnızca teslim hatasında çalışır" kuralı,
gerçek teslim durumunu (`messages.delivery_status`) bilmeyi gerektirir.

## Karar

1. `outreach_guard()` bu fazda yalnızca şu an var olan verilerle zorlanabilen kontrolleri yapar:
   `DO_NOT_CONTACT` (`businesses.do_not_contact`), gönderim saatleri (Europe/Istanbul, hafta içi
   09:00–18:30), kanal soğuma (`businesses.last_contacted_at` — **kanal bazlı değil, tüm kanallar
   için tek bir zaman damgası**, çünkü henüz kanal bazlı gönderim geçmişi yok) ve günlük limit
   (`stage_transitions`'daki bugünkü `CONTACTED` geçiş sayısı, gerçek mesaj sayısına bir proxy).
2. `MAX_FOLLOWUPS` ve `DUPLICATE_MESSAGE_PROTECTION` bu fazda **uygulanmaz**; fonksiyon bu ikisi
   için hiçbir zaman red üretmez (sessizce geçer, hata değil).
3. `packages/core/routing/choose-channel.ts`'deki `chooseChannel()` de aynı nedenle fallback'i
   modellemiyor: bir kanaldan ilk temas kurulduysa (`firstMessageChannelWithin30Days`), başka bir
   hiç kullanılmamış kanala otomatik geçmiyor (`OTHER_CHANNEL_ALREADY_CONTACTED`). Gerçek fallback
   (teslim hatası → ikinci kanal) Faz 7'de mesaj teslim durumu eklenince ayrı bir yol olarak
   uygulanacak.
4. Faz 7 (`messages`/`conversations`) ve Faz 8 (`follow_ups`) tabloları eklendiğinde bu migration
   **değiştirilmez** (CLAUDE.md #2); yeni bir migration `create or replace function
   public.outreach_guard(...)` ile fonksiyonu tamamlar ve kanal bazlı soğuma/duplicate/max-followup
   kontrollerini ekler.

## Gerekçe

- `outreach_guard`'ı Faz 7/8'e kadar hiç yazmamak, "DB'de zorlanır" ilkesini (CLAUDE.md, SPEC.md →
  I.5) Faz 5'in acceptance kriterine kadar karşılamamak anlamına gelirdi ("DNC'li lead için hiçbir
  yol gönderime izin vermez" testi zaten bu fazda mümkün ve önemli).
- Fonksiyonu şimdiden eksiksiz simüle etmek (örn. sahte bir `messages` tablosu ekleyip Faz 7'de
  silmek) CLAUDE.md #11'i ("aktif faz dışındaki dosyaları refactor etme") ihlal eder ve gerçek Faz
  7 şemasıyla çakışma riski taşır.
- Bu fazda henüz gerçek bir gönderim akışı (Conversations sayfası) olmadığından, eksik kontroller
  pratikte hiçbir kullanıcı akışını etkilemiyor — fonksiyon şu an yalnızca lead detayındaki
  "Önerilen kanal" kartı için çağrılıyor, gerçek gönderim değil.

## Sonuçlar

- Faz 7 planlaması bu ADR'yi okumalı ve `outreach_guard()`'ı `CREATE OR REPLACE FUNCTION` ile
  tamamlamalı; aksi halde MAX_FOLLOWUPS/DUPLICATE_MESSAGE_PROTECTION sessizce atlanmaya devam eder.
- `CHANNEL_COOLDOWN`'ın kanal bazlı olmaması, pratikte bir kanaldan mesaj atıldığında diğer tüm
  kanalların da 72 saat "soğumada" görünmesine yol açar (daha kısıtlayıcı, güvenli taraf) — Faz
  7'de düzeltilecek.
- pgTAP testi (`supabase/tests/outreach_guard.test.sql`) yalnızca bu fazda uygulanan kontrolleri
  doğrular; MAX_FOLLOWUPS/DUPLICATE_MESSAGE_PROTECTION testleri Faz 7/8'e ertelendi.

## Güncelleme (Faz 7, 2026-09-26)

`conversations`/`messages` tabloları eklenince `outreach_guard()` `20260925196000_conversations.sql`
migration'ında `CREATE OR REPLACE` ile tamamlandı:

- `CHANNEL_COOLDOWN` artık kanal bazlı (`conversations.last_outbound_at`, kanal başına ayrı satır).
- `DAILY_CHANNEL_LIMIT` eklendi (`outreach_limits.channels` içindeki kanal başına günlük sınır,
  gerçek `messages` SENT sayısına göre).
- `DUPLICATE_MESSAGE_PROTECTION`, `outreach_guard()`'a değil `mark_message_sent()` RPC'sine eklendi
  (içerik hash'i belirli bir mesaja ait olduğu için kanal-seviyeli guard'dan ayrı ele alındı).
- `MAX_FOLLOWUPS` hâlâ ertelenmiştir; `follow_ups` tablosu Faz 8'de eklenince tamamlanacak.

`chooseChannel()`'daki `OTHER_CHANNEL_ALREADY_CONTACTED` sınırlaması ve fallback modellememesi
maddesi değişmedi; gerçek teslim durumu (`messages` üzerinden) Faz 8/10'da fallback mantığına
bağlanabilir.

## Kaynaklar

- SPEC.md → I.4, I.5
