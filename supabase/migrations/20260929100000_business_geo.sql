-- G2 (ADR 0012): her işletme bir ülkeye, saat dilimine ve dile bağlanır.
-- Mevcut kayıtlar Türkiye'dir. Yeni sütunlar istemci UPDATE yetkisine EKLENMEZ
-- (20260926100100: tablo düzeyi UPDATE geri alınmış, yalnızca listelenen sütunlar yazılabilir);
-- düzenleme arayüzü G6'da gelir. Okuma tablo düzeyindeki SELECT ile açıktır.

alter table public.businesses
  add column country_code text,
  add column region text,
  add column postal_code text,
  add column timezone text,
  add column language text,
  add column places_refreshed_at timestamptz;

update public.businesses
set country_code = 'TR',
    timezone = 'Europe/Istanbul',
    language = 'tr'
where country_code is null;

-- Places'tan gelen kayıtların verisi oluşturulma anında alınmıştı.
update public.businesses
set places_refreshed_at = created_at
where google_place_id is not null and places_refreshed_at is null;

alter table public.businesses
  alter column country_code set not null,
  add constraint businesses_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  add constraint businesses_language_format check (language is null or language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

create index businesses_ws_country_city_idx on public.businesses (workspace_id, country_code, city);
create index businesses_ws_category_idx on public.businesses (workspace_id, category);
create index businesses_name_trgm_idx on public.businesses using gin (name extensions.gin_trgm_ops);

-- Ekibin çalışma saati dilimi (panel ve rapor gün sınırları, günlük limitler) ve ülkesiz eski
-- çağrılar için varsayılan ülke.
alter table public.workspace_settings
  add column timezone text not null default 'Europe/Istanbul',
  add column default_country text not null default 'TR';

alter table public.workspace_settings
  add constraint workspace_settings_default_country_format check (default_country ~ '^[A-Z]{2}$');
