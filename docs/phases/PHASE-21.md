# PHASE 21 (G9) — Jarvis işlemleri

**Dal:** `feature/p21-jarvis-actions` · **Zorluk:** Orta · **Bağımlılık:** G6
**Referans:** `docs/SPEC.md` → O, D15 · BACKLOG #25

## Amaç
Jarvis yalnızca cevap vermez; sözleşmeli, onaylı işlemleri de yapar. Gönderim her zaman insan onayındadır.

## Kapsam
- `jarvis-gateway` Edge Function, AGENT rolü ve RLS, kapsamlı belirteç, idempotency anahtarı, onay belirteci.
- `packages/contracts/actions` → `jarvis/actions.json` üretimi; `jarvis/SKILL.md`.
- İşlem kataloğu: lead ara/filtrele, tarama başlat (bütçe sınırıyla), analiz çalıştır, taslak hazırlat, not ekle, aşama öner,
  follow-up planla. **Yapamaz:** mesaj gönderme, DNC kaldırma, silme, ayar değiştirme.
- Uygulama içi panel: Jarvis'in önerdiği işlem "Onayla" ile çalışır; her işlem `actor_type = JARVIS` ile loglanır.

## Testler
- Birim: işlem şemaları ve doğrulama; Deno: gateway yetki, idempotency, onay süresi. pgTAP: AGENT rolünün sınırları.

## Acceptance criteria
- [ ] "Austin'deki web sitesi olmayan diş kliniklerini tara" → bütçe onayıyla tarama başlar.
- [ ] Jarvis onaysız hiçbir mutasyon yapamaz; yasak işlemler reddedilir ve loglanır.
