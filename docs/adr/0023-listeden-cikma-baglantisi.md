# ADR 0023 — Listeden çıkma bağlantısı ve `List-Unsubscribe` başlığı

**Durum:** Kabul · 2026-10-11 (kullanıcı onayı: "ilerleyelim"); kod hazır, bulutta denenmedi
**İlgili:** ADR 0019 (ülke uyumu, "Bilinen sınırlar" maddesi), `docs/phases/PHASE-17.md`

## Sorun
Giden e-postalarda çıkma yolu yalnızca "bu e-postayı yanıtlayın" satırıdır. Alıcı yanıt yazmak zorundadır ve çıkma isteği
ancak uygulama açıkken gelen kutusu çalışırsa işlenir. Standart tek tıkla çıkma (RFC 8058: `List-Unsubscribe` +
`List-Unsubscribe-Post`) yoktur; posta sağlayıcıları bunu "spam değil" sinyali sayar.

## Karar
1. **Tek kullanımlık, tahmin edilemez bağlantı.** Her giden e-posta için sunucuda rastgele 32 baytlık bir anahtar üretilir;
   veritabanında yalnızca SHA-256 özeti tutulur. İmza sırrı istemciye konmaz (masaüstü uygulamasında gizli anahtar saklanamaz).
2. **Veritabanı** (yeni migration, eskisine dokunulmaz):
   - `unsubscribe_tokens(id, workspace_id, business_id, message_id, token_hash unique, created_at, used_at)`; RLS + FORCE RLS,
     istemci yalnızca kendi çalışma alanında okur, doğrudan yazamaz.
   - `issue_unsubscribe_token(p_business_id uuid, p_message_id uuid) → text`: SECURITY DEFINER, yalnızca çalışma alanı üyesi;
     ham anahtarı bir kez döner.
   - `consume_unsubscribe_token(p_token text) → jsonb`: yalnızca `service_role`; anahtarı bulur, işletmeyi DNC yapar
     (`set_dnc` mantığı, sebep "Alıcı bağlantıyla çıktı"), e-posta adresi ve alan adını `suppressions`'a yazar, `activity_logs`'a
     kayıt düşer, `used_at` doldurur. Tekrar çağrı hata vermez ("zaten çıkarıldınız").
3. **Edge Function `unsubscribe`** (`verify_jwt = false`, herkese açık): `GET ?t=...` ve `POST` ile aynı işi yapar
   (RFC 8058 tek tıklama POST'tur). Cevap düz metindir: Supabase fonksiyon alan adı HTML'i düz metne çevirir, bu yüzden
   güzel bir sayfa yapılamaz; bu sınırı kabul ediyoruz. Dil `lang` parametresiyle TR/EN. Hata mesajı ayrıntı sızdırmaz.
4. **Gönderim:**
   - `deliver` e-posta gönderirken `issue_unsubscribe_token` çağırır; alt bilgiye "Listeden çıkmak için: <bağlantı>" satırı ekler
     (mevcut "yanıtla çık" satırı kalır).
   - `OutboundEmail` yeni alan: `list_unsubscribe_url`. Yerel sunucu (nodemailer) ve Tauri (lettre) bu adresle
     `List-Unsubscribe: <url>` ve `List-Unsubscribe-Post: List-Unsubscribe=One-Click` başlıklarını ekler.
5. **Kapsam dışı:** SMTP gönderimi olmayan kanallar (Instagram vb.), sunucu tarafı otomatik gönderim (G7), güzel HTML sayfa
   (özel alan adı gerekir; G10).

## Adımlar
| # | Adım | Doğrulama |
| --- | --- | --- |
| 1 | Migration + pgTAP (RLS, yetki, tek kullanım, DNC + suppressions, ikinci tıklama) | `supabase test db` |
| 2 | Edge Function `unsubscribe` + doğrulama birim testi | vitest |
| 3 | Alt bilgi (`buildComplianceFooter`) bağlantı satırı + `OutboundEmail.list_unsubscribe_url` + `deliver` bağlama | vitest |
| 4 | Yerel sunucu başlıkları (nodemailer) | vitest (mock transport) |
| 5 | Tauri başlıkları (lettre) | `cargo test` / derleme (mümkünse) |
| 6 | Kabul listesi + ADR 0019 "Bilinen sınırlar" güncellemesi + BACKLOG | — |

## Kullanıcıdan gereken (Claude yapmaz)
- `npx supabase db push` (yeni migration)
- `npx supabase functions deploy unsubscribe --no-verify-jwt`
- Gerçek bir e-postada bağlantıya tıklayıp işletmenin DNC olduğunu görmek.

## Riskler
- Posta güvenlik tarayıcıları bağlantıyı önceden açıp alıcıyı yanlışlıkla çıkarabilir. Yön muhafazakârdır (gereksiz çıkma,
  gereksiz gönderimden iyidir); kabul edilir.
- Tauri (Rust) değişikliği bu ortamda derlenemezse yalnızca web kipi test edilmiş olur; masaüstü başlıkları kullanıcı derlemesinde
  doğrulanmalıdır.
- Supabase varsayılan alan adı e-postada "güzel" görünmez; özel alan adı G10'dur.
