create schema if not exists autolm_private;
revoke all on schema autolm_private from public, anon, authenticated;

create table if not exists autolm_private.settings (
  key text primary key,
  value text not null
);
revoke all on table autolm_private.settings from public, anon, authenticated;

create table if not exists public.users (
  mobile text not null,
  role text not null check (role in ('admin','expert')),
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  primary key (mobile, role)
);
create table if not exists public.experts (
  mobile text primary key,
  code text not null unique,
  name text not null default '',
  city text not null default '',
  specialty text not null default '',
  status text not null check (status in ('active','inactive')),
  national_code text not null default '',
  email text not null default '',
  address text not null default '',
  joined_at timestamptz not null default now()
);
create table if not exists public.inspections (
  id text primary key,
  owner_mobile text not null references public.experts(mobile),
  vehicle jsonb not null,
  items jsonb not null,
  step text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  imported boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists inspections_owner_created_idx on public.inspections(owner_mobile, created_at desc);
create table if not exists public.inspection_report_sources (
  inspection_id text primary key references public.inspections(id) on delete cascade,
  metadata jsonb not null
);
create table if not exists public.sessions (
  token_hash text primary key,
  mobile text not null,
  role text not null,
  expires_at bigint not null,
  foreign key (mobile, role) references public.users(mobile, role) on delete cascade
);
create table if not exists public.audit (
  id bigint generated always as identity primary key,
  inspection_id text references public.inspections(id),
  actor text not null,
  action text not null,
  detail jsonb not null,
  occurred_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.experts enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_report_sources enable row level security;
alter table public.sessions enable row level security;
alter table public.audit enable row level security;
revoke all on public.users, public.experts, public.inspections, public.inspection_report_sources, public.sessions, public.audit from public, anon, authenticated;

create or replace function public.autolm_rpc(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, autolm_private
as $function$
declare
  v_expected text;
  v_headers jsonb;
  v_row record;
  v_case public.inspections%rowtype;
  v_existing boolean;
  v_owner text;
  v_id text;
  v_revision integer;
  v_current_status text;
  v_old_status text;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_profile jsonb;
  v_entry jsonb;
  v_result jsonb;
  v_metadata jsonb;
  v_created timestamptz;
  v_updated timestamptz;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  select s.value into v_expected from autolm_private.settings s where s.key = 'api_token';
  if v_expected is null or (v_headers ->> 'x-autolm-db-token') is distinct from v_expected then
    raise exception using message = '401|دسترسی پایگاه داده مجاز نیست.';
  end if;

  if p_action = 'health' then
    return jsonb_build_object('ok', true);
  elsif p_action = 'get_user' then
    select to_jsonb(u) into v_result from public.users u where u.mobile = p_payload->>'mobile' and u.role = p_payload->>'role';
    return v_result;
  elsif p_action = 'get_expert' then
    select jsonb_build_object('id',e.mobile,'mobile',e.mobile,'code',e.code,'name',e.name,'city',e.city,'specialty',e.specialty,
      'status',e.status,'nationalCode',e.national_code,'email',e.email,'address',e.address,'joinedAt',e.joined_at,
      'hasLogin',exists(select 1 from public.users u where u.mobile=e.mobile and u.role='expert'))
      into v_result from public.experts e where e.mobile = p_payload->>'mobile';
    return v_result;
  elsif p_action = 'experts' then
    select coalesce(jsonb_agg(jsonb_build_object('id',e.mobile,'mobile',e.mobile,'code',e.code,'name',e.name,'city',e.city,'specialty',e.specialty,
      'status',e.status,'nationalCode',e.national_code,'email',e.email,'address',e.address,'joinedAt',e.joined_at,
      'hasLogin',exists(select 1 from public.users u where u.mobile=e.mobile and u.role='expert')) order by e.joined_at,e.mobile), '[]'::jsonb)
      into v_result from public.experts e;
    return v_result;
  elsif p_action = 'overview' then
    return jsonb_build_object('experts',public.autolm_rpc('experts','{}'::jsonb), 'cases',public.autolm_rpc('inspections','{}'::jsonb));
  elsif p_action = 'inspections' then
    select coalesce(jsonb_agg(x.result order by x.created_at desc), '[]'::jsonb) into v_result
    from (
      select i.created_at,
        (coalesce(src.metadata,'{}'::jsonb) || jsonb_build_object(
          'schemaVersion',2,'id',i.id,'ownerMobile',i.owner_mobile,
          'vehicle',i.vehicle || jsonb_build_object('inspector',coalesce(e.name,'')),
          'items',case when coalesce((p_payload->>'includeDrafts')::boolean,false) then i.items else
            coalesce((select jsonb_object_agg(k, val - 'noteDraft') from jsonb_each(i.items) as each_item(k,val)), '{}'::jsonb) end,
          'step',i.step,'createdAt',i.created_at,'updatedAt',i.updated_at,'version',i.version,'imported',i.imported,
          'complete',(select count(*)=16 from jsonb_each(i.items) as item(k,val) where val->>'condition' is not null),
          'history',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'detail',a.detail,'at',a.occurred_at) order by a.id) from public.audit a where a.inspection_id=i.id),'[]'::jsonb)
        ) || i.metadata) as result
      from public.inspections i
      join public.experts e on e.mobile=i.owner_mobile
      left join public.inspection_report_sources src on src.inspection_id=i.id
      where (coalesce(p_payload->>'owner','') = '' or i.owner_mobile=p_payload->>'owner')
        and (coalesce(p_payload->>'id','') = '' or i.id=p_payload->>'id')
    ) x;
    return v_result;
  elsif p_action = 'issue_session' then
    delete from public.sessions where expires_at < (extract(epoch from clock_timestamp())*1000)::bigint;
    insert into public.sessions(token_hash,mobile,role,expires_at) values(p_payload->>'tokenHash',p_payload->>'mobile',p_payload->>'role',(p_payload->>'expiresAt')::bigint);
    return jsonb_build_object('ok',true);
  elsif p_action = 'session' then
    select u.mobile,u.role,u.name into v_row from public.sessions s join public.users u on u.mobile=s.mobile and u.role=s.role
      where s.token_hash=p_payload->>'tokenHash' and s.role=p_payload->>'role' and s.expires_at>(p_payload->>'now')::bigint;
    if not found then return null; end if;
    v_result := jsonb_build_object('mobile',v_row.mobile,'role',v_row.role,'name',v_row.name);
    if v_row.role='expert' then
      v_profile := public.autolm_rpc('get_expert',jsonb_build_object('mobile',v_row.mobile));
      if v_profile is null or v_profile->>'status' <> 'active' then return null; end if;
      v_result := v_result || jsonb_build_object('expert',v_profile);
    end if;
    return v_result;
  elsif p_action = 'logout' then
    delete from public.sessions where token_hash=p_payload->>'tokenHash';
    return jsonb_build_object('ok',true);
  elsif p_action = 'save_expert' then
    insert into public.experts(mobile,code,name,city,specialty,status,national_code,email,address,joined_at)
      values(p_payload->>'mobile','EX-'||(p_payload->>'mobile'),p_payload->>'name',p_payload->>'city',p_payload->>'specialty',p_payload->>'status',p_payload->>'nationalCode',p_payload->>'email',p_payload->>'address',now())
      on conflict(mobile) do update set name=excluded.name,city=excluded.city,specialty=excluded.specialty,status=excluded.status,
        national_code=excluded.national_code,email=excluded.email,address=excluded.address;
    if nullif(p_payload->>'passwordHash','') is not null then
      insert into public.users(mobile,role,name,password_hash,created_at) values(p_payload->>'mobile','expert',p_payload->>'name',p_payload->>'passwordHash',now())
        on conflict(mobile,role) do update set name=excluded.name,password_hash=excluded.password_hash;
      delete from public.sessions where mobile=p_payload->>'mobile' and role='expert';
    else
      update public.users set name=p_payload->>'name' where mobile=p_payload->>'mobile' and role='expert';
      if p_payload->>'status'='inactive' then delete from public.sessions where mobile=p_payload->>'mobile' and role='expert'; end if;
    end if;
    return public.autolm_rpc('get_expert',jsonb_build_object('mobile',p_payload->>'mobile'));
  elsif p_action = 'save_inspection' then
    v_id := p_payload#>>'{record,id}';
    v_owner := p_payload->>'ownerMobile';
    if not exists(select 1 from public.experts where mobile=v_owner and status='active') then raise exception using message='403|حساب کارشناس فعال نیست.'; end if;
    select * into v_case from public.inspections where id=v_id for update;
    v_existing := found;
    if v_existing and v_case.owner_mobile<>v_owner then raise exception using message='403|این پرونده متعلق به شما نیست.'; end if;
    if coalesce(v_case.version,0) <> coalesce((p_payload->>'version')::integer,0) then raise exception using message='409|این پرونده در صفحهٔ دیگری تغییر کرده است. پیش از ادامه، نسخهٔ جدید را دریافت کنید.'; end if;
    v_created := coalesce(nullif(p_payload->>'createdAt','')::timestamptz, v_case.created_at, now());
    v_updated := now();
    v_metadata := coalesce(p_payload->'metadata','{}'::jsonb);
    v_revision := coalesce(v_case.version,0)+1;
    v_current_status := case when (select count(*)=16 from jsonb_each(p_payload#>'{record,items}') as item(k,val) where val->>'condition' is not null) then 'complete'
      when exists(select 1 from jsonb_each(p_payload#>'{record,items}') as item(k,val) where val->>'condition' is not null) then 'progress' else 'draft' end;
    if v_existing then
      v_old_status := case when (select count(*)=16 from jsonb_each(v_case.items) as item(k,val) where val->>'condition' is not null) then 'complete'
        when exists(select 1 from jsonb_each(v_case.items) as item(k,val) where val->>'condition' is not null) then 'progress' else 'draft' end;
      update public.inspections set vehicle=p_payload#>'{record,vehicle}',items=p_payload#>'{record,items}',step=p_payload#>>'{record,step}',updated_at=v_updated,version=v_revision,metadata=v_metadata where id=v_id;
      if v_old_status<>v_current_status then insert into public.audit(inspection_id,actor,action,detail) values(v_id,v_owner,'status_changed',jsonb_build_object('from',v_old_status,'to',v_current_status)); end if;
    else
      insert into public.inspections(id,owner_mobile,vehicle,items,step,created_at,updated_at,version,metadata)
        values(v_id,v_owner,p_payload#>'{record,vehicle}',p_payload#>'{record,items}',p_payload#>>'{record,step}',v_created,v_updated,v_revision,v_metadata);
      insert into public.audit(inspection_id,actor,action,detail) values(v_id,v_owner,'created',jsonb_build_object('status',v_current_status));
    end if;
    if p_payload#>>'{record,provenance}'='user_description' then
      insert into public.inspection_report_sources(inspection_id,metadata) values(v_id,v_metadata)
        on conflict(inspection_id) do update set metadata=excluded.metadata;
    end if;
    return (public.autolm_rpc('inspections',jsonb_build_object('id',v_id,'owner',v_owner,'includeDrafts',true)))->0;
  elsif p_action = 'mcp_import' then
    v_id := p_payload#>>'{record,id}';
    v_owner := p_payload->>'ownerMobile';
    v_revision := (p_payload->>'incomingRevision')::integer;
    if not exists(select 1 from public.experts where mobile=v_owner and status='active') then raise exception using message='409|کارشناس فعال MCP در پنل مدیریت پیدا نشد.'; end if;
    select * into v_case from public.inspections where id=v_id for update;
    v_existing := found;
    if v_existing then
      if not coalesce((v_case.metadata->>'mcpSource')::boolean,false) then raise exception using message='409|شناسهٔ پرونده در پنل برای پرونده‌ای دیگر استفاده شده است.'; end if;
      if coalesce((v_case.metadata->>'mcpRevision')::integer,0)>=v_revision then return (public.autolm_rpc('inspections',jsonb_build_object('id',v_id)))->0; end if;
      update public.inspections set owner_mobile=v_owner,vehicle=p_payload#>'{record,vehicle}',items=p_payload#>'{record,items}',step=p_payload#>>'{record,step}',updated_at=coalesce(nullif(p_payload->>'updatedAt','')::timestamptz,nullif(p_payload->>'createdAt','')::timestamptz,now()),version=version+1,metadata=jsonb_build_object('mcpSource',true,'mcpRevision',v_revision) where id=v_id;
      insert into public.audit(inspection_id,actor,action,detail) values(v_id,'auto-lm-mcp','mcp_updated',jsonb_build_object('revision',v_revision,'inspector',p_payload->>'inspectorName'));
    else
      insert into public.inspections(id,owner_mobile,vehicle,items,step,created_at,updated_at,version,imported,metadata)
        values(v_id,v_owner,p_payload#>'{record,vehicle}',p_payload#>'{record,items}',p_payload#>>'{record,step}',coalesce(nullif(p_payload->>'createdAt','')::timestamptz,now()),coalesce(nullif(p_payload->>'updatedAt','')::timestamptz,nullif(p_payload->>'createdAt','')::timestamptz,now()),1,true,jsonb_build_object('mcpSource',true,'mcpRevision',v_revision));
      insert into public.audit(inspection_id,actor,action,detail) values(v_id,'auto-lm-mcp','mcp_imported',jsonb_build_object('revision',v_revision,'inspector',p_payload->>'inspectorName'));
    end if;
    insert into public.inspection_report_sources(inspection_id,metadata) values(v_id,coalesce(p_payload->'source','{}'::jsonb)) on conflict(inspection_id) do update set metadata=excluded.metadata;
    return (public.autolm_rpc('inspections',jsonb_build_object('id',v_id)))->0;
  elsif p_action = 'import_legacy' then
    for v_entry in select value from jsonb_array_elements(coalesce(p_payload->'profiles','[]'::jsonb)) loop
      if not exists(select 1 from public.experts where mobile=v_entry->>'mobile') and (v_entry->>'mobile') ~ '^09[0-9]{9}$' then
        insert into public.experts(mobile,code,name,city,specialty,status,national_code,email,address,joined_at)
          values(v_entry->>'mobile','EX-'||(v_entry->>'mobile'),left(v_entry->>'name',80),left(v_entry->>'city',80),left(v_entry->>'specialty',80),'inactive',left(v_entry->>'nationalCode',80),left(v_entry->>'email',80),left(v_entry->>'address',250),coalesce(nullif(v_entry->>'joinedAt','')::timestamptz,now()));
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(p_payload->'inspections','[]'::jsonb)) loop
      v_id := v_entry#>>'{record,id}';
      v_owner := v_entry->>'ownerMobile';
      if exists(select 1 from public.inspections where id=v_id) or (p_payload->>'onlyOwner'<>'' and v_owner<>p_payload->>'onlyOwner') then v_skipped:=v_skipped+1; continue; end if;
      if not exists(select 1 from public.experts where mobile=v_owner) then
        insert into public.experts(mobile,code,name,status,joined_at) values(v_owner,'EX-'||v_owner,'','inactive',now());
      end if;
      v_created:=coalesce(nullif(v_entry->>'createdAt','')::timestamptz,now());
      v_updated:=coalesce(nullif(v_entry->>'updatedAt','')::timestamptz,v_created);
      insert into public.inspections(id,owner_mobile,vehicle,items,step,created_at,updated_at,imported,metadata)
        values(v_id,v_owner,v_entry#>'{record,vehicle}',v_entry#>'{record,items}',v_entry#>>'{record,step}',v_created,v_updated,true,
          case when v_entry#>>'{record,provenance}'='user_description' then jsonb_build_object('provenance','user_description','additionalNotes',v_entry#>'{record,additionalNotes}','sourceHistory',v_entry#>'{record,sourceHistory}') else '{}'::jsonb end);
      insert into public.audit(inspection_id,actor,action,detail) values(v_id,p_payload->>'actor','imported',jsonb_build_object('source','legacy_browser'));
      v_imported:=v_imported+1;
    end loop;
    return jsonb_build_object('imported',v_imported,'skipped',v_skipped);
  else
    raise exception using message='404|درخواست پایگاه داده شناخته نشد.';
  end if;
end;
$function$;

revoke all on function public.autolm_rpc(text,jsonb) from public, authenticated;
grant execute on function public.autolm_rpc(text,jsonb) to anon;
