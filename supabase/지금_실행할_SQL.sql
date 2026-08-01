-- 대한간호학생회 부산 정책국 최종 통합 수정 SQL
-- 이 파일 하나만 Supabase SQL Editor의 새 쿼리에서 전체 실행하세요.
-- 기존 기능을 유지하면서 회원가입 직책, 불가능 날짜 조사, 모든 리더 일정 등록,
-- 정책국 일정 달력, 콘텐츠 작성·승인, 초기 공지사항, 홈페이지 관리 기능을 현재 구조로 맞춥니다.

begin;

create extension if not exists pgcrypto;

-- 1. 직책 체계 확장 ---------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_system_role_check;

update public.profiles
set system_role = case
  when system_role = 'director' then 'policy_director'
  when system_role = 'general_manager' then 'policy_general_manager'
  when system_role = 'senior_manager' and department = '정책2부' then 'senior_manager_div2'
  when system_role = 'senior_manager' then 'senior_manager_div1'
  when system_role = 'staff' then 'department_manager'
  when system_role = 'member' then 'leader'
  else system_role
end;

alter table public.profiles
  add constraint profiles_system_role_check
  check (system_role in (
    'leader',
    'section_manager',
    'department_manager',
    'policy_general_manager',
    'senior_manager_div1',
    'senior_manager_div2',
    'policy_director',
    'external_admin'
  ));

alter table public.profiles alter column system_role set default 'leader';

create or replace function public.normalize_department(p_department text)
returns text
language sql
immutable
as $$
  select case trim(coalesce(p_department, ''))
    when '정책1부' then 'div1'
    when 'div1' then 'div1'
    when '정책2부' then 'div2'
    when 'div2' then 'div2'
    else 'policy_office'
  end;
$$;

create or replace function public.department_display_name(p_scope text)
returns text
language sql
immutable
as $$
  select case public.normalize_department(p_scope)
    when 'div1' then '정책1부'
    when 'div2' then '정책2부'
    else '정책국'
  end;
$$;

create or replace function public.default_position_for_role(p_role text)
returns text
language sql
immutable
as $$
  select case p_role
    when 'policy_director' then '정책국장'
    when 'senior_manager_div1' then '정책1부 수석부장'
    when 'senior_manager_div2' then '정책2부 수석부장'
    when 'policy_general_manager' then '정책총괄부장'
    when 'department_manager' then '부장'
    when 'section_manager' then '과장'
    when 'external_admin' then '관리자'
    else '리더'
  end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (
    id, name, school, cohort, department,
    approval_status, system_role, position,
    created_at, updated_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'school', ''),
    coalesce(new.raw_user_meta_data ->> 'cohort', ''),
    public.department_display_name(coalesce(new.raw_user_meta_data ->> 'department', '정책국')),
    'pending',
    'leader',
    null,
    now(),
    now()
  )
  on conflict (id) do update
  set
    name = excluded.name,
    school = excluded.school,
    cohort = excluded.cohort,
    department = excluded.department,
    updated_at = now();
  return new;
end;
$$;

-- 2. 기능 권한 --------------------------------------------------------------
create table if not exists public.member_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null,
  scope text not null default '*',
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission_code, scope),
  constraint member_permissions_code_check check (permission_code in (
    'member_approve','role_manage','permission_grant',
    'content_write_notice','content_write_card','content_write_policy','content_approve',
    'news_manage','board_moderate','anonymous_identity_reveal',
    'schedule_manage_common','schedule_manage_div1','schedule_manage_div2',
    'system_manage'
  )),
  constraint member_permissions_scope_check check (scope in ('*','policy_office','div1','div2'))
);

alter table public.member_permissions enable row level security;

create or replace function public.role_default_has_permission(
  p_role text,
  p_permission text,
  p_scope text default '*'
)
returns boolean
language sql
immutable
as $$
  select case
    when p_permission in ('portal_access','board_use','schedule_view','schedule_create','content_read_internal') then true
    when p_role = 'policy_director' then true
    when p_role = 'external_admin' then p_permission = 'system_manage'
    when p_role = 'policy_general_manager' then p_permission in (
      'permission_grant','content_write_notice','content_write_card','content_write_policy',
      'content_approve','news_manage','board_moderate','schedule_manage_common'
    )
    when p_role = 'senior_manager_div1' then
      (p_permission in ('member_approve','role_manage','permission_grant') and p_scope in ('*','div1'))
      or p_permission in ('content_write_notice','content_write_card','content_write_policy','content_approve','board_moderate','schedule_manage_div1')
    when p_role = 'senior_manager_div2' then
      (p_permission in ('member_approve','role_manage','permission_grant') and p_scope in ('*','div2'))
      or p_permission in ('content_write_notice','content_write_card','content_write_policy','content_approve','board_moderate','schedule_manage_div2')
    else false
  end;
$$;

create or replace function public.has_permission(
  p_permission text,
  p_scope text default '*'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_status text;
begin
  select system_role, approval_status
    into v_role, v_status
  from public.profiles
  where id = auth.uid();

  if v_status <> 'approved' then
    return false;
  end if;

  if public.role_default_has_permission(v_role, p_permission, p_scope) then
    return true;
  end if;

  return exists (
    select 1
    from public.member_permissions mp
    where mp.user_id = auth.uid()
      and mp.permission_code = p_permission
      and (mp.scope = '*' or p_scope = '*' or mp.scope = public.normalize_department(p_scope))
  );
end;
$$;

create or replace function public.get_my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p public.profiles%rowtype;
  permissions text[];
  known_permissions text[] := array[
    'member_approve','role_manage','permission_grant',
    'content_write_notice','content_write_card','content_write_policy','content_approve',
    'news_manage','board_moderate','anonymous_identity_reveal',
    'schedule_manage_common','schedule_manage_div1','schedule_manage_div2','system_manage'
  ];
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then return null; end if;

  select coalesce(array_agg(code order by code), array[]::text[])
    into permissions
  from unnest(known_permissions) as u(code)
  where public.has_permission(code, '*');

  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'school', p.school,
    'cohort', p.cohort,
    'department', p.department,
    'approval_status', p.approval_status,
    'position', p.position,
    'system_role', p.system_role,
    'permissions', to_jsonb(permissions)
  );
end;
$$;

create or replace function public.can_approve_members()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_permission('member_approve', '*');
$$;

create or replace function public.is_director()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and approval_status = 'approved'
      and system_role = 'policy_director'
  );
$$;

create or replace function public.can_manage_target(
  p_target_department text,
  p_target_role text default 'leader'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_scope text := public.normalize_department(p_target_department);
begin
  select system_role into v_role
  from public.profiles
  where id = auth.uid() and approval_status = 'approved';

  if v_role = 'policy_director' then return true; end if;

  if v_role = 'senior_manager_div1' then
    return v_scope = 'div1' and p_target_role not in ('policy_director','senior_manager_div1','senior_manager_div2','policy_general_manager','external_admin');
  end if;

  if v_role = 'senior_manager_div2' then
    return v_scope = 'div2' and p_target_role not in ('policy_director','senior_manager_div1','senior_manager_div2','policy_general_manager','external_admin');
  end if;

  return public.has_permission('role_manage', v_scope);
end;
$$;

-- 3. 가입 승인·직책·권한 관리 ----------------------------------------------
drop function if exists public.approve_leader(uuid,text,text,text);
create function public.approve_leader(
  p_target_user_id uuid,
  p_new_system_role text default 'leader',
  p_new_position text default null,
  p_new_department text default '정책국'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.profiles%rowtype;
  v_scope text := public.normalize_department(p_new_department);
  v_role text := p_new_system_role;
  v_position text;
begin
  if v_role not in ('leader','section_manager','department_manager','policy_general_manager','senior_manager_div1','senior_manager_div2','policy_director','external_admin') then
    raise exception '허용되지 않은 직책입니다.';
  end if;

  if v_role = 'senior_manager_div1' then v_scope := 'div1'; end if;
  if v_role = 'senior_manager_div2' then v_scope := 'div2'; end if;
  if v_role in ('policy_director','policy_general_manager','external_admin') then v_scope := 'policy_office'; end if;

  if not public.has_permission('member_approve', v_scope) then
    raise exception '해당 소속의 가입 승인 권한이 없습니다.';
  end if;

  if not public.can_manage_target(public.department_display_name(v_scope), v_role) and not public.is_director() then
    raise exception '해당 직책을 부여할 권한이 없습니다.';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_user_id
  for update;

  if v_target.id is null then raise exception '신청자를 찾을 수 없습니다.'; end if;
  if v_target.approval_status <> 'pending' then raise exception '승인 대기 상태의 신청자만 승인할 수 있습니다.'; end if;

  v_position := nullif(btrim(coalesce(p_new_position, '')), '');
  if v_position is null then v_position := public.default_position_for_role(v_role); end if;

  update public.profiles
  set approval_status = 'approved',
      system_role = v_role,
      position = v_position,
      department = public.department_display_name(v_scope),
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = p_target_user_id;
end;
$$;

drop function if exists public.reject_member(uuid);
create function public.reject_member(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.profiles%rowtype;
  v_scope text;
begin
  select * into v_target from public.profiles where id = p_target_user_id for update;
  if v_target.id is null then raise exception '신청자를 찾을 수 없습니다.'; end if;
  v_scope := public.normalize_department(v_target.department);
  if not public.has_permission('member_approve', v_scope) then raise exception '가입 반려 권한이 없습니다.'; end if;
  if v_target.approval_status <> 'pending' then raise exception '승인 대기 상태의 신청자만 반려할 수 있습니다.'; end if;
  update public.profiles set approval_status = 'rejected', approved_by = null, approved_at = null, updated_at = now()
  where id = p_target_user_id;
end;
$$;

drop function if exists public.update_leader_assignment(uuid,text,text,text);
create function public.update_leader_assignment(
  p_target_user_id uuid,
  p_new_system_role text,
  p_new_position text,
  p_new_department text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.profiles%rowtype;
  v_scope text := public.normalize_department(p_new_department);
  v_role text := p_new_system_role;
  v_position text;
begin
  if p_target_user_id = auth.uid() then raise exception '자기 자신의 직책은 변경할 수 없습니다.'; end if;
  if v_role not in ('leader','section_manager','department_manager','policy_general_manager','senior_manager_div1','senior_manager_div2','policy_director','external_admin') then
    raise exception '허용되지 않은 직책입니다.';
  end if;
  if v_role = 'senior_manager_div1' then v_scope := 'div1'; end if;
  if v_role = 'senior_manager_div2' then v_scope := 'div2'; end if;
  if v_role in ('policy_director','policy_general_manager','external_admin') then v_scope := 'policy_office'; end if;

  select * into v_target from public.profiles where id = p_target_user_id for update;
  if v_target.id is null or v_target.approval_status not in ('approved','suspended') then raise exception '관리할 수 있는 리더를 찾을 수 없습니다.'; end if;
  if not public.can_manage_target(v_target.department, v_target.system_role) then raise exception '현재 직책을 관리할 권한이 없습니다.'; end if;
  if not public.can_manage_target(public.department_display_name(v_scope), v_role) then raise exception '변경할 직책 또는 소속을 부여할 권한이 없습니다.'; end if;

  v_position := nullif(btrim(coalesce(p_new_position, '')), '');
  if v_position is null then v_position := public.default_position_for_role(v_role); end if;

  update public.profiles
  set system_role = v_role,
      position = v_position,
      department = public.department_display_name(v_scope),
      updated_at = now()
  where id = p_target_user_id;
end;
$$;

drop function if exists public.suspend_member(uuid);
create function public.suspend_member(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_target public.profiles%rowtype;
begin
  if p_target_user_id = auth.uid() then raise exception '자기 자신의 계정은 중지할 수 없습니다.'; end if;
  select * into v_target from public.profiles where id = p_target_user_id for update;
  if v_target.id is null then raise exception '대상 리더를 찾을 수 없습니다.'; end if;
  if not public.can_manage_target(v_target.department, v_target.system_role) then raise exception '이용 중지 권한이 없습니다.'; end if;
  if v_target.approval_status <> 'approved' then raise exception '승인된 리더만 이용 중지할 수 있습니다.'; end if;
  update public.profiles set approval_status = 'suspended', updated_at = now() where id = p_target_user_id;
end;
$$;

drop function if exists public.reactivate_member(uuid);
create function public.reactivate_member(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_target public.profiles%rowtype;
begin
  select * into v_target from public.profiles where id = p_target_user_id for update;
  if v_target.id is null then raise exception '대상 리더를 찾을 수 없습니다.'; end if;
  if not public.can_manage_target(v_target.department, v_target.system_role) then raise exception '이용 재개 권한이 없습니다.'; end if;
  if v_target.approval_status <> 'suspended' then raise exception '이용 중지 상태의 리더만 복구할 수 있습니다.'; end if;
  update public.profiles set approval_status = 'approved', updated_at = now() where id = p_target_user_id;
end;
$$;

drop function if exists public.list_manageable_leaders();
create function public.list_manageable_leaders()
returns table (
  id uuid,
  name text,
  school text,
  cohort text,
  department text,
  approval_status text,
  position_title text,
  system_role text,
  created_at timestamptz,
  permissions jsonb,
  can_approve boolean,
  can_edit_role boolean,
  can_edit_permissions boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_scope text;
begin
  select p.system_role, public.normalize_department(p.department)
    into v_role, v_scope
  from public.profiles p
  where p.id = auth.uid() and p.approval_status = 'approved';

  if v_role is null then raise exception '로그인이 필요합니다.'; end if;
  if not (
    public.has_permission('member_approve','*') or public.has_permission('role_manage','*')
    or public.has_permission('permission_grant','*') or public.has_permission('system_manage','*')
  ) then raise exception '리더 관리 권한이 없습니다.'; end if;

  return query
  select
    p.id, p.name, p.school, p.cohort, p.department, p.approval_status, p.position, p.system_role, p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('code',mp.permission_code,'scope',mp.scope) order by mp.permission_code)
              from public.member_permissions mp where mp.user_id = p.id), '[]'::jsonb),
    p.approval_status = 'pending' and public.has_permission('member_approve', public.normalize_department(p.department)),
    p.approval_status in ('approved','suspended') and p.id <> auth.uid() and public.can_manage_target(p.department,p.system_role),
    p.approval_status in ('approved','suspended') and p.id <> auth.uid() and (
      v_role = 'policy_director'
      or (v_role = 'senior_manager_div1' and public.normalize_department(p.department) = 'div1')
      or (v_role = 'senior_manager_div2' and public.normalize_department(p.department) = 'div2')
      or v_role = 'policy_general_manager'
      or public.has_permission('permission_grant', public.normalize_department(p.department))
    )
  from public.profiles p
  where
    v_role = 'policy_director'
    or (v_role = 'senior_manager_div1' and public.normalize_department(p.department) = 'div1')
    or (v_role = 'senior_manager_div2' and public.normalize_department(p.department) = 'div2')
    or (v_role in ('policy_general_manager','external_admin') and p.approval_status in ('approved','suspended'))
    or (public.has_permission('permission_grant', public.normalize_department(p.department)) and p.approval_status in ('approved','suspended'))
  order by case p.approval_status when 'pending' then 0 else 1 end, p.created_at, p.name;
end;
$$;

drop function if exists public.set_member_permissions(uuid,jsonb);
create function public.set_member_permissions(
  p_target_user_id uuid,
  p_permission_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_target public.profiles%rowtype;
  v_allowed text[];
  item jsonb;
  v_code text;
  v_scope text;
begin
  if p_target_user_id = auth.uid() then raise exception '자기 자신의 기능 권한은 변경할 수 없습니다.'; end if;
  select system_role into v_caller_role from public.profiles where id = auth.uid() and approval_status = 'approved';
  select * into v_target from public.profiles where id = p_target_user_id;
  if v_target.id is null or v_target.approval_status not in ('approved','suspended') then raise exception '대상 리더를 찾을 수 없습니다.'; end if;

  if v_caller_role = 'policy_director' then
    v_allowed := array[
      'member_approve','role_manage','permission_grant','content_write_notice','content_write_card','content_write_policy',
      'content_approve','news_manage','board_moderate','anonymous_identity_reveal',
      'schedule_manage_common','schedule_manage_div1','schedule_manage_div2','system_manage'
    ];
  elsif v_caller_role = 'senior_manager_div1' and public.normalize_department(v_target.department) = 'div1' then
    v_allowed := array['content_write_notice','content_write_card','content_write_policy','content_approve','news_manage','board_moderate','schedule_manage_div1'];
  elsif v_caller_role = 'senior_manager_div2' and public.normalize_department(v_target.department) = 'div2' then
    v_allowed := array['content_write_notice','content_write_card','content_write_policy','content_approve','news_manage','board_moderate','schedule_manage_div2'];
  elsif v_caller_role = 'policy_general_manager' then
    v_allowed := array['content_write_notice','content_write_card','content_write_policy','content_approve','news_manage','board_moderate','schedule_manage_common'];
  elsif public.has_permission('permission_grant', public.normalize_department(v_target.department)) then
    v_allowed := array['content_write_notice','content_write_card','content_write_policy','content_approve','news_manage','board_moderate'];
  else
    raise exception '기능 권한을 부여할 수 없습니다.';
  end if;

  delete from public.member_permissions
  where user_id = p_target_user_id and permission_code = any(v_allowed);

  if p_permission_items is null or jsonb_typeof(p_permission_items) <> 'array' then return; end if;

  for item in select value from jsonb_array_elements(p_permission_items)
  loop
    v_code := item ->> 'code';
    v_scope := coalesce(item ->> 'scope', '*');
    if not (v_code = any(v_allowed)) then raise exception '부여할 수 없는 기능 권한이 포함되어 있습니다: %', v_code; end if;
    if v_scope not in ('*','policy_office','div1','div2') then v_scope := '*'; end if;
    insert into public.member_permissions(user_id,permission_code,scope,granted_by)
    values (p_target_user_id,v_code,v_scope,auth.uid())
    on conflict do nothing;
  end loop;
end;
$$;

-- 4. 공지·카드뉴스·정책 콘텐츠 --------------------------------------------
create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('notice','card','policy')),
  title text not null,
  summary text not null default '',
  body text not null default '',
  cover_url text,
  status text not null default 'draft' check (status in ('draft','review','published','rejected','hidden')),
  review_note text,
  author_id uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.content_posts enable row level security;

drop policy if exists content_posts_select on public.content_posts;
create policy content_posts_select
on public.content_posts for select
to anon, authenticated
using (
  status = 'published'
  or author_id = auth.uid()
  or public.has_permission('content_approve','*')
  or public.has_permission('content_write_' || category,'*')
);

create or replace function public.save_content_draft(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_category text := trim(coalesce(p_payload ->> 'category',''));
  v_title text := trim(coalesce(p_payload ->> 'title',''));
  v_summary text := trim(coalesce(p_payload ->> 'summary',''));
  v_body text := coalesce(p_payload ->> 'body','');
  v_cover text := nullif(trim(coalesce(p_payload ->> 'cover_url','')), '');
  v_permission text;
  v_existing public.content_posts%rowtype;
begin
  if v_category not in ('notice','card','policy') then raise exception '콘텐츠 종류가 올바르지 않습니다.'; end if;
  if v_title = '' then raise exception '제목을 입력해 주세요.'; end if;
  v_permission := 'content_write_' || v_category;
  if not (public.has_permission(v_permission,'*') or public.has_permission('content_approve','*')) then raise exception '이 콘텐츠를 작성할 권한이 없습니다.'; end if;

  begin v_id := nullif(p_payload ->> 'id','')::uuid; exception when others then v_id := null; end;
  if v_id is null then
    insert into public.content_posts(category,title,summary,body,cover_url,author_id)
    values (v_category,v_title,v_summary,v_body,v_cover,auth.uid()) returning id into v_id;
  else
    select * into v_existing from public.content_posts where id = v_id for update;
    if v_existing.id is null then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
    if v_existing.author_id <> auth.uid() and not public.has_permission('content_approve','*') then raise exception '이 콘텐츠를 수정할 권한이 없습니다.'; end if;
    if v_existing.status = 'published' and not public.has_permission('content_approve','*') then raise exception '게시된 콘텐츠는 게시 승인 권한자가 수정해야 합니다.'; end if;
    update public.content_posts
    set category=v_category,title=v_title,summary=v_summary,body=v_body,cover_url=v_cover,
        status=case when status='rejected' then 'draft' else status end,updated_at=now()
    where id=v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.submit_content(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_post public.content_posts%rowtype;
begin
  select * into v_post from public.content_posts where id=p_post_id for update;
  if v_post.id is null then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
  if v_post.author_id <> auth.uid() and not public.has_permission('content_approve','*') then raise exception '승인 요청 권한이 없습니다.'; end if;
  update public.content_posts set status='review',review_note=null,updated_at=now() where id=p_post_id;
end;
$$;

create or replace function public.publish_content(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('content_approve','*') then raise exception '게시 승인 권한이 없습니다.'; end if;
  update public.content_posts set status='published',approved_by=auth.uid(),published_at=now(),updated_at=now(),review_note=null where id=p_post_id;
  if not found then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
end;
$$;

create or replace function public.reject_content(p_post_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('content_approve','*') then raise exception '반려 권한이 없습니다.'; end if;
  update public.content_posts set status='rejected',review_note=nullif(trim(p_reason),''),updated_at=now() where id=p_post_id;
  if not found then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
end;
$$;

create or replace function public.hide_content(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('content_approve','*') then raise exception '게시물 숨김 권한이 없습니다.'; end if;
  update public.content_posts set status='hidden',updated_at=now() where id=p_post_id;
  if not found then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
end;
$$;

drop function if exists public.list_content_management();
create function public.list_content_management()
returns table (
  id uuid, category text, title text, summary text, body text, cover_url text,
  status text, review_note text, author_name text, author_id uuid,
  created_at timestamptz, updated_at timestamptz, published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (
    public.has_permission('content_write_notice','*') or public.has_permission('content_write_card','*')
    or public.has_permission('content_write_policy','*') or public.has_permission('content_approve','*')
  ) then raise exception '콘텐츠 관리 권한이 없습니다.'; end if;

  return query
  select c.id,c.category,c.title,c.summary,c.body,c.cover_url,c.status,c.review_note,p.name,c.author_id,c.created_at,c.updated_at,c.published_at
  from public.content_posts c join public.profiles p on p.id=c.author_id
  where c.author_id=auth.uid() or public.has_permission('content_approve','*')
  order by c.updated_at desc;
end;
$$;

-- 5. 익명 리더 소통방 ------------------------------------------------------
create table if not exists public.anonymous_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_id uuid not null references public.profiles(id),
  status text not null default 'visible' check (status in ('visible','hidden','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anonymous_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.anonymous_posts(id) on delete cascade,
  body text not null,
  author_id uuid not null references public.profiles(id),
  status text not null default 'visible' check (status in ('visible','hidden','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anonymous_identity_audit (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.anonymous_posts(id),
  requested_by uuid not null references public.profiles(id),
  reason text not null,
  requested_at timestamptz not null default now()
);

alter table public.anonymous_posts enable row level security;
alter table public.anonymous_comments enable row level security;
alter table public.anonymous_identity_audit enable row level security;

create or replace function public.create_anonymous_post(p_title text,p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_approved_member() then raise exception '승인된 리더만 이용할 수 있습니다.'; end if;
  if trim(coalesce(p_title,''))='' or trim(coalesce(p_body,''))='' then raise exception '제목과 내용을 입력해 주세요.'; end if;
  insert into public.anonymous_posts(title,body,author_id)
  values(trim(p_title),trim(p_body),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_anonymous_posts()
returns table(id uuid,title text,body text,created_at timestamptz,updated_at timestamptz,comment_count bigint,can_edit boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_approved_member() then raise exception '승인된 리더만 이용할 수 있습니다.'; end if;
  return query
  select p.id,p.title,p.body,p.created_at,p.updated_at,
    (select count(*) from public.anonymous_comments c where c.post_id=p.id and c.status='visible'),
    (p.author_id=auth.uid() or public.has_permission('board_moderate','*'))
  from public.anonymous_posts p
  where p.status='visible'
  order by p.created_at desc;
end;
$$;

create or replace function public.update_anonymous_post(p_post_id uuid,p_title text,p_body text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_author uuid;
begin
  select author_id into v_author from public.anonymous_posts where id=p_post_id and status='visible' for update;
  if v_author is null then raise exception '게시글을 찾을 수 없습니다.'; end if;
  if v_author<>auth.uid() and not public.has_permission('board_moderate','*') then raise exception '수정 권한이 없습니다.'; end if;
  update public.anonymous_posts set title=trim(p_title),body=trim(p_body),updated_at=now() where id=p_post_id;
end;
$$;

create or replace function public.delete_anonymous_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_author uuid;
begin
  select author_id into v_author from public.anonymous_posts where id=p_post_id and status='visible' for update;
  if v_author is null then raise exception '게시글을 찾을 수 없습니다.'; end if;
  if v_author<>auth.uid() and not public.has_permission('board_moderate','*') then raise exception '삭제 권한이 없습니다.'; end if;
  update public.anonymous_posts set status='deleted',updated_at=now() where id=p_post_id;
end;
$$;

create or replace function public.create_anonymous_comment(p_post_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_approved_member() then raise exception '승인된 리더만 이용할 수 있습니다.'; end if;
  if not exists(select 1 from public.anonymous_posts where id=p_post_id and status='visible') then raise exception '게시글을 찾을 수 없습니다.'; end if;
  if trim(coalesce(p_body,''))='' then raise exception '댓글 내용을 입력해 주세요.'; end if;
  insert into public.anonymous_comments(post_id,body,author_id) values(p_post_id,trim(p_body),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_anonymous_comments(p_post_id uuid)
returns table(id uuid,body text,created_at timestamptz,updated_at timestamptz,can_edit boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_approved_member() then raise exception '승인된 리더만 이용할 수 있습니다.'; end if;
  return query
  select c.id,c.body,c.created_at,c.updated_at,(c.author_id=auth.uid() or public.has_permission('board_moderate','*'))
  from public.anonymous_comments c where c.post_id=p_post_id and c.status='visible' order by c.created_at;
end;
$$;

create or replace function public.delete_anonymous_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_author uuid;
begin
  select author_id into v_author from public.anonymous_comments where id=p_comment_id and status='visible' for update;
  if v_author is null then raise exception '댓글을 찾을 수 없습니다.'; end if;
  if v_author<>auth.uid() and not public.has_permission('board_moderate','*') then raise exception '댓글 삭제 권한이 없습니다.'; end if;
  update public.anonymous_comments set status='deleted',updated_at=now() where id=p_comment_id;
end;
$$;

create or replace function public.reveal_anonymous_author(p_post_id uuid,p_reason text)
returns table(name text,position_title text,system_role text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('anonymous_identity_reveal','*') then raise exception '익명 작성자 확인 권한이 없습니다.'; end if;
  if length(trim(coalesce(p_reason,''))) < 10 then raise exception '확인 사유를 10자 이상 입력해 주세요.'; end if;
  insert into public.anonymous_identity_audit(post_id,requested_by,reason) values(p_post_id,auth.uid(),trim(p_reason));
  return query
  select pr.name,pr.position,pr.system_role
  from public.anonymous_posts ap join public.profiles pr on pr.id=ap.author_id
  where ap.id=p_post_id;
end;
$$;


-- 현재 회원가입·관리센터 구조로 덮어쓰기 -------------------------------

-- 1. 회원가입 신청 직책과 일정 응답 소속 ---------------------------------
alter table public.profiles add column if not exists requested_position text;
alter table public.profiles add column if not exists availability_scope text;

alter table public.profiles drop constraint if exists profiles_availability_scope_check;
alter table public.profiles
  add constraint profiles_availability_scope_check
  check (availability_scope is null or availability_scope in ('div1','div2'));

create or replace function public.resolve_availability_scope_v2(
  p_department text,
  p_position text,
  p_requested_position text,
  p_saved_scope text
)
returns text
language sql
immutable
as $$
  select case
    when p_saved_scope in ('div1','div2') then p_saved_scope
    when regexp_replace(lower(coalesce(p_department,'')), '[[:space:]]+', '', 'g') in ('정책1부','정책제1부','1부','div1') then 'div1'
    when regexp_replace(lower(coalesce(p_department,'')), '[[:space:]]+', '', 'g') in ('정책2부','정책제2부','2부','div2') then 'div2'
    when regexp_replace(lower(coalesce(p_position,'')), '[[:space:]]+', '', 'g') like '%정책1부%' then 'div1'
    when regexp_replace(lower(coalesce(p_position,'')), '[[:space:]]+', '', 'g') like '%정책2부%' then 'div2'
    when regexp_replace(lower(coalesce(p_requested_position,'')), '[[:space:]]+', '', 'g') like '%정책1부%' then 'div1'
    when regexp_replace(lower(coalesce(p_requested_position,'')), '[[:space:]]+', '', 'g') like '%정책2부%' then 'div2'
    else null
  end;
$$;

create or replace function public.sync_profile_availability_scope_v2()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.availability_scope := public.resolve_availability_scope_v2(
    new.department, new.position, new.requested_position, new.availability_scope
  );
  return new;
end;
$$;

drop trigger if exists profiles_sync_availability_scope_v2 on public.profiles;
create trigger profiles_sync_availability_scope_v2
before insert or update of department, position, requested_position, availability_scope
on public.profiles
for each row execute function public.sync_profile_availability_scope_v2();

update public.profiles
set availability_scope = public.resolve_availability_scope_v2(department, position, requested_position, availability_scope)
where availability_scope is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_department text;
  v_requested_position text;
begin
  v_department := case regexp_replace(coalesce(new.raw_user_meta_data ->> 'department',''), '[[:space:]]+', '', 'g')
    when '정책1부' then '정책1부'
    when '정책제1부' then '정책1부'
    when '정책2부' then '정책2부'
    when '정책제2부' then '정책2부'
    else '정책국'
  end;
  v_requested_position := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'requested_position','')), '');

  insert into public.profiles (
    id, name, school, cohort, department, requested_position, availability_scope,
    approval_status, system_role, position, created_at, updated_at
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name',''),
    coalesce(new.raw_user_meta_data ->> 'school',''),
    coalesce(new.raw_user_meta_data ->> 'cohort',''),
    v_department,
    v_requested_position,
    public.resolve_availability_scope_v2(v_department, null, v_requested_position, null),
    'pending',
    'leader',
    null,
    now(),
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    school = excluded.school,
    cohort = excluded.cohort,
    department = excluded.department,
    requested_position = coalesce(excluded.requested_position, public.profiles.requested_position),
    availability_scope = coalesce(excluded.availability_scope, public.profiles.availability_scope),
    updated_at = now();
  return new;
end;
$$;

-- 기존 승인 대기 계정의 신청 직책을 인증 메타데이터에서 복구
update public.profiles p
set requested_position = nullif(btrim(coalesce(u.raw_user_meta_data ->> 'requested_position','')), ''),
    updated_at = now()
from auth.users u
where u.id = p.id
  and p.requested_position is null
  and nullif(btrim(coalesce(u.raw_user_meta_data ->> 'requested_position','')), '') is not null;

create or replace function public.get_my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p public.profiles%rowtype;
  permissions text[];
  known_permissions text[] := array[
    'member_approve','role_manage','permission_grant',
    'content_write_notice','content_write_card','content_write_policy','content_approve',
    'news_manage','board_moderate','anonymous_identity_reveal',
    'schedule_manage_common','schedule_manage_div1','schedule_manage_div2','system_manage'
  ];
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then return null; end if;
  select coalesce(array_agg(code order by code), array[]::text[]) into permissions
  from unnest(known_permissions) as u(code)
  where public.has_permission(code, '*');
  return jsonb_build_object(
    'id',p.id,'name',p.name,'school',p.school,'cohort',p.cohort,'department',p.department,
    'requested_position',p.requested_position,'availability_scope',p.availability_scope,
    'approval_status',p.approval_status,'position',p.position,'system_role',p.system_role,
    'permissions',to_jsonb(permissions)
  );
end;
$$;

drop function if exists public.approve_leader(uuid,text,text,text);
create function public.approve_leader(
  p_target_user_id uuid,
  p_new_system_role text default 'leader',
  p_new_position text default null,
  p_new_department text default '정책국'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.profiles%rowtype;
  v_scope text := public.normalize_department(p_new_department);
  v_role text := p_new_system_role;
  v_position text;
begin
  if v_role not in ('leader','section_manager','department_manager','policy_general_manager','senior_manager_div1','senior_manager_div2','policy_director','external_admin') then
    raise exception '허용되지 않은 직책입니다.';
  end if;
  if v_role = 'senior_manager_div1' then v_scope := 'div1'; end if;
  if v_role = 'senior_manager_div2' then v_scope := 'div2'; end if;
  if v_role in ('policy_director','policy_general_manager','external_admin') then v_scope := 'policy_office'; end if;
  if not public.has_permission('member_approve', v_scope) then raise exception '해당 소속의 가입 승인 권한이 없습니다.'; end if;
  if not public.can_manage_target(public.department_display_name(v_scope), v_role) and not public.is_director() then raise exception '해당 직책을 부여할 권한이 없습니다.'; end if;

  select * into v_target from public.profiles where id = p_target_user_id for update;
  if v_target.id is null then raise exception '신청자를 찾을 수 없습니다.'; end if;
  if v_target.approval_status <> 'pending' then raise exception '승인 대기 상태의 신청자만 승인할 수 있습니다.'; end if;

  v_position := nullif(btrim(coalesce(p_new_position,'')), '');
  if v_position is null then v_position := nullif(btrim(coalesce(v_target.requested_position,'')), ''); end if;
  if v_position is null then v_position := public.default_position_for_role(v_role); end if;

  update public.profiles set
    approval_status='approved', system_role=v_role, position=v_position,
    department=public.department_display_name(v_scope), approved_by=auth.uid(), approved_at=now(), updated_at=now()
  where id=p_target_user_id;
end;
$$;

-- 관리 목록 함수에서 사용하는 권한 테이블이 없는 경우 먼저 생성
create table if not exists public.member_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null,
  scope text not null default '*',
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission_code, scope)
);

-- 반환 열이 추가되므로 기존 함수를 지운 뒤 현재 형태로 다시 생성
drop function if exists public.list_manageable_leaders();
create function public.list_manageable_leaders()
returns table (
  id uuid, name text, school text, cohort text, department text, approval_status text,
  position_title text, requested_position_title text, system_role text, login_email text,
  possible_duplicate boolean, created_at timestamptz, permissions jsonb,
  can_approve boolean, can_edit_role boolean, can_edit_permissions boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
  v_scope text;
begin
  select p.system_role, public.normalize_department(p.department) into v_role,v_scope
  from public.profiles p where p.id=auth.uid() and p.approval_status='approved';
  if v_role is null then raise exception '로그인이 필요합니다.'; end if;
  if not (public.has_permission('member_approve','*') or public.has_permission('role_manage','*') or public.has_permission('permission_grant','*') or public.has_permission('system_manage','*')) then
    raise exception '리더 관리 권한이 없습니다.';
  end if;
  return query
  select p.id,p.name,p.school,p.cohort,p.department,p.approval_status,p.position,p.requested_position,p.system_role,u.email::text,
    (trim(coalesce(p.name,''))<>'' and trim(coalesce(p.school,''))<>'' and trim(coalesce(p.cohort,''))<>'' and exists(
      select 1 from public.profiles d where d.id<>p.id and d.approval_status<>'rejected'
      and lower(trim(d.name))=lower(trim(p.name)) and lower(trim(d.school))=lower(trim(p.school)) and lower(trim(d.cohort))=lower(trim(p.cohort))
    )),
    p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('code',mp.permission_code,'scope',mp.scope) order by mp.permission_code) from public.member_permissions mp where mp.user_id=p.id),'[]'::jsonb),
    p.approval_status='pending' and public.has_permission('member_approve',public.normalize_department(p.department)),
    p.approval_status in ('approved','suspended') and p.id<>auth.uid() and public.can_manage_target(p.department,p.system_role),
    p.approval_status in ('approved','suspended') and p.id<>auth.uid() and (
      v_role='policy_director' or (v_role='senior_manager_div1' and public.normalize_department(p.department)='div1')
      or (v_role='senior_manager_div2' and public.normalize_department(p.department)='div2') or v_role='policy_general_manager'
      or public.has_permission('permission_grant',public.normalize_department(p.department))
    )
  from public.profiles p join auth.users u on u.id=p.id
  where v_role='policy_director'
    or (v_role='senior_manager_div1' and public.normalize_department(p.department)='div1')
    or (v_role='senior_manager_div2' and public.normalize_department(p.department)='div2')
    or (v_role in ('policy_general_manager','external_admin') and p.approval_status in ('approved','suspended'))
    or (public.has_permission('permission_grant',public.normalize_department(p.department)) and p.approval_status in ('approved','suspended'))
  order by case p.approval_status when 'pending' then 0 else 1 end,p.created_at,p.name;
end;
$$;

-- 6. 모든 승인 리더 콘텐츠 작성 + 초기 공지사항 ---------------------------
alter table public.content_posts alter column author_id drop not null;
alter table public.content_posts add column if not exists seed_key text;
create unique index if not exists content_posts_seed_key_unique
  on public.content_posts(seed_key);

drop policy if exists content_posts_select on public.content_posts;
create policy content_posts_select
on public.content_posts for select
to anon, authenticated
using (
  status = 'published'
  or author_id = auth.uid()
  or public.has_permission('content_approve','*')
);

create or replace function public.is_approved_content_writer_v2()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and approval_status = 'approved'
      and system_role <> 'external_admin'
  );
$$;

create or replace function public.can_approve_content_v2()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_permission('content_approve','*')
    or exists(
      select 1 from public.profiles
      where id=auth.uid() and approval_status='approved'
        and system_role in ('policy_director','policy_general_manager','senior_manager_div1','senior_manager_div2')
    );
$$;

create or replace function public.save_content_draft(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_category text := trim(coalesce(p_payload ->> 'category',''));
  v_title text := trim(coalesce(p_payload ->> 'title',''));
  v_summary text := trim(coalesce(p_payload ->> 'summary',''));
  v_body text := coalesce(p_payload ->> 'body','');
  v_cover text := nullif(trim(coalesce(p_payload ->> 'cover_url','')), '');
  v_existing public.content_posts%rowtype;
begin
  if not public.is_approved_content_writer_v2() and not public.can_approve_content_v2() then
    raise exception '가입 승인을 완료한 리더만 콘텐츠를 작성할 수 있습니다.';
  end if;
  if v_category not in ('notice','card','policy') then raise exception '콘텐츠 종류가 올바르지 않습니다.'; end if;
  if v_title = '' then raise exception '제목을 입력해 주세요.'; end if;
  if length(v_title) > 160 then raise exception '제목이 너무 깁니다.'; end if;
  if length(v_body) > 20000 then raise exception '본문이 너무 깁니다.'; end if;
  begin v_id := nullif(p_payload ->> 'id','')::uuid; exception when others then v_id := null; end;
  if v_id is null then
    insert into public.content_posts(category,title,summary,body,cover_url,author_id)
    values (v_category,v_title,v_summary,v_body,v_cover,auth.uid()) returning id into v_id;
  else
    select * into v_existing from public.content_posts where id=v_id for update;
    if v_existing.id is null then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
    if v_existing.author_id is distinct from auth.uid() and not public.can_approve_content_v2() then raise exception '이 콘텐츠를 수정할 권한이 없습니다.'; end if;
    if v_existing.status in ('published','hidden') and not public.can_approve_content_v2() then raise exception '게시된 콘텐츠는 관리 권한자가 수정해야 합니다.'; end if;
    update public.content_posts
    set category=v_category,title=v_title,summary=v_summary,body=v_body,cover_url=v_cover,
        status=case when status='rejected' then 'draft' else status end,
        review_note=case when status='rejected' then null else review_note end,
        updated_at=now()
    where id=v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.submit_content(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_post public.content_posts%rowtype;
begin
  select * into v_post from public.content_posts where id=p_post_id for update;
  if v_post.id is null then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
  if v_post.author_id is distinct from auth.uid() and not public.can_approve_content_v2() then raise exception '승인 요청 권한이 없습니다.'; end if;
  if v_post.status not in ('draft','rejected') then raise exception '작성 중이거나 반려된 콘텐츠만 승인 요청할 수 있습니다.'; end if;
  update public.content_posts set status='review',review_note=null,updated_at=now() where id=p_post_id;
end;
$$;

create or replace function public.publish_content(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_approve_content_v2() then raise exception '게시 승인 권한이 없습니다.'; end if;
  update public.content_posts
  set status='published',approved_by=auth.uid(),published_at=coalesce(published_at,now()),updated_at=now(),review_note=null
  where id=p_post_id;
  if not found then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
end;
$$;

create or replace function public.reject_content(p_post_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_approve_content_v2() then raise exception '반려 권한이 없습니다.'; end if;
  update public.content_posts set status='rejected',review_note=nullif(trim(p_reason),''),updated_at=now() where id=p_post_id;
  if not found then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
end;
$$;

create or replace function public.hide_content(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_approve_content_v2() then raise exception '게시물 숨김 권한이 없습니다.'; end if;
  update public.content_posts set status='hidden',updated_at=now() where id=p_post_id;
  if not found then raise exception '콘텐츠를 찾을 수 없습니다.'; end if;
end;
$$;

drop function if exists public.list_content_management();
create function public.list_content_management()
returns table (
  id uuid, category text, title text, summary text, body text, cover_url text,
  status text, review_note text, author_name text, author_id uuid,
  created_at timestamptz, updated_at timestamptz, published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_approved_content_writer_v2() and not public.can_approve_content_v2() then
    raise exception '콘텐츠 관리 화면을 이용할 수 없습니다.';
  end if;
  return query
  select c.id,c.category,c.title,c.summary,c.body,c.cover_url,c.status,c.review_note,
         coalesce(p.name,'정책국 운영팀'),c.author_id,c.created_at,c.updated_at,c.published_at
  from public.content_posts c
  left join public.profiles p on p.id=c.author_id
  where c.author_id=auth.uid() or public.can_approve_content_v2()
  order by case c.status when 'review' then 0 when 'draft' then 1 else 2 end,c.updated_at desc;
end;
$$;

insert into public.content_posts(category,title,summary,body,status,published_at,seed_key)
values
('notice','대한간호학생회 부산 정책국 홈페이지 이용 안내',
 '공개 콘텐츠와 리더 전용 기능을 편리하게 이용하는 방법을 안내합니다.',
 '## 홈페이지 이용 안내\n대한간호학생회 부산 정책국 홈페이지에 오신 것을 환영합니다. 이 공간은 정책국의 활동과 간호·보건의료 정책 정보를 공유하고 리더들의 협업을 지원하기 위해 운영됩니다.\n\n## 공개 메뉴\n- 정책국 소개와 공지사항\n- 카드뉴스와 정책 콘텐츠\n- 간호·정책 뉴스와 공개 일정\n- 정책단어와 정책 퀴즈\n\n## 리더 기능\n이메일 인증과 가입 승인을 완료한 리더는 일정 확인과 정책국 일정 등록 그리고 익명 소통방과 콘텐츠 작성 기능을 이용할 수 있습니다.\n\n## 계정 보안\n로그인 아이디는 가입 시 입력한 이메일입니다. 비밀번호는 안전한 방식으로 처리되며 운영자도 기존 비밀번호를 확인할 수 없습니다.',
 'published',now(),'notice_welcome_v2'),
('notice','일정 확인 및 정책국 일정 등록 안내',
 '불가능한 날짜 제출과 정책국 공식 일정 등록·관리 방법을 안내합니다.',
 '## 불가능한 날짜 제출\n정책국·정책1부·정책2부의 모든 승인 리더는 일정 확인 화면에서 참여가 불가능한 날짜와 사유를 등록해 주세요. 선택하지 않은 날짜는 가능한 날로 집계됩니다.\n\n## 정책국 일정 등록\n가입 승인을 완료한 모든 리더는 회의와 사업 그리고 제출 마감 등의 일정을 등록할 수 있습니다. 시작 시간과 장소가 정해지지 않은 경우에는 비워둘 수 있습니다.\n\n## 수정과 삭제\n등록한 일정은 일반 리더가 직접 수정하거나 삭제할 수 없습니다. 변경이 필요하면 소속 수석부장 또는 정책총괄부장에게 요청해 주세요.',
 'published',now(),'notice_schedule_v2'),
('notice','공지사항·카드뉴스·정책 콘텐츠 작성 안내',
 '리더가 콘텐츠 초안을 작성하고 관리 권한자가 검토·게시하는 절차를 안내합니다.',
 '## 작성할 수 있는 콘텐츠\n승인된 모든 리더는 공지사항과 카드뉴스 그리고 정책 콘텐츠의 초안을 작성할 수 있습니다.\n\n## 게시 절차\n- 초안 작성 및 저장\n- 승인 요청\n- 관리 권한자의 내용과 출처 검토\n- 게시 승인 또는 반려\n\n## 작성 원칙\n정책과 제도에 관한 내용은 공식 자료 또는 신뢰할 수 있는 출처를 확인하고 사실과 의견을 구분해 작성해 주세요.',
 'published',now(),'notice_content_v2'),
('notice','익명 리더 소통방 이용 안내',
 '자유로운 의견과 업무 아이디어를 나누기 위한 익명 소통방 이용 방법입니다.',
 '## 익명 소통 안내\n게시글과 댓글에는 이름과 직책 그리고 소속이 표시되지 않습니다.\n다른 리더에게 작성자의 신원은 공개되지 않습니다.\n\n서로를 존중하는 표현을 사용하고 개인을 특정할 수 있는 개인정보는 작성하지 말아 주세요.',
 'published',now(),'notice_board_v2')
on conflict (seed_key) do update set
  title=excluded.title,summary=excluded.summary,body=excluded.body,status='published',published_at=coalesce(public.content_posts.published_at,excluded.published_at),updated_at=now();

-- 7. 불가능한 날짜 조사 ----------------------------------------------------
create table if not exists public.leader_unavailable_submissions_v2 (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('div1','div2')),
  month_start date not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(leader_id,scope,month_start)
);
create table if not exists public.leader_unavailable_days_v2 (
  submission_id uuid not null references public.leader_unavailable_submissions_v2(id) on delete cascade,
  unavailable_date date not null,
  created_at timestamptz not null default now(),
  primary key(submission_id,unavailable_date)
);
alter table public.leader_unavailable_submissions_v2 enable row level security;
alter table public.leader_unavailable_days_v2 enable row level security;

create or replace function public.is_approved_leader_v2()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved' and system_role<>'external_admin');
$$;

create or replace function public.can_view_unavailable_v2(p_scope text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_role text; v_department text; v_scope text:=public.normalize_department(p_scope);
begin
  select system_role,public.normalize_department(department) into v_role,v_department
  from public.profiles where id=auth.uid() and approval_status='approved';
  if v_role is null then return false; end if;
  if v_role in ('policy_director','policy_general_manager') then return true; end if;
  if v_role='senior_manager_div1' and v_scope='div1' then return true; end if;
  if v_role='senior_manager_div2' and v_scope='div2' then return true; end if;
  return public.has_permission(case v_scope when 'div1' then 'schedule_manage_div1' else 'schedule_manage_div2' end,v_scope);
end; $$;

create or replace function public.can_manage_unavailable_v2(p_scope text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.can_view_unavailable_v2(p_scope);
$$;

create or replace function public.can_manage_policy_schedule_v2(p_scope text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_role text; v_scope text:=public.normalize_department(p_scope);
begin
  select system_role into v_role from public.profiles where id=auth.uid() and approval_status='approved';
  if v_role is null then return false; end if;
  if v_role in ('policy_director','policy_general_manager') then return true; end if;
  if v_role='senior_manager_div1' and v_scope='div1' then return true; end if;
  if v_role='senior_manager_div2' and v_scope='div2' then return true; end if;
  return public.has_permission(case v_scope when 'policy_office' then 'schedule_manage_common' when 'div1' then 'schedule_manage_div1' else 'schedule_manage_div2' end,v_scope);
end; $$;

create or replace function public.get_schedule_context_v2()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype; v_scope text; v_can_submit boolean; v_message text;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null then return null; end if;
  v_scope:=public.resolve_availability_scope_v2(p.department,p.position,p.requested_position,p.availability_scope);
  v_can_submit:=p.approval_status='approved' and p.system_role<>'external_admin' and v_scope in ('div1','div2');
  v_message:=case
    when p.approval_status<>'approved' then '가입 승인 완료 후 일정 응답을 등록할 수 있습니다.'
    when p.system_role='external_admin' then '외부 관리자는 일정 응답 대상이 아닙니다.'
    when v_scope not in ('div1','div2') then '정책1부 또는 정책2부 소속이 확인되지 않습니다. 관리센터에서 소속을 확인해 주세요.'
    else null end;
  return jsonb_build_object(
    'own_scope',v_scope,'can_submit',v_can_submit,'scope_message',v_message,
    'can_view_div1',public.can_view_unavailable_v2('div1'),
    'can_view_div2',public.can_view_unavailable_v2('div2'),
    'can_manage_div1',public.can_manage_unavailable_v2('div1'),
    'can_manage_div2',public.can_manage_unavailable_v2('div2'),
    'can_manage_common',public.can_manage_policy_schedule_v2('policy_office'),
    'can_create_schedule',public.is_approved_leader_v2()
  );
end; $$;

create or replace function public.submit_unavailable_month_v2(p_scope text,p_month_start date,p_selections jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_scope text:=public.normalize_department(p_scope); v_month date:=date_trunc('month',p_month_start)::date;
  v_own_scope text; v_submission uuid; v_item jsonb; v_date date; v_count int:=0;
begin
  if not public.is_approved_leader_v2() then raise exception '승인된 리더만 제출할 수 있습니다.'; end if;
  if v_scope not in ('div1','div2') then raise exception '정책1부 또는 정책2부를 선택해 주세요.'; end if;
  select public.resolve_availability_scope_v2(department,position,requested_position,availability_scope) into v_own_scope
  from public.profiles where id=auth.uid();
  if v_own_scope is distinct from v_scope then raise exception '본인 소속 부서의 불가능한 날짜만 제출할 수 있습니다.'; end if;
  if exists(select 1 from public.leader_unavailable_submissions_v2 where leader_id=auth.uid() and scope=v_scope and month_start=v_month) then
    raise exception '이 달 일정 응답은 이미 제출했습니다. 변경이 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.';
  end if;
  if jsonb_typeof(coalesce(p_selections,'[]'::jsonb))<>'array' then raise exception '날짜 형식이 올바르지 않습니다.'; end if;
  insert into public.leader_unavailable_submissions_v2(leader_id,scope,month_start) values(auth.uid(),v_scope,v_month) returning id into v_submission;
  for v_item in select * from jsonb_array_elements(coalesce(p_selections,'[]'::jsonb)) loop
    v_date:=(v_item->>'date')::date;
    if v_date<v_month or v_date>=(v_month+interval '1 month')::date then raise exception '선택한 날짜가 해당 월을 벗어났습니다.'; end if;
    insert into public.leader_unavailable_days_v2(submission_id,unavailable_date) values(v_submission,v_date) on conflict do nothing;
    v_count:=v_count+1;
  end loop;
  return v_count;
end; $$;

create or replace function public.get_my_unavailable_month_v2(p_scope text,p_month_start date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_scope text:=public.normalize_department(p_scope); v_month date:=date_trunc('month',p_month_start)::date;
  v_submission public.leader_unavailable_submissions_v2%rowtype; v_days jsonb;
begin
  if not public.is_approved_leader_v2() then raise exception '승인된 리더만 확인할 수 있습니다.'; end if;
  select * into v_submission from public.leader_unavailable_submissions_v2 where leader_id=auth.uid() and scope=v_scope and month_start=v_month;
  if v_submission.id is null then return jsonb_build_object('submitted',false,'selections','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('date',unavailable_date) order by unavailable_date),'[]'::jsonb) into v_days
  from public.leader_unavailable_days_v2 where submission_id=v_submission.id;
  return jsonb_build_object('submitted',true,'submitted_at',v_submission.submitted_at,'selections',v_days);
end; $$;

drop function if exists public.list_unavailable_summary_v2(text,date);
create function public.list_unavailable_summary_v2(p_scope text,p_month_start date)
returns table(schedule_date date,available_count integer,unavailable_count integer,submission_count integer)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_scope text:=public.normalize_department(p_scope); v_month date:=date_trunc('month',p_month_start)::date;
begin
  if not public.can_view_unavailable_v2(v_scope) then raise exception '해당 부서 일정 현황을 확인할 권한이 없습니다.'; end if;
  return query
  with dates as (select generate_series(v_month,(v_month+interval '1 month - 1 day')::date,interval '1 day')::date d),
  subs as (select id from public.leader_unavailable_submissions_v2 where scope=v_scope and month_start=v_month),
  total as (select count(*)::int n from subs),
  blocked as (select u.unavailable_date,count(*)::int n from public.leader_unavailable_days_v2 u join subs s on s.id=u.submission_id group by u.unavailable_date)
  select dates.d,greatest((select n from total)-coalesce(blocked.n,0),0),coalesce(blocked.n,0),(select n from total)
  from dates left join blocked on blocked.unavailable_date=dates.d order by dates.d;
end; $$;

drop function if exists public.list_unavailable_details_v2(text,date);
create function public.list_unavailable_details_v2(p_scope text,p_schedule_date date)
returns table(leader_id uuid,leader_name text,leader_position text,status text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_scope text:=public.normalize_department(p_scope); v_month date:=date_trunc('month',p_schedule_date)::date;
begin
  if not public.can_view_unavailable_v2(v_scope) then raise exception '상세 일정 현황을 확인할 권한이 없습니다.'; end if;
  return query
  select p.id,p.name,p.position,case when u.unavailable_date is null then 'available' else 'unavailable' end
  from public.leader_unavailable_submissions_v2 s
  join public.profiles p on p.id=s.leader_id
  left join public.leader_unavailable_days_v2 u on u.submission_id=s.id and u.unavailable_date=p_schedule_date
  where s.scope=v_scope and s.month_start=v_month order by p.name;
end; $$;

create or replace function public.manager_set_unavailable_day_v2(p_target_user_id uuid,p_scope text,p_schedule_date date,p_status text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_scope text:=public.normalize_department(p_scope); v_month date:=date_trunc('month',p_schedule_date)::date; v_submission uuid;
begin
  if not public.can_manage_unavailable_v2(v_scope) then raise exception '일정 응답 수정 권한이 없습니다.'; end if;
  select id into v_submission from public.leader_unavailable_submissions_v2 where leader_id=p_target_user_id and scope=v_scope and month_start=v_month;
  if v_submission is null then raise exception '해당 리더가 이 달 일정을 제출하지 않았습니다.'; end if;
  if p_status='unavailable' then insert into public.leader_unavailable_days_v2(submission_id,unavailable_date) values(v_submission,p_schedule_date) on conflict do nothing;
  elsif p_status='available' then delete from public.leader_unavailable_days_v2 where submission_id=v_submission and unavailable_date=p_schedule_date;
  else raise exception '일정 상태가 올바르지 않습니다.'; end if;
  update public.leader_unavailable_submissions_v2 set updated_at=now() where id=v_submission;
end; $$;

-- 8. 정책국 공식 일정 달력 -------------------------------------------------
create table if not exists public.leader_schedules (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  event_date date not null,
  start_time time,
  end_time time,
  title text not null,
  location text,
  note text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leader_schedules add column if not exists visibility text not null default 'internal';
alter table public.leader_schedules add column if not exists schedule_kind text not null default 'confirmed';
alter table public.leader_schedules enable row level security;

create table if not exists public.policy_schedule_audit_v2(
  id bigint generated by default as identity primary key,
  schedule_id uuid,
  action text not null,
  changed_by uuid references public.profiles(id),
  snapshot jsonb,
  created_at timestamptz not null default now()
);
alter table public.policy_schedule_audit_v2 enable row level security;

create or replace function public.is_executive_v2()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved' and system_role in ('policy_director','policy_general_manager','senior_manager_div1','senior_manager_div2'));
$$;

create or replace function public.create_policy_schedule_v2(p_scope text,p_event_date date,p_start_time time,p_end_time time,p_title text,p_location text,p_note text,p_visibility text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_scope text:=public.normalize_department(p_scope); v_id uuid;
begin
  if not public.is_approved_leader_v2() then raise exception '가입 승인을 완료한 리더만 일정을 등록할 수 있습니다.'; end if;
  if v_scope not in ('policy_office','div1','div2') then raise exception '일정 구분이 올바르지 않습니다.'; end if;
  if trim(coalesce(p_title,''))='' then raise exception '일정 제목을 입력해 주세요.'; end if;
  if p_visibility not in ('public','internal','executive') then raise exception '공개 범위가 올바르지 않습니다.'; end if;
  if p_start_time is not null and p_end_time is not null and p_end_time<p_start_time then raise exception '종료 시간은 시작 시간보다 빠를 수 없습니다.'; end if;
  if exists(select 1 from public.leader_schedules where schedule_kind='confirmed' and event_date=p_event_date and scope=v_scope and lower(trim(title))=lower(trim(p_title))) then
    raise exception '같은 날짜에 제목이 같은 일정이 이미 등록되어 있습니다.';
  end if;
  insert into public.leader_schedules(scope,event_date,start_time,end_time,title,location,note,created_by,visibility,schedule_kind)
  values(v_scope,p_event_date,p_start_time,p_end_time,trim(p_title),nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_note,'')),''),auth.uid(),p_visibility,'confirmed') returning id into v_id;
  insert into public.policy_schedule_audit_v2(schedule_id,action,changed_by,snapshot)
  select id,'create',auth.uid(),to_jsonb(s) from public.leader_schedules s where id=v_id;
  return v_id;
end; $$;

drop function if exists public.list_policy_schedules_v2(date,date);
create function public.list_policy_schedules_v2(p_start_date date,p_end_date date)
returns table(id uuid,scope text,event_date date,start_time time,end_time time,title text,location text,note text,visibility text,created_by_name text,can_manage boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved') then raise exception '승인된 리더만 일정을 확인할 수 있습니다.'; end if;
  return query
  select s.id,s.scope,s.event_date,s.start_time,s.end_time,s.title,s.location,s.note,s.visibility,
         case when public.can_manage_policy_schedule_v2(s.scope) then p.name else null end,
         public.can_manage_policy_schedule_v2(s.scope)
  from public.leader_schedules s join public.profiles p on p.id=s.created_by
  where s.schedule_kind='confirmed' and s.event_date between p_start_date and p_end_date
    and (s.visibility in ('public','internal') or (s.visibility='executive' and public.is_executive_v2()))
  order by s.event_date,s.start_time nulls first,s.created_at;
end; $$;

drop function if exists public.list_public_policy_schedules_v2(date,date);
create function public.list_public_policy_schedules_v2(p_start_date date,p_end_date date)
returns table(id uuid,scope text,event_date date,start_time time,end_time time,title text,location text,note text)
language sql stable security definer set search_path=public,pg_temp as $$
  select s.id,s.scope,s.event_date,s.start_time,s.end_time,s.title,s.location,s.note
  from public.leader_schedules s where s.schedule_kind='confirmed' and s.visibility='public' and s.event_date between p_start_date and p_end_date
  order by s.event_date,s.start_time nulls first,s.created_at;
$$;

create or replace function public.manager_update_policy_schedule_v2(p_schedule_id uuid,p_event_date date,p_start_time time,p_end_time time,p_title text,p_location text,p_note text,p_visibility text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old public.leader_schedules%rowtype;
begin
  select * into v_old from public.leader_schedules where id=p_schedule_id and schedule_kind='confirmed' for update;
  if v_old.id is null then raise exception '일정을 찾을 수 없습니다.'; end if;
  if not public.can_manage_policy_schedule_v2(v_old.scope) then raise exception '일정 수정 권한이 없습니다.'; end if;
  if trim(coalesce(p_title,''))='' then raise exception '일정 제목을 입력해 주세요.'; end if;
  if p_visibility not in ('public','internal','executive') then raise exception '공개 범위가 올바르지 않습니다.'; end if;
  if p_start_time is not null and p_end_time is not null and p_end_time<p_start_time then raise exception '종료 시간은 시작 시간보다 빠를 수 없습니다.'; end if;
  insert into public.policy_schedule_audit_v2(schedule_id,action,changed_by,snapshot) values(v_old.id,'update_before',auth.uid(),to_jsonb(v_old));
  update public.leader_schedules set event_date=p_event_date,start_time=p_start_time,end_time=p_end_time,title=trim(p_title),location=nullif(trim(coalesce(p_location,'')),''),note=nullif(trim(coalesce(p_note,'')),''),visibility=p_visibility,updated_at=now() where id=p_schedule_id;
end; $$;

create or replace function public.manager_delete_policy_schedule_v2(p_schedule_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old public.leader_schedules%rowtype;
begin
  select * into v_old from public.leader_schedules where id=p_schedule_id and schedule_kind='confirmed' for update;
  if v_old.id is null then raise exception '일정을 찾을 수 없습니다.'; end if;
  if not public.can_manage_policy_schedule_v2(v_old.scope) then raise exception '일정 삭제 권한이 없습니다.'; end if;
  insert into public.policy_schedule_audit_v2(schedule_id,action,changed_by,snapshot) values(v_old.id,'delete',auth.uid(),to_jsonb(v_old));
  delete from public.leader_schedules where id=p_schedule_id;
end; $$;


-- 9. 정책단어 작성·관리 -----------------------------------------------------
create table if not exists public.policy_glossary_entries_v1(
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  category text not null default '기타',
  summary text not null default '',
  detail text not null default '',
  source_title text,
  source_url text,
  status text not null default 'draft' check(status in ('draft','published','hidden')),
  author_id uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.policy_glossary_entries_v1 enable row level security;
drop policy if exists glossary_public_select_v1 on public.policy_glossary_entries_v1;
create policy glossary_public_select_v1 on public.policy_glossary_entries_v1 for select to anon,authenticated
using(status='published' or author_id=auth.uid() or public.can_approve_content_v2());
grant select on public.policy_glossary_entries_v1 to anon,authenticated;

create or replace function public.save_glossary_entry_v1(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_existing public.policy_glossary_entries_v1%rowtype;
  v_term text:=trim(coalesce(p_payload->>'term','')); v_category text:=trim(coalesce(p_payload->>'category','기타'));
  v_summary text:=trim(coalesce(p_payload->>'summary','')); v_detail text:=coalesce(p_payload->>'detail','');
  v_source_title text:=nullif(trim(coalesce(p_payload->>'source_title','')),'');
  v_source_url text:=nullif(trim(coalesce(p_payload->>'source_url','')),'');
begin
  if not public.is_approved_content_writer_v2() and not public.can_approve_content_v2() then raise exception '가입 승인을 완료한 리더만 정책단어를 작성할 수 있습니다.'; end if;
  if v_term='' then raise exception '정책단어를 입력해 주세요.'; end if;
  if v_summary='' then raise exception '한 줄 정의를 입력해 주세요.'; end if;
  begin v_id:=nullif(p_payload->>'id','')::uuid; exception when others then v_id:=null; end;
  if v_id is null then
    insert into public.policy_glossary_entries_v1(term,category,summary,detail,source_title,source_url,author_id)
    values(v_term,v_category,v_summary,v_detail,v_source_title,v_source_url,auth.uid()) returning id into v_id;
  else
    select * into v_existing from public.policy_glossary_entries_v1 where id=v_id for update;
    if v_existing.id is null then raise exception '정책단어를 찾을 수 없습니다.'; end if;
    if v_existing.author_id is distinct from auth.uid() and not public.can_approve_content_v2() then raise exception '수정 권한이 없습니다.'; end if;
    if v_existing.status='published' and not public.can_approve_content_v2() then raise exception '게시된 정책단어는 관리 권한자가 수정해야 합니다.'; end if;
    update public.policy_glossary_entries_v1 set term=v_term,category=v_category,summary=v_summary,detail=v_detail,source_title=v_source_title,source_url=v_source_url,updated_at=now() where id=v_id;
  end if;
  return v_id;
end; $$;

drop function if exists public.list_glossary_management_v1();
create function public.list_glossary_management_v1()
returns table(id uuid,term text,category text,summary text,detail text,source_title text,source_url text,status text,author_name text,author_id uuid,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_approved_content_writer_v2() and not public.can_approve_content_v2() then raise exception '정책단어 관리 화면을 이용할 수 없습니다.'; end if;
  return query select g.id,g.term,g.category,g.summary,g.detail,g.source_title,g.source_url,g.status,coalesce(p.name,'정책국 운영팀'),g.author_id,g.updated_at
  from public.policy_glossary_entries_v1 g left join public.profiles p on p.id=g.author_id
  where g.author_id=auth.uid() or public.can_approve_content_v2() order by g.updated_at desc;
end; $$;

create or replace function public.publish_glossary_entry_v1(p_entry_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.can_approve_content_v2() then raise exception '정책단어 게시 권한이 없습니다.'; end if;
  update public.policy_glossary_entries_v1 set status='published',approved_by=auth.uid(),published_at=coalesce(published_at,now()),updated_at=now() where id=p_entry_id;
  if not found then raise exception '정책단어를 찾을 수 없습니다.'; end if;
end; $$;
create or replace function public.hide_glossary_entry_v1(p_entry_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.can_approve_content_v2() then raise exception '정책단어 숨김 권한이 없습니다.'; end if;
  update public.policy_glossary_entries_v1 set status='hidden',updated_at=now() where id=p_entry_id;
  if not found then raise exception '정책단어를 찾을 수 없습니다.'; end if;
end; $$;

insert into public.policy_glossary_entries_v1(term,category,summary,detail,source_title,source_url,status,published_at) values
('간호법','간호정책','간호에 관한 기본사항과 간호사 등의 업무·권리·책임을 규정하는 법률입니다.','다양한 현장에서 수준 높은 간호를 제공하고 의료의 질과 환자안전을 높이기 위한 법적 기반입니다.','국가법령정보센터 · 간호법','https://www.law.go.kr/법령/간호법','published',now()),
('간호사 면허','간호정책','간호사 국가시험 합격 후 보건복지부장관에게 받는 법적 자격입니다.','면허는 일정한 교육요건과 국가시험 합격을 전제로 하며 간호업무 수행의 기본 자격입니다.','국가법령정보센터 · 간호법','https://www.law.go.kr/법령/간호법','published',now()),
('전문간호사','간호정책','전문분야 교육과 자격인정을 거쳐 고도의 간호를 수행하는 간호사입니다.','관련 법령에 따라 분야별 자격기준과 교육과정 및 업무범위가 정해집니다.','국가법령정보센터 · 간호법','https://www.law.go.kr/법령/간호법','published',now()),
('진료지원업무','간호정책','법령이 정한 요건 아래 간호사가 의사의 판단·지도·위임에 근거해 수행하는 업무입니다.','기관 요건과 자격·교육 및 업무범위가 명확해야 하며 환자안전 관리가 함께 이뤄져야 합니다.','국가법령정보센터 · 간호법','https://www.law.go.kr/법령/간호법','published',now()),
('간호인력 지원센터','간호정책','간호인력의 장기근속과 전문성 향상 등을 지원하기 위한 조직입니다.','지역 단위의 취업·교육·경력개발과 근무환경 개선 지원 기능을 수행할 수 있습니다.','국가법령정보센터 · 간호법','https://www.law.go.kr/법령/간호법','published',now()),
('간호·간병통합서비스','간호정책','보호자나 개인 간병인 대신 병동의 간호인력이 간호와 간병을 함께 제공하는 입원서비스입니다.','환자 간병부담을 줄이고 안전하고 체계적인 입원서비스를 제공하는 것을 목표로 합니다.','보건복지부 · 보건의료 정책','https://www.mohw.go.kr','published',now()),
('간호관리료 차등제','간호정책','간호인력 확보수준 등에 따라 입원료 관련 보상을 달리하는 제도입니다.','의료기관의 적정 간호인력 확보를 유도하기 위한 건강보험 보상체계의 하나입니다.','건강보험심사평가원 · 요양급여 적정성 평가','https://www.hira.or.kr','published',now()),
('교대제 개선','간호정책','규칙적이고 예측 가능한 근무와 교육지원을 통해 교대근무 환경을 개선하는 정책입니다.','근무 예측가능성, 신규간호사 교육, 숙련인력 유지와 환자안전 향상을 함께 목표로 합니다.','보건복지부 · 보건의료 정책','https://www.mohw.go.kr','published',now()),
('보건의료기본법','보건의료','보건의료에 관한 국민의 권리와 국가·지방자치단체의 책임을 정한 기본법입니다.','보건의료정책의 기본방향과 보건의료서비스 및 정보에 관한 원칙을 제시합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('보건의료인','보건의료','관련 법령에 따라 자격·면허를 취득했거나 보건의료서비스 종사가 허용된 사람입니다.','간호사와 의사 등 법령이 정한 다양한 보건의료 전문인력을 포함하는 개념입니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('보건의료정보','보건의료','보건의료와 관련한 지식이나 문자·숫자·영상 등 모든 형태의 자료입니다.','개인 건강정보뿐 아니라 정책·통계·연구자료 등 폭넓은 정보가 포함될 수 있습니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('건강권','보건의료','국민이 건강을 보호받고 필요한 보건의료서비스에 접근할 권리입니다.','법과 정책은 국민의 건강보호와 적정한 서비스 접근을 보장하는 방향으로 설계됩니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('건강형평성','보건의료','피할 수 있고 불공정한 건강격차를 줄이는 정책원칙입니다.','동일한 자원배분이 아니라 필요와 장벽의 차이를 반영한 지원이 중요합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('보편적 건강보장','보건의료','모든 사람이 재정적 어려움 없이 필요한 보건의료서비스를 이용하도록 하는 목표입니다.','서비스 범위와 접근성·질·재정부담을 함께 고려하는 개념입니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('일차의료','보건의료','주민이 가장 먼저 접하는 지속적이고 포괄적인 보건의료서비스입니다.','예방과 건강관리, 흔한 질환의 진료, 필요한 경우 다른 기관으로의 연계를 포함합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('의료전달체계','보건의료','환자의 필요에 따라 적절한 수준의 의료기관과 서비스를 연계하는 체계입니다.','일차의료부터 전문·중증진료까지 역할을 나누고 의뢰·회송을 통해 연속성을 높입니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('지역보건법','지역보건','지역 주민의 건강증진과 지역보건의료기관 및 사업에 관한 사항을 규정하는 법률입니다.','지역의 건강문제와 자원을 반영해 계획을 세우고 보건소 등을 중심으로 사업을 수행합니다.','국가법령정보센터 · 지역보건법','https://www.law.go.kr/법령/지역보건법','published',now()),
('지역보건의료계획','지역보건','지역의 건강문제와 자원을 분석해 수립하는 중장기 보건의료계획입니다.','목표와 사업, 자원배분, 평가계획을 지역 특성에 맞게 구성합니다.','국가법령정보센터 · 지역보건법','https://www.law.go.kr/법령/지역보건법','published',now()),
('보건소','지역보건','지역 주민을 대상으로 건강증진·질병예방·보건사업을 수행하는 지역보건기관입니다.','지역 건강조사와 예방접종, 모자보건, 만성질환 관리 등 다양한 사업을 수행합니다.','국가법령정보센터 · 지역보건법','https://www.law.go.kr/법령/지역보건법','published',now()),
('지역사회 건강조사','지역보건','지역 주민의 건강행태와 건강수준을 파악하기 위한 조사입니다.','지역별 건강문제와 격차를 파악해 보건사업의 우선순위와 성과평가에 활용합니다.','국가법령정보센터 · 지역보건법','https://www.law.go.kr/법령/지역보건법','published',now()),
('건강증진','지역보건','건강에 유리한 생활과 환경을 만들고 건강역량을 높이는 활동입니다.','개인의 행동변화뿐 아니라 제도와 환경 개선을 함께 포함합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('건강격차','지역보건','사회경제적 조건이나 지역 등에 따라 나타나는 건강수준과 서비스 이용의 차이입니다.','정책은 불필요하고 개선 가능한 격차를 파악하고 줄이는 데 초점을 둡니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('환자안전법','환자안전','환자안전사고 예방과 재발방지를 위한 국가·기관의 활동을 규정한 법률입니다.','환자안전위원회와 전담인력, 보고학습체계 등 환자안전 기반을 마련합니다.','국가법령정보센터 · 환자안전법','https://www.law.go.kr/법령/환자안전법','published',now()),
('환자안전사고','환자안전','보건의료서비스 과정에서 환자에게 위해가 발생했거나 발생할 우려가 있는 사고입니다.','사고의 원인을 학습하고 재발을 막기 위한 체계적 관리가 중요합니다.','국가법령정보센터 · 환자안전법','https://www.law.go.kr/법령/환자안전법','published',now()),
('환자안전활동','환자안전','환자안전사고를 예방하고 재발을 막기 위한 모든 활동입니다.','보고, 분석, 교육, 절차 개선, 안전문화 조성 등을 포함합니다.','국가법령정보센터 · 환자안전법','https://www.law.go.kr/법령/환자안전법','published',now()),
('근접오류','환자안전','실제 환자 피해로 이어지기 전에 발견되거나 우연히 회피된 사건입니다.','시스템의 취약점을 조기에 발견할 수 있는 중요한 학습자료입니다.','국가법령정보센터 · 환자안전법','https://www.law.go.kr/법령/환자안전법','published',now()),
('근본원인분석','환자안전','사고의 표면적 원인보다 시스템과 과정의 근본 원인을 찾는 분석방법입니다.','개인 비난보다 업무흐름·환경·의사소통·장비·규정의 문제를 구조적으로 살핍니다.','국가법령정보센터 · 환자안전법','https://www.law.go.kr/법령/환자안전법','published',now()),
('환자안전문화','환자안전','오류를 숨기기보다 보고하고 학습하며 개선하는 조직의 가치와 행동입니다.','공정한 보고문화와 리더십, 의사소통, 지속적인 개선이 핵심입니다.','국가법령정보센터 · 환자안전법','https://www.law.go.kr/법령/환자안전법','published',now()),
('표준주의','감염관리','감염 여부와 관계없이 모든 환자에게 적용하는 기본 감염예방 원칙입니다.','손위생, 개인보호구, 주사안전, 환경관리, 호흡기 예절 등을 포함합니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('접촉주의','감염관리','접촉으로 전파되는 감염병을 예방하기 위한 추가주의입니다.','상황에 따라 장갑과 가운을 사용하고 환자·환경 접촉 후 손위생을 철저히 합니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('비말주의','감염관리','기침·재채기 등 큰 호흡기 비말로 전파되는 감염을 예방하는 추가주의입니다.','환자와 가까운 거리에서 마스크 등 적절한 보호구를 사용합니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('공기주의','감염관리','공기 중 작은 입자를 통해 전파되는 감염을 예방하는 추가주의입니다.','음압격리와 호흡보호구 등 질환 특성에 맞는 조치가 필요합니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('손위생','감염관리','손에 있는 병원체를 제거하거나 줄이기 위한 손씻기 또는 손소독입니다.','환자 접촉 전후와 오염 가능성이 있는 행위 전후에 적절한 방법으로 수행합니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('감염관리','감염관리','감염 발생과 전파를 예방·감시·대응하는 조직적 활동입니다.','감시, 교육, 환경관리, 보호구, 항생제 적정사용, 유행 대응 등이 포함됩니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('감염병 감시','감염관리','감염병 발생정보를 지속적으로 수집·분석·해석하는 활동입니다.','유행을 조기에 발견하고 예방·대응정책을 결정하는 근거가 됩니다.','국가법령정보센터 · 감염병의 예방 및 관리에 관한 법률','https://www.law.go.kr/법령/감염병의예방및관리에관한법률','published',now()),
('역학조사','감염관리','감염병의 원인과 전파경로 및 접촉자를 파악하는 조사입니다.','확산 방지와 위험요인 제거를 위한 근거를 제공합니다.','국가법령정보센터 · 감염병의 예방 및 관리에 관한 법률','https://www.law.go.kr/법령/감염병의예방및관리에관한법률','published',now()),
('예방접종','감염관리','면역을 형성해 감염병 발생이나 중증화를 줄이는 예방수단입니다.','개인 보호와 함께 집단 수준의 전파 감소에 기여합니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('국민건강보험','건강보험','질병과 부상에 대한 의료비 부담을 사회적으로 분담하는 공적 보험제도입니다.','보험료와 국고지원 등을 재원으로 가입자의 의료이용 비용 일부를 보장합니다.','국가법령정보센터 · 국민건강보험법','https://www.law.go.kr/법령/국민건강보험법','published',now()),
('보험자','건강보험','건강보험을 운영하고 보험료·급여 등 보험업무를 수행하는 주체입니다.','우리나라 국민건강보험의 보험자는 국민건강보험공단입니다.','국가법령정보센터 · 국민건강보험법','https://www.law.go.kr/법령/국민건강보험법','published',now()),
('요양급여','건강보험','건강보험이 보장하는 진찰·검사·치료·간호 등 의료서비스입니다.','법령과 기준에 따라 급여범위와 비용부담이 정해집니다.','국가법령정보센터 · 국민건강보험법','https://www.law.go.kr/법령/국민건강보험법','published',now()),
('본인부담금','건강보험','건강보험 급여비용 중 환자가 직접 부담하는 금액입니다.','급여종류와 의료기관 및 대상자 조건 등에 따라 부담수준이 달라질 수 있습니다.','국민건강보험공단 · 건강보험 및 장기요양보험','https://www.nhis.or.kr','published',now()),
('비급여','건강보험','건강보험 급여대상에 포함되지 않아 환자가 비용을 부담하는 의료서비스입니다.','항목과 비용을 환자가 알 수 있도록 설명과 공개가 중요합니다.','국가법령정보센터 · 국민건강보험법','https://www.law.go.kr/법령/국민건강보험법','published',now()),
('건강보험심사평가원','건강보험','요양급여비용 심사와 의료의 질 적정성 평가 등을 수행하는 기관입니다.','건강보험 급여의 적정성과 의료서비스 질 향상을 지원합니다.','건강보험심사평가원 · 요양급여 적정성 평가','https://www.hira.or.kr','published',now()),
('요양급여 적정성 평가','건강보험','의료서비스가 적절하게 제공되는지 질과 결과를 평가하는 제도입니다.','평가결과를 공개하고 의료기관의 질 향상을 유도하는 데 활용됩니다.','건강보험심사평가원 · 요양급여 적정성 평가','https://www.hira.or.kr','published',now()),
('건강보험정책심의위원회','건강보험','건강보험 정책과 보험료·급여 등 주요 사항을 심의하는 위원회입니다.','가입자와 공급자, 공익 대표 등이 참여해 주요 건강보험 정책을 논의합니다.','국가법령정보센터 · 국민건강보험법','https://www.law.go.kr/법령/국민건강보험법','published',now()),
('노인장기요양보험','돌봄','고령이나 노인성 질병으로 일상생활이 어려운 사람의 돌봄을 지원하는 제도입니다.','신체활동과 가사활동 지원 등 장기요양급여를 제공합니다.','국가법령정보센터 · 노인장기요양보험법','https://www.law.go.kr/법령/노인장기요양보험법','published',now()),
('장기요양인정','돌봄','신청자의 심신상태와 일상생활 수행능력을 평가해 장기요양 대상 여부를 결정하는 절차입니다.','조사와 등급판정 절차를 거쳐 필요한 급여수준이 결정됩니다.','국가법령정보센터 · 노인장기요양보험법','https://www.law.go.kr/법령/노인장기요양보험법','published',now()),
('재가급여','돌봄','수급자가 가정이나 지역에서 받는 장기요양서비스입니다.','방문요양·방문간호·주야간보호 등 다양한 형태가 있습니다.','국가법령정보센터 · 노인장기요양보험법','https://www.law.go.kr/법령/노인장기요양보험법','published',now()),
('시설급여','돌봄','수급자가 장기요양기관에 입소해 받는 서비스입니다.','생활지원과 신체활동지원 등 지속적인 돌봄을 제공합니다.','국가법령정보센터 · 노인장기요양보험법','https://www.law.go.kr/법령/노인장기요양보험법','published',now()),
('통합돌봄','돌봄','의료·요양·돌봄·주거 서비스를 지역에서 연계해 제공하는 접근입니다.','대상자가 살던 곳에서 필요한 서비스를 연속적으로 받을 수 있도록 조정합니다.','보건복지부 · 보건의료 정책','https://www.mohw.go.kr','published',now()),
('의료기관 인증','의료의 질','의료기관의 환자안전과 의료서비스 질을 기준에 따라 평가하는 제도입니다.','조직 운영과 환자진료, 안전관리 체계가 기준에 맞는지 확인합니다.','국가법령정보센터 · 의료법','https://www.law.go.kr/법령/의료법','published',now()),
('의무기록','의료의 질','환자의 상태와 진료·간호 내용을 기록한 공식 문서입니다.','정확성과 적시성, 연속성, 보안이 중요합니다.','국가법령정보센터 · 의료법','https://www.law.go.kr/법령/의료법','published',now()),
('설명의무','의료의 질','환자가 치료나 검사에 대해 이해하고 결정할 수 있도록 필요한 정보를 제공하는 의무입니다.','위험과 대안 및 예상결과를 환자의 이해수준에 맞게 설명해야 합니다.','국가법령정보센터 · 의료법','https://www.law.go.kr/법령/의료법','published',now()),
('민감정보','개인정보','사생활 침해 위험이 커 특별한 보호가 필요한 개인정보입니다.','건강정보와 유전정보 등은 강화된 보호가 요구됩니다.','국가법령정보센터 · 개인정보 보호법','https://www.law.go.kr/법령/개인정보보호법','published',now()),
('가명정보','개인정보','추가정보 없이는 특정 개인을 알아볼 수 없도록 처리한 정보입니다.','통계·연구 등 법이 허용한 목적에서 안전조치와 함께 활용할 수 있습니다.','국가법령정보센터 · 개인정보 보호법','https://www.law.go.kr/법령/개인정보보호법','published',now()),
('최소수집','개인정보','목적 달성에 필요한 범위에서만 개인정보를 수집하는 원칙입니다.','불필요한 항목과 과도한 보관을 줄여 개인정보 침해 위험을 낮춥니다.','국가법령정보센터 · 개인정보 보호법','https://www.law.go.kr/법령/개인정보보호법','published',now()),
('접근통제','개인정보','허가된 사람만 정보나 시스템에 접근하도록 제한하는 보호조치입니다.','계정관리와 권한분리, 기록점검 등을 통해 정보노출을 줄입니다.','국가법령정보센터 · 개인정보 보호법','https://www.law.go.kr/법령/개인정보보호법','published',now()),
('근거기반 정책','정책기초','연구와 통계, 현장경험, 이해관계자 의견을 종합해 설계하는 정책입니다.','근거의 질과 적용가능성 및 형평성을 함께 검토합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('정책의제','정책기초','정부와 사회가 해결해야 할 공공문제로 공식 논의되는 사안입니다.','문제의 심각성, 사회적 관심, 정치적 가능성 등에 따라 의제로 형성됩니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('정책대안','정책기초','정책목표를 달성하기 위해 비교하는 여러 해결방안입니다.','효과와 비용, 형평성, 실행가능성, 수용성 등을 기준으로 평가합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('시범사업','정책기초','정책을 전면 시행하기 전에 제한된 범위에서 효과와 실행가능성을 검증하는 사업입니다.','성과와 부작용, 현장수용성, 확대조건을 확인하는 데 목적이 있습니다.','보건복지부 · 보건의료 정책','https://www.mohw.go.kr','published',now()),
('성과지표','정책평가','정책이나 사업의 진행과 결과를 측정하는 기준입니다.','투입·과정·산출·결과 지표를 목표와 연결해 구성합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('과정평가','정책평가','정책이 계획대로 수행됐는지 실행과정을 분석하는 평가입니다.','대상자 도달, 제공량, 실행충실도, 장애요인 등을 확인합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('결과평가','정책평가','정책이 목표한 변화와 영향을 만들었는지 확인하는 평가입니다.','건강결과와 이용, 비용, 형평성, 부작용 등을 측정합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('비용효과성','정책평가','투입비용에 비해 어느 정도의 건강효과를 얻는지 비교하는 개념입니다.','대안 간 자원배분을 판단할 때 효과와 비용을 함께 봅니다.','국가법령정보센터 · 국민건강보험법','https://www.law.go.kr/법령/국민건강보험법','published',now()),
('이해관계자','정책기초','정책의 영향을 받거나 정책결정에 영향을 주는 개인·집단·기관입니다.','환자, 가족, 보건의료인, 정부, 보험자, 지역사회 등이 포함될 수 있습니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('거버넌스','정책기초','정부와 기관·전문가·시민이 역할을 나누고 협력해 정책을 운영하는 방식입니다.','책임성과 투명성, 참여, 조정체계가 중요합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('위험소통','정책소통','건강위험과 대응방법을 국민과 이해관계자에게 전달하고 소통하는 활동입니다.','확인된 사실과 불확실성을 구분하고 신속·일관되게 안내해야 합니다.','질병관리청 · 감염병 정책','https://www.kdca.go.kr','published',now()),
('재난의료','보건의료','재난 상황에서 다수의 환자와 보건위기 대응을 위해 제공되는 의료체계입니다.','현장 대응과 이송, 병상·인력 조정, 기관 간 협력이 중요합니다.','보건복지부 · 보건의료 정책','https://www.mohw.go.kr','published',now()),
('보건의료 질','의료의 질','의료서비스가 안전하고 효과적이며 환자중심적으로 제공되는 정도입니다.','적시성·효율성·형평성도 질 평가의 주요 관점입니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('환자중심성','의료의 질','환자의 필요와 가치 및 선호를 존중해 진료와 정책에 반영하는 원칙입니다.','충분한 설명과 참여, 존중, 연속성 있는 서비스가 중요합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('접근성','보건의료','필요한 사람이 적절한 시간과 장소에서 서비스를 이용할 수 있는 정도입니다.','거리와 비용, 시간, 정보, 문화적 장벽을 함께 고려합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('의료의 연속성','의료의 질','여러 시점과 기관에서 환자정보와 서비스가 끊기지 않고 이어지는 특성입니다.','의뢰·회송과 기록공유, 담당자 간 의사소통이 중요합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('취약계층','보건의료','건강위험이나 서비스 접근 장벽이 상대적으로 큰 집단입니다.','정책 설계 시 필요와 장벽을 별도로 파악해 맞춤지원해야 합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('건강문해력','보건의료','건강정보를 찾고 이해하고 활용해 판단하는 능력입니다.','쉬운 언어와 명확한 안내, 이해확인 방식이 건강문해력을 지원합니다.','국가법령정보센터 · 보건의료기본법','https://www.law.go.kr/법령/보건의료기본법','published',now()),
('공공보건의료','보건의료','국가와 지방자치단체 등이 국민의 필수 보건의료를 보장하기 위해 제공·지원하는 활동입니다.','지역·필수의료와 취약계층 보호 및 재난대응 등이 중요한 영역입니다.','보건복지부 · 보건의료 정책','https://www.mohw.go.kr','published',now())
on conflict(term) do nothing;

-- 10. 정책국장 홈페이지 관리 -----------------------------------------------
create table if not exists public.site_configuration_v1(
  singleton_id smallint primary key default 1 check(singleton_id=1),
  config jsonb not null,updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
create table if not exists public.site_configuration_history_v1(
  id bigint generated by default as identity primary key,config jsonb not null,changed_by uuid references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.site_configuration_v1 enable row level security;
alter table public.site_configuration_history_v1 enable row level security;
insert into public.site_configuration_v1(singleton_id,config) values(1,'{
  "site_name":"대한간호학생회 부산","site_subtitle":"정책국 공식 홈페이지","utility_label":"대한간호학생회 부산 · 정책국",
  "home_title":"정책을 읽고 간호의 내일을 설계합니다.",
  "home_description":"간호정책을 쉽고 정확하게 전달하고 현장의 목소리를 연결하는 대한간호학생회 부산 정책국의 공식 공간입니다.",
  "footer_notice":"공개 게시물은 로그인 없이 열람할 수 있습니다.",
  "alert_title":"홈페이지 이용 안내","alert_body":"공개 메뉴는 로그인 없이 열람할 수 있습니다. 리더 기능은 이메일 인증과 가입 승인을 완료한 뒤 이용할 수 있습니다.",
  "popup":{"enabled":true,"title":"대한간호학생회 부산 정책국 홈페이지에 오신 것을 환영합니다","body":"본 홈페이지는 부산 정책국 리더들의 원활한 소통과 정책 정보 공유를 위해 운영됩니다. 로그인 또는 가입 신청을 진행해 주세요.","id_guide":"가입 시 입력한 이메일 주소를 사용합니다.","password_guide":"안전한 방식으로 변환하여 처리되며 운영자도 기존 비밀번호를 확인할 수 없습니다.","signup_guide":"이메일 인증과 임원의 승인을 완료하면 리더 홈을 이용할 수 있습니다."},
  "public_menu":{"about":{"label":"정책국 소개","visible":true},"notice":{"label":"공지사항","visible":true},"cards":{"label":"카드뉴스","visible":true},"policy":{"label":"정책 콘텐츠","visible":true},"glossary":{"label":"정책단어","visible":true},"news":{"label":"간호·정책 뉴스","visible":true},"schedule":{"label":"정책국 일정","visible":true}},
  "leader_menu":{"home":"리더 홈","schedule":"일정 확인","board":"익명 소통","quiz":"정책 퀴즈"}
}'::jsonb) on conflict(singleton_id) do nothing;

create or replace function public.is_policy_director_v1()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles where id=auth.uid() and approval_status='approved' and (system_role='policy_director' or regexp_replace(coalesce(position,''),'[[:space:]]+','','g')='정책국장'));
$$;
create or replace function public.get_site_config_public_v1()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$ select config from public.site_configuration_v1 where singleton_id=1; $$;
create or replace function public.get_site_config_admin_v1()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_config jsonb;v_history jsonb;
begin
  if not public.is_policy_director_v1() then raise exception '정책국장만 홈페이지 설정을 관리할 수 있습니다.'; end if;
  select config into v_config from public.site_configuration_v1 where singleton_id=1;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'created_at',h.created_at,'changed_by_name',coalesce(p.name,'정책국장')) order by h.id desc),'[]'::jsonb)
  into v_history from (select * from public.site_configuration_history_v1 order by id desc limit 20) h left join public.profiles p on p.id=h.changed_by;
  return jsonb_build_object('config',v_config,'history',v_history);
end; $$;
create or replace function public.save_site_config_v1(p_config jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old jsonb;
begin
  if not public.is_policy_director_v1() then raise exception '정책국장만 홈페이지 설정을 변경할 수 있습니다.'; end if;
  if jsonb_typeof(p_config)<>'object' then raise exception '설정 형식이 올바르지 않습니다.'; end if;
  if length(p_config::text)>50000 then raise exception '설정 내용이 너무 깁니다.'; end if;
  if btrim(coalesce(p_config->>'site_name',''))='' or btrim(coalesce(p_config->>'home_title',''))='' then raise exception '사이트 이름과 홈 제목은 비워둘 수 없습니다.'; end if;
  select config into v_old from public.site_configuration_v1 where singleton_id=1 for update;
  if v_old is not null then insert into public.site_configuration_history_v1(config,changed_by) values(v_old,auth.uid()); end if;
  insert into public.site_configuration_v1(singleton_id,config,updated_by,updated_at) values(1,p_config,auth.uid(),now())
  on conflict(singleton_id) do update set config=excluded.config,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end; $$;
create or replace function public.restore_site_config_v1(p_version_id bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_restore jsonb;v_current jsonb;
begin
  if not public.is_policy_director_v1() then raise exception '정책국장만 이전 설정을 복원할 수 있습니다.'; end if;
  select config into v_restore from public.site_configuration_history_v1 where id=p_version_id;
  if v_restore is null then raise exception '복원할 설정을 찾을 수 없습니다.'; end if;
  select config into v_current from public.site_configuration_v1 where singleton_id=1 for update;
  if v_current is not null then insert into public.site_configuration_history_v1(config,changed_by) values(v_current,auth.uid()); end if;
  update public.site_configuration_v1 set config=v_restore,updated_by=auth.uid(),updated_at=now() where singleton_id=1;
end; $$;

-- 11. 실행 권한 정리 -------------------------------------------------------
grant select on table public.content_posts to anon,authenticated;

revoke all on table public.leader_unavailable_submissions_v2 from anon,authenticated;
revoke all on table public.leader_unavailable_days_v2 from anon,authenticated;
revoke all on table public.policy_schedule_audit_v2 from anon,authenticated;
revoke all on table public.site_configuration_v1 from anon,authenticated;
revoke all on table public.site_configuration_history_v1 from anon,authenticated;

revoke all on function public.get_my_access() from public;
revoke all on function public.approve_leader(uuid,text,text,text) from public;
revoke all on function public.reject_member(uuid) from public;
revoke all on function public.update_leader_assignment(uuid,text,text,text) from public;
revoke all on function public.set_member_permissions(uuid,jsonb) from public;
revoke all on function public.list_manageable_leaders() from public;
revoke all on function public.save_content_draft(jsonb) from public;
revoke all on function public.submit_content(uuid) from public;
revoke all on function public.publish_content(uuid) from public;
revoke all on function public.reject_content(uuid,text) from public;
revoke all on function public.hide_content(uuid) from public;
revoke all on function public.list_content_management() from public;
revoke all on function public.create_anonymous_post(text,text) from public;
revoke all on function public.list_anonymous_posts() from public;
revoke all on function public.update_anonymous_post(uuid,text,text) from public;
revoke all on function public.delete_anonymous_post(uuid) from public;
revoke all on function public.create_anonymous_comment(uuid,text) from public;
revoke all on function public.list_anonymous_comments(uuid) from public;
revoke all on function public.delete_anonymous_comment(uuid) from public;
revoke all on function public.get_schedule_context_v2() from public;
revoke all on function public.submit_unavailable_month_v2(text,date,jsonb) from public;
revoke all on function public.get_my_unavailable_month_v2(text,date) from public;
revoke all on function public.list_unavailable_summary_v2(text,date) from public;
revoke all on function public.list_unavailable_details_v2(text,date) from public;
revoke all on function public.manager_set_unavailable_day_v2(uuid,text,date,text) from public;
revoke all on function public.create_policy_schedule_v2(text,date,time,time,text,text,text,text) from public;
revoke all on function public.list_policy_schedules_v2(date,date) from public;
revoke all on function public.list_public_policy_schedules_v2(date,date) from public;
revoke all on function public.manager_update_policy_schedule_v2(uuid,date,time,time,text,text,text,text) from public;
revoke all on function public.manager_delete_policy_schedule_v2(uuid) from public;
revoke all on function public.save_glossary_entry_v1(jsonb) from public;
revoke all on function public.list_glossary_management_v1() from public;
revoke all on function public.publish_glossary_entry_v1(uuid) from public;
revoke all on function public.hide_glossary_entry_v1(uuid) from public;
revoke all on function public.get_site_config_public_v1() from public;
revoke all on function public.get_site_config_admin_v1() from public;
revoke all on function public.save_site_config_v1(jsonb) from public;
revoke all on function public.restore_site_config_v1(bigint) from public;

grant execute on function public.get_my_access() to authenticated;
grant execute on function public.approve_leader(uuid,text,text,text) to authenticated;
grant execute on function public.list_manageable_leaders() to authenticated;
grant execute on function public.reject_member(uuid) to authenticated;
grant execute on function public.update_leader_assignment(uuid,text,text,text) to authenticated;
grant execute on function public.set_member_permissions(uuid,jsonb) to authenticated;
grant execute on function public.save_content_draft(jsonb) to authenticated;
grant execute on function public.submit_content(uuid) to authenticated;
grant execute on function public.publish_content(uuid) to authenticated;
grant execute on function public.reject_content(uuid,text) to authenticated;
grant execute on function public.hide_content(uuid) to authenticated;
grant execute on function public.list_content_management() to authenticated;
grant execute on function public.create_anonymous_post(text,text) to authenticated;
grant execute on function public.list_anonymous_posts() to authenticated;
grant execute on function public.update_anonymous_post(uuid,text,text) to authenticated;
grant execute on function public.delete_anonymous_post(uuid) to authenticated;
grant execute on function public.create_anonymous_comment(uuid,text) to authenticated;
grant execute on function public.list_anonymous_comments(uuid) to authenticated;
grant execute on function public.delete_anonymous_comment(uuid) to authenticated;
grant execute on function public.get_schedule_context_v2() to authenticated;
grant execute on function public.submit_unavailable_month_v2(text,date,jsonb) to authenticated;
grant execute on function public.get_my_unavailable_month_v2(text,date) to authenticated;
grant execute on function public.list_unavailable_summary_v2(text,date) to authenticated;
grant execute on function public.list_unavailable_details_v2(text,date) to authenticated;
grant execute on function public.manager_set_unavailable_day_v2(uuid,text,date,text) to authenticated;
grant execute on function public.create_policy_schedule_v2(text,date,time,time,text,text,text,text) to authenticated;
grant execute on function public.list_policy_schedules_v2(date,date) to authenticated;
grant execute on function public.list_public_policy_schedules_v2(date,date) to anon,authenticated;
grant execute on function public.manager_update_policy_schedule_v2(uuid,date,time,time,text,text,text,text) to authenticated;
grant execute on function public.manager_delete_policy_schedule_v2(uuid) to authenticated;
grant execute on function public.save_glossary_entry_v1(jsonb) to authenticated;
grant execute on function public.list_glossary_management_v1() to authenticated;
grant execute on function public.publish_glossary_entry_v1(uuid) to authenticated;
grant execute on function public.hide_glossary_entry_v1(uuid) to authenticated;
grant execute on function public.get_site_config_public_v1() to anon,authenticated;
grant execute on function public.get_site_config_admin_v1() to authenticated;
grant execute on function public.save_site_config_v1(jsonb) to authenticated;
grant execute on function public.restore_site_config_v1(bigint) to authenticated;

commit;
select 'final_integrated_update_ready' as check_name;

-- ============================================================================
-- 2026-08-01 추가 통합 보완
-- 1) 정책국 포함 모든 승인 리더의 참여 불가일 및 사유 등록
-- 2) 차기 정책국장도 운영 가능한 페이지별 블록 편집기
-- 3) 홈페이지 공개 일정 달력용 페이지 구성
-- ============================================================================
begin;

-- A. 모든 소속의 참여 불가일 및 사유 ---------------------------------------
alter table public.profiles drop constraint if exists profiles_availability_scope_check;
alter table public.profiles
  add constraint profiles_availability_scope_check
  check (availability_scope is null or availability_scope in ('policy_office','div1','div2'));

create or replace function public.resolve_availability_scope_v2(
  p_department text,
  p_position text,
  p_requested_position text,
  p_saved_scope text
)
returns text
language sql
immutable
as $$
  select case
    when p_saved_scope in ('policy_office','div1','div2') then p_saved_scope
    when public.normalize_department(p_department) in ('policy_office','div1','div2') then public.normalize_department(p_department)
    when regexp_replace(lower(coalesce(p_position,'')), '[[:space:]]+', '', 'g') like '%정책1부%' then 'div1'
    when regexp_replace(lower(coalesce(p_position,'')), '[[:space:]]+', '', 'g') like '%정책2부%' then 'div2'
    when regexp_replace(lower(coalesce(p_requested_position,'')), '[[:space:]]+', '', 'g') like '%정책1부%' then 'div1'
    when regexp_replace(lower(coalesce(p_requested_position,'')), '[[:space:]]+', '', 'g') like '%정책2부%' then 'div2'
    else 'policy_office'
  end;
$$;

update public.profiles
set availability_scope = public.resolve_availability_scope_v2(department, position, requested_position, availability_scope)
where availability_scope is null or availability_scope not in ('policy_office','div1','div2');

alter table public.leader_unavailable_submissions_v2
  drop constraint if exists leader_unavailable_submissions_v2_scope_check;
alter table public.leader_unavailable_submissions_v2
  add constraint leader_unavailable_submissions_v2_scope_check
  check (scope in ('policy_office','div1','div2'));

alter table public.leader_unavailable_days_v2
  add column if not exists reason_code text not null default 'personal';
alter table public.leader_unavailable_days_v2
  add column if not exists reason_detail text;
alter table public.leader_unavailable_days_v2
  drop constraint if exists leader_unavailable_days_v2_reason_code_check;
alter table public.leader_unavailable_days_v2
  add constraint leader_unavailable_days_v2_reason_code_check
  check (reason_code in ('personal','class','clinical','work','exam','family','health','other'));

create or replace function public.unavailable_reason_label_v3(p_reason_code text)
returns text
language sql
immutable
as $$
  select case p_reason_code
    when 'personal' then '개인 일정'
    when 'class' then '수업'
    when 'clinical' then '실습'
    when 'work' then '근무'
    when 'exam' then '시험'
    when 'family' then '가족 일정'
    when 'health' then '건강 사유'
    when 'other' then '기타'
    else '개인 일정'
  end;
$$;

create or replace function public.can_view_unavailable_v2(p_scope text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text;
  v_own_scope text;
  v_scope text := public.normalize_department(p_scope);
begin
  select system_role,
         public.resolve_availability_scope_v2(department,position,requested_position,availability_scope)
    into v_role,v_own_scope
  from public.profiles
  where id=auth.uid() and approval_status='approved' and system_role<>'external_admin';

  if v_role is null then return false; end if;
  if v_own_scope=v_scope then return true; end if;
  if v_role in ('policy_director','policy_general_manager') then return true; end if;
  if v_role='senior_manager_div1' and v_scope='div1' then return true; end if;
  if v_role='senior_manager_div2' and v_scope='div2' then return true; end if;

  return public.has_permission(
    case v_scope
      when 'policy_office' then 'schedule_manage_common'
      when 'div1' then 'schedule_manage_div1'
      else 'schedule_manage_div2'
    end,
    v_scope
  );
end;
$$;

create or replace function public.can_manage_unavailable_v2(p_scope text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text;
  v_scope text := public.normalize_department(p_scope);
begin
  select system_role into v_role
  from public.profiles
  where id=auth.uid() and approval_status='approved';

  if v_role is null then return false; end if;
  if v_role in ('policy_director','policy_general_manager') then return true; end if;
  if v_role='senior_manager_div1' and v_scope='div1' then return true; end if;
  if v_role='senior_manager_div2' and v_scope='div2' then return true; end if;

  return public.has_permission(
    case v_scope
      when 'policy_office' then 'schedule_manage_common'
      when 'div1' then 'schedule_manage_div1'
      else 'schedule_manage_div2'
    end,
    v_scope
  );
end;
$$;

create or replace function public.get_schedule_context_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  p public.profiles%rowtype;
  v_scope text;
  v_can_submit boolean;
  v_message text;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null then return null; end if;

  v_scope:=public.resolve_availability_scope_v2(p.department,p.position,p.requested_position,p.availability_scope);
  v_can_submit:=p.approval_status='approved' and p.system_role<>'external_admin' and v_scope in ('policy_office','div1','div2');
  v_message:=case
    when p.approval_status<>'approved' then '가입 승인 완료 후 일정 응답을 등록할 수 있습니다.'
    when p.system_role='external_admin' then '외부 관리자는 일정 응답 대상이 아닙니다.'
    else null
  end;

  return jsonb_build_object(
    'own_scope',v_scope,
    'can_submit',v_can_submit,
    'scope_message',v_message,
    'can_view_policy_office',public.can_view_unavailable_v2('policy_office'),
    'can_view_div1',public.can_view_unavailable_v2('div1'),
    'can_view_div2',public.can_view_unavailable_v2('div2'),
    'can_manage_policy_office',public.can_manage_unavailable_v2('policy_office'),
    'can_manage_div1',public.can_manage_unavailable_v2('div1'),
    'can_manage_div2',public.can_manage_unavailable_v2('div2'),
    'can_manage_common',public.can_manage_policy_schedule_v2('policy_office'),
    'can_create_schedule',public.is_approved_leader_v2()
  );
end;
$$;

create or replace function public.submit_unavailable_month_v2(p_scope text,p_month_start date,p_selections jsonb)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_scope text:=public.normalize_department(p_scope);
  v_month date:=date_trunc('month',p_month_start)::date;
  v_own_scope text;
  v_submission uuid;
  v_item jsonb;
  v_date date;
  v_reason_code text;
  v_reason_detail text;
  v_count int:=0;
begin
  if not public.is_approved_leader_v2() then raise exception '승인된 리더만 제출할 수 있습니다.'; end if;
  if v_scope not in ('policy_office','div1','div2') then raise exception '소속이 올바르지 않습니다.'; end if;

  select public.resolve_availability_scope_v2(department,position,requested_position,availability_scope)
  into v_own_scope
  from public.profiles where id=auth.uid();

  if v_own_scope is distinct from v_scope then raise exception '본인 소속의 불가능한 날짜만 제출할 수 있습니다.'; end if;
  if exists(
    select 1 from public.leader_unavailable_submissions_v2
    where leader_id=auth.uid() and scope=v_scope and month_start=v_month
  ) then
    raise exception '이 달 일정 응답은 이미 제출했습니다. 변경이 필요하면 소속 수석부장이나 정책총괄부장에게 요청해 주세요.';
  end if;
  if jsonb_typeof(coalesce(p_selections,'[]'::jsonb))<>'array' then raise exception '날짜 형식이 올바르지 않습니다.'; end if;

  insert into public.leader_unavailable_submissions_v2(leader_id,scope,month_start)
  values(auth.uid(),v_scope,v_month)
  returning id into v_submission;

  for v_item in select * from jsonb_array_elements(coalesce(p_selections,'[]'::jsonb)) loop
    v_date:=(v_item->>'date')::date;
    v_reason_code:=coalesce(nullif(v_item->>'reason_code',''),'personal');
    v_reason_detail:=nullif(btrim(coalesce(v_item->>'reason_detail','')),'');

    if v_date<v_month or v_date>=(v_month+interval '1 month')::date then
      raise exception '선택한 날짜가 해당 월을 벗어났습니다.';
    end if;
    if v_reason_code not in ('personal','class','clinical','work','exam','family','health','other') then
      raise exception '불가능 사유가 올바르지 않습니다.';
    end if;
    if length(coalesce(v_reason_detail,''))>120 then raise exception '추가 사유는 120자 이내로 입력해 주세요.'; end if;

    insert into public.leader_unavailable_days_v2(submission_id,unavailable_date,reason_code,reason_detail)
    values(v_submission,v_date,v_reason_code,v_reason_detail)
    on conflict(submission_id,unavailable_date) do update
      set reason_code=excluded.reason_code,reason_detail=excluded.reason_detail;
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.get_my_unavailable_month_v2(p_scope text,p_month_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_scope text:=public.normalize_department(p_scope);
  v_month date:=date_trunc('month',p_month_start)::date;
  v_submission public.leader_unavailable_submissions_v2%rowtype;
  v_days jsonb;
begin
  if not public.is_approved_leader_v2() then raise exception '승인된 리더만 확인할 수 있습니다.'; end if;
  select * into v_submission
  from public.leader_unavailable_submissions_v2
  where leader_id=auth.uid() and scope=v_scope and month_start=v_month;

  if v_submission.id is null then
    return jsonb_build_object('submitted',false,'selections','[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date',unavailable_date,
        'reason_code',reason_code,
        'reason_label',public.unavailable_reason_label_v3(reason_code),
        'reason_detail',reason_detail
      ) order by unavailable_date
    ),
    '[]'::jsonb
  ) into v_days
  from public.leader_unavailable_days_v2
  where submission_id=v_submission.id;

  return jsonb_build_object(
    'submitted',true,
    'submitted_at',v_submission.submitted_at,
    'selections',v_days
  );
end;
$$;

drop function if exists public.list_unavailable_details_v2(text,date);
create function public.list_unavailable_details_v2(p_scope text,p_schedule_date date)
returns table(
  leader_id uuid,
  leader_name text,
  leader_position_title text,
  status text,
  reason_code text,
  reason_label text,
  reason_detail text
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_scope text:=public.normalize_department(p_scope);
  v_month date:=date_trunc('month',p_schedule_date)::date;
  v_can_manage boolean:=public.can_manage_unavailable_v2(v_scope);
begin
  if not public.can_view_unavailable_v2(v_scope) then
    raise exception '상세 일정 현황을 확인할 권한이 없습니다.';
  end if;

  return query
  select
    p.id,
    p.name,
    coalesce(nullif(p.position,''),public.default_position_for_role(p.system_role)),
    case when u.unavailable_date is null then 'available' else 'unavailable' end,
    u.reason_code,
    case when u.unavailable_date is null then null else public.unavailable_reason_label_v3(u.reason_code) end,
    case when v_can_manage then u.reason_detail else null end
  from public.leader_unavailable_submissions_v2 s
  join public.profiles p on p.id=s.leader_id
  left join public.leader_unavailable_days_v2 u
    on u.submission_id=s.id and u.unavailable_date=p_schedule_date
  where s.scope=v_scope and s.month_start=v_month
  order by
    case when u.unavailable_date is null then 1 else 0 end,
    p.name;
end;
$$;

create or replace function public.manager_set_unavailable_day_v3(
  p_target_user_id uuid,
  p_scope text,
  p_schedule_date date,
  p_status text,
  p_reason_code text default 'personal',
  p_reason_detail text default null
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_scope text:=public.normalize_department(p_scope);
  v_month date:=date_trunc('month',p_schedule_date)::date;
  v_submission uuid;
  v_reason_code text:=coalesce(nullif(p_reason_code,''),'personal');
begin
  if not public.can_manage_unavailable_v2(v_scope) then raise exception '일정 응답 수정 권한이 없습니다.'; end if;
  select id into v_submission
  from public.leader_unavailable_submissions_v2
  where leader_id=p_target_user_id and scope=v_scope and month_start=v_month;

  if v_submission is null then raise exception '해당 리더가 이 달 일정을 제출하지 않았습니다.'; end if;

  if p_status='unavailable' then
    if v_reason_code not in ('personal','class','clinical','work','exam','family','health','other') then
      raise exception '불가능 사유가 올바르지 않습니다.';
    end if;
    insert into public.leader_unavailable_days_v2(submission_id,unavailable_date,reason_code,reason_detail)
    values(v_submission,p_schedule_date,v_reason_code,nullif(btrim(coalesce(p_reason_detail,'')),''))
    on conflict(submission_id,unavailable_date) do update
      set reason_code=excluded.reason_code,reason_detail=excluded.reason_detail;
  elsif p_status='available' then
    delete from public.leader_unavailable_days_v2
    where submission_id=v_submission and unavailable_date=p_schedule_date;
  else
    raise exception '일정 상태가 올바르지 않습니다.';
  end if;

  update public.leader_unavailable_submissions_v2
  set updated_at=now()
  where id=v_submission;
end;
$$;

create or replace function public.manager_set_unavailable_day_v2(
  p_target_user_id uuid,p_scope text,p_schedule_date date,p_status text
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  perform public.manager_set_unavailable_day_v3(
    p_target_user_id,p_scope,p_schedule_date,p_status,'personal',null
  );
end;
$$;

-- B. 페이지별 블록 편집기 ---------------------------------------------------
create table if not exists public.page_layouts_v1(
  page_key text primary key,
  page_label text not null,
  layout jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_layout_history_v1(
  id bigint generated by default as identity primary key,
  page_key text not null,
  snapshot jsonb not null,
  changed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.page_layouts_v1 enable row level security;
alter table public.page_layout_history_v1 enable row level security;

create or replace function public.page_key_allowed_v1(p_page_key text)
returns boolean
language sql
immutable
as $$
  select p_page_key in (
    'home','about','notice','cards','policy','glossary','news','schedule',
    'dashboard','internal-schedule','board','quiz','article'
  );
$$;

insert into public.page_layouts_v1(page_key,page_label,layout)
values
('home','홈페이지',jsonb_build_object(
  'page_key','home','page_label','홈페이지','access_level','public',
  'hero',jsonb_build_object('eyebrow','POLICY DIVISION · BUSAN','title','정책을 읽고 간호의 내일을 설계합니다.','description','간호정책을 쉽고 정확하게 전달하고 현장의 목소리를 연결하는 대한간호학생회 부산 정책국의 공식 공간입니다.','visible',true),
  'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),
  'blocks',jsonb_build_array(
    jsonb_build_object(
      'id','home-policy-calendar','type','schedule_calendar','visible',true,
      'title','정책국 일정','description','확정된 정책국·정책1부·정책2부 일정을 한눈에 확인하세요.',
      'show_filters',true,'upcoming_count',5,'variant','clean','accent','#1976c9'
    )
  ),
  'popups','[]'::jsonb
)),
('about','정책국 소개',jsonb_build_object('page_key','about','page_label','정책국 소개','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('notice','공지사항',jsonb_build_object('page_key','notice','page_label','공지사항','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('cards','카드뉴스',jsonb_build_object('page_key','cards','page_label','카드뉴스','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('policy','정책 콘텐츠',jsonb_build_object('page_key','policy','page_label','정책 콘텐츠','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('glossary','정책단어',jsonb_build_object('page_key','glossary','page_label','정책단어','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('news','간호·정책 뉴스',jsonb_build_object('page_key','news','page_label','간호·정책 뉴스','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('schedule','정책국 일정',jsonb_build_object('page_key','schedule','page_label','정책국 일정','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('dashboard','리더 홈',jsonb_build_object('page_key','dashboard','page_label','리더 홈','access_level','leaders','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#f5f8fc','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('internal-schedule','일정 확인',jsonb_build_object('page_key','internal-schedule','page_label','일정 확인','access_level','leaders','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#f5f8fc','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('board','익명 소통',jsonb_build_object('page_key','board','page_label','익명 소통','access_level','leaders','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#f5f8fc','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('quiz','정책 퀴즈',jsonb_build_object('page_key','quiz','page_label','정책 퀴즈','access_level','leaders','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#f5f8fc','content_width','wide','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb)),
('article','게시글 상세',jsonb_build_object('page_key','article','page_label','게시글 상세','access_level','public','hero',jsonb_build_object('visible',true),'design',jsonb_build_object('accent','#1976c9','background','#ffffff','content_width','narrow','replace_base_content',false,'section_style','soft'),'blocks','[]'::jsonb,'popups','[]'::jsonb))
on conflict(page_key) do nothing;

create or replace function public.get_page_layout_public_v1(p_page_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_layout jsonb;
  v_access text;
begin
  if not public.page_key_allowed_v1(p_page_key) then return null; end if;
  select layout,coalesce(layout->>'access_level','public')
  into v_layout,v_access
  from public.page_layouts_v1
  where page_key=p_page_key;

  if v_layout is null then return null; end if;
  if v_access='leaders' and not public.is_approved_leader_v2() then return null; end if;
  if v_access='executives' and not public.is_executive_v2() then return null; end if;
  return v_layout;
end;
$$;

create or replace function public.list_page_layouts_admin_v1()
returns table(page_key text,page_label text,updated_at timestamptz)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_policy_director_v1() then raise exception '정책국장만 페이지를 관리할 수 있습니다.'; end if;
  return query
  select p.page_key,p.page_label,p.updated_at
  from public.page_layouts_v1 p
  order by case p.page_key
    when 'home' then 1 when 'about' then 2 when 'notice' then 3 when 'cards' then 4
    when 'policy' then 5 when 'glossary' then 6 when 'news' then 7 when 'schedule' then 8
    when 'dashboard' then 9 when 'internal-schedule' then 10 when 'board' then 11 when 'quiz' then 12
    else 99 end;
end;
$$;

create or replace function public.get_page_layout_admin_v1(p_page_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_layout jsonb;
  v_label text;
  v_history jsonb;
  v_pages jsonb;
begin
  if not public.is_policy_director_v1() then raise exception '정책국장만 페이지를 관리할 수 있습니다.'; end if;
  if not public.page_key_allowed_v1(p_page_key) then raise exception '편집할 수 없는 페이지입니다.'; end if;

  select layout,page_label into v_layout,v_label
  from public.page_layouts_v1 where page_key=p_page_key;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',h.id,'created_at',h.created_at,'changed_by_name',coalesce(p.name,'정책국장')
  ) order by h.id desc),'[]'::jsonb)
  into v_history
  from (
    select * from public.page_layout_history_v1
    where page_key=p_page_key
    order by id desc limit 30
  ) h
  left join public.profiles p on p.id=h.changed_by;

  select coalesce(jsonb_agg(jsonb_build_object(
    'page_key',l.page_key,'page_label',l.page_label,'updated_at',l.updated_at
  ) order by l.page_label),'[]'::jsonb)
  into v_pages
  from public.page_layouts_v1 l;

  return jsonb_build_object(
    'page_key',p_page_key,
    'page_label',v_label,
    'layout',v_layout,
    'history',v_history,
    'pages',v_pages
  );
end;
$$;

create or replace function public.save_page_layout_v1(p_page_key text,p_layout jsonb)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_old jsonb;
  v_label text;
  v_blocks jsonb;
  v_popups jsonb;
begin
  if not public.is_policy_director_v1() then raise exception '정책국장만 페이지를 변경할 수 있습니다.'; end if;
  if not public.page_key_allowed_v1(p_page_key) then raise exception '편집할 수 없는 페이지입니다.'; end if;
  if jsonb_typeof(p_layout)<>'object' then raise exception '페이지 설정 형식이 올바르지 않습니다.'; end if;
  if length(p_layout::text)>200000 then raise exception '페이지 내용이 너무 큽니다.'; end if;

  v_blocks:=coalesce(p_layout->'blocks','[]'::jsonb);
  v_popups:=coalesce(p_layout->'popups','[]'::jsonb);
  if jsonb_typeof(v_blocks)<>'array' then raise exception '페이지 블록 형식이 올바르지 않습니다.'; end if;
  if jsonb_array_length(v_blocks)>80 then raise exception '페이지 블록은 최대 80개까지 등록할 수 있습니다.'; end if;
  if jsonb_typeof(v_popups)<>'array' then raise exception '팝업 형식이 올바르지 않습니다.'; end if;
  if jsonb_array_length(v_popups)>20 then raise exception '페이지별 팝업은 최대 20개까지 등록할 수 있습니다.'; end if;

  select layout,page_label into v_old,v_label
  from public.page_layouts_v1
  where page_key=p_page_key
  for update;

  if v_old is not null then
    insert into public.page_layout_history_v1(page_key,snapshot,changed_by)
    values(p_page_key,v_old,auth.uid());
  end if;

  insert into public.page_layouts_v1(page_key,page_label,layout,updated_by,updated_at)
  values(
    p_page_key,
    coalesce(nullif(btrim(p_layout->>'page_label'),''),v_label,p_page_key),
    p_layout || jsonb_build_object('page_key',p_page_key),
    auth.uid(),now()
  )
  on conflict(page_key) do update
    set page_label=excluded.page_label,
        layout=excluded.layout,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at;
end;
$$;

create or replace function public.restore_page_layout_v1(p_version_id bigint)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_history public.page_layout_history_v1%rowtype;
  v_current jsonb;
begin
  if not public.is_policy_director_v1() then raise exception '정책국장만 이전 버전을 복원할 수 있습니다.'; end if;
  select * into v_history from public.page_layout_history_v1 where id=p_version_id;
  if v_history.id is null then raise exception '복원할 페이지 버전을 찾을 수 없습니다.'; end if;

  select layout into v_current from public.page_layouts_v1 where page_key=v_history.page_key for update;
  if v_current is not null then
    insert into public.page_layout_history_v1(page_key,snapshot,changed_by)
    values(v_history.page_key,v_current,auth.uid());
  end if;

  update public.page_layouts_v1
  set layout=v_history.snapshot,updated_by=auth.uid(),updated_at=now()
  where page_key=v_history.page_key;
end;
$$;

-- 정책국장 전용 공개 이미지 저장소
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'site-media','site-media',true,5242880,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict(id) do update
set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists site_media_public_read_v1 on storage.objects;
create policy site_media_public_read_v1
on storage.objects for select
to public
using(bucket_id='site-media');

drop policy if exists site_media_director_insert_v1 on storage.objects;
create policy site_media_director_insert_v1
on storage.objects for insert
to authenticated
with check(bucket_id='site-media' and public.is_policy_director_v1());

drop policy if exists site_media_director_update_v1 on storage.objects;
create policy site_media_director_update_v1
on storage.objects for update
to authenticated
using(bucket_id='site-media' and public.is_policy_director_v1())
with check(bucket_id='site-media' and public.is_policy_director_v1());

drop policy if exists site_media_director_delete_v1 on storage.objects;
create policy site_media_director_delete_v1
on storage.objects for delete
to authenticated
using(bucket_id='site-media' and public.is_policy_director_v1());

-- 직접 테이블 접근은 차단하고 안전한 RPC만 공개
revoke all on table public.page_layouts_v1 from anon,authenticated;
revoke all on table public.page_layout_history_v1 from anon,authenticated;

revoke all on function public.manager_set_unavailable_day_v3(uuid,text,date,text,text,text) from public;
revoke all on function public.get_page_layout_public_v1(text) from public;
revoke all on function public.list_page_layouts_admin_v1() from public;
revoke all on function public.get_page_layout_admin_v1(text) from public;
revoke all on function public.save_page_layout_v1(text,jsonb) from public;
revoke all on function public.restore_page_layout_v1(bigint) from public;

grant execute on function public.list_unavailable_details_v2(text,date) to authenticated;
grant execute on function public.manager_set_unavailable_day_v3(uuid,text,date,text,text,text) to authenticated;
grant execute on function public.get_page_layout_public_v1(text) to anon,authenticated;
grant execute on function public.list_page_layouts_admin_v1() to authenticated;
grant execute on function public.get_page_layout_admin_v1(text) to authenticated;
grant execute on function public.save_page_layout_v1(text,jsonb) to authenticated;
grant execute on function public.restore_page_layout_v1(bigint) to authenticated;

commit;
select 'page_editor_home_calendar_unavailable_reason_ready' as check_name;
