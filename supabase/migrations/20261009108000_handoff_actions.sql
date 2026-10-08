-- Devir kartı (human_handoffs): devral / ata / kapat. Şimdiye dek kart yalnızca oluşturulabiliyordu; kullanıcı "devralamıyor,
-- atayamıyor, kapatamıyordu" ve tablo doğrudan UPDATE'e açıktı (kayıtsız). Artık tüm değişiklik RPC ile yapılır ve aktivite
-- günlüğüne düşer (CLAUDE.md #8); doğrudan UPDATE kapatılır.

revoke update on public.human_handoffs from authenticated, anon;
drop policy human_handoffs_update on public.human_handoffs;

-- Devral veya başkasına ata. OPEN → ACCEPTED; zaten ACCEPTED ise yalnızca atanan değişir. Hedef çalışma alanı üyesi olmalı.
-- İşletme henüz kimseye atanmamışsa aynı kişiye atanır (devralan kişi işi yürütür).
create function public.accept_handoff(p_handoff_id uuid, p_user_id uuid default null)
returns public.human_handoffs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_handoff public.human_handoffs%rowtype;
  v_target uuid;
  v_name text;
begin
  select * into v_handoff from public.human_handoffs where id = p_handoff_id for update;
  if v_uid is null or not found or not public.is_member(v_handoff.workspace_id) then
    raise exception 'handoff not found';
  end if;
  if v_handoff.status = 'CLOSED' then
    raise exception 'handoff is closed';
  end if;

  v_target := coalesce(p_user_id, v_uid);
  if not exists (select 1 from public.workspace_members where workspace_id = v_handoff.workspace_id and user_id = v_target) then
    raise exception 'assignee is not a member of this workspace';
  end if;

  update public.human_handoffs
  set status = 'ACCEPTED', assigned_to = v_target, updated_at = now()
  where id = p_handoff_id
  returning * into v_handoff;

  if (select assigned_to from public.businesses where id = v_handoff.business_id) is null then
    perform public.assign_business(v_handoff.business_id, v_target);
  end if;

  select coalesce(nullif(full_name, ''), 'bir üye') into v_name from public.profiles where id = v_target;
  perform public.log_activity(
    v_handoff.workspace_id, 'handoff.accepted', 'business', v_handoff.business_id,
    format('Devir kartı %s kişisine atandı', v_name),
    jsonb_build_object('handoffId', p_handoff_id, 'assignedTo', v_target)
  );

  return v_handoff;
end;
$$;

-- Kapat: iş devralındı ve bitti. Kapanınca aynı işletme için yeni devir kartı açılabilir.
create function public.close_handoff(p_handoff_id uuid, p_note text default null)
returns public.human_handoffs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_handoff public.human_handoffs%rowtype;
begin
  select * into v_handoff from public.human_handoffs where id = p_handoff_id for update;
  if v_uid is null or not found or not public.is_member(v_handoff.workspace_id) then
    raise exception 'handoff not found';
  end if;
  if v_handoff.status = 'CLOSED' then
    raise exception 'handoff is closed';
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'note too long';
  end if;

  update public.human_handoffs
  set status = 'CLOSED', updated_at = now()
  where id = p_handoff_id
  returning * into v_handoff;

  perform public.log_activity(
    v_handoff.workspace_id, 'handoff.closed', 'business', v_handoff.business_id,
    'Devir kartı kapatıldı',
    jsonb_build_object('handoffId', p_handoff_id, 'note', nullif(trim(p_note), ''))
  );

  return v_handoff;
end;
$$;

revoke execute on function public.accept_handoff(uuid, uuid) from public, anon;
revoke execute on function public.close_handoff(uuid, text) from public, anon;
grant execute on function public.accept_handoff(uuid, uuid) to authenticated;
grant execute on function public.close_handoff(uuid, text) to authenticated;

-- Kural "işletme başına tek OPEN kart" idi; devralınmış (ACCEPTED) kart varken ikinci bir kart açılabiliyordu.
-- Artık işletme başına tek ETKİN (OPEN veya ACCEPTED) kart vardır.
drop index public.human_handoffs_one_open_per_business;
create unique index human_handoffs_one_active_per_business
  on public.human_handoffs (business_id) where status in ('OPEN', 'ACCEPTED');

create or replace function public.create_handoff(
  p_business_id uuid,
  p_conversation_id uuid,
  p_summary text,
  p_requirements jsonb default '[]'::jsonb,
  p_created_by_type text default 'USER'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_handoff_id uuid;
begin
  select workspace_id into v_ws from public.businesses where id = p_business_id;
  if v_ws is null or not public.is_member(v_ws) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;

  if exists (select 1 from public.human_handoffs where business_id = p_business_id and status in ('OPEN', 'ACCEPTED')) then
    raise exception 'business already has an active handoff';
  end if;

  insert into public.human_handoffs (workspace_id, business_id, conversation_id, summary, requirements, created_by_type)
  values (v_ws, p_business_id, p_conversation_id, p_summary, p_requirements, p_created_by_type)
  returning id into v_handoff_id;

  perform public.log_activity(
    v_ws, 'handoff.created', 'business', p_business_id, 'Devir kartı oluşturuldu', '{}'::jsonb
  );

  return v_handoff_id;
end;
$$;
