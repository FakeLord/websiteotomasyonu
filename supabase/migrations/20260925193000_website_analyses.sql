-- Faz 4: website_analyses (Website Analyzer + Contact Discovery sonuçları),
-- SPEC.md → H, I.2. `website_status` businesses'ta Faz 2'den beri var; bu
-- migration onu yalnızca `save_website_analysis()` RPC'sinin yazabileceği
-- şekilde kilitler (CLAUDE.md #5 ile aynı ilke: analiz sonucu client'tan
-- elle değiştirilemez).

create table public.website_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  status text not null check (status in ('NO_WEBSITE', 'BROKEN_WEBSITE', 'LOW_QUALITY_WEBSITE', 'GOOD_WEBSITE')),
  broken_reason text
    check (broken_reason is null or broken_reason in ('DNS', 'TIMEOUT', 'HTTP_ERROR', 'SSL', 'PARKED', 'EMPTY', 'FETCH_ERROR')),
  final_url text,
  http_status integer,
  response_ms integer,
  pages_fetched integer not null default 0,
  checks jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  analyzer_version integer not null default 1,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index website_analyses_business_id_idx on public.website_analyses (business_id, created_at desc);
create index website_analyses_workspace_idx on public.website_analyses (workspace_id, created_at desc);

alter table public.website_analyses enable row level security;
alter table public.website_analyses force row level security;

create policy website_analyses_select on public.website_analyses
  for select to authenticated
  using (public.is_member(workspace_id));

-- Yazma yalnızca save_website_analysis() RPC'si (SECURITY DEFINER) iledir.

-- website_status Faz 2'de eklenmişti ama hiç kısıtlanmamıştı; artık yalnızca
-- analiz RPC'si tarafından yazılabilir (CLAUDE.md #5 ile aynı ilke).
revoke update (website_status) on public.businesses from authenticated;

create function public.save_website_analysis(
  ws uuid,
  p_business_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := p_result ->> 'status';
  v_broken_reason text := nullif(p_result ->> 'brokenReason', '');
  v_analysis_id uuid;
  v_contact jsonb;
  v_channel text;
  v_normalized_value text;
  v_found_via text;
  v_confidence numeric;
begin
  if v_uid is null or not public.is_member(ws) then
    raise exception 'not a member of workspace %', ws;
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id and workspace_id = ws) then
    raise exception 'business % not found in workspace %', p_business_id, ws;
  end if;

  if v_status not in ('NO_WEBSITE', 'BROKEN_WEBSITE', 'LOW_QUALITY_WEBSITE', 'GOOD_WEBSITE') then
    raise exception 'invalid website status %', v_status;
  end if;

  insert into public.website_analyses (
    workspace_id, business_id, status, broken_reason, final_url, http_status,
    response_ms, pages_fetched, checks, issues, analyzer_version, created_by
  ) values (
    ws, p_business_id, v_status, v_broken_reason,
    nullif(p_result ->> 'finalUrl', ''),
    nullif(p_result ->> 'httpStatus', '')::integer,
    nullif(p_result ->> 'responseMs', '')::integer,
    coalesce((p_result ->> 'pagesFetched')::integer, 0),
    coalesce(p_result -> 'checks', '{}'::jsonb),
    coalesce(p_result -> 'issues', '[]'::jsonb),
    coalesce((p_result ->> 'analyzerVersion')::integer, 1),
    v_uid
  )
  returning id into v_analysis_id;

  update public.businesses
  set website_status = v_status, updated_at = now()
  where id = p_business_id and workspace_id = ws;

  for v_contact in select * from jsonb_array_elements(coalesce(p_result -> 'contacts', '[]'::jsonb))
  loop
    v_channel := v_contact ->> 'channel';
    v_normalized_value := v_contact ->> 'normalizedValue';
    v_found_via := coalesce(nullif(v_contact ->> 'foundVia', ''), 'WEBSITE');
    v_confidence := coalesce((v_contact ->> 'confidence')::numeric, 0.5);

    if v_channel is null or v_normalized_value is null then
      continue;
    end if;

    insert into public.contact_channels (
      workspace_id, business_id, channel, value, normalized_value, found_via, confidence
    ) values (
      ws, p_business_id, v_channel, v_contact ->> 'value', v_normalized_value,
      case when v_found_via = 'JSON_LD' then 'JSON_LD' else 'WEBSITE' end,
      v_confidence
    )
    on conflict (workspace_id, channel, normalized_value)
      do update set confidence = greatest(public.contact_channels.confidence, excluded.confidence);
  end loop;

  perform public.log_activity(
    ws, 'website.analyzed', 'business', p_business_id,
    format('Website analizi: %s', v_status),
    jsonb_build_object('status', v_status, 'pagesFetched', p_result ->> 'pagesFetched')
  );

  return jsonb_build_object('analysisId', v_analysis_id, 'status', v_status);
end;
$$;

revoke execute on function public.save_website_analysis(uuid, uuid, jsonb) from public;
grant execute on function public.save_website_analysis(uuid, uuid, jsonb) to authenticated;
