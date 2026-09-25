# Faz 1 — Manuel QA Listesi

Kaynak: `docs/phases/PHASE-01.md` → Acceptance criteria.

## Bu oturumda doğrulanabilenler

- [x] `pnpm lint && pnpm typecheck && pnpm test` temiz — 4 test dosyası, 13 test.
- [x] `cargo check` (Rust: `keyring` + `secrets.rs` komutları dahil) hatasız.
- [x] `pnpm build` (Vite) hatasız; login sayfası tarayıcı önizlemesinde doğru render ediliyor,
      oturumsuz durumda `/login`'e yönlendiriliyor (RouteGuard doğrulandı).
- [x] Migration'lar SPEC.md → E, F, N, P.1 ile satır satır karşılaştırıldı: RLS ENABLE+FORCE,
      `is_member`/`is_admin` yardımcıları, `activity_logs` immutability trigger'ı + REVOKE,
      son-admin koruması, `workspace_id` spoofing engeli (bkz. pgTAP test dosyaları).
- [x] `docs/adr/0002-auth.md`: SMTP limiti (2 e-posta/saat, custom SMTP gerekli),
      `inviteUserByEmail` `redirectTo` davranışı, custom storage adapter arayüzü ve
      `FORCE ROW LEVEL SECURITY` + `SECURITY DEFINER` etkileşimi (postgres BYPASSRLS)
      araştırıldı ve kod bu bulgulara göre yazıldı.

## Bu ortamda çalıştırılamayanlar (kullanıcı tarafından doğrulanmalı)

- [ ] **pgTAP testleri** (`supabase/tests/workspace_isolation.test.sql`,
      `member_cannot_update_settings.test.sql`, `activity_logs_immutable.test.sql`,
      `bootstrap_workspace_once.test.sql`, `last_admin_protection.test.sql`,
      `workspace_write_guards.test.sql`): Docker kurulu değil, bu yüzden `supabase start` ve
      `pnpm test:db` bu oturumda çalıştırılamadı. Docker Desktop kurulup şu adımlarla
      doğrulanmalı:
      ```bash
      supabase start
      pnpm test:db
      ```
      Her dosyanın pgTAP `plan()` sayısı kadar test geçmeli, hiç FAIL olmamalı.
- [ ] **Deno testleri** (`supabase/functions/admin-invite/validate.test.ts`): Deno bu ortamda
      kurulu değil. `deno test supabase/functions/admin-invite/` ile doğrulanmalı.
- [ ] **Gerçek Supabase projesi kurulumu** (SPEC.md → F, "Uzak Supabase kurulumu"):
      1. [Supabase Dashboard](https://supabase.com/dashboard)'da yeni proje oluşturun.
      2. Authentication → Providers → Email: "Confirm email" açık, "Allow new users to sign up"
         **kapalı** (yalnızca davetle giriş).
      3. Authentication → Policies: minimum şifre uzunluğu 12.
      4. **Authentication → Emails → SMTP Settings'den custom SMTP bağlayın** — yerleşik servis
         saatte yalnızca 2 e-posta gönderir, ekip testleri için yetersizdir (bkz. ADR 0002).
      5. `supabase link --project-ref <ref>` ve `supabase db push` ile migration'ları uygulayın.
      6. Dashboard → Authentication → Users'dan ilk kullanıcıyı (admin) elle oluşturun.
      7. Uygulamada bu kullanıcıyla giriş yapın → "Davet bekleniyor" ekranında workspace adı
         girip "Workspace oluştur" ile `bootstrap_workspace` çağrılır, admin olursunuz.
      8. Edge Function'ı deploy edin: `supabase functions deploy admin-invite`.
      9. `apps/desktop/.env` dosyasını `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` ile doldurun.
- [ ] **Uçtan uca davet akışı**: Team sayfasından ikinci bir e-posta davet edin → gösterilen
      davet kodunu not edin → davetli e-postadaki Supabase linkiyle şifresini belirlesin →
      masaüstü uygulamasında giriş yapsın → "Davet bekleniyor" ekranında kodu girip katılsın.
      Activity Log'da `member.invite_accepted` satırının düştüğünü doğrulayın.
- [ ] **Oturumun Credential Manager'da saklandığı**: uygulamayı kapatıp yeniden açın, oturumun
      geri geldiğini doğrulayın; Windows "Kimlik Bilgisi Yöneticisi"nde
      `com.hostlysisletme.localbusinessfinder` servis adıyla bir girdi görünmeli.
- [ ] **Supabase Security Advisor**'da kritik uyarı olmadığını Dashboard → Advisors'dan kontrol
      edin.

## Notlar

- Davet kabul akışı için mimari karar (deep-link yerine uygulama içi davet kodu):
  `docs/adr/0002-auth.md` → madde 5.
- `workspace_members`/`workspace_invites`/`activity_logs` kullanıcı referansları
  `auth.users(id)` yerine `public.profiles(id)`'e FK'lidir (PostgREST embedding için
  standart Supabase pratiği); `profiles`, `on_auth_user_created` trigger'ı ile her zaman
  `auth.users`'ın 1:1 gölgesidir.
