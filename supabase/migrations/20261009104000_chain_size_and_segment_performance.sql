-- Daha uygun işletme bulma (ADR 0015):
-- 1) businesses.chain_size: aynı zincire ait kayıt sayısı. Zincir ve şubeler merkezden yönetilir; karar verici
--    karşıda olmaz. Fırsatlar listesi bunları varsayılan olarak gizler (kullanıcı tek tıkla gösterebilir).
--    Kural: AYNI ad + AYNI kategori + EN AZ ÜÇ FARKLI ilçe/şehir. Bilerek dar tutuldu: yanlış pozitif, gerçek bir
--    lead'i sessizce saklar. Alan adı/telefon/e-posta/sosyal hesap paylaşan kayıtlar zaten içe aktarmada tek kayıtta
--    birleştirildiği (find_duplicate_business) için ayrıca sinyal olarak kullanılmaz.
-- 2) market_performance(): sektöre ve şehre göre bulunan / yazılan / cevap veren / müşteri sayıları.

alter table public.businesses add column chain_size integer not null default 1 check (chain_size >= 1);

create index businesses_ws_normalized_name_idx on public.businesses (workspace_id, normalized_name);

-- Verilen adı paylaşan kayıtların chain_size değerini yeniden hesaplar.
create function public.recompute_chain_size(p_ws uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_name is null then
    return;
  end if;

  update public.businesses b
  set chain_size = coalesce((
    select case when count(distinct (coalesce(o.city, ''), coalesce(o.district, ''))) >= 3 then count(*) else 1 end
    from public.businesses o
    where o.workspace_id = b.workspace_id and o.merged_into is null
      and o.normalized_name = b.normalized_name
      and o.category is not distinct from b.category
  ), 1)
  where b.workspace_id = p_ws
    and b.merged_into is null
    and b.normalized_name = p_name
    and length(b.normalized_name) >= 4;
end;
$$;

revoke execute on function public.recompute_chain_size(uuid, text) from public, anon, authenticated;

create function public.businesses_chain_size_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_chain_size(new.workspace_id, new.normalized_name);
  if tg_op = 'UPDATE' then
    -- Ad/birleştirme/konum değişince eski grup da küçülür.
    perform public.recompute_chain_size(old.workspace_id, old.normalized_name);
  end if;
  return null;
end;
$$;

-- chain_size'ı güncellemek bu tetikleyiciyi yeniden çalıştırmaz (kolon listesinde yok).
create trigger businesses_chain_size
  after insert or update of normalized_name, category, city, district, merged_into
  on public.businesses
  for each row execute function public.businesses_chain_size_trigger();

-- Mevcut kayıtlar için bir kez: üç veya daha fazla kaydı olan adlar.
do $$
declare
  r record;
begin
  for r in
    select workspace_id, normalized_name
    from public.businesses
    where merged_into is null and length(normalized_name) >= 4
    group by workspace_id, normalized_name
    having count(*) >= 3
  loop
    perform public.recompute_chain_size(r.workspace_id, r.normalized_name);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Sektör ve şehir bazında performans. Tüm zamanlar; pazar filtresi (ülke/şehir) uygulanır.
-- contacted: en az bir giden mesajı SENT olan işletme; replied: en az bir gelen mesajı olan işletme.
create function public.market_performance(ws uuid, p_country text default null, p_city text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  with base as (
    select
      b.id,
      coalesce(nullif(trim(b.category), ''), '—') as category,
      b.country_code,
      coalesce(nullif(trim(b.city), ''), '—') as city,
      b.stage,
      (b.website_status in ('NO_WEBSITE', 'BROKEN_WEBSITE', 'LOW_QUALITY_WEBSITE')) as is_opportunity,
      exists (
        select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
        where c.business_id = b.id and m.direction = 'OUT' and m.status = 'SENT'
      ) as contacted,
      exists (
        select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
        where c.business_id = b.id and m.direction = 'IN'
      ) as replied
    from public.businesses b
    where b.workspace_id = ws and b.merged_into is null
      and (p_country is null or b.country_code = p_country)
      and (p_city is null or b.city = p_city)
  ),
  by_category as (
    select category as key, null::text as country_code,
      count(*) as found,
      count(*) filter (where is_opportunity) as opportunities,
      count(*) filter (where contacted) as contacted,
      count(*) filter (where replied) as replied,
      count(*) filter (where stage = 'WON') as won
    from base group by category order by count(*) filter (where contacted) desc, count(*) desc limit 50
  ),
  by_city as (
    select city as key, country_code,
      count(*) as found,
      count(*) filter (where is_opportunity) as opportunities,
      count(*) filter (where contacted) as contacted,
      count(*) filter (where replied) as replied,
      count(*) filter (where stage = 'WON') as won
    from base group by city, country_code order by count(*) filter (where contacted) desc, count(*) desc limit 50
  )
  select jsonb_build_object(
    'byCategory', coalesce((select jsonb_agg(to_jsonb(c)) from by_category c), '[]'::jsonb),
    'byCity', coalesce((select jsonb_agg(to_jsonb(c)) from by_city c), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.market_performance(uuid, text, text) from public, anon;
grant execute on function public.market_performance(uuid, text, text) to authenticated;
