-- SPEC.md → L/M: kanal INVALID/BOUNCED olunca o kanaldaki bekleyen
-- follow-up'lar iptal edilir; durum yalnızca mark_channel_status RPC'siyle
-- (üye + log) değişir.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;
-- G2: businesses.country_code zorunludur (üretimde yalnızca import_business satır ekler). Bu fikstür doğrudan
-- INSERT yaptığı için varsayılan yalnızca bu transaction'da verilir; dosya sonundaki rollback geri alır.
alter table public.businesses alter column country_code set default 'TR';


select plan(9);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c5000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chan@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c5000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'other@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'c5000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Channel WS') as ws \gset
reset role;

insert into public.businesses (id, workspace_id, name, normalized_name, created_by, stage)
values ('c5100000-0000-0000-0000-000000000001', :'ws', 'Kanal İşletme', 'kanal isletme', 'c5000000-0000-0000-0000-000000000001', 'CONTACTED');

insert into public.contact_channels (id, workspace_id, business_id, channel, value, normalized_value, found_via)
values
  ('c5200000-0000-0000-0000-000000000001', :'ws', 'c5100000-0000-0000-0000-000000000001', 'INSTAGRAM', '@kanal', 'instagram:kanal', 'WEBSITE'),
  ('c5200000-0000-0000-0000-000000000002', :'ws', 'c5100000-0000-0000-0000-000000000001', 'EMAIL', 'Info@Kanal.com', 'info@kanal.com', 'WEBSITE'),
  ('c5200000-0000-0000-0000-000000000003', :'ws', 'c5100000-0000-0000-0000-000000000001', 'EMAIL', 'satis@kanal.com', 'satis@kanal.com', 'WEBSITE');

insert into public.conversations (id, workspace_id, business_id, channel)
values
  ('c5300000-0000-0000-0000-000000000001', :'ws', 'c5100000-0000-0000-0000-000000000001', 'INSTAGRAM'),
  ('c5300000-0000-0000-0000-000000000002', :'ws', 'c5100000-0000-0000-0000-000000000001', 'EMAIL');

insert into public.follow_ups (id, workspace_id, business_id, conversation_id, step, due_at)
values
  ('c5400000-0000-0000-0000-000000000001', :'ws', 'c5100000-0000-0000-0000-000000000001', 'c5300000-0000-0000-0000-000000000001', 1, now() + interval '3 days'),
  ('c5400000-0000-0000-0000-000000000002', :'ws', 'c5100000-0000-0000-0000-000000000001', 'c5300000-0000-0000-0000-000000000002', 1, now() + interval '3 days');

set local role authenticated;

select is(
  public.mark_channel_status('c5100000-0000-0000-0000-000000000001', 'INSTAGRAM', null, 'INVALID', 'Hesap yok'),
  1,
  'Değer verilmezse işletmenin o kanaldaki kayıtları işaretlenir'
);

select is(
  (select status from public.follow_ups where id = 'c5400000-0000-0000-0000-000000000001'),
  'CANCELLED',
  'INVALID kanalın bekleyen follow-up''ı iptal edilir'
);

select is(
  (select status from public.follow_ups where id = 'c5400000-0000-0000-0000-000000000002'),
  'PENDING',
  'Başka kanalın follow-up''ı etkilenmez'
);

select is(
  public.mark_channel_status('c5100000-0000-0000-0000-000000000001', 'EMAIL', 'INFO@kanal.com', 'BOUNCED', 'Bounce'),
  1,
  'Değer verilirse yalnızca o adres (büyük/küçük harf duyarsız) işaretlenir'
);

select is(
  (select status from public.follow_ups where id = 'c5400000-0000-0000-0000-000000000002'),
  'PENDING',
  'İşletmenin geçerli başka e-posta adresi varken follow-up sürer'
);

select public.mark_channel_status('c5100000-0000-0000-0000-000000000001', 'EMAIL', 'satis@kanal.com', 'BOUNCED', 'Bounce');

select is(
  (select status from public.follow_ups where id = 'c5400000-0000-0000-0000-000000000002'),
  'CANCELLED',
  'Son geçerli e-posta da BOUNCED olunca follow-up iptal edilir'
);

select throws_like(
  $$ select public.mark_channel_status('c5100000-0000-0000-0000-000000000001', 'EMAIL', null, 'DELETED', null) $$,
  '%invalid channel status%',
  'Yalnızca VALID/INVALID/BOUNCED kabul edilir'
);

select ok(
  exists (select 1 from public.activity_logs where action = 'contact_channel.status_changed'),
  'Durum değişikliği activity log''a yazılır'
);

reset role;
select set_config('request.jwt.claim.sub', 'c5000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select throws_like(
  $$ select public.mark_channel_status('c5100000-0000-0000-0000-000000000001', 'EMAIL', null, 'VALID', null) $$,
  '%not found or not accessible%',
  'Başka workspace üyesi kanal durumunu değiştiremez'
);

select * from finish();

rollback;
