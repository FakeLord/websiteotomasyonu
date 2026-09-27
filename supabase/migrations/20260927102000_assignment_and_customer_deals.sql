-- ADR 0007: lead atama RPC'si ve Müşteriler ekranı için customer_deals.

-- Atama: hedef kullanıcı aynı workspace'in üyesi olmalı; her atama activity
-- log'a düşer (CLAUDE.md #8). NULL atamayı kaldırır.
create function public.assign_business(p_business_id uuid, p_user_id uuid)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_assignee_name text;
begin
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found or not public.is_member(v_business.workspace_id) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;

  if p_user_id is not null and not exists (
    select 1 from public.workspace_members where workspace_id = v_business.workspace_id and user_id = p_user_id
  ) then
    raise exception 'assignee is not a member of this workspace';
  end if;

  update public.businesses
  set assigned_to = p_user_id, version = version + 1, updated_at = now()
  where id = p_business_id
  returning * into v_business;

  select coalesce(nullif(full_name, ''), 'bir üye') into v_assignee_name from public.profiles where id = p_user_id;

  perform public.log_activity(
    v_business.workspace_id,
    case when p_user_id is null then 'lead.unassigned' else 'lead.assigned' end,
    'business', p_business_id,
    case when p_user_id is null
      then format('%s için atama kaldırıldı', v_business.name)
      else format('%s, %s kişisine atandı', v_business.name, v_assignee_name)
    end,
    jsonb_build_object('assignedTo', p_user_id)
  );

  return v_business;
end;
$$;

revoke execute on function public.assign_business(uuid, uuid) from public, anon;
grant execute on function public.assign_business(uuid, uuid) to authenticated;

-- Müşteri anlaşması: WON aşamasındaki işletme başına tek kayıt.
create table public.customer_deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  package_id uuid references public.service_packages (id) on delete set null,
  package_name text check (package_name is null or length(package_name) <= 120),
  amount numeric(12, 2) check (amount is null or amount >= 0),
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR')),
  billing text not null default 'ONE_TIME' check (billing in ('ONE_TIME', 'MONTHLY', 'YEARLY')),
  start_date date not null default current_date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'ENDED')),
  note text check (note is null or length(note) <= 2000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create index customer_deals_workspace_idx on public.customer_deals (workspace_id, start_date desc);

alter table public.customer_deals enable row level security;
alter table public.customer_deals force row level security;

create policy customer_deals_select on public.customer_deals
  for select to authenticated using (public.is_member(workspace_id));
-- Yazma yolu yalnızca upsert_customer_deal RPC'sidir (aşama ve log kuralları tek yerde).

revoke insert, update, delete on public.customer_deals from authenticated, anon;

create function public.upsert_customer_deal(
  p_business_id uuid,
  p_package_id uuid,
  p_package_name text,
  p_amount numeric,
  p_currency text,
  p_billing text,
  p_start_date date,
  p_status text,
  p_note text
)
returns public.customer_deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_deal public.customer_deals%rowtype;
  v_package_name text := nullif(trim(coalesce(p_package_name, '')), '');
begin
  select * into v_business from public.businesses where id = p_business_id;
  if not found or not public.is_member(v_business.workspace_id) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;
  if v_business.stage <> 'WON' then
    raise exception 'customer deal requires stage WON (current: %)', v_business.stage;
  end if;

  if p_package_id is not null then
    select coalesce(v_package_name, name) into v_package_name
    from public.service_packages
    where id = p_package_id and workspace_id = v_business.workspace_id;
    if not found then
      raise exception 'package % not found in this workspace', p_package_id;
    end if;
  end if;

  insert into public.customer_deals (
    workspace_id, business_id, package_id, package_name, amount, currency, billing,
    start_date, status, note, created_by
  ) values (
    v_business.workspace_id, p_business_id, p_package_id, v_package_name, p_amount,
    coalesce(p_currency, 'TRY'), coalesce(p_billing, 'ONE_TIME'), coalesce(p_start_date, current_date),
    coalesce(p_status, 'ACTIVE'), nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  )
  on conflict (business_id) do update set
    package_id = excluded.package_id,
    package_name = excluded.package_name,
    amount = excluded.amount,
    currency = excluded.currency,
    billing = excluded.billing,
    start_date = excluded.start_date,
    status = excluded.status,
    note = excluded.note,
    updated_at = now()
  returning * into v_deal;

  perform public.log_activity(
    v_business.workspace_id, 'customer.deal_saved', 'business', p_business_id,
    format('%s müşteri anlaşması kaydedildi', v_business.name),
    jsonb_build_object('dealId', v_deal.id, 'status', v_deal.status, 'amount', v_deal.amount, 'currency', v_deal.currency)
  );

  return v_deal;
end;
$$;

revoke execute on function public.upsert_customer_deal(uuid, uuid, text, numeric, text, text, date, text, text) from public, anon;
grant execute on function public.upsert_customer_deal(uuid, uuid, text, numeric, text, text, date, text, text) to authenticated;
