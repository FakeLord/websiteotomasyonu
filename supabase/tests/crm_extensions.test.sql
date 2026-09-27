-- ADR 0007 genişletmeleri: atama, customer_deals, kampanyalar, report_metrics.
-- Her yeni tablo için izolasyon + "yazma yalnızca RPC" + iş kuralları.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(25);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'crm-a@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'crm-a2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'crm-b@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('CRM A') as ws \gset
reset role;
select set_config('request.jwt.claim.sub', '', true);

insert into public.workspace_members (workspace_id, user_id, role)
values (:'ws', 'c1000000-0000-0000-0000-000000000002', 'MEMBER');

insert into public.workspaces (id, name, created_by)
values ('cbbbbbbb-0000-0000-0000-000000000000', 'CRM B', 'c1000000-0000-0000-0000-000000000003');
insert into public.workspace_members (workspace_id, user_id, role)
values ('cbbbbbbb-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000003', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('cbbbbbbb-0000-0000-0000-000000000000');

-- Fixture işletmeler (postgres olarak): biri WON, biri DNC, ikisi e-postalı aday.
insert into public.businesses (id, workspace_id, name, normalized_name, city, district, category, stage, lead_score, do_not_contact, created_by)
values
  ('c2000000-0000-0000-0000-000000000001', :'ws', 'Kazanılan Diş', 'kazanilan dis', 'İstanbul', 'Kadıköy', 'Diş Kliniği', 'WON', 90, false, 'c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002', :'ws', 'Aday Diş', 'aday dis', 'İstanbul', 'Kadıköy', 'Diş Kliniği', 'NEW', 85, false, 'c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000003', :'ws', 'DNC Diş', 'dnc dis', 'İstanbul', 'Kadıköy', 'Diş Kliniği', 'NEW', 95, true, 'c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000004', :'ws', 'Kanalsız Diş', 'kanalsiz dis', 'İstanbul', 'Kadıköy', 'Diş Kliniği', 'NEW', 88, false, 'c1000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000005', :'ws', 'Düşük Skor Diş', 'dusuk skor dis', 'İstanbul', 'Kadıköy', 'Diş Kliniği', 'NEW', 20, false, 'c1000000-0000-0000-0000-000000000001');

insert into public.contact_channels (workspace_id, business_id, channel, value, normalized_value, found_via)
values
  (:'ws', 'c2000000-0000-0000-0000-000000000002', 'EMAIL', 'aday@test.local', 'aday@test.local', 'MANUAL'),
  (:'ws', 'c2000000-0000-0000-0000-000000000003', 'EMAIL', 'dnc@test.local', 'dnc@test.local', 'MANUAL'),
  (:'ws', 'c2000000-0000-0000-0000-000000000005', 'EMAIL', 'dusuk@test.local', 'dusuk@test.local', 'MANUAL');

-- ===== Atama =====
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select is(
  (public.assign_business('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002')).assigned_to,
  'c1000000-0000-0000-0000-000000000002'::uuid,
  'Üye, işletmeyi aynı workspace''teki başka bir üyeye atayabilir'
);

select is(
  (select count(*)::int from public.activity_logs where action = 'lead.assigned' and entity_id = 'c2000000-0000-0000-0000-000000000002'),
  1,
  'Atama activity log''a yazılır'
);

select throws_like(
  $$ select public.assign_business('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000003') $$,
  '%not a member of this workspace%',
  'Başka workspace''in kullanıcısına atama yapılamaz'
);

-- ===== customer_deals =====
select throws_like(
  format($$ insert into public.customer_deals (workspace_id, business_id) values (%L, 'c2000000-0000-0000-0000-000000000001') $$, :'ws'),
  '%permission denied%',
  'customer_deals''a doğrudan INSERT yapılamaz'
);

select throws_like(
  $$ select public.upsert_customer_deal('c2000000-0000-0000-0000-000000000002', null, 'Kurumsal Site', 15000, 'TRY', 'ONE_TIME', current_date, 'ACTIVE', null) $$,
  '%requires stage WON%',
  'WON olmayan işletmeye müşteri anlaşması eklenemez'
);

select is(
  (public.upsert_customer_deal('c2000000-0000-0000-0000-000000000001', null, 'Kurumsal Site', 15000, 'TRY', 'ONE_TIME', current_date, 'ACTIVE', null)).amount,
  15000::numeric,
  'WON işletmeye müşteri anlaşması eklenir'
);

select is(
  (public.upsert_customer_deal('c2000000-0000-0000-0000-000000000001', null, 'Premium', 18000, 'TRY', 'MONTHLY', current_date, 'ACTIVE', null)).package_name,
  'Premium',
  'Aynı işletme için ikinci kayıt mevcut anlaşmayı günceller'
);

select is((select count(*)::int from public.customer_deals), 1, 'İşletme başına tek anlaşma kalır');

-- ===== Kampanyalar =====
select public.create_campaign(:'ws', 'Kadıköy Diş', null, 'EMAIL', '{"district": "Kadıköy", "category": "diş", "minScore": 50}'::jsonb, 2, 20) as campaign_id \gset

select is(
  public.populate_campaign_members(:'campaign_id', 100),
  1,
  'Segment doldurma: DNC, kanalsız, düşük skorlu ve WON işletmeler alınmaz'
);

select is(
  (select business_id from public.campaign_members where campaign_id = :'campaign_id'),
  'c2000000-0000-0000-0000-000000000002'::uuid,
  'Kampanyaya yalnızca uygun aday eklenir'
);

select is(public.populate_campaign_members(:'campaign_id', 100), 0, 'Tekrar doldurma aynı işletmeyi ikinci kez eklemez');

select throws_like(
  format($$ insert into public.campaign_members (workspace_id, campaign_id, business_id) values (%L, %L, 'c2000000-0000-0000-0000-000000000005') $$, :'ws', :'campaign_id'),
  '%permission denied%',
  'campaign_members''a doğrudan INSERT yapılamaz'
);

select throws_like(
  format($$ select public.set_campaign_status(%L, 'COMPLETED') $$, :'campaign_id'),
  '%invalid campaign status transition%',
  'DRAFT kampanya doğrudan COMPLETED olamaz'
);

select is((public.set_campaign_status(:'campaign_id', 'ACTIVE')).status, 'ACTIVE', 'DRAFT → ACTIVE geçişi yapılır');

select throws_like(
  format($$ select public.set_campaign_member_status((select id from public.campaign_members where campaign_id = %L), 'SENT') $$, :'campaign_id'),
  '%invalid campaign member transition%',
  'SENT durumu elle verilemez (yalnızca mesaj akışından gelir)'
);

reset role;

-- Mesaj akışı (postgres olarak fixture): giden mesaj SENT → üye SENT, gelen → REPLIED.
insert into public.conversations (id, workspace_id, business_id, channel)
values ('c3000000-0000-0000-0000-000000000001', :'ws', 'c2000000-0000-0000-0000-000000000002', 'EMAIL');
insert into public.messages (workspace_id, conversation_id, direction, status, body, author_type, sent_at)
values (:'ws', 'c3000000-0000-0000-0000-000000000001', 'OUT', 'SENT', 'Merhaba', 'USER', now());

select is(
  (select status from public.campaign_members where campaign_id = :'campaign_id'),
  'SENT',
  'Kampanya kanalında gönderilen mesaj üyeyi SENT yapar'
);

insert into public.messages (workspace_id, conversation_id, direction, status, body, author_type)
values (:'ws', 'c3000000-0000-0000-0000-000000000001', 'IN', 'RECEIVED', 'İlgileniyoruz', 'USER');

select is(
  (select status from public.campaign_members where campaign_id = :'campaign_id'),
  'REPLIED',
  'İşletmeden gelen cevap üyeyi REPLIED yapar'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select is(
  (public.campaign_stats(:'ws') -> :'campaign_id' ->> 'replied')::int,
  1,
  'campaign_stats cevap sayısını döner'
);

select is(
  (public.report_metrics(:'ws', (now() at time zone 'Europe/Istanbul')::date - 6, (now() at time zone 'Europe/Istanbul')::date) -> 'funnel' ->> 'contacted')::int,
  1,
  'report_metrics hunisi iletişime geçilen işletmeyi sayar'
);

select is(
  (select count(*)::int from public.workspace_member_directory(:'ws')),
  2,
  'Üye dizini workspace''in tüm üyelerini döner'
);

-- ===== İzolasyon: B workspace'inin kullanıcısı =====
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000003', true);

select is((select count(*)::int from public.customer_deals), 0, 'Başka workspace üyesi customer_deals göremez');
select is((select count(*)::int from public.campaigns), 0, 'Başka workspace üyesi kampanyaları göremez');
select is((select count(*)::int from public.campaign_members), 0, 'Başka workspace üyesi kampanya üyelerini göremez');

select throws_like(
  format($$ select public.report_metrics(%L, (now() at time zone 'Europe/Istanbul')::date - 6, (now() at time zone 'Europe/Istanbul')::date) $$, :'ws'),
  '%not a member%',
  'Üye olmayan report_metrics çağıramaz'
);

select throws_like(
  format($$ select * from public.workspace_member_directory(%L) $$, :'ws'),
  '%not a member%',
  'Üye olmayan başka workspace''in üye dizinini göremez'
);

select * from finish();

rollback;
