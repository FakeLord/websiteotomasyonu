-- Faz 2: transition_stage / merge_businesses / set_dnc RPC'leri (SPEC.md → K, I.5)
-- + businesses üzerinde kolon koruması (stage/do_not_contact/lead_score yalnızca
-- RPC ile değişir — SPEC.md → P.1).
--
-- is_valid_stage_transition buradaki geçiş tablosu, packages/core/pipeline'daki
-- isValidTransition ile birebir aynı olmalıdır (DB son hakem, TS yalnızca UI
-- ön-doğrulaması için); biri değişirse diğeri de güncellenmelidir.

create function public.is_valid_stage_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('NEW', 'QUALIFIED'), ('NEW', 'DISQUALIFIED'),
    ('QUALIFIED', 'OUTREACH_READY'), ('QUALIFIED', 'DISQUALIFIED'),
    ('OUTREACH_READY', 'CONTACTED'),
    ('CONTACTED', 'REPLIED'), ('CONTACTED', 'LOST'),
    ('REPLIED', 'ENGAGED'), ('REPLIED', 'LOST'),
    ('ENGAGED', 'PROPOSAL_READY'), ('ENGAGED', 'LOST'),
    ('PROPOSAL_READY', 'HANDED_OFF'),
    ('HANDED_OFF', 'WON'), ('HANDED_OFF', 'LOST'),
    ('LOST', 'QUALIFIED')
  );
$$;

create function public.transition_stage(
  p_business_id uuid,
  p_to_stage text,
  p_reason text,
  p_expected_version integer
)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_old_stage text;
  v_uid uuid := auth.uid();
begin
  select * into v_business from public.businesses where id = p_business_id for update;

  if not found then
    raise exception 'business not found';
  end if;

  if not public.is_member(v_business.workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  if v_business.version <> p_expected_version then
    raise exception 'version_conflict: business was updated by someone else';
  end if;

  if not public.is_valid_stage_transition(v_business.stage, p_to_stage) then
    raise exception 'invalid_transition: % -> %', v_business.stage, p_to_stage;
  end if;

  if v_business.do_not_contact and p_to_stage not in ('LOST', 'DISQUALIFIED') then
    raise exception 'business is marked do_not_contact';
  end if;

  v_old_stage := v_business.stage;

  update public.businesses
  set stage = p_to_stage,
      version = version + 1,
      updated_at = now(),
      lost_reason = case when p_to_stage = 'LOST' then p_reason else null end
  where id = p_business_id
  returning * into v_business;

  insert into public.stage_transitions (workspace_id, business_id, from_stage, to_stage, reason, actor_type, actor_user_id)
  values (
    v_business.workspace_id, p_business_id, v_old_stage, p_to_stage, p_reason,
    case when v_uid is not null then 'USER' else 'SYSTEM' end, v_uid
  );

  perform public.log_activity(
    v_business.workspace_id, 'lead.stage_changed', 'business', p_business_id,
    format('Stage: %s → %s', v_old_stage, p_to_stage),
    jsonb_build_object('from', v_old_stage, 'to', p_to_stage, 'reason', p_reason)
  );

  return v_business;
end;
$$;

create function public.set_dnc(
  p_business_id uuid,
  p_value boolean,
  p_reason text
)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
begin
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'business not found';
  end if;

  if not public.is_member(v_business.workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  if v_business.do_not_contact and p_value = false then
    if not public.is_admin(v_business.workspace_id) then
      raise exception 'only ADMIN can remove do_not_contact';
    end if;
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'reason is required to remove do_not_contact';
    end if;
  end if;

  update public.businesses
  set do_not_contact = p_value,
      dnc_reason = p_reason,
      dnc_at = case when p_value then now() else null end,
      version = version + 1,
      updated_at = now()
  where id = p_business_id
  returning * into v_business;

  perform public.log_activity(
    v_business.workspace_id,
    case when p_value then 'lead.dnc_set' else 'lead.dnc_removed' end,
    'business', p_business_id,
    case when p_value then 'DNC işaretlendi' else 'DNC kaldırıldı' end,
    jsonb_build_object('reason', p_reason)
  );

  return v_business;
end;
$$;

create function public.merge_businesses(p_keep_id uuid, p_drop_id uuid)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep public.businesses%rowtype;
  v_drop public.businesses%rowtype;
begin
  if p_keep_id = p_drop_id then
    raise exception 'keep and drop must differ';
  end if;

  select * into v_keep from public.businesses where id = p_keep_id for update;
  if not found then
    raise exception 'keep business not found';
  end if;

  select * into v_drop from public.businesses where id = p_drop_id for update;
  if not found then
    raise exception 'drop business not found';
  end if;

  if v_keep.workspace_id <> v_drop.workspace_id then
    raise exception 'businesses belong to different workspaces';
  end if;

  if not public.is_member(v_keep.workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  if v_drop.merged_into is not null then
    raise exception 'drop business already merged';
  end if;

  update public.business_sources set business_id = p_keep_id where business_id = p_drop_id;
  update public.notes set business_id = p_keep_id where business_id = p_drop_id;
  update public.stage_transitions set business_id = p_keep_id where business_id = p_drop_id;

  -- contact_channels: keep'te aynı (channel, normalized_value) zaten varsa
  -- taşınmaz (unique çakışmasını önlemek için), yalnızca çakışmayanlar taşınır.
  update public.contact_channels cc
  set business_id = p_keep_id
  where cc.business_id = p_drop_id
    and not exists (
      select 1 from public.contact_channels k
      where k.business_id = p_keep_id
        and k.channel = cc.channel
        and k.normalized_value = cc.normalized_value
    );
  delete from public.contact_channels where business_id = p_drop_id;

  update public.businesses
  set merged_into = p_keep_id,
      version = version + 1,
      updated_at = now()
  where id = p_drop_id;

  update public.businesses
  set do_not_contact = do_not_contact or v_drop.do_not_contact,
      dnc_reason = coalesce(dnc_reason, v_drop.dnc_reason),
      dnc_at = case
        when dnc_at is not null and v_drop.dnc_at is not null then least(dnc_at, v_drop.dnc_at)
        else coalesce(dnc_at, v_drop.dnc_at)
      end,
      version = version + 1,
      updated_at = now()
  where id = p_keep_id
  returning * into v_keep;

  perform public.log_activity(
    v_keep.workspace_id, 'business.merged', 'business', p_keep_id,
    format('İşletme birleştirildi (kaybeden: %s)', v_drop.name),
    jsonb_build_object('keepId', p_keep_id, 'dropId', p_drop_id)
  );

  return v_keep;
end;
$$;

revoke execute on function public.transition_stage(uuid, text, text, integer) from public;
revoke execute on function public.set_dnc(uuid, boolean, text) from public;
revoke execute on function public.merge_businesses(uuid, uuid) from public;

grant execute on function public.transition_stage(uuid, text, text, integer) to authenticated;
grant execute on function public.set_dnc(uuid, boolean, text) to authenticated;
grant execute on function public.merge_businesses(uuid, uuid) to authenticated;

-- Kolon koruması: stage/do_not_contact/lead_score/dnc_* doğrudan UPDATE ile
-- değiştirilemez; yalnızca yukarıdaki SECURITY DEFINER RPC'ler (postgres
-- sahipliğiyle, BYPASSRLS) değiştirebilir.
revoke update (stage, do_not_contact, dnc_reason, dnc_at, lead_score, score_breakdown, scoring_version, merged_into)
  on public.businesses from authenticated;
