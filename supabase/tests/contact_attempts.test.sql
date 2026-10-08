-- ADR 0016: elle temas kaydı (log_contact_attempt), sonuç bildirimi ve aşama ilerlemesi, takip tarihi, rapor, yalıtım.
begin;

set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(36);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e7000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'att1@test.local', crypt('password123', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e7000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'att2@test.local', crypt('password123', gen_salt('bf')), now(), now(), now());

select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.bootstrap_workspace('Attempt WS') as ws \gset

select (public.import_business(:'ws', '{"name": "Temas Bir", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "category": "Kafe", "email": "bir@test.example"}'::jsonb) ->> 'businessId') as b1 \gset
select (public.import_business(:'ws', '{"name": "Temas İki", "source": "MANUAL", "countryCode": "TR", "city": "İstanbul", "category": "Kafe"}'::jsonb) ->> 'businessId') as b2 \gset
select (public.import_business(:'ws', '{"name": "Temas Üç", "source": "MANUAL", "countryCode": "TR", "city": "Ankara", "category": "Berber"}'::jsonb) ->> 'businessId') as b3 \gset

-- 1) Temas kaydı: bağlantı açıldığı anda ATTEMPTED
select public.log_contact_attempt(:'b1', 'INSTAGRAM', '@temasbir') as a1 \gset
select is((select outcome from public.contact_attempts where id = :'a1'), 'ATTEMPTED', 'Yeni temas ATTEMPTED başlar');
select is((select stage from public.businesses where id = :'b1'), 'NEW', 'Sonuç girilmeden aşama değişmez');
select ok((select last_contacted_at is not null from public.businesses where id = :'b1'), 'Son temas zamanı yazılır');
select is((select last_contact_channel || ':' || last_contact_outcome from public.businesses where id = :'b1'), 'INSTAGRAM:ATTEMPTED', 'Son temas özeti işletmeye yazılır');
select is((select count(*)::int from public.activity_logs where workspace_id = :'ws' and action = 'contact.attempted'), 1, 'Temas aktivite günlüğüne yazılır');

-- 2) Geçersiz girdiler ve doğrudan yazma
select throws_ok(
  format($q$select public.log_contact_attempt(%L, 'MAPS', 'x')$q$, :'b1'), '23514', null, 'Geçersiz kanal reddedilir'
);
select throws_ok(
  format($q$insert into public.contact_attempts (workspace_id, business_id, channel, address) values (%L, %L, 'EMAIL', 'x')$q$, :'ws', :'b1'),
  '42501', null, 'İstemci temas tablosuna doğrudan yazamaz'
);
select throws_ok(
  format($q$update public.businesses set last_contact_outcome = 'REPLIED' where id = %L$q$, :'b1'),
  '42501', null, 'İstemci son temas özetini doğrudan değiştiremez'
);
select throws_like(
  format($q$select public.set_contact_attempt_outcome(%L, 'LATER')$q$, :'a1'),
  '%follow_up_at is required%', 'Sonra seçeneği tarih ister'
);

-- 3) "Yazdım": yeni işletme adım adım İletişime geçilen'e taşınır, takip +3 gün
select (public.set_contact_attempt_outcome(:'a1', 'SENT') ->> 'stage') as st \gset
select is(:'st'::text, 'CONTACTED', 'Yazdım: NEW → CONTACTED');
select is((select count(*)::int from public.stage_transitions where business_id = :'b1'), 3, 'Aşama üç geçerli adımla ilerler ve geçmişe yazılır');
select ok(
  (select bool_and(public.is_valid_stage_transition(from_stage, to_stage)) and count(distinct to_stage) = 3 from public.stage_transitions where business_id = :'b1'),
  'Her adım geçerli bir geçiştir (QUALIFIED, OUTREACH_READY, CONTACTED)'
);
select ok(
  (select next_action_at between now() + interval '2 days 23 hours' and now() + interval '3 days 1 hour' from public.businesses where id = :'b1'),
  'Takip tarihi varsayılan olarak 3 gün sonradır'
);
select is((select last_contact_outcome from public.businesses where id = :'b1'), 'SENT', 'Son temas sonucu güncellenir');

-- 4) Aşama geri alınmaz: ikinci "Yazdım" aşamayı değiştirmez
select public.log_contact_attempt(:'b1', 'EMAIL', 'bir@test.example') as a2 \gset
select public.set_contact_attempt_outcome(:'a2', 'SENT');
select is((select count(*)::int from public.stage_transitions where business_id = :'b1'), 3, 'Aynı aşamaya tekrar yazmak yeni geçiş üretmez');

-- 5) "Cevap verdi": REPLIED, takip temizlenir
select public.set_contact_attempt_outcome(:'a2', 'REPLIED');
select is((select stage from public.businesses where id = :'b1'), 'REPLIED', 'Cevap verdi: CONTACTED → REPLIED');
select ok((select next_action_at is null from public.businesses where id = :'b1'), 'Cevap gelince takip tarihi temizlenir');

-- 6) "Sonra": tarih konur, aşama değişmez
select public.log_contact_attempt(:'b2', 'WHATSAPP', '+905321112233') as a3 \gset
select public.set_contact_attempt_outcome(:'a3', 'LATER', 'Salı arayın', now() + interval '5 days');
select is((select stage from public.businesses where id = :'b2'), 'NEW', 'Sonra: aşama değişmez');
select ok((select next_action_at > now() + interval '4 days' from public.businesses where id = :'b2'), 'Sonra: takip tarihi seçilen gündür');
select is((select note from public.contact_attempts where id = :'a3'), 'Salı arayın', 'Not kaydedilir');

-- 7) "Ulaşılamadı": aşama değişmez, takip +2 gün
select public.log_contact_attempt(:'b2', 'PHONE', '+905321112233') as a4 \gset
select public.set_contact_attempt_outcome(:'a4', 'UNREACHABLE');
select is((select stage from public.businesses where id = :'b2'), 'NEW', 'Ulaşılamadı: aşama değişmez');
select ok((select next_action_at between now() + interval '1 day 23 hours' and now() + interval '2 days 1 hour' from public.businesses where id = :'b2'), 'Ulaşılamadı: takip 2 gün sonra');

-- 8) "İlgilenmedi": yeni işletme dahi önce İletişime geçilen'e uğrayıp LOST olur, sebep kaydedilir
select public.log_contact_attempt(:'b3', 'INSTAGRAM', '@temasuc') as a5 \gset
select public.set_contact_attempt_outcome(:'a5', 'NOT_INTERESTED');
select is((select stage || ':' || lost_reason from public.businesses where id = :'b3'), 'LOST:NOT_INTERESTED', 'İlgilenmedi: LOST ve sebep NOT_INTERESTED');
select is((select count(*)::int from public.stage_transitions where business_id = :'b3'), 4, 'LOST öncesi ara aşamalar geçmişe yazılır');

-- 9) Vazgeçtim: yalnızca sonuçsuz temas, son temas özeti kalan kaynaklardan yeniden hesaplanır
select public.log_contact_attempt(:'b2', 'EMAIL', 'iki@test.example') as a6 \gset
select public.set_contact_attempt_outcome(:'a6', 'CANCELLED');
select is((select last_contact_channel from public.businesses where id = :'b2'), 'PHONE', 'Vazgeçilen temas son temas sayılmaz');
select throws_like(
  format($q$select public.set_contact_attempt_outcome(%L, 'CANCELLED')$q$, :'a2'),
  '%only an attempt without an outcome%', 'Sonucu girilmiş temastan vazgeçilemez'
);
select throws_like(
  format($q$select public.set_contact_attempt_outcome(%L, 'SENT')$q$, :'a6'),
  '%cancelled%', 'Vazgeçilen temasın sonucu değiştirilemez'
);

-- 10) DNC işletmeye temas kaydı açılamaz
reset role;
update public.businesses set do_not_contact = true where id = :'b2';
set local role authenticated;
select throws_like(
  format($q$select public.log_contact_attempt(%L, 'EMAIL', 'iki@test.example')$q$, :'b2'),
  '%do_not_contact%', 'DNC işletmeye temas kaydı açılamaz'
);

-- 11) Rapor
select is(
  (select (e ->> 'attempts')::int from jsonb_array_elements(public.contact_attempt_stats(:'ws', current_date - 2, current_date + 1)) e where e ->> 'channel' = 'INSTAGRAM'),
  2, 'Rapor: Instagram 2 temas (vazgeçilen sayılmaz)'
);
select is(
  (select (e ->> 'replied')::int from jsonb_array_elements(public.contact_attempt_stats(:'ws', current_date - 2, current_date + 1)) e where e ->> 'channel' = 'EMAIL'),
  1, 'Rapor: e-postada 1 cevap'
);
select is(
  (select (e ->> 'attempts')::int from jsonb_array_elements(public.contact_attempt_stats(:'ws', current_date - 2, current_date + 1, 'TR', 'Ankara')) e where e ->> 'channel' = 'INSTAGRAM'),
  1, 'Rapor pazar filtresine uyar'
);
select is(jsonb_array_length(public.contact_attempt_stats(:'ws', current_date - 2, current_date + 1, 'US', null)), 0, 'Kaydı olmayan pazarda rapor boş');

-- 12) Yalıtım
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspaces (id, name, created_by) values ('e7ffffff-0000-0000-0000-000000000009', 'Other WS', 'e7000000-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values ('e7ffffff-0000-0000-0000-000000000009', 'e7000000-0000-0000-0000-000000000002', 'ADMIN');
insert into public.workspace_settings (workspace_id) values ('e7ffffff-0000-0000-0000-000000000009');
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_like(format($q$select public.log_contact_attempt(%L, 'EMAIL', 'x')$q$, :'b1'), '%business not found%', 'Başka çalışma alanının işletmesine temas kaydı açılamaz');
select throws_like(format($q$select public.set_contact_attempt_outcome(%L, 'SENT')$q$, :'a1'), '%contact attempt not found%', 'Başka çalışma alanının temasına sonuç girilemez');
select is((select count(*)::int from public.contact_attempts), 0, 'Başka çalışma alanının temasları görünmez');
select throws_like(format($q$select public.contact_attempt_stats(%L, current_date, current_date)$q$, :'ws'), '%not a member%', 'Başka çalışma alanının raporu okunamaz');

reset role;

select * from finish();

rollback;
