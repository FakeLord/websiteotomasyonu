# PHASE 01 — Auth + Workspace + RLS + Activity Log

**Dal:** `feature/p01-auth-rls` · **Tag:** `v0.1.0` · **Zorluk:** Yüksek · **Bağımlılık:** Faz 0
**Referans:** `docs/SPEC.md` → E, F, N, P.1, P.3

## Amaç
Çok kullanıcılı, workspace izolasyonlu ve denetim izi değiştirilemez güvenli temel.

## Veritabanı (yeni migration'lar)
- `profiles`: `id` = auth.users.id. Yeni kullanıcıda trigger ile otomatik oluşur.
- `workspaces`, `workspace_members` (role: ADMIN / MEMBER / AGENT, `text + CHECK`), `workspace_invites`, `workspace_settings` (tek satır; jsonb alanları SPEC E'deki varsayılanlarla ve Karar Kaydı D3/D6/D11 değerleriyle doldurulur).
- `activity_logs` (`bigserial`): actor_type USER / AI / JARVIS / SYSTEM.
- Fonksiyonlar (`security definer`, `set search_path = public`, `stable` gerektiğinde):
  - `is_member(ws uuid)`, `is_admin(ws uuid)`, `my_workspace_ids()`
  - `bootstrap_workspace(name text)`: yalnızca hiç workspace yokken çalışır; çağıranı ADMIN yapar.
  - `accept_invite(token text)`
  - `log_activity(ws uuid, action text, entity_type text, entity_id uuid, summary text, metadata jsonb)`: `actor_type`'ı kendisi belirler.
- Trigger'lar:
  - `activity_logs` üzerinde `BEFORE UPDATE OR DELETE` → exception.
  - Son ADMIN rolünü düşürme veya silme → exception.
  - Üye ekleme/çıkarma ve ayar değişikliği → activity log.
- RLS: tüm tablolarda ENABLE + FORCE. SELECT üyelere açıktır; `workspace_settings` ve `workspace_members` için yazma yalnızca admin'e açıktır; `activity_logs` için INSERT/UPDATE/DELETE politikası yoktur ve `REVOKE` uygulanır.

## Edge Functions
- `admin-invite`: JWT'yi doğrular, `is_admin` kontrolü yapar, `auth.admin.inviteUserByEmail` çağırır ve `workspace_invites` kaydı açar. Service role yalnızca burada kullanılır.

## Desktop
- Login, şifre sıfırlama ve davet kabul ekranları.
- Oturum token'ı Rust `keyring` komutu ile Windows Credential Manager'da saklanır (supabase-js için özel storage adapter).
- Route guard: oturum yoksa login'e, üyelik yoksa "Davet bekleniyor" ekranına yönlendirir.
- Team sayfası: üye listesi, davet formu, rol değiştirme (yalnızca admin).
- Activity Log sayfası: liste, actor tipi ve kullanıcı filtresi, sayfalama.

## Uzak Supabase kurulumu (kullanıcıyla birlikte)
- Kullanıcı Supabase projesini oluşturur. Public sign-up kapatılır, e-posta doğrulama açılır, minimum şifre uzunluğu 12 olur.
- `supabase link` ve `supabase db push` çalıştırılır. İlk admin kullanıcısı panelden oluşturulur ve `bootstrap_workspace` çağrılır.

## Testler
- pgTAP:
  - A workspace'inin üyesi B'nin hiçbir tablosunu okuyamaz ve yazamaz.
  - MEMBER `workspace_settings`'i güncelleyemez.
  - `activity_logs` için UPDATE ve DELETE, authenticated kullanıcıda ve service role'de reddedilir.
  - `bootstrap_workspace` ikinci kez çalışmaz.
  - Son admin düşürülemez.
  - İstemcinin gönderdiği `workspace_id` başka bir workspace'e yazmaya izin vermez.
- Integration (lokal Supabase): davet → kabul → üyelik akışı; log_activity actor belirleme.

## Acceptance criteria
- [ ] İki farklı workspace'in kullanıcıları birbirinin verisini göremez (pgTAP yeşil).
- [ ] MEMBER ayar değiştiremez; admin değiştirebilir ve bu log'a düşer.
- [ ] Activity log admin tarafından da silinemez veya değiştirilemez.
- [ ] Davet edilen kullanıcı e-postadaki linkle şifre belirler, giriş yapar ve ekibi görür.
- [ ] Uygulama yeniden açıldığında oturum Credential Manager'dan geri gelir; localStorage'da token yoktur.
- [ ] Supabase Security Advisor'da kritik uyarı yok.

## VERIFY_CURRENT_DOCS
- Supabase Auth yerleşik SMTP limitleri, `inviteUserByEmail` davranışı, supabase-js custom storage adapter API'si. Bulguları `docs/adr/0002-auth.md` dosyasına yaz.
