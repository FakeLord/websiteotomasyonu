-- SPEC.md → K: CONTACTED → REPLIED (gelen mesaj), STOP → DNC + LOST,
-- sekans bitti + 7 gün cevapsız → LOST (NO_RESPONSE).
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;
-- G2: businesses.country_code zorunludur (üretimde yalnızca import_business satır ekler). Bu fikstür doğrudan
-- INSERT yaptığı için varsayılan yalnızca bu transaction'da verilir; dosya sonundaki rollback geri alır.
alter table public.businesses alter column country_code set default 'TR';


select plan(14);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'stage@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'outsider@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Stage WS') as ws \gset
reset role;

-- 1 soru soran, 2 otomatik yanıt, 3 STOP, 4 ENGAGED'de cevap,
-- 5 sekansı bitmiş eski, 6 bekleyen adımlı, 7 yeni gönderilmiş, 8 adımı eksik, 9 dış workspace testi için
insert into public.businesses (id, workspace_id, name, normalized_name, created_by, stage)
select ('d6100000-0000-0000-0000-00000000000' || i)::uuid, :'ws', 'İşletme ' || i, 'isletme ' || i,
       'd6000000-0000-0000-0000-000000000001', case when i = 4 then 'ENGAGED' else 'CONTACTED' end
from generate_series(1, 8) as i;

insert into public.conversations (id, workspace_id, business_id, channel, last_outbound_at)
select ('d6200000-0000-0000-0000-00000000000' || i)::uuid, :'ws', ('d6100000-0000-0000-0000-00000000000' || i)::uuid, 'EMAIL',
       now() - case when i = 7 then interval '3 days' else interval '8 days' end
from generate_series(1, 8) as i;

insert into public.messages (workspace_id, conversation_id, direction, status, body, author_type, sent_at, created_at)
select :'ws', ('d6200000-0000-0000-0000-00000000000' || i)::uuid, 'OUT', 'SENT', 'Merhaba', 'USER',
       now() - case when i = 7 then interval '3 days' else interval '8 days' end,
       now() - case when i = 7 then interval '3 days' else interval '8 days' end
from generate_series(1, 8) as i;

insert into public.follow_ups (workspace_id, business_id, conversation_id, step, due_at, status)
select :'ws', ('d6100000-0000-0000-0000-00000000000' || b)::uuid, ('d6200000-0000-0000-0000-00000000000' || b)::uuid, s,
       now() - interval '10 days',
       case when b = 6 and s = 2 then 'PENDING' else 'SENT' end
from generate_series(5, 7) as b, generate_series(1, 2) as s;

insert into public.follow_ups (workspace_id, business_id, conversation_id, step, due_at, status)
values (:'ws', 'd6100000-0000-0000-0000-000000000008', 'd6200000-0000-0000-0000-000000000008', 1, now() - interval '10 days', 'SENT');

set local role authenticated;

-- Gelen mesajlar
select public.record_inbound(:'ws', 'd6100000-0000-0000-0000-000000000001', 'EMAIL', 'Fiyat nedir?', null, '<q-1@x>', 'QUESTION', 0.9, false);
select public.record_inbound(:'ws', 'd6100000-0000-0000-0000-000000000002', 'EMAIL', 'İzindeyim', null, '<a-1@x>', 'AUTO_REPLY', 1, false);
select public.record_inbound(:'ws', 'd6100000-0000-0000-0000-000000000003', 'EMAIL', 'Bir daha yazmayın', null, '<s-1@x>', 'STOP_CONTACT', 0.95, true);
select public.record_inbound(:'ws', 'd6100000-0000-0000-0000-000000000004', 'EMAIL', 'Tamam', null, '<e-1@x>', 'INTERESTED', 0.9, false);

select is((select stage from public.businesses where id = 'd6100000-0000-0000-0000-000000000001'), 'REPLIED', 'Gelen cevap CONTACTED lead''i REPLIED yapar');
select is(
  (select actor_type from public.stage_transitions where business_id = 'd6100000-0000-0000-0000-000000000001' and to_stage = 'REPLIED'),
  'SYSTEM',
  'Otomatik REPLIED geçişi SYSTEM olarak kaydedilir'
);
select is((select stage from public.businesses where id = 'd6100000-0000-0000-0000-000000000002'), 'CONTACTED', 'Otomatik yanıt aşamayı değiştirmez');
select is((select stage from public.businesses where id = 'd6100000-0000-0000-0000-000000000003'), 'LOST', 'STOP cevabı lead''i LOST yapar');
select is((select lost_reason from public.businesses where id = 'd6100000-0000-0000-0000-000000000003'), 'NOT_INTERESTED', 'STOP için kayıp nedeni NOT_INTERESTED');
select ok((select do_not_contact from public.businesses where id = 'd6100000-0000-0000-0000-000000000003'), 'STOP cevabı DNC işaretler');
select is((select stage from public.businesses where id = 'd6100000-0000-0000-0000-000000000004'), 'ENGAGED', 'İleri aşamadaki lead geri alınmaz');

-- Sekans sonu
select is(public.close_stale_sequences(:'ws'), 1, 'Yalnızca sekansı bitmiş ve 7 gün cevapsız lead kapatılır');
select is((select stage from public.businesses where id = 'd6100000-0000-0000-0000-000000000005'), 'LOST', 'Sekansı biten lead LOST olur');
select is((select lost_reason from public.businesses where id = 'd6100000-0000-0000-0000-000000000005'), 'NO_RESPONSE', 'Kayıp nedeni NO_RESPONSE');
select is(
  (select array_agg(stage order by name) from public.businesses where id in (
    'd6100000-0000-0000-0000-000000000006', 'd6100000-0000-0000-0000-000000000007', 'd6100000-0000-0000-0000-000000000008')),
  array['CONTACTED', 'CONTACTED', 'CONTACTED'],
  'Bekleyen adımı olan, 7 gün dolmayan veya adımı eksik lead kapatılmaz'
);
select is(public.close_stale_sequences(:'ws'), 0, 'İkinci çağrı hiçbir şeyi değiştirmez');

reset role;
update public.workspace_settings set followup_policy = followup_policy || '{"afterSequence": "KEEP"}'::jsonb where workspace_id = :'ws';
update public.follow_ups set status = 'SENT' where business_id = 'd6100000-0000-0000-0000-000000000006';
set local role authenticated;

select is(public.close_stale_sequences(:'ws'), 0, 'Politika otomatik kapatmayı istemiyorsa hiçbir lead kapatılmaz');

reset role;
select set_config('request.jwt.claim.sub', 'd6000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select throws_like(
  format($$ select public.close_stale_sequences(%L) $$, :'ws'),
  '%not a member%',
  'Üye olmayan başka workspace''in sekanslarını kapatamaz'
);

select * from finish();

rollback;
