# ADR 0003 — Realtime RLS Davranışı ve Dedupe/Merge Tasarım Kararları

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-25
- **Bağlam:** Faz 2 (CRM Core + Import + Dedupe) — `docs/SPEC.md` → E, G.4, K bölümleri (bu faz için ayrı bir `PHASE-02.md` sağlanmadı, kapsam doğrudan SPEC'ten türetildi)

## Sorun

1. Faz 2'nin acceptance kriteri "bir kullanıcının değişikliği diğerinde ≤ 3 sn içinde görünür" Supabase Realtime'a bağımlı; Realtime'ın RLS'i (workspace izolasyonu) gerçekten uyguladığı doğrulanmalı.
2. SPEC'in `businesses` tablo tanımı "olası duplicate kuyruğu" ve "merge" özelliklerini açıkça istiyor (G.4, D modülleri) ama bu ikisi için ayrı bir kuyruk tablosu ya da merge sonrası silme davranışı tanımlamıyor.

## Araştırma Bulguları

### Realtime `postgres_changes` + RLS

Doğrulandı: `postgres_changes`, her aboneye özel olarak RLS politikalarını **gerçekten uygular** — bir satır yalnızca o kullanıcının SELECT politikasından geçiyorsa yayınlanır. **Önemli istisna:** `DELETE` olayları RLS'e tabi değildir (Postgres, silinen satır için "bu kullanıcı görebilir miydi" kontrolünü yapamaz); silinen satırın eski verisi RLS'ten bağımsız olarak tüm abonelere gider. `REPLICA IDENTITY FULL` olmadan UPDATE/DELETE olaylarında eski değerler gönderilmez.

### Karar

- `businesses`, `notes`, `stage_transitions` tabloları `supabase_realtime` publication'ına eklenir ve `REPLICA IDENTITY FULL` ayarlanır.
- **Bu fazda hiçbir RPC bu tablolardan gerçek `DELETE` yapmaz** (DELETE/RLS açığından tamamen kaçınmak için). Merge ve olası duplicate işaretleme, aşağıdaki gibi **soft** alanlarla çözülür — bu, SPEC'in "soft-delete yok (DNC ve LOST yeterli; gerçek silme yalnızca admin RPC ile, KVKK talebi için)" ilkesiyle de tutarlıdır.

### `businesses` tablosuna SPEC'in E listesinde açıkça yer almayan iki alan eklendi

| Alan | Amaç | Gerekçe |
| --- | --- | --- |
| `possible_duplicate_of uuid references businesses(id)` | I.4'teki "olası duplicate kuyruğu" | SPEC ayrı bir kuyruk tablosu tanımlamıyor; bu alan `WHERE possible_duplicate_of IS NOT NULL` filtresiyle Leads sayfasında doğrudan kuyruk görünümü sağlar, ek tabloya gerek bırakmaz. |
| `merged_into uuid references businesses(id)` | `merge_businesses` sonrası "kaybeden" kaydı işaretlemek | Gerçek DELETE hem Realtime DELETE/RLS açığını tetikler hem de SPEC'in genel "soft-delete" ilkesine aykırı düşer; bunun yerine `merged_into` set edilir, aktif lead listeleri `WHERE merged_into IS NULL` filtreler, tüm çocuk kayıtlar (`business_sources`, `contact_channels`, `notes`, `stage_transitions`) `keep_id`'ye taşınır. |

Bu iki alan Karar Kaydı'na yeni bir madde olarak eklenmedi çünkü SPEC'in D bölümündeki hiçbir kararla çelişmiyor; yalnızca SPEC'in belirtmediği bir uygulama detayını dolduruyor.

## Sonuçlar

Realtime abonelikleri güvenle workspace'e göre filtrelenir; DELETE kullanılmadığı için DELETE/RLS istisnası bu fazda risk oluşturmaz. `merged_into`/`possible_duplicate_of` alanları ileride gerçek bir "duplicate queue" tablosuna taşınmak istenirse migration ile kolayca dönüştürülebilir (veri kaybı olmadan).

## Kaynaklar

- [Postgres Changes | Supabase Docs](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Realtime Postgres RLS now available on Supabase](https://supabase.com/blog/realtime-row-level-security-in-postgresql)
