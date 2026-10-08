-- =====================================================================================================
-- UYGULAMA VERİSİNİ SIFIRLAMA — elle, yalnızca proje sahibi tarafından, Supabase SQL Editor'de çalıştırılır.
--
-- SİLİNEN: tüm işletmeler ve onlara bağlı her şey (iletişim kanalları, kaynaklar, notlar, aşama geçmişi,
--          website analizleri, konuşmalar, mesajlar, devirler, follow-up'lar, müşteri anlaşmaları),
--          kampanyalar ve üyeleri, arama geçmişi, AI çağrı geçmişi ve önbelleği, aktivite günlüğü.
-- KALAN:   kullanıcılar ve ekip (workspace_members, profiles, davetler), çalışma alanı ayarları
--          (workspace_settings: puanlama, AI yapılandırması, limitler, saat dilimi), API anahtarları (Vault),
--          Bilgi Bankası (kb_entries), hizmetler ve paketler (services, service_packages).
--
-- GERİ DÖNÜŞ: silinen her tablonun tam kopyası önce `reset_backup_20261009` şemasına alınır. Bu şema API'ye
--          açık değildir. Her şey yolundaysa birkaç hafta sonra en alttaki komutla silinebilir.
-- GÜVENLİK: tek işlemdir (transaction); herhangi bir adım hata verirse HİÇBİR ŞEY silinmez.
--          İkinci kez çalıştırılırsa "schema already exists" hatasıyla durur (yedeğin üzerine yazmaz).
-- NOT:     aktivite günlüğü normalde silinemez (append-only tetikleyici). TRUNCATE satır tetikleyicisini
--          çalıştırmadığı için burada kullanılır; tetikleyiciye dokunulmaz, koruma olduğu gibi kalır.
-- =====================================================================================================

begin;

-- 1) Yedek: silinecek her tablonun kopyası.
create schema reset_backup_20261009;

create table reset_backup_20261009.businesses       as table public.businesses;
create table reset_backup_20261009.contact_channels as table public.contact_channels;
create table reset_backup_20261009.business_sources as table public.business_sources;
create table reset_backup_20261009.notes            as table public.notes;
create table reset_backup_20261009.stage_transitions as table public.stage_transitions;
create table reset_backup_20261009.website_analyses as table public.website_analyses;
create table reset_backup_20261009.conversations    as table public.conversations;
create table reset_backup_20261009.messages         as table public.messages;
create table reset_backup_20261009.human_handoffs   as table public.human_handoffs;
create table reset_backup_20261009.follow_ups       as table public.follow_ups;
create table reset_backup_20261009.customer_deals   as table public.customer_deals;
create table reset_backup_20261009.campaigns        as table public.campaigns;
create table reset_backup_20261009.campaign_members as table public.campaign_members;
create table reset_backup_20261009.search_jobs      as table public.search_jobs;
create table reset_backup_20261009.ai_runs          as table public.ai_runs;
create table reset_backup_20261009.ai_output_cache  as table public.ai_output_cache;
create table reset_backup_20261009.activity_logs    as table public.activity_logs;

-- Yedek şeması yalnızca veritabanı sahibine açıktır.
revoke all on schema reset_backup_20261009 from public, anon, authenticated;

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
  (select count(*) from reset_backup_20261009.businesses) as yedekteki_isletme,
  (select count(*) from public.workspace_members) as kalan_uye,
  (select count(*) from public.workspace_settings) as kalan_ayar,
  (select count(*) from public.kb_entries)        as kalan_bilgi_bankasi,
  (select count(*) from public.service_packages)  as kalan_paket;

commit;

-- -----------------------------------------------------------------------------------------------------
-- Her şey yolundaysa, birkaç hafta sonra yedeği kalıcı olarak silmek için (AYRI çalıştırılır):
--   drop schema reset_backup_20261009 cascade;
-- -----------------------------------------------------------------------------------------------------
