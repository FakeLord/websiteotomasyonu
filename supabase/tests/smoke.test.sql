-- Faz 0 smoke testi: pgTAP'ın lokal Supabase'de çalıştığını doğrular.
-- Gerçek RLS/RPC testleri Faz 1'den itibaren buraya eklenir.
begin;

select plan(1);

select ok(1 = 1, 'pgTAP çalışıyor');

select * from finish();

rollback;
