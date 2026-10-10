-- BACKLOG #17: müşteri anlaşması silme (yalnızca ADMIN, loglanır, yalıtım).
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dd1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dd2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('DD WS') as ws \gset
select (public.import_business(:'ws', '{"name": "Musteri A", "source": "MANUAL", "countryCode": "TR"}'::jsonb) ->> 'businessId') as b \gset
reset role;

update public.businesses set stage = 'WON' where id = :'b';
insert into public.customer_deals (workspace_id, business_id, package_name, amount, currency)
values (:'ws', :'b', 'Paket', 1000, 'TRY');
insert into public.workspace_members (workspace_id, user_id, role)
values (:'ws', 'fc000000-0000-0000-0000-000000000002', 'MEMBER');

-- Üye silemez.
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok(
  format($q$select public.delete_customer_deal(%L)$q$, :'b'),
  'only ADMIN can delete a customer deal',
  'MEMBER anlaşmayı silemez'
);
reset role;
select is((select count(*)::int from public.customer_deals where business_id = :'b'), 1, 'Anlaşma yerinde kaldı');

-- Yönetici siler.
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok(
  format($q$select public.delete_customer_deal(%L)$q$, :'b'),
  'ADMIN anlaşmayı siler'
);
reset role;
select is((select count(*)::int from public.customer_deals where business_id = :'b'), 0, 'Anlaşma silindi');
select is((select stage from public.businesses where id = :'b'), 'WON', 'İşletme WON aşamasında kalır');
select ok(
  exists (select 1 from public.activity_logs where workspace_id = :'ws' and action = 'customer.deal_deleted'),
  'Silme etkinlik kaydına yazıldı'
);

set local role authenticated;
select throws_ok(
  format($q$select public.delete_customer_deal(%L)$q$, :'b'),
  null,
  'Anlaşması olmayan işletmede hata verir'
);

select * from finish();

rollback;
