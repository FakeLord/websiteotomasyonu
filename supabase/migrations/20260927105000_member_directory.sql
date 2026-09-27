-- ADR 0007: Ekip ekranı ve atama menüleri için üye dizini. profiles.full_name
-- çoğu zaman boş olduğundan e-posta ve son giriş zamanı auth.users'tan okunur;
-- yalnızca aynı workspace'in üyeleri birbirini görebilir.

create function public.workspace_member_directory(ws uuid)
returns table (
  user_id uuid,
  name text,
  email text,
  role text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  assigned_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  return query
  select
    wm.user_id,
    coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1))::text,
    u.email::text,
    wm.role,
    wm.created_at,
    u.last_sign_in_at,
    (select count(*) from public.businesses b
      where b.workspace_id = ws and b.assigned_to = wm.user_id and b.merged_into is null)
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  left join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = ws
  order by wm.created_at;
end;
$$;

revoke execute on function public.workspace_member_directory(uuid) from public, anon;
grant execute on function public.workspace_member_directory(uuid) to authenticated;
