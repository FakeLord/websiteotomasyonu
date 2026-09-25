# Jarvis Skill — Local Business Finder (yer tutucu)

Bu dosya, Jarvis entegrasyonunun (SPEC.md → O bölümü) Faz 12'de dolduracağı yer tutucudur. Faz 0 kapsamında yalnızca klasör ve manifest iskeleti oluşturulur; hiçbir action henüz tanımlı değildir.

## Durum

- **Faz:** 0 (iskelet) — Faz 12'de (`docs/phases/PHASE-12.md`) tam entegrasyon eklenecek.
- **Action kataloğu:** `docs/SPEC.md` → O bölümü, "Action kataloğu (v1)" tablosu.
- **Manifest:** `jarvis/actions.json` — `packages/contracts/src/actions/*.ts` zod şemalarından üretilir, elle düzenlenmez.

## Erişim modeli (özet)

Jarvis, core'a hiç dokunmadan `jarvis-gateway` Edge Function üzerinden, versiyonlu bir action sözleşmesiyle bağlanır. AGENT rolü yalnızca okuma view'larına erişir; yazma işlemleri onay token'ı gerektiren RPC'ler üzerinden yapılır. Ayrıntılar için `docs/SPEC.md` → O bölümü.
