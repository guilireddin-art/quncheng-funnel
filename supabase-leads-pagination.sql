-- C project: server-side lead pagination.
-- This migration only creates helper functions and indexes. It does not update
-- or delete any rows in public.leads or public.pages.

create or replace function public.lead_name_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', '', 'g'));
$$;

create or replace function public.lead_phone_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when regexp_replace(coalesce(value, ''), '\D', '', 'g') like '8869%'
      then '0' || substring(regexp_replace(coalesce(value, ''), '\D', '', 'g') from 4)
    else regexp_replace(coalesce(value, ''), '\D', '', 'g')
  end;
$$;

create index if not exists leads_created_at_desc_idx
  on public.leads (created_at desc);

create index if not exists leads_page_slug_created_at_desc_idx
  on public.leads (page_slug, created_at desc);

create index if not exists leads_status_created_at_desc_idx
  on public.leads (status, created_at desc);

create or replace function public.get_master_leads_page(
  p_page integer default 1,
  p_page_size integer default 100,
  p_search text default null,
  p_status text default null,
  p_page_slug text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_today_from timestamptz default null,
  p_today_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_size integer := least(greatest(coalesce(p_page_size, 100), 1), 1000);
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  with duplicate_flags as (
    select id,
      ((name_key <> '' and name_rank > 1) or (phone_key <> '' and phone_rank > 1)) as duplicate_flag
    from (
      select keyed.*,
        row_number() over (partition by name_key order by created_at, id) as name_rank,
        row_number() over (partition by phone_key order by created_at, id) as phone_rank
      from (
        select id, created_at,
          public.lead_name_key(name) as name_key,
          public.lead_phone_key(phone) as phone_key
        from public.leads
      ) keyed
    ) ranked
  ), scope as (
    select l.*
    from public.leads l
    where (nullif(btrim(p_page_slug), '') is null or coalesce(l.page_slug, 'main') = btrim(p_page_slug))
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
      and (
        nullif(btrim(p_search), '') is null
        or coalesce(l.name, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.phone, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.line_id, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.city, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.id_number, '') ilike '%' || btrim(p_search) || '%'
      )
  ), filtered as (
    select *
    from scope
    where (nullif(btrim(p_status), '') is null or status = btrim(p_status))
  ), page_rows as (
    select f.*, d.duplicate_flag
    from filtered f
    join duplicate_flags d on d.id = f.id
    order by f.created_at desc, f.id desc
    limit safe_size
    offset (safe_page - 1) * safe_size
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        (to_jsonb(r) - 'duplicate_flag') || jsonb_build_object('__isDuplicate', r.duplicate_flag)
        order by r.created_at desc, r.id desc
      )
      from page_rows r
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'stats', jsonb_build_object(
      'filtered', (select count(*) from filtered),
      'today', (select count(*) from scope where p_today_from is not null and p_today_to is not null and created_at >= p_today_from and created_at < p_today_to),
      'new', (select count(*) from scope where status = 'new'),
      'contacted', (select count(*) from scope where status = 'contacted'),
      'line_added', (select count(*) from scope where status = 'line_added'),
      'approved', (select count(*) from scope where status = 'approved'),
      'invalid', (select count(*) from scope where status = 'invalid')
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.get_page_leads_page(
  target_slug text,
  page_password text,
  p_page integer default 1,
  p_page_size integer default 100,
  p_search text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_today_from timestamptz default null,
  p_today_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_size integer := least(greatest(coalesce(p_page_size, 100), 1), 1000);
  result jsonb;
begin
  if not public.page_login(target_slug, page_password) then
    raise exception 'invalid password';
  end if;

  with duplicate_flags as (
    select id,
      ((name_key <> '' and name_rank > 1) or (phone_key <> '' and phone_rank > 1)) as duplicate_flag
    from (
      select keyed.*,
        row_number() over (partition by name_key order by created_at, id) as name_rank,
        row_number() over (partition by phone_key order by created_at, id) as phone_rank
      from (
        select id, created_at,
          public.lead_name_key(name) as name_key,
          public.lead_phone_key(phone) as phone_key
        from public.leads
        where coalesce(page_slug, 'main') = target_slug
      ) keyed
    ) ranked
  ), scope as (
    select l.*
    from public.leads l
    where coalesce(l.page_slug, 'main') = target_slug
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
      and (
        nullif(btrim(p_search), '') is null
        or coalesce(l.name, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.phone, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.line_id, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.city, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(l.id_number, '') ilike '%' || btrim(p_search) || '%'
      )
  ), filtered as (
    select *
    from scope
    where (nullif(btrim(p_status), '') is null or status = btrim(p_status))
  ), page_rows as (
    select f.*, d.duplicate_flag
    from filtered f
    join duplicate_flags d on d.id = f.id
    order by f.created_at desc, f.id desc
    limit safe_size
    offset (safe_page - 1) * safe_size
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        (to_jsonb(r) - 'duplicate_flag') || jsonb_build_object('__duplicate', r.duplicate_flag)
        order by r.created_at desc, r.id desc
      )
      from page_rows r
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'stats', jsonb_build_object(
      'filtered', (select count(*) from filtered),
      'today', (select count(*) from scope where p_today_from is not null and p_today_to is not null and created_at >= p_today_from and created_at < p_today_to),
      'new', (select count(*) from scope where status = 'new'),
      'contacted', (select count(*) from scope where status = 'contacted'),
      'line_added', (select count(*) from scope where status = 'line_added'),
      'approved', (select count(*) from scope where status = 'approved'),
      'invalid', (select count(*) from scope where status = 'invalid')
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_master_leads_page(integer, integer, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.get_master_leads_page(integer, integer, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

revoke all on function public.get_page_leads_page(text, text, integer, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.get_page_leads_page(text, text, integer, integer, text, text, timestamptz, timestamptz, timestamptz, timestamptz) to anon, authenticated;

select count(*) as leads_after_pagination_migration from public.leads;
