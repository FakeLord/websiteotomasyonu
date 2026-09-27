-- Yeni workspace'ler OpenAI → NVIDIA sağlayıcı zinciriyle başlar (ADR 0007).
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(2);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a1a1a1a1-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chain@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Chain WS') as ws \gset
reset role;

select is(
  (select jsonb_path_query_array(ai_config, '$.providers[*].id') from public.workspace_settings where workspace_id = :'ws'),
  '["openai", "nvidia"]'::jsonb,
  'Yeni workspace sağlayıcı zinciri OpenAI → NVIDIA sırasıyla başlar'
);

select is(
  (select (ai_config ->> 'dailyLimit')::integer from public.workspace_settings where workspace_id = :'ws'),
  300,
  'Varsayılan günlük AI kotası 300'
);

select * from finish();

rollback;
