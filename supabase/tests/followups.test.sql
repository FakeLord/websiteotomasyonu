-- schedule_next_followup()/mark_followup_sent(): sekans doğru zincirlenir;
-- gelen mesaj ve durma aşamaları bekleyen follow-up'ları iptal eder
-- (SPEC.md → M).
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'fa111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'fu@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

create temporary table fu_test_ids (label text primary key, id uuid);
grant all on fu_test_ids to authenticated;

select set_config('request.jwt.claim.sub', 'fa111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.bootstrap_workspace('FU Workspace');
insert into fu_test_ids values ('workspace', (select id from public.workspaces where name = 'FU Workspace'));

select public.import_business(
  (select id from fu_test_ids where label = 'workspace'),
  jsonb_build_object('name', 'FU İşletmesi', 'source', 'MANUAL'),
  null
);
insert into fu_test_ids values ('business', (select id from public.businesses where name = 'FU İşletmesi'));

select public.record_inbound(
  (select id from fu_test_ids where label = 'workspace'),
  (select id from fu_test_ids where label = 'business'),
  'EMAIL', 'ilk temas', null, null, null, null, false
);
insert into fu_test_ids values (
  'conversation',
  (select id from public.conversations where business_id = (select id from fu_test_ids where label = 'business'))
);

-- Adım 1'i planla.
select public.schedule_next_followup(
  (select id from fu_test_ids where label = 'workspace'),
  (select id from fu_test_ids where label = 'business'),
  (select id from fu_test_ids where label = 'conversation'),
  1, now() + interval '3 days'
);

select is(
  (select count(*)::int from public.follow_ups where business_id = (select id from fu_test_ids where label = 'business') and status = 'PENDING'),
  1,
  'schedule_next_followup() bir PENDING satır oluşturur'
);

insert into fu_test_ids values (
  'followup1',
  (select id from public.follow_ups where business_id = (select id from fu_test_ids where label = 'business') and step = 1)
);

-- Aynı step ikinci kez planlanamaz (unique constraint, on conflict do nothing -> null döner).
select is(
  public.schedule_next_followup(
    (select id from fu_test_ids where label = 'workspace'),
    (select id from fu_test_ids where label = 'business'),
    (select id from fu_test_ids where label = 'conversation'),
    1, now() + interval '3 days'
  ),
  null,
  'Aynı conversation+step için ikinci kez planlama sessizce hiçbir şey yapmaz'
);

-- Adım 1 gönderilince adım 2 otomatik planlanır.
insert into public.messages (workspace_id, conversation_id, direction, status, body, author_type)
values ((select id from fu_test_ids where label = 'workspace'), (select id from fu_test_ids where label = 'conversation'), 'OUT', 'DRAFT', 'takip mesajı', 'USER')
returning id;
insert into fu_test_ids values ('message1', (select id from public.messages where conversation_id = (select id from fu_test_ids where label = 'conversation') and direction = 'OUT' order by created_at desc limit 1));

select public.mark_followup_sent(
  (select id from fu_test_ids where label = 'followup1'),
  (select id from fu_test_ids where label = 'message1'),
  now() + interval '4 days'
);

select is(
  (select status from public.follow_ups where id = (select id from fu_test_ids where label = 'followup1')),
  'SENT',
  'mark_followup_sent() adım 1''i SENT yapar'
);

select is(
  (select count(*)::int from public.follow_ups where business_id = (select id from fu_test_ids where label = 'business') and step = 2 and status = 'PENDING'),
  1,
  'mark_followup_sent() bir sonraki adımı (step 2) otomatik planlar'
);

-- Gelen bir mesaj bekleyen follow-up''ları iptal eder.
select public.record_inbound(
  (select id from fu_test_ids where label = 'workspace'),
  (select id from fu_test_ids where label = 'business'),
  'EMAIL', 'müşteriden cevap', null, null, null, null, false
);

select is(
  (select status from public.follow_ups where business_id = (select id from fu_test_ids where label = 'business') and step = 2),
  'CANCELLED',
  'Gelen mesaj, bekleyen step 2 follow-up''unu iptal eder'
);

-- ENGAGED aşamasına geçiş de bekleyen follow-up'ları iptal eder (yeni bir tane planla, sonra aşama değiştir).
select public.schedule_next_followup(
  (select id from fu_test_ids where label = 'workspace'),
  (select id from fu_test_ids where label = 'business'),
  (select id from fu_test_ids where label = 'conversation'),
  3, now() + interval '1 day'
);

reset role;
update public.businesses set stage = 'REPLIED' where id = (select id from fu_test_ids where label = 'business');
update public.businesses set stage = 'ENGAGED' where id = (select id from fu_test_ids where label = 'business');

select set_config('request.jwt.claim.sub', 'fa111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  (select status from public.follow_ups where business_id = (select id from fu_test_ids where label = 'business') and step = 3),
  'CANCELLED',
  'ENGAGED aşamasına geçiş bekleyen follow-up''u iptal eder'
);

select is(
  (select (public.analytics_summary((select id from fu_test_ids where label = 'workspace')) ->> 'pendingFollowUps')::int),
  0,
  'analytics_summary() bekleyen follow-up sayısını doğru döner (hepsi iptal/gönderildi)'
);

reset role;

select * from finish();

rollback;
