-- record_inbound()/mark_message_sent(): STOP kelimesi DNC'ye döner; SENT
-- yalnızca APPROVED'dan sonra ve outreach_guard izin verirse olur; aynı
-- içerik 30 gün içinde ikinci kez gönderilemez; ilk gönderen assigned_to olur
-- (SPEC.md → I.5, J.3, D16).
begin;

select plan(9);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'cv111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'cv@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

create temporary table cv_test_ids (label text primary key, id uuid);
grant all on cv_test_ids to authenticated;

select set_config('request.jwt.claim.sub', 'cv111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.bootstrap_workspace('CV Workspace');
insert into cv_test_ids values ('workspace', (select id from public.workspaces where name = 'CV Workspace'));

select public.import_business(
  (select id from cv_test_ids where label = 'workspace'),
  jsonb_build_object('name', 'CV İşletmesi', 'source', 'MANUAL'),
  null
);
insert into cv_test_ids values ('business', (select id from public.businesses where name = 'CV İşletmesi'));

-- Gelen bir "yazmayın" mesajı DNC'ye döner.
select public.record_inbound(
  (select id from cv_test_ids where label = 'workspace'),
  (select id from cv_test_ids where label = 'business'),
  'EMAIL', 'Lütfen bir daha yazmayın.', null, null, 'STOP_CONTACT', 0.95, true
);

select is(
  (select do_not_contact from public.businesses where id = (select id from cv_test_ids where label = 'business')),
  true,
  'record_inbound() stop_request=true ile DNC işaretler'
);

-- DNC işaretliyken outreach_guard reddeder; DNC'yi elle kaldır (test devam etsin).
select public.set_dnc((select id from cv_test_ids where label = 'business'), false, 'test devam');

insert into cv_test_ids values (
  'conversation',
  (select id from public.conversations where business_id = (select id from cv_test_ids where label = 'business') and channel = 'EMAIL')
);

-- Bir taslak mesaj oluştur, onayla, gönder.
insert into public.messages (workspace_id, conversation_id, direction, status, body, author_type)
values (
  (select id from cv_test_ids where label = 'workspace'),
  (select id from cv_test_ids where label = 'conversation'),
  'OUT', 'DRAFT', 'Merhaba, size nasıl yardımcı olabiliriz?', 'USER'
)
returning id;
insert into cv_test_ids values ('message', (select id from public.messages where conversation_id = (select id from cv_test_ids where label = 'conversation') and direction = 'OUT'));

select throws_like(
  format($$select public.mark_message_sent(%L, 'hash-1')$$, (select id from cv_test_ids where label = 'message')),
  '%only an APPROVED message can be sent%',
  'DRAFT bir mesaj doğrudan SENT yapılamaz'
);

select public.approve_message((select id from cv_test_ids where label = 'message'));

select public.mark_message_sent((select id from cv_test_ids where label = 'message'), 'hash-1');

select is(
  (select status from public.messages where id = (select id from cv_test_ids where label = 'message')),
  'SENT',
  'APPROVED bir mesaj mark_message_sent() ile SENT olur'
);

select is(
  (select assigned_to from public.businesses where id = (select id from cv_test_ids where label = 'business')),
  'cv111111-1111-1111-1111-111111111111'::uuid,
  'İlk gönderen otomatik assigned_to olur (D16)'
);

-- Aynı content_hash 30 gün içinde ikinci kez reddedilir.
insert into public.messages (workspace_id, conversation_id, direction, status, body, author_type)
values (
  (select id from cv_test_ids where label = 'workspace'),
  (select id from cv_test_ids where label = 'conversation'),
  'OUT', 'APPROVED', 'Merhaba, size nasıl yardımcı olabiliriz?', 'USER'
)
returning id;
insert into cv_test_ids values ('message2', (select id from public.messages where status = 'APPROVED' and conversation_id = (select id from cv_test_ids where label = 'conversation')));

select throws_like(
  format($$select public.mark_message_sent(%L, 'hash-1')$$, (select id from cv_test_ids where label = 'message2')),
  '%duplicate_message%',
  'Aynı content_hash 30 gün içinde ikinci kez gönderilemez'
);

-- Bir üye (owner değil) doğrudan messages.status''u SENT yapamaz.
update public.messages set status = 'DRAFT' where id = (select id from cv_test_ids where label = 'message2');

select throws_like(
  format($$update public.messages set status = 'SENT' where id = %L$$, (select id from cv_test_ids where label = 'message2')),
  '%permission denied%',
  'messages.status doğrudan UPDATE ile SENT yapılamaz (REVOKE UPDATE)'
);

reset role;

-- İkinci workspace ile izolasyon.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'cv222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'cv-bob@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());
insert into public.workspaces (id, name, created_by)
values ('dddddddd-0000-0000-0000-000000000004', 'CV Workspace B', 'cv222222-2222-2222-2222-222222222222');
insert into public.workspace_members (workspace_id, user_id, role)
values ('dddddddd-0000-0000-0000-000000000004', 'cv222222-2222-2222-2222-222222222222', 'ADMIN');
insert into public.workspace_settings (workspace_id)
values ('dddddddd-0000-0000-0000-000000000004');

select set_config('request.jwt.claim.sub', 'cv222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is(
  (select count(*)::int from public.conversations where workspace_id = (select id from cv_test_ids where label = 'workspace')),
  0,
  'Bob, Workspace A''nın conversations satırlarını göremez'
);

select is(
  (select count(*)::int from public.messages where workspace_id = (select id from cv_test_ids where label = 'workspace')),
  0,
  'Bob, Workspace A''nın messages satırlarını göremez'
);

select throws_like(
  format($$select public.create_handoff(%L, %L, 'özet')$$,
    (select id from cv_test_ids where label = 'business'),
    (select id from cv_test_ids where label = 'conversation')
  ),
  '%not found or not accessible%',
  'Bob, Workspace A''nın işletmesi için handoff oluşturamaz'
);

reset role;

select * from finish();

rollback;
