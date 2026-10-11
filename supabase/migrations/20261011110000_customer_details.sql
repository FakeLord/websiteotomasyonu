-- ADR 0024: müşteri detay sayfası — hizmet/hesap kalemleri, paket içeriği ve belgeler/faturalar.
--
--   customer_services   : müşterinin domain/hosting/e-posta/site/paket kalemleri (sınırsız satır). ŞİFRE SAKLANMAZ.
--   customer_documents  : fatura/sözleşme/diğer belge kayıtları; dosyanın kendisi `customer-files` kovasında.
--   Yazma yolu yalnızca RPC'lerdir; silmeyi yalnızca ADMIN yapar. İki tablo da yalnızca WON işletme içindir.

-- ---------------------------------------------------------------------------------------------------
-- 1) Hizmet / hesap kalemleri
-- ---------------------------------------------------------------------------------------------------
create table public.customer_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('DOMAIN', 'HOSTING', 'EMAIL', 'WEBSITE', 'SOCIAL', 'PACKAGE_ITEM', 'OTHER')),
  title text not null check (length(title) between 1 and 160),
  provider text check (provider is null or length(provider) <= 160),
  identifier text check (identifier is null or length(identifier) <= 255),
  login_url text check (login_url is null or (length(login_url) <= 500 and login_url ~* '^https?://')),
  username text check (username is null or length(username) <= 255),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'ENDED')),
  starts_on date,
  renews_on date,
  cost_amount numeric(12, 2) check (cost_amount is null or cost_amount >= 0),
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR')),
  note text check (note is null or length(note) <= 2000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_services_business_idx on public.customer_services (business_id, kind, created_at);
create index customer_services_renewal_idx on public.customer_services (workspace_id, renews_on) where renews_on is not null;

alter table public.customer_services enable row level security;
alter table public.customer_services force row level security;
create policy customer_services_select on public.customer_services
  for select to authenticated using (public.is_member(workspace_id));
revoke insert, update, delete on public.customer_services from authenticated, anon;

-- ---------------------------------------------------------------------------------------------------
-- 2) Belgeler / faturalar
-- ---------------------------------------------------------------------------------------------------
create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid references public.customer_services (id) on delete set null,
  kind text not null check (kind in ('INVOICE', 'CONTRACT', 'OTHER')),
  title text not null check (length(title) between 1 and 160),
  invoice_number text check (invoice_number is null or length(invoice_number) <= 80),
  amount numeric(12, 2) check (amount is null or amount >= 0),
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR')),
  issued_on date,
  file_path text not null unique check (length(file_path) between 10 and 600),
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null check (length(mime_type) <= 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index customer_documents_business_idx on public.customer_documents (business_id, created_at desc);

alter table public.customer_documents enable row level security;
alter table public.customer_documents force row level security;
create policy customer_documents_select on public.customer_documents
  for select to authenticated using (public.is_member(workspace_id));
revoke insert, update, delete on public.customer_documents from authenticated, anon;

-- ---------------------------------------------------------------------------------------------------
-- 3) RPC'ler
-- ---------------------------------------------------------------------------------------------------
create function public.upsert_customer_service(
  p_id uuid,
  p_business_id uuid,
  p_kind text,
  p_title text,
  p_provider text,
  p_identifier text,
  p_login_url text,
  p_username text,
  p_status text,
  p_starts_on date,
  p_renews_on date,
  p_cost_amount numeric,
  p_currency text,
  p_note text
)
returns public.customer_services
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_row public.customer_services%rowtype;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  select * into v_business from public.businesses where id = p_business_id;
  if not found or not public.is_member(v_business.workspace_id) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;
  if v_business.stage <> 'WON' then
    raise exception 'customer services require stage WON (current: %)', v_business.stage;
  end if;
  if v_title is null then
    raise exception 'title is required';
  end if;

  if p_id is null then
    insert into public.customer_services (
      workspace_id, business_id, kind, title, provider, identifier, login_url, username,
      status, starts_on, renews_on, cost_amount, currency, note, created_by
    ) values (
      v_business.workspace_id, p_business_id, p_kind, v_title,
      nullif(trim(coalesce(p_provider, '')), ''), nullif(trim(coalesce(p_identifier, '')), ''),
      nullif(trim(coalesce(p_login_url, '')), ''), nullif(trim(coalesce(p_username, '')), ''),
      coalesce(p_status, 'ACTIVE'), p_starts_on, p_renews_on, p_cost_amount, coalesce(p_currency, 'TRY'),
      nullif(trim(coalesce(p_note, '')), ''), auth.uid()
    )
    returning * into v_row;
  else
    update public.customer_services
    set kind = p_kind,
        title = v_title,
        provider = nullif(trim(coalesce(p_provider, '')), ''),
        identifier = nullif(trim(coalesce(p_identifier, '')), ''),
        login_url = nullif(trim(coalesce(p_login_url, '')), ''),
        username = nullif(trim(coalesce(p_username, '')), ''),
        status = coalesce(p_status, 'ACTIVE'),
        starts_on = p_starts_on,
        renews_on = p_renews_on,
        cost_amount = p_cost_amount,
        currency = coalesce(p_currency, 'TRY'),
        note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
    where id = p_id and business_id = p_business_id
    returning * into v_row;
    if not found then
      raise exception 'service % not found', p_id;
    end if;
  end if;

  perform public.log_activity(
    v_business.workspace_id, 'customer.service_saved', 'business', p_business_id,
    format('Müşteri hizmeti kaydedildi: %s', v_title),
    jsonb_build_object('kind', p_kind)
  );
  return v_row;
end;
$$;

revoke execute on function public.upsert_customer_service(uuid, uuid, text, text, text, text, text, text, text, date, date, numeric, text, text) from public, anon;
grant execute on function public.upsert_customer_service(uuid, uuid, text, text, text, text, text, text, text, date, date, numeric, text, text) to authenticated;

create function public.delete_customer_service(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.customer_services%rowtype;
begin
  select * into v_row from public.customer_services where id = p_id;
  if not found or not public.is_member(v_row.workspace_id) then
    raise exception 'service % not found or not accessible', p_id;
  end if;
  if not public.is_admin(v_row.workspace_id) then
    raise exception 'only ADMIN can delete a customer service';
  end if;
  delete from public.customer_services where id = p_id;
  perform public.log_activity(
    v_row.workspace_id, 'customer.service_deleted', 'business', v_row.business_id,
    format('Müşteri hizmeti silindi: %s', v_row.title), jsonb_build_object('kind', v_row.kind)
  );
end;
$$;

revoke execute on function public.delete_customer_service(uuid) from public, anon;
grant execute on function public.delete_customer_service(uuid) to authenticated;

-- Dosya önce istemci tarafından kovaya yüklenir, ardından bu RPC kaydı oluşturur. Yol, çalışma alanı ve işletmeyle
-- başlamak zorundadır: başka bir çalışma alanının yoluna kayıt açılamaz.
create function public.register_customer_document(
  p_business_id uuid,
  p_kind text,
  p_title text,
  p_invoice_number text,
  p_amount numeric,
  p_currency text,
  p_issued_on date,
  p_service_id uuid,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes integer
)
returns public.customer_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_row public.customer_documents%rowtype;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  select * into v_business from public.businesses where id = p_business_id;
  if not found or not public.is_member(v_business.workspace_id) then
    raise exception 'business % not found or not accessible', p_business_id;
  end if;
  if v_business.stage <> 'WON' then
    raise exception 'customer documents require stage WON (current: %)', v_business.stage;
  end if;
  if v_title is null then
    raise exception 'title is required';
  end if;
  if p_file_path is null
     or left(p_file_path, length(v_business.workspace_id::text) + length(p_business_id::text) + 2)
        <> v_business.workspace_id::text || '/' || p_business_id::text || '/' then
    raise exception 'file path does not belong to this customer';
  end if;
  if p_service_id is not null and not exists (
    select 1 from public.customer_services where id = p_service_id and business_id = p_business_id
  ) then
    raise exception 'service % not found for this customer', p_service_id;
  end if;

  insert into public.customer_documents (
    workspace_id, business_id, service_id, kind, title, invoice_number, amount, currency, issued_on,
    file_path, file_name, mime_type, size_bytes, created_by
  ) values (
    v_business.workspace_id, p_business_id, p_service_id, p_kind, v_title,
    nullif(trim(coalesce(p_invoice_number, '')), ''), p_amount, coalesce(p_currency, 'TRY'), p_issued_on,
    p_file_path, p_file_name, p_mime_type, p_size_bytes, auth.uid()
  )
  returning * into v_row;

  perform public.log_activity(
    v_business.workspace_id, 'customer.document_added', 'business', p_business_id,
    format('Müşteri belgesi eklendi: %s', v_title), jsonb_build_object('kind', p_kind)
  );
  return v_row;
end;
$$;

revoke execute on function public.register_customer_document(uuid, text, text, text, numeric, text, date, uuid, text, text, text, integer) from public, anon;
grant execute on function public.register_customer_document(uuid, text, text, text, numeric, text, date, uuid, text, text, text, integer) to authenticated;

-- Kaydı siler ve dosyanın yolunu döner; dosyayı istemci kovadan kaldırır (silme politikası yalnızca ADMIN).
create function public.delete_customer_document(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.customer_documents%rowtype;
begin
  select * into v_row from public.customer_documents where id = p_id;
  if not found or not public.is_member(v_row.workspace_id) then
    raise exception 'document % not found or not accessible', p_id;
  end if;
  if not public.is_admin(v_row.workspace_id) then
    raise exception 'only ADMIN can delete a customer document';
  end if;
  delete from public.customer_documents where id = p_id;
  perform public.log_activity(
    v_row.workspace_id, 'customer.document_deleted', 'business', v_row.business_id,
    format('Müşteri belgesi silindi: %s', v_row.title), jsonb_build_object('kind', v_row.kind)
  );
  return v_row.file_path;
end;
$$;

revoke execute on function public.delete_customer_document(uuid) from public, anon;
grant execute on function public.delete_customer_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 4) Depolama: özel kova + üyelik tabanlı politikalar
-- ---------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-files', 'customer-files', false, 10485760,
  array[
    'application/pdf', 'image/png', 'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Yolun ilk parçası çalışma alanı kimliğidir: {workspace_id}/{business_id}/{dosya}
create policy customer_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy customer_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy customer_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_admin(((storage.foldername(name))[1])::uuid)
  );
