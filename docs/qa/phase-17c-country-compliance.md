# Ülke uyumu (ADR 0019 / G5) — manuel test listesi

Ön koşul (bulut): `npx supabase db push` (20261010103000_country_compliance), `baslat.cmd build`, `Ctrl+F5`.

## Otomatik doğrulananlar
- pgTAP: `country_compliance.test.sql` (21 doğrulama: ülke kuralları, posta adresi zorunluluğu, kural dışı ülke, yayımlanmış
  adres şartı, kalıcı silme, bastırma listesi ve yeniden içe aktarma, yalıtım).
- Birim: `footer.test.ts` (alt bilgi), `prompts.test.ts` (çıkma ifadeleri), `contact-attempts.test.ts` düzeltildi.

## Elle (bulutta)
- [ ] Ayarlar → Genel → "Gönderen kimliği": şirket adı ve posta adresi girip Kaydet (yönetici); üye bu bölümü görmez.
- [ ] Posta adresi boşken ABD işletmesine gönder: "Gönderen posta adresi girilmemiş" hatası.
- [ ] Adres girilince kendi adresinize bağlı bir test işletmesine e-posta gönderin: mesajın sonunda şirket adı, adres ve
      çıkma satırı görünür (ABD ise "This is a commercial message.").
- [ ] Almanya gibi kural tanımsız ülkede e-posta: "ülke kuralı izin vermiyor" hatası; Instagram/WhatsApp etkilenmez.
- [ ] Kanada/Avustralya işletmesinde adres elle girilmişse e-posta reddedilir; sitesinden bulunmuşsa geçer.
- [ ] Cevapta "unsubscribe" / "çıkmak istiyorum" yazılınca işletme DNC olur.
- [ ] Lead detayında (yönetici) "Kalıcı sil": sebep olmadan silinmez; silince Leadler'e döner, işletme kaybolur.
- [ ] Silinen işletmenin e-postası tekrar içe aktarılınca kayıt DNC olur ve "bastırma listesinde" hatası verir.
