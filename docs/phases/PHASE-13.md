# PHASE 13 (G1) — Buluta taşıma

**Dal:** `feature/p13-cloud` · **Zorluk:** Orta · **Bağımlılık:** G0 · **Kullanıcı adımı gerekir**
**Referans:** `docs/SPEC.md` → F ("Uzak Supabase kurulumu"), P.3, D13, D19 · BACKLOG #28, #26 (yedek)

## Amaç
Veritabanı ve sunucu fonksiyonları bulutta; ekip aynı veriyi kullanır, Docker günlük kullanım için gerekmez.

## Kullanıcının yapacakları
1. supabase.com'da hesap ve proje açmak (bölge: ekibe yakın; veritabanı şifresini saklamak).
2. Proje referansını ve `anon` anahtarını `.env`'e yazmak; `supabase login` + `supabase link` (kimlik bilgisi yalnızca kullanıcıda).
3. Vault'a API anahtarlarını (Google Places, NVIDIA, isteğe bağlı OpenAI) Ayarlar ekranından girmek.
4. Davet e-postaları için SMTP bilgisi (Auth → SMTP).

## Kapsam
- `supabase db push` (tüm migration'lar), 5 Edge Function'ın yayınlanması (`admin-invite`, `admin-secrets`, `ai-gateway`,
  `jarvis-chat`, `places-search`), `pnpm sync:edge` doğrulaması.
- Auth: herkese açık kayıt kapalı, e-posta doğrulama açık, en az 12 karakter şifre; ilk ADMIN + `bootstrap_workspace`.
- İsteğe bağlı: yerel verinin (işletmeler, kanallar, KB) buluta aktarımı — mevcut JSON dışa aktarımı + tek seferlik içe aktarma betiği.
- Web modu CSP'si ve `tauri.conf.json`: `connect-src` bulut adresi (yerel 127.0.0.1 yalnızca geliştirme yapılandırmasında).
- `baslat.cmd`: bulut modunda Docker/Supabase adımını atlar.
- **Haftalık şifreli yedek:** GitHub Actions `pg_dump` (D13); bağlantı dizesi yalnızca depo sırrında.

## Testler
- `pnpm test:db` yerelde yeşil; bulutta şema farkı yok (`supabase db diff` boş).
- Security Advisor'da kritik uyarı yok. Edge Function'lar bulutta `scripts/smoke/*` ile elle denenir.

## Acceptance criteria
- [ ] İkinci bir kullanıcı davet e-postasıyla girer ve aynı veriyi görür; başka workspace'i göremez.
- [ ] Docker kapalıyken `baslat.cmd` ile uygulama açılır ve çalışır.
- [ ] İlk yedek dosyası oluşur ve şifre çözülüp açılabilir.
- [ ] Repoda ve loglarda hiçbir gizli anahtar yoktur.

## VERIFY_CURRENT_DOCS
- Supabase ücretsiz plan sınırları (DB boyutu, Edge Function çağrıları, duraklatma), `pg_cron` ve Vault'un planda varlığı;
  Auth özel SMTP ayarı. Bulgular `docs/adr/0011-cloud.md`.
