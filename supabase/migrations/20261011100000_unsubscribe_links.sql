-- ADR 0023: giden e-postalarda tek kullanımlık "listeden çık" bağlantısı.
--
--   unsubscribe_tokens         : her giden e-posta için bir anahtar; yalnızca SHA-256 özeti saklanır.
--   issue_unsubscribe_token()  : çalışma alanı üyesi, gönderim anında ham anahtarı bir kez alır.
--   consume_unsubscribe_token(): yalnızca service_role (herkese açık Edge Function); işletmeyi DNC yapar,
--                                bastırma listesine yazar, log düşer. İkinci çağrı hata vermez.

create table public.unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index unsubscribe_tokens_business_idx on public.unsubscribe_tokens (business_id);

-- Politika yok: istemci tabloyu doğrudan okuyamaz/yazamaz; erişim yalnızca aşağıdaki işlevlerle.
alter table public.unsubscribe_tokens enable row level security;
alter table public.unsubscribe_tokens force row level security;
revoke all on public.unsubscribe_tokens from authenticated, anon;

create function public.issue_unsubscribe_token(p_business_id uuid, p_message_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_token text;
begin
  select workspace_id into v_ws from public.businesses where id = p_business_id;
  if v_ws is null or not public.is_member(v_ws) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;

  -- 244 bit rastgelelik; yalnızca özeti saklanır.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.unsubscribe_tokens (workspace_id, business_id, message_id, token_hash)
  values (v_ws, p_business_id, p_message_id, public.suppression_hash(v_token));

  return v_token;
end;
$$;

revoke execute on function public.issue_unsubscribe_token(uuid, uuid) from public, anon;
grant execute on function public.issue_unsubscribe_token(uuid, uuid) to authenticated;

create function public.consume_unsubscribe_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.unsubscribe_tokens%rowtype;
  v_suppressed integer := 0;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_row
  from public.unsubscribe_tokens
  where token_hash = public.suppression_hash(p_token)
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_row.used_at is not null then
    return jsonb_build_object('status', 'already');
  end if;

  -- Çağıran herkese açık fonksiyondur; işlem kullanıcı değil sistem eylemi olarak kaydedilir.
  perform set_config('app.actor', 'SYSTEM', true);

  update public.unsubscribe_tokens set used_at = now() where id = v_row.id;

  -- İşletme silinmişse cascade ile anahtar da silinir; buraya gelindiyse işletme vardır.
  update public.businesses
  set do_not_contact = true,
      dnc_reason = 'Alıcı listeden çıkma bağlantısını kullandı',
      dnc_at = now(),
      version = version + 1,
      updated_at = now()
  where id = v_row.business_id and do_not_contact = false;

  insert into public.suppressions (workspace_id, kind, value_hash, reason)
  select v_row.workspace_id, k.kind, k.value_hash, 'Listeden çıkma bağlantısı'
  from public.business_suppression_keys(v_row.business_id) k
  on conflict (workspace_id, kind, value_hash) do nothing;
  get diagnostics v_suppressed = row_count;

  perform public.log_activity(
    v_row.workspace_id, 'lead.unsubscribed', 'business', v_row.business_id,
    'Alıcı listeden çıkma bağlantısını kullandı',
    jsonb_build_object('suppressed', v_suppressed)
  );

  return jsonb_build_object('status', 'unsubscribed');
end;
$$;

revoke execute on function public.consume_unsubscribe_token(text) from public, authenticated, anon;
grant execute on function public.consume_unsubscribe_token(text) to service_role;
