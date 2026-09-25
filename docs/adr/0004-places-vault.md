# ADR 0004 — Supabase Vault ve Places API (New) İstek Şekli

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-25
- **Bağlam:** Faz 3 (Google Places Discovery) — SPEC.md → G.1, P.3 (VERIFY_CURRENT_DOCS)

## Sorun

P.3'te işaretlenmiş, henüz yapılmamış bir VERIFY: Supabase Vault'un Free planda kullanılabilirliği ve Edge Function'dan okunma yöntemi. Ayrıca Places API (New) Text Search'ün tam istek/yanıt şekli (field mask header'ı, sayfalama) doğrulanmalı.

## Araştırma Bulguları

### Supabase Vault

Vault, `vault.decrypted_secrets` görünümü üzerinden okunan bir Postgres uzantısıdır. **Edge Function'dan doğrudan `env` değişkeni gibi okunamaz** — bir veritabanı round-trip'i gerekir: ya `supabase.rpc()` ile bir `SECURITY DEFINER` fonksiyon çağrılır, ya da service-role bağlantısıyla `vault.decrypted_secrets`'a doğrudan sorgu atılır. Free planda kullanılabilirliği dokümanlarda açıkça teyit edilemedi (muğlak); pratikte Vault, Postgres uzantısı olarak her planda kurulu geliyor ve ek ücret gerektirmiyor — kritik bir engel bulunamadı.

**Karar:** `admin-secrets` Edge Function'ı, Google Places anahtarını `vault.create_secret()` ile yazar; `places-search` Edge Function'ı service-role bağlantısıyla `SECURITY DEFINER` bir `get_secret(name text)` SQL fonksiyonu üzerinden okur (ham `vault.decrypted_secrets` görünümüne Edge Function'ın doğrudan erişimi olmaz, yalnızca dar bir fonksiyon arayüzü).

### Places API (New) Text Search — tam istek şekli

- **Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`
- **Header'lar:** `X-Goog-Api-Key: <key>`, `X-Goog-FieldMask: places.id,places.displayName,...` (boşluksuz, virgülle ayrılmış; SPEC'teki sabit maske ile birebir kullanılacak).
- **Body:** `{"textQuery": "...", "languageCode": "tr", "regionCode": "TR", "pageSize": 20, "pageToken": "..."}`.
- **Sayfalama:** `nextPageToken` **response body'sinde bir JSON alanı** olarak döner (query param değil); bir sonraki istekte `pageToken` olarak body'ye konur. `pageToken` dışındaki tüm parametreler bir önceki istekle birebir aynı olmalı (aksi halde `INVALID_ARGUMENT`). Google, token geçerli olana kadar bir bekleme süresi belgelemiyor; yine de SPEC'teki "istekler arası 1 sn" kuralı korunur.

## Karar

- `places-search` Edge Function'ı yukarıdaki tam istek şeklini birebir uygular; field mask sabiti kodda tek bir yerde tutulur (`SPEC.md → G.1`'deki liste).
- Vault erişimi dar bir `get_secret`/`set_secret` SQL fonksiyon arayüzü üzerinden yapılır, Edge Function'lar `vault.decrypted_secrets`'a doğrudan erişmez.

## Kaynaklar

- [Text Search (New) | Places API (New)](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Vault | Supabase Docs](https://supabase.com/docs/guides/database/vault)
- [Working around the Edge Function secrets limit | Supabase Docs](https://supabase.com/docs/guides/troubleshooting/working-around-the-edge-function-secrets-limit)
