-- SPEC.md → L/M: otomatik yanıt (AUTO_REPLY) follow-up'ı iptal etmez, yalnızca
-- erteler; cevap sayılmaz. Aynı dış mesaj kimliği iki kez kaydedilmez.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'intent@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Intent WS') as ws \gset
reset role;

insert into public.businesses (id, workspace_id, name, normalized_name, created_by, stage)
values
  ('a3100000-0000-0000-0000-000000000001', :'ws', 'Tatilde', 'tatilde', 'a3000000-0000-0000-0000-000000000001', 'CONTACTED'),
  ('a3100000-0000-0000-0000-000000000002', :'ws', 'Cevaplayan', 'cevaplayan', 'a3000000-0000-0000-0000-000000000001', 'CONTACTED');

insert into public.conversations (id, workspace_id, business_id, channel, last_outbound_at)
values
  ('a3200000-0000-0000-0000-000000000001', :'ws', 'a3100000-0000-0000-0000-000000000001', 'EMAIL', now() - interval '1 day'),
  ('a3200000-0000-0000-0000-000000000002', :'ws', 'a3100000-0000-0000-0000-000000000002', 'EMAIL', now() - interval '1 day');

insert into public.follow_ups (id, workspace_id, business_id, conversation_id, step, due_at)
values
  ('a3300000-0000-0000-0000-000000000001', :'ws', 'a3100000-0000-0000-0000-000000000001', 'a3200000-0000-0000-0000-000000000001', 1, '2026-10-01 09:00+03'),
  ('a3300000-0000-0000-0000-000000000002', :'ws', 'a3100000-0000-0000-0000-000000000002', 'a3200000-0000-0000-0000-000000000002', 1, '2026-10-01 09:00+03');

set local role authenticated;

select public.record_inbound(:'ws', 'a3100000-0000-0000-0000-000000000001', 'EMAIL', 'İzindeyim, 5 Ekim''te döneceğim.',
  'Otomatik yanıt', '<auto-1@mail.test>', 'AUTO_REPLY', 1, false) as first_auto \gset

select is(
  (select status from public.follow_ups where id = 'a3300000-0000-0000-0000-000000000001'),
  'PENDING',
  'AUTO_REPLY bekleyen follow-up''ı iptal etmez'
);

select is(
  (select due_at from public.follow_ups where id = 'a3300000-0000-0000-0000-000000000001'),
  '2026-10-03 09:00+03'::timestamptz,
  'AUTO_REPLY bekleyen follow-up''ı 2 gün erteler'
);

select is(
  (select last_inbound_at from public.conversations where id = 'a3200000-0000-0000-0000-000000000001'),
  null,
  'AUTO_REPLY cevap sayılmaz (last_inbound_at değişmez)'
);

select is(
  public.record_inbound(:'ws', 'a3100000-0000-0000-0000-000000000001', 'EMAIL', 'İzindeyim, 5 Ekim''te döneceğim.',
    'Otomatik yanıt', '<auto-1@mail.test>', 'AUTO_REPLY', 1, false) -> 'messageId',
  (:'first_auto'::jsonb) -> 'messageId',
  'Aynı dış mesaj kimliği ikinci kez kaydedilmez, mevcut kayıt döner'
);

select is(
  (select count(*)::integer from public.messages where external_message_id = '<auto-1@mail.test>'),
  1,
  'Tekrarlanan içe aktarımda tek mesaj satırı kalır'
);

select is(
  (select due_at from public.follow_ups where id = 'a3300000-0000-0000-0000-000000000001'),
  '2026-10-03 09:00+03'::timestamptz,
  'Tekrarlanan içe aktarım follow-up''ı ikinci kez ertelemez'
);

select public.record_inbound(:'ws', 'a3100000-0000-0000-0000-000000000002', 'EMAIL', 'Fiyat bilgisi alabilir miyim?',
  'Re: Web siteniz', '<human-1@mail.test>', 'QUESTION', 0.9, false);

select is(
  (select status from public.follow_ups where id = 'a3300000-0000-0000-0000-000000000002'),
  'CANCELLED',
  'Gerçek cevap bekleyen follow-up''ı iptal eder'
);

select * from finish();

rollback;
