# Yurtdışı e-posta kilidi (ADR 0017) — manuel test listesi

Ön koşul (bulut): `npx supabase db push` (20261010100000_foreign_email_lock). Arayüz değiştiği için `baslat.cmd build`.

## Otomatik doğrulananlar
- pgTAP: `foreign_email_lock.test.sql` (8 doğrulama: TR serbest, ABD kapalı, WhatsApp etkilenmez, yönetici açınca geçer,
  açıkça false iken kapalı, `mark_message_sent` reddeder, MEMBER açamaz).

## Elle (bulutta)
- [ ] Türkiye dışı (country_code ≠ TR) bir işletmede e-posta taslağı onayla → gönder: "Yurtdışındaki işletmeye e-posta kapalı…" hatası.
- [ ] Aynı işletmede WhatsApp/Instagram "İletişime geç" normal çalışır.
- [ ] Ayarlar → Puanlama ve Limitler → "Yurtdışı işletmelere e-posta göndermeye izin ver" kutusu (yönetici): işaretle, Kaydet →
      e-posta artık bu kuraldan reddedilmez (diğer sebepler olabilir: pencere, limit).
- [ ] Kutuyu kapatıp kaydet → yeniden reddedilir.
- [ ] Üye (MEMBER) hesabıyla kutuyu değiştirip Kaydet: değişmez/hata verir.
- [ ] Türkiye'deki işletmeye e-posta bu kuraldan etkilenmez.
