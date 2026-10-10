-- ADR 0018: Taslak kuyruğu (ADR 0014 Adım 2). Fırsatlar'daki e-postalı işletmeler için taslaklar arka planda
-- (açık sekmedeki çalıştırıcı) üretilir ve konuşmaya DRAFT olarak kaydedilir; gönderim hep insan onayındadır.
-- Kuyruk satırı başına dil kullanıcı tarafından seçilir (ADR 0013: varsayılan dil yok).
-- Tablo yalnızca RPC ile yazılır (istemci select alır).

create table public.draft_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null default 'EMAIL' check (channel = 'EMAIL'),
  language text not null check (language in ('tr', 'en')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED')),
  attempts integer not null default 0,
  error text,
  claimed_by text,
  claimed_until timestamptz,
  message_id uuid references public.messages (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_jobs_business_channel_unique unique (business_id, channel)
);

create index draft_jobs_claim_idx on public.draft_jobs (workspace_id, status, created_at);

alter table public.draft_jobs enable row level security;
alter table public.draft_jobs force row level security;

create policy draft_jobs_select on public.draft_jobs
  for select to authenticated using (public.is_member(workspace_id));

revoke insert, update, delete on public.draft_jobs from authenticated, anon;

-- Fırsat kuralıyla (packages/core pipeline/opportunity.ts + LeadsPage applyOpportunity) aynı seçim:
-- sitesi yok/açılmıyor/zayıf, aşama NEW/QUALIFIED/OUTREACH_READY, DNC değil, faaliyette, zincir değil,
-- geçerli e-posta adresi var, bu işletmeye henüz taslak/mesaj yok. Yurtdışı kilidi (ADR 0017) uygulanır:
-- ayar kapalıyken Türkiye dışı işletmeler kuyruğa alınmaz. En yüksek puandan başlar.
create function public.enqueue_opportunity_drafts(
  ws uuid,
  p_language text,
  p_limit integer default 25,
  p_country text default null,
  p_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_allow_foreign boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_ids uuid[];
  v_queued integer;
begin
  if v_uid is null or not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;
  if p_language not in ('tr', 'en') then
    raise exception 'language must be tr or en';
  end if;

  select coalesce((outreach_limits ->> 'allow_foreign_email')::boolean, false)
    into v_allow_foreign
  from public.workspace_settings where workspace_id = ws;
  v_allow_foreign := coalesce(v_allow_foreign, false);

  select array_agg(id) into v_ids
  from (
    select b.id
    from public.businesses b
    where b.workspace_id = ws
      and b.merged_into is null
      and b.website_status in ('NO_WEBSITE', 'BROKEN_WEBSITE', 'LOW_QUALITY_WEBSITE')
      and b.stage in ('NEW', 'QUALIFIED', 'OUTREACH_READY')
      and b.do_not_contact = false
      and (b.business_status is null or b.business_status = 'OPERATIONAL')
      and b.chain_size = 1
      and (b.country_code = 'TR' or v_allow_foreign)
      and (p_country is null or b.country_code = upper(p_country))
      and (p_city is null or b.city = p_city)
      and exists (
        select 1 from public.contact_channels cc
        where cc.business_id = b.id and cc.channel = 'EMAIL' and coalesce(cc.status, '') not in ('INVALID', 'BOUNCED')
      )
      and not exists (
        select 1
        from public.conversations c
        join public.messages m on m.conversation_id = c.id
        where c.business_id = b.id and c.channel = 'EMAIL'
          and m.direction = 'OUT' and m.status in ('DRAFT', 'APPROVED', 'SENT')
      )
      and not exists (
        select 1 from public.draft_jobs j
        where j.business_id = b.id and j.channel = 'EMAIL' and j.status in ('QUEUED', 'RUNNING', 'DONE')
      )
    order by b.lead_score desc nulls last, b.created_at desc
    limit v_limit
  ) s;

  if v_ids is null then
    return jsonb_build_object('queued', 0);
  end if;

  insert into public.draft_jobs (workspace_id, business_id, channel, language, created_by)
  select ws, id, 'EMAIL', p_language, v_uid from unnest(v_ids) as id
  on conflict (business_id, channel) do update
    set status = 'QUEUED', language = excluded.language, attempts = 0, error = null,
        claimed_by = null, claimed_until = null, message_id = null,
        created_by = excluded.created_by, updated_at = now()
    where public.draft_jobs.status in ('FAILED', 'CANCELLED');
  get diagnostics v_queued = row_count;

  perform public.log_activity(
    ws, 'draft_queue.enqueued', 'workspace', ws,
    format('%s işletme için taslak kuyruğa alındı', v_queued),
    jsonb_build_object('count', v_queued, 'language', p_language)
  );

  return jsonb_build_object('queued', v_queued);
end;
$$;

-- Sıradaki işi bu cihaza verir (yoksa null). Sahipliği dolmuş RUNNING işler yeniden verilir; 3 kez yarım kalan FAILED olur.
create function public.claim_next_draft_job(ws uuid, p_device_id text, p_ttl_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.draft_jobs%rowtype;
  v_business public.businesses%rowtype;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  update public.draft_jobs
  set status = 'FAILED', error = 'Üç denemede tamamlanamadı', claimed_by = null, claimed_until = null, updated_at = now()
  where workspace_id = ws and status = 'RUNNING' and claimed_until < now() and attempts >= 3;

  select * into v_job
  from public.draft_jobs
  where workspace_id = ws
    and (status = 'QUEUED' or (status = 'RUNNING' and claimed_until < now()))
  order by created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.draft_jobs
  set status = 'RUNNING', claimed_by = p_device_id,
      claimed_until = now() + make_interval(secs => p_ttl_seconds),
      attempts = attempts + 1, updated_at = now()
  where id = v_job.id;

  select * into v_business from public.businesses where id = v_job.business_id;

  return jsonb_build_object(
    'jobId', v_job.id,
    'businessId', v_job.business_id,
    'channel', v_job.channel,
    'language', v_job.language,
    'name', v_business.name,
    'category', v_business.category,
    'district', v_business.district,
    'city', v_business.city,
    'doNotContact', v_business.do_not_contact
  );
end;
$$;

-- İşi kapatır. Yalnızca işi alan cihaz kapatabilir (sahiplik dolup başkasına geçtiyse sessizce yok sayılır).
create function public.complete_draft_job(
  p_job_id uuid,
  p_device_id text,
  p_status text,
  p_error text default null,
  p_message_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.draft_jobs%rowtype;
begin
  if p_status not in ('DONE', 'FAILED') then
    raise exception 'status must be DONE or FAILED';
  end if;

  select * into v_job from public.draft_jobs where id = p_job_id;
  if not found or not public.is_member(v_job.workspace_id) then
    raise exception 'draft job % not found or not accessible', p_job_id;
  end if;
  if v_job.claimed_by is distinct from p_device_id then
    return;
  end if;

  update public.draft_jobs
  set status = p_status,
      error = case when p_status = 'FAILED' then left(coalesce(p_error, 'Bilinmeyen hata'), 500) else null end,
      message_id = case when p_status = 'DONE' then p_message_id else null end,
      claimed_by = null, claimed_until = null, updated_at = now()
  where id = p_job_id;
end;
$$;

-- Bekleyen (QUEUED) işleri iptal eder; çalışan iş tamamlanır.
create function public.cancel_draft_jobs(ws uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  update public.draft_jobs set status = 'CANCELLED', updated_at = now()
  where workspace_id = ws and status = 'QUEUED';
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.log_activity(ws, 'draft_queue.cancelled', 'workspace', ws,
      format('%s bekleyen taslak işi iptal edildi', v_count), jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

create function public.retry_failed_draft_jobs(ws uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  update public.draft_jobs
  set status = 'QUEUED', attempts = 0, error = null, claimed_by = null, claimed_until = null, updated_at = now()
  where workspace_id = ws and status = 'FAILED';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.draft_queue_progress(ws uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_member(ws) then
    raise exception 'not a member of this workspace';
  end if;

  return jsonb_build_object(
    'queued', (select count(*) from public.draft_jobs where workspace_id = ws and status = 'QUEUED'),
    'running', (select count(*) from public.draft_jobs where workspace_id = ws and status = 'RUNNING'),
    'done', (select count(*) from public.draft_jobs where workspace_id = ws and status = 'DONE'),
    'failed', (select count(*) from public.draft_jobs where workspace_id = ws and status = 'FAILED'),
    'lastError', (
      select error from public.draft_jobs
      where workspace_id = ws and status = 'FAILED'
      order by updated_at desc limit 1
    ),
    'pendingApproval', (
      select count(*)
      from public.messages
      where workspace_id = ws and direction = 'OUT' and status = 'DRAFT' and author_type = 'AI'
    )
  );
end;
$$;

revoke execute on function public.enqueue_opportunity_drafts(uuid, text, integer, text, text) from public;
revoke execute on function public.claim_next_draft_job(uuid, text, integer) from public;
revoke execute on function public.complete_draft_job(uuid, text, text, text, uuid) from public;
revoke execute on function public.cancel_draft_jobs(uuid) from public;
revoke execute on function public.retry_failed_draft_jobs(uuid) from public;
revoke execute on function public.draft_queue_progress(uuid) from public;

grant execute on function public.enqueue_opportunity_drafts(uuid, text, integer, text, text) to authenticated;
grant execute on function public.claim_next_draft_job(uuid, text, integer) to authenticated;
grant execute on function public.complete_draft_job(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.cancel_draft_jobs(uuid) to authenticated;
grant execute on function public.retry_failed_draft_jobs(uuid) to authenticated;
grant execute on function public.draft_queue_progress(uuid) to authenticated;
