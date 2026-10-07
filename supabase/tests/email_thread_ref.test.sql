-- SPEC.md → L: e-posta konuşmasında ilk giden mesajın Message-ID'si
-- conversations.email_thread_ref'e yazılır; sonraki gönderimler değiştirmez.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;
-- G2: businesses.country_code zorunludur (üretimde yalnızca import_business satır ekler). Bu fikstür doğrudan
-- INSERT yaptığı için varsayılan yalnızca bu transaction'da verilir; dosya sonundaki rollback geri alır.
alter table public.businesses alter column country_code set default 'TR';


select plan(3);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'thread@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'b4000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Thread WS') as ws \gset
reset role;

insert into public.businesses (id, workspace_id, name, normalized_name, created_by)
values ('b4100000-0000-0000-0000-000000000001', :'ws', 'Mail İşletme', 'mail isletme', 'b4000000-0000-0000-0000-000000000001');

insert into public.conversations (id, workspace_id, business_id, channel)
values
  ('b4200000-0000-0000-0000-000000000001', :'ws', 'b4100000-0000-0000-0000-000000000001', 'EMAIL'),
  ('b4200000-0000-0000-0000-000000000002', :'ws', 'b4100000-0000-0000-0000-000000000001', 'INSTAGRAM');

insert into public.messages (id, workspace_id, conversation_id, direction, status, body, author_type)
values
  ('b4300000-0000-0000-0000-000000000001', :'ws', 'b4200000-0000-0000-0000-000000000001', 'OUT', 'APPROVED', 'İlk', 'USER'),
  ('b4300000-0000-0000-0000-000000000002', :'ws', 'b4200000-0000-0000-0000-000000000001', 'OUT', 'APPROVED', 'İkinci', 'USER'),
  ('b4300000-0000-0000-0000-000000000003', :'ws', 'b4200000-0000-0000-0000-000000000002', 'OUT', 'APPROVED', 'DM', 'USER');

-- mark_message_sent'in yaptığı durum değişikliği (RPC mesai saatine bağlı olduğu için doğrudan).
update public.messages set status = 'SENT', sent_at = now(), external_message_id = '<first@ajans.test>'
where id = 'b4300000-0000-0000-0000-000000000001';

select is(
  (select email_thread_ref from public.conversations where id = 'b4200000-0000-0000-0000-000000000001'),
  '<first@ajans.test>',
  'İlk giden e-postanın Message-ID''si thread referansı olur'
);

update public.messages set status = 'SENT', sent_at = now(), external_message_id = '<second@ajans.test>'
where id = 'b4300000-0000-0000-0000-000000000002';

select is(
  (select email_thread_ref from public.conversations where id = 'b4200000-0000-0000-0000-000000000001'),
  '<first@ajans.test>',
  'Sonraki gönderimler thread referansını değiştirmez'
);

update public.messages set status = 'SENT', sent_at = now(), external_message_id = 'ig-123'
where id = 'b4300000-0000-0000-0000-000000000003';

select is(
  (select email_thread_ref from public.conversations where id = 'b4200000-0000-0000-0000-000000000002'),
  null,
  'E-posta dışı kanalda thread referansı yazılmaz'
);

select * from finish();

rollback;
