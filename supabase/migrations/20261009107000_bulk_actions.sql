-- Leadler'de toplu işlem: toplu atama ve toplu eleme (DISQUALIFIED). Her kayıt tek tek mevcut RPC'lerden geçer
-- (assign_business, transition_stage): yetki, geçiş kuralı ve activity log aynı kalır; burada yalnızca döngü ve sınır vardır.
-- Hepsi-ya-da-hiçbiri: başka çalışma alanının veya bulunamayan bir kayıt gelirse hiçbiri değişmez.

create function public.bulk_assign_businesses(p_business_ids uuid[], p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ws uuid;
  v_business public.businesses%rowtype;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(array_length(p_business_ids, 1), 0) not between 1 and 500 then
    raise exception 'between 1 and 500 businesses required';
  end if;

  -- Önce hepsini doğrula (hepsi-ya-da-hiçbiri).
  for v_id in select distinct unnest(p_business_ids) loop
    select workspace_id into v_ws from public.businesses where id = v_id;
    if not found or not public.is_member(v_ws) then
      raise exception 'business % not found or not accessible', v_id;
    end if;
  end loop;

  for v_id in select distinct unnest(p_business_ids) loop
    select * into v_business from public.businesses where id = v_id;
    if v_business.assigned_to is not distinct from p_user_id then
      v_skipped := v_skipped + 1;
    else
      perform public.assign_business(v_id, p_user_id);
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
end;
$$;

-- Yalnızca henüz yazılmamış (NEW, QUALIFIED) işletmeler elenir; ilerlemiş aşamadakiler atlanır ve sayılır.
create function public.bulk_disqualify_businesses(p_business_ids uuid[], p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ws uuid;
  v_business public.businesses%rowtype;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(array_length(p_business_ids, 1), 0) not between 1 and 500 then
    raise exception 'between 1 and 500 businesses required';
  end if;
  if p_reason is not null and length(p_reason) > 300 then
    raise exception 'reason too long';
  end if;

  for v_id in select distinct unnest(p_business_ids) loop
    select workspace_id into v_ws from public.businesses where id = v_id;
    if not found or not public.is_member(v_ws) then
      raise exception 'business % not found or not accessible', v_id;
    end if;
  end loop;

  for v_id in select distinct unnest(p_business_ids) loop
    select * into v_business from public.businesses where id = v_id for update;
    if v_business.stage in ('NEW', 'QUALIFIED') and v_business.merged_into is null then
      perform public.transition_stage(v_id, 'DISQUALIFIED', coalesce(nullif(trim(p_reason), ''), 'Toplu eleme'), v_business.version);
      v_updated := v_updated + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.bulk_assign_businesses(uuid[], uuid) from public, anon;
revoke execute on function public.bulk_disqualify_businesses(uuid[], text) from public, anon;
grant execute on function public.bulk_assign_businesses(uuid[], uuid) to authenticated;
grant execute on function public.bulk_disqualify_businesses(uuid[], text) to authenticated;
