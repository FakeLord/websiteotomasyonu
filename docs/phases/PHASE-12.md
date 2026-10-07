# PHASE 12 (G0) — Temizlik ve karar kaydı

**Dal:** `feature/p12-global-foundation` · **Zorluk:** Düşük · **Bağımlılık:** —
**Referans:** `docs/adr/0010-global-pivot.md`, `docs/BACKLOG.md`

## Amaç
Küresel kapsama geçmeden önce tek bir temiz taban: dallar birleşmiş, kararlar yazılı, bilinen hata kapalı.

## Kapsam
- `feature/p09-redesign`, `p10-mvp-completion`, `p11-web-mode` → `main` (yerel, fast-forward).
- SPEC v2: D2 revizyonu, D18–D22, "Yol Haritası v2" tablosu; ADR 0010; BACKLOG; PHASE-12…22.
- Masaüstü SMTP: 465 → örtük TLS, diğer portlar → zorunlu STARTTLS (BACKLOG #7).
- Görünen ürün adı: "Global Business Finder" (yalnızca metin; paket adları, kimlik ve kurulum adı değişmez).

## Testler
- `cargo test --lib` (SMTP güvenlik kipi), elle smoke: `cargo test --lib smtp_smoke -- --ignored`.
- `pnpm lint && pnpm typecheck && pnpm test`.

## Acceptance criteria
- [x] `main`, p11'in son commit'indedir.
- [x] Masaüstünde 587 ve 465 gerçek sunucuda kimlik doğrulama aşamasına ulaşır.
- [x] SPEC, ADR 0010, BACKLOG ve faz dosyaları birbiriyle tutarlıdır.
- [x] Uygulama başlığı ve başlatıcı yeni adı gösterir; testler yeşildir (435 birim testi, 14 Rust testi).
