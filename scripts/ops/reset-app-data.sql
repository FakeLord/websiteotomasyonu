-- =====================================================================================================
-- UYGULAMA VERİSİNİ SIFIRLAMA — elle, yalnızca proje sahibi tarafından, Supabase SQL Editor'de çalıştırılır.
-- Geliştirme sürerken her güncellemeden sonra temiz başlamak için TEKRAR TEKRAR çalıştırılabilir.
--
-- SİLİNEN: tüm işletmeler ve onlara bağlı her şey (iletişim kanalları, kaynaklar, notlar, aşama geçmişi,
--          website analizleri, konuşmalar, mesajlar, devirler, follow-up'lar, müşteri anlaşmaları),
--          kampanyalar ve üyeleri, arama geçmişi, AI çağrı geçmişi ve önbelleği, aktivite günlüğü.
-- KALAN:   kullanıcılar ve ekip (workspace_members, profiles, davetler), çalışma alanı ayarları
--          (workspace_settings: puanlama, AI yapılandırması, limitler, saat dilimi), API anahtarları (Vault),
--          Bilgi Bankası (kb_entries), hizmetler ve paketler (services, service_packages).
--
-- GERİ DÖNÜŞ: silinen her tablonun tam kopyası önce `reset_backup_<tarih_saat>` şemasına alınır (her
--          çalıştırmada yeni bir şema). Bu şemalar API'ye açık değildir. Eskileri en alttaki komutla silinir.
-- GÜVENLİK: tek işlemdir (transaction); herhangi bir adım hata verirse HİÇBİR ŞEY silinmez.
-- NOT:     aktivite günlüğü normalde silinemez (append-only tetikleyici). TRUNCATE satır tetikleyicisini
--          çalıştırmadığı için burada kullanılır; tetikleyiciye dokunulmaz, koruma olduğu gibi kalır.
-- =====================================================================================================

begin;

do $$
declare
  v_schema text := 'reset_backup_' || to_char(now() at time zone 'Europe/Istanbul', 'YYYYMMDD_HH24MI');
  v_table text;
  v_tables text[] := array[
    'businesses', 'contact_channels', 'business_sources', 'notes', 'stage_transitions', 'website_analyses',
    'conversations', 'messages', 'human_handoffs', 'follow_ups', 'customer_deals', 'campaigns',
    'campaign_members', 'search_jobs', 'ai_runs', 'ai_output_cache', 'activity_logs'
  ];
begin
  -- 1) Yedek: silinecek her tablonun kopyası. Aynı dakikada ikinci çalıştırma "already exists" ile durur.
  execute format('create schema %I', v_schema);
  foreach v_table in array v_tables loop
    execute format('create table %I.%I as table public.%I', v_schema, v_table, v_table);
  end loop;
  execute format('revoke all on schema %I from public, anon, authenticated', v_schema);
  raise notice 'Yedek alındı: % (% işletme)', v_schema, (select count(*) from public.businesses);
end
$$;

-- 2) Silme. İşletmeye bağlı tablolar ON DELETE CASCADE ile birlikte gider.
delete from public.follow_ups;        -- mesajlara cascade'siz bağlı olduğu için önce
delete from public.campaigns;         -- campaign_members cascade
delete from public.businesses;        -- kanallar, kaynaklar, notlar, aşama geçmişi, analizler, konuşmalar,
                                      -- mesajlar, devirler, anlaşmalar cascade
delete from public.search_jobs;
delete from public.ai_runs;
delete from public.ai_output_cache;
delete from public.worker_leases;
truncate table public.activity_logs restart identity;

-- 3) Kontrol: soldaki sayılar 0, sağdakiler (kalanlar) dokunulmamış olmalı.
select
  (select count(*) from public.businesses)      as isletme,
  (select count(*) from public.conversations)   as konusma,
  (select count(*) from public.messages)        as mesaj,
  (select count(*) from public.campaigns)       as kampanya,
  (select count(*) from public.search_jobs)     as arama,
  (select count(*) from public.activity_logs)   as aktivite,
  (select string_agg(nspname, ', ' order by nspname) from pg_namespace where nspname like 'reset_backup_%') as yedek_semalari,
  (select count(*) from public.workspace_members) as kalan_uye,
  (select count(*) from public.workspace_settings) as kalan_ayar,
  (select count(*) from public.kb_entries)        as kalan_bilgi_bankasi,
  (select count(*) from public.service_packages)  as kalan_paket;

commit;

-- -----------------------------------------------------------------------------------------------------
-- Eski yedekleri kalıcı olarak silmek için (AYRI çalıştırılır; şema adını kontrol satırından alın):
--   drop schema reset_backup_20261009_1430 cascade;
-- -----------------------------------------------------------------------------------------------------
