-- SPEC.md → L (asist "Gönderemedim", e-posta bounce) ve M (durma koşulu:
-- kanal INVALID/BOUNCED). mark_channel_status kanal kayıtlarını işaretler ve
-- log yazar; contact_channels trigger'ı, işletmenin o kanal türünde geçerli
-- adresi kalmadıysa bekleyen follow-up'ları iptal eder (hangi yoldan
-- değişirse değişsin kural tek yerde).

create function public.mark_channel_status(
  p_business_id uuid,
  p_channel text,
  p_value text,
  p_status text,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_count integer;
begin
  select workspace_id into v_ws from public.businesses where id = p_business_id;
  if v_ws is null or not public.is_member(v_ws) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;

  if p_status not in ('VALID', 'INVALID', 'BOUNCED') then
    raise exception 'invalid channel status: %', p_status;
  end if;

  update public.contact_channels
  set status = p_status
  where business_id = p_business_id
    and channel = p_channel
    and status is distinct from p_status
    and (
      p_value is null
      or lower(value) = lower(trim(p_value))
      or lower(normalized_value) = lower(trim(p_value))
    );
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.log_activity(
      v_ws, 'contact_channel.status_changed', 'business', p_business_id,
      format('%s kanalı %s olarak işaretlendi%s', p_channel, p_status,
        case when p_reason is null then '' else ': ' || p_reason end),
      jsonb_build_object('channel', p_channel, 'status', p_status, 'value', p_value, 'reason', p_reason)
    );
  end if;

  return v_count;
end;
$$;

revoke execute on function public.mark_channel_status(uuid, text, text, text, text) from public;
grant execute on function public.mark_channel_status(uuid, text, text, text, text) to authenticated;

create function public.cancel_followups_on_channel_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('INVALID', 'BOUNCED')
     and old.status is distinct from new.status
     and not exists (
       select 1 from public.contact_channels c
       where c.business_id = new.business_id
         and c.channel = new.channel
         and c.status not in ('INVALID', 'BOUNCED')
     )
  then
    update public.follow_ups f
    set status = 'CANCELLED',
        cancel_reason = format('%s kanalı %s', new.channel, new.status),
        updated_at = now()
    from public.conversations c
    where f.conversation_id = c.id
      and c.business_id = new.business_id
      and c.channel = new.channel
      and f.status in ('PENDING', 'DRAFTED');
  end if;
  return new;
end;
$$;

create trigger contact_channels_cancel_followups
  after update of status on public.contact_channels
  for each row execute function public.cancel_followups_on_channel_status();
