-- outreach_guard kanal soğuması soğuk erişim içindir: işletme son giden
-- mesajımızdan sonra cevap verdiyse, soğuma süresi dolmadan cevap yazabilmeliyiz.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;
-- G2: businesses.country_code zorunludur (üretimde yalnızca import_business satır ekler). Bu fikstür doğrudan
-- INSERT yaptığı için varsayılan yalnızca bu transaction'da verilir; dosya sonundaki rollback geri alır.
alter table public.businesses alter column country_code set default 'TR';


select plan(2);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'guard@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Guard WS') as ws \gset
reset role;

insert into public.businesses (id, workspace_id, name, normalized_name, created_by)
values
  ('f2000000-0000-0000-0000-000000000001', :'ws', 'Cevap Veren', 'cevap veren', 'f1000000-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000002', :'ws', 'Sessiz', 'sessiz', 'f1000000-0000-0000-0000-000000000001');

insert into public.conversations (workspace_id, business_id, channel, last_outbound_at, last_inbound_at)
values
  (:'ws', 'f2000000-0000-0000-0000-000000000001', 'EMAIL', now() - interval '2 hours', now() - interval '1 hour'),
  (:'ws', 'f2000000-0000-0000-0000-000000000002', 'EMAIL', now() - interval '2 hours', null);

set local role authenticated;

select ok(
  not (public.outreach_guard('f2000000-0000-0000-0000-000000000001', 'EMAIL') -> 'reasons') ? 'CHANNEL_COOLDOWN',
  'Son gidenden sonra cevap veren işletmeye soğuma uygulanmaz'
);

select ok(
  (public.outreach_guard('f2000000-0000-0000-0000-000000000002', 'EMAIL') -> 'reasons') ? 'CHANNEL_COOLDOWN',
  'Cevap vermeyen işletmeye soğuma uygulanmaya devam eder'
);

select * from finish();

rollback;
