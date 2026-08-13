-- 在 Supabase SQL Editor 中完整运行一次。
create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  role text not null default 'member' check (role in ('admin','member')),
  session_token_hash text unique,
  joined_at timestamptz not null default now()
);

alter table public.members add column if not exists auth_user_id uuid unique;
alter table public.members add column if not exists email text;

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references public.members(id),
  expires_at timestamptz not null,
  max_uses integer not null default 10 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  active boolean not null default true
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  due_at timestamptz,
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  due_at timestamptz,
  goal_id uuid references public.goals(id) on delete set null,
  created_by uuid not null references public.members(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (task_id, member_id)
);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('due_3d','due_24h','due_today','overdue_1','overdue_2','overdue_3')),
  provider_id text,
  sent_at timestamptz not null default now(),
  unique(task_id, member_id, reminder_kind)
);

alter table public.members enable row level security;
alter table public.invite_codes enable row level security;
alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.reminder_deliveries enable row level security;

revoke all on public.members, public.invite_codes, public.goals, public.tasks, public.task_assignees from anon, authenticated;
revoke all on public.reminder_deliveries from anon, authenticated;

create or replace function public.redeem_invite(invite_code text, display_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_invite public.invite_codes; v_token text; v_member public.members;
begin
  select * into v_invite from public.invite_codes where upper(code)=upper(trim(invite_code)) for update;
  if v_invite.id is null or not v_invite.active or v_invite.expires_at <= now() or v_invite.uses >= v_invite.max_uses then
    raise exception '邀请码无效、已过期或次数已用完';
  end if;
  if char_length(trim(display_name)) < 1 or char_length(trim(display_name)) > 30 then raise exception '名字长度应为 1–30 个字符'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  select * into v_member from public.members where role='admin' and session_token_hash is null order by joined_at limit 1 for update;
  if v_member.id is not null then
    update public.members set name=trim(display_name), session_token_hash=encode(extensions.digest(v_token,'sha256'),'hex') where id=v_member.id returning * into v_member;
  else
    insert into public.members(name, role, session_token_hash) values(trim(display_name),'member',encode(extensions.digest(v_token,'sha256'),'hex')) returning * into v_member;
  end if;
  update public.invite_codes set uses=uses+1 where id=v_invite.id;
  return jsonb_build_object('session_token',v_token,'member_name',v_member.name,'role',v_member.role);
end $$;

create or replace function public.join_with_verified_email(invite_code text, display_name text)
returns jsonb language plpgsql security definer set search_path=public,auth,extensions as $$
declare v_uid uuid; v_email text; v_invite public.invite_codes; v_token text; v_member public.members;
begin
  v_uid := auth.uid(); v_email := auth.jwt()->>'email';
  if v_uid is null or v_email is null then raise exception '请先完成邮箱验证'; end if;
  select * into v_member from public.members where auth_user_id=v_uid for update;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  if v_member.id is not null then
    update public.members set session_token_hash=encode(extensions.digest(v_token,'sha256'),'hex') where id=v_member.id returning * into v_member;
    return jsonb_build_object('session_token',v_token,'member_name',v_member.name,'role',v_member.role);
  end if;
  select * into v_invite from public.invite_codes where upper(code)=upper(trim(invite_code)) for update;
  if v_invite.id is null or not v_invite.active or v_invite.expires_at<=now() or v_invite.uses>=v_invite.max_uses then raise exception '邀请码无效、已过期或次数已用完'; end if;
  select * into v_member from public.members where role='admin' and auth_user_id is null order by joined_at limit 1 for update;
  if v_member.id is not null then
    update public.members set name=trim(display_name),email=lower(v_email),auth_user_id=v_uid,session_token_hash=encode(extensions.digest(v_token,'sha256'),'hex') where id=v_member.id returning * into v_member;
  else
    insert into public.members(name,role,email,auth_user_id,session_token_hash) values(trim(display_name),'member',lower(v_email),v_uid,encode(extensions.digest(v_token,'sha256'),'hex')) returning * into v_member;
  end if;
  update public.invite_codes set uses=uses+1 where id=v_invite.id;
  return jsonb_build_object('session_token',v_token,'member_name',v_member.name,'role',v_member.role);
end $$;

create or replace function public.member_for_token(session_token text)
returns public.members language sql stable security definer set search_path=public as $$
  select * from public.members where session_token_hash=encode(extensions.digest(session_token,'sha256'),'hex') limit 1
$$;

create or replace function public.get_workspace_snapshot(session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  return jsonb_build_object(
    'member', jsonb_build_object('id',me.id,'name',me.name,'role',me.role),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'role',m.role,'joined_at',m.joined_at) order by m.joined_at) from public.members m),'[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.goals g),'[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('assignees',coalesce((select jsonb_agg(ta.member_id) from public.task_assignees ta where ta.task_id=t.id),'[]'::jsonb)) order by t.created_at desc) from public.tasks t),'[]'::jsonb)
  );
end $$;

create or replace function public.create_planner_task(session_token text, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_task public.tasks; assignee uuid;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  insert into public.tasks(title,due_at,priority,goal_id,created_by) values(trim(task_title),due_at,task_priority,goal_id,me.id) returning * into new_task;
  foreach assignee in array assignee_ids loop insert into public.task_assignees values(new_task.id,assignee) on conflict do nothing; end loop;
  return jsonb_build_object('id',new_task.id);
end $$;

create or replace function public.set_planner_task_status(session_token text, task_id uuid, new_status text)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  update public.tasks set status=new_status, completed_at=case when new_status='done' then now() else null end where id=task_id;
end $$;

create or replace function public.delete_planner_task(session_token text, task_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  delete from public.tasks where id=task_id;
end $$;

create or replace function public.update_planner_task(session_token text, task_id uuid, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; assignee uuid;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  update public.tasks t set title=trim(task_title), due_at=update_planner_task.due_at, priority=task_priority, goal_id=update_planner_task.goal_id where t.id=update_planner_task.task_id;
  delete from public.task_assignees where task_assignees.task_id=update_planner_task.task_id;
  foreach assignee in array assignee_ids loop insert into public.task_assignees values(update_planner_task.task_id,assignee) on conflict do nothing; end loop;
end $$;

create or replace function public.create_planner_goal(session_token text, goal_title text, goal_description text default '', due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_goal public.goals;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  insert into public.goals(title,description,due_at,created_by) values(trim(goal_title),trim(goal_description),due_at,me.id) returning * into new_goal;
  return jsonb_build_object('id',new_goal.id);
end $$;

create or replace function public.delete_planner_goal(session_token text, goal_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if; delete from public.goals where id=goal_id;
end $$;

grant execute on function public.redeem_invite(text,text) to anon;
grant execute on function public.join_with_verified_email(text,text) to authenticated;
grant execute on function public.get_workspace_snapshot(text) to anon;
grant execute on function public.create_planner_task(text,text,timestamptz,text,uuid,uuid[]) to anon;
grant execute on function public.update_planner_task(text,uuid,text,timestamptz,text,uuid,uuid[]) to anon;
grant execute on function public.set_planner_task_status(text,uuid,text) to anon;
grant execute on function public.delete_planner_task(text,uuid) to anon;
grant execute on function public.create_planner_goal(text,text,text,timestamptz) to anon;
grant execute on function public.delete_planner_goal(text,uuid) to anon;

-- 首位管理员与首个邀请码。管理员的临时会话令牌请在首次正式登录流程完成后轮换。
do $$ declare admin_id uuid; begin
  if not exists(select 1 from public.members where role='admin') then
    insert into public.members(name,role) values('林野','admin') returning id into admin_id;
    insert into public.invite_codes(code,created_by,expires_at,max_uses) values('KHKH-0826',admin_id,now()+interval '7 days',10);
  end if;
end $$;
