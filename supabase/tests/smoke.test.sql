-- Faz 0 smoke testi: pgTAP'ın lokal Supabase'de çalıştığını doğrular.
-- Gerçek RLS/RPC testleri Faz 1'den itibaren buraya eklenir.
begin;

-- Yerel geliştirme DB'sindeki gerçek veriyi (ör. elle oluşturulmuş workspace)
-- yalnızca bu transaction içinde gizler; testler boş bir workspace durumu
-- varsayar ve dosya sonundaki rollback her şeyi geri getirir.
set local client_min_messages = warning;
truncate table public.workspaces cascade;

select plan(1);

select ok(1 = 1, 'pgTAP çalışıyor');

select * from finish();

rollback;
