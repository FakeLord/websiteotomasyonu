-- ADR 0018: taslak kuyruğu (draft_jobs + RPC'ler): seçim kuralı, yurtdışı kilidi, sahiplik, iptal/yeniden dene, yalıtım.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(22);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dq1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dq2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('DQ WS 1') as ws \gset
select (public.import_business(:'ws', '{"name": "Aday Bir", "source": "MANUAL", "countryCode": "TR"}'::jsonb) ->> 'businessId') as b1 \gset
select (public.import_business(:'ws', '{"name": "Sitesi Var", "source": "MANUAL", "countryCode": "TR"}'::jsonb) ->> 'businessId') as b2 \gset
select (public.import_business(:'ws', '{"name": "Mailsiz", "source": "MANUAL", "countryCode": "TR"}'::jsonb) ->> 'businessId') as b3 \gset
select (public.import_business(:'ws', '{"name": "Texas Dental", "source": "MANUAL", "countryCode": "US"}'::jsonb) ->> 'businessId') as b4 \gset
select (public.import_business(:'ws', '{"name": "DNC Aday", "source": "MANUAL", "countryCode": "TR"}'::jsonb) ->> 'businessId') as b5 \gset
reset role;

update public.businesses set website_status = 'NO_WEBSITE', lead_score = 80 where id in (:'b1', :'b3', :'b4', :'b5');
update public.businesses set website_status = 'GOOD_WEBSITE', lead_score = 90 where id = :'b2';
update public.businesses set do_not_contact = true where id = :'b5';
insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via)
select :'ws', id, 'EMAIL', 'info@' || id || '.test', 'info@' || id || '.test', 'MANUAL'
from public.businesses where id in (:'b1', :'b2', :'b4', :'b5');

set local role authenticated;

select throws_ok(
  format($q$select public.enqueue_opportunity_drafts(%L, 'de', 10)$q$, :'ws'),
  'language must be tr or en',
  'Dil tr veya en olmalı'
);

select is(
  (public.enqueue_opportunity_drafts(:'ws', 'en', 10) ->> 'queued')::int,
  1,
  'Yalnızca uygun TR işletme kuyruğa alınır (siteli, e-postasız, DNC ve yurtdışı hariç)'
);

select is(
  (select business_id::text from public.draft_jobs where workspace_id = :'ws'),
  :'b1',
  'Kuyruktaki işletme sitesi olmayan, e-postalı TR işletmesi'
);

select is(
  (public.enqueue_opportunity_drafts(:'ws', 'en', 10) ->> 'queued')::int,
  0,
  'İkinci çağrı aynı işletmeyi tekrar kuyruğa almaz'
);

reset role;
update public.workspace_settings
set outreach_limits = jsonb_set(outreach_limits, '{allow_foreign_email}', 'true'::jsonb)
where workspace_id = :'ws';
set local role authenticated;

select is(
  (public.enqueue_opportunity_drafts(:'ws', 'en', 10) ->> 'queued')::int,
  1,
  'Yurtdışı e-posta ayarı açılınca ABD işletmesi de kuyruğa girer'
);

select is(
  (public.enqueue_opportunity_drafts(:'ws', 'tr', 10, 'TR') ->> 'queued')::int,
  0,
  'Ülke süzgeci: TR için yeni aday yok'
);

-- Sahiplik: iş bir cihaza verilir.
select is(
  (public.claim_next_draft_job(:'ws', 'dev-a', 300) ->> 'businessId'),
  :'b1',
  'İlk iş (en eski) cihaz A''ya verilir'
);
select is(
  (public.claim_next_draft_job(:'ws', 'dev-b', 300) ->> 'businessId'),
  :'b4',
  'Sıradaki iş cihaz B''ye verilir (A''nın işi tekrar verilmez)'
);
select is(
  public.claim_next_draft_job(:'ws', 'dev-c', 300),
  null,
  'Kuyruk boşken null döner'
);

select public.complete_draft_job(
  (select id from public.draft_jobs where business_id = :'b1'), 'dev-WRONG', 'DONE', null, null
);
select is(
  (select status from public.draft_jobs where business_id = :'b1'),
  'RUNNING',
  'İşi almayan cihaz kapatamaz'
);

select public.complete_draft_job(
  (select id from public.draft_jobs where business_id = :'b1'), 'dev-a', 'DONE', null, null
);
select is(
  (select status from public.draft_jobs where business_id = :'b1'),
  'DONE',
  'İşi alan cihaz DONE yapabilir'
);

select public.complete_draft_job(
  (select id from public.draft_jobs where business_id = :'b4'), 'dev-b', 'FAILED', 'Kontrolden geçemedi', null
);
select is(
  (select error from public.draft_jobs where business_id = :'b4'),
  'Kontrolden geçemedi',
  'FAILED hata nedeniyle kaydedilir'
);

select is(
  (public.draft_queue_progress(:'ws') ->> 'failed')::int,
  1,
  'İlerleme: 1 başarısız'
);
select is(
  (public.retry_failed_draft_jobs(:'ws')),
  1,
  'Başarısız iş yeniden kuyruğa alınır'
);
select is(
  (select status from public.draft_jobs where business_id = :'b4'),
  'QUEUED',
  'Yeniden denenen iş QUEUED'
);
select is(
  (public.cancel_draft_jobs(:'ws')),
  1,
  'Bekleyen iş iptal edilir'
);
select is(
  (select status from public.draft_jobs where business_id = :'b4'),
  'CANCELLED',
  'İptal edilen iş CANCELLED'
);

-- İptal edilen işletme yeniden kuyruğa alınabilir; kota/kurulum nedeniyle bırakılan iş deneme hakkı harcamaz.
select is(
  (public.enqueue_opportunity_drafts(:'ws', 'tr', 10) ->> 'queued')::int,
  1,
  'İptal edilen işletme yeniden kuyruğa alınır (dil güncellenir)'
);
select is(
  (select language from public.draft_jobs where business_id = :'b4'),
  'tr',
  'Yeniden kuyruğa alınan işin dili yeni seçimdir'
);
select public.claim_next_draft_job(:'ws', 'dev-d', 300);
select public.complete_draft_job(
  (select id from public.draft_jobs where business_id = :'b4'), 'dev-d', 'QUEUED', 'Günlük AI kotası doldu', null
);
select is(
  (select status || ':' || attempts::text from public.draft_jobs where business_id = :'b4'),
  'QUEUED:0',
  'Bırakılan iş kuyruğa döner ve deneme sayısı geri alınır'
);

-- Yalıtım: başka çalışma alanı üyesi bu kuyruğa dokunamaz.
reset role;
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok(
  format($q$select public.claim_next_draft_job(%L, 'dev-x', 300)$q$, :'ws'),
  'not a member of this workspace',
  'Başka çalışma alanı kuyruğu alınamaz'
);
select is(
  (select count(*)::int from public.draft_jobs where workspace_id = :'ws'),
  0,
  'Başka çalışma alanı üyesi draft_jobs satırlarını göremez'
);

select * from finish();

rollback;
