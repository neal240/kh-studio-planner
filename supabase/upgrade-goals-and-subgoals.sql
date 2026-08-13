create table if not exists public.sub_goals (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);
alter table public.tasks add column if not exists sub_goal_id uuid references public.sub_goals(id) on delete set null;
alter table public.sub_goals enable row level security;
revoke all on public.sub_goals from anon, authenticated;

create or replace function public.get_workspace_snapshot(session_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  return jsonb_build_object(
    'member',jsonb_build_object('id',me.id,'name',me.name,'role',me.role),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'role',m.role,'joined_at',m.joined_at) order by m.joined_at) from public.members m),'[]'::jsonb),
    'goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.goals g),'[]'::jsonb),
    'sub_goals',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.sub_goals s),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('assignees',coalesce((select jsonb_agg(ta.member_id) from public.task_assignees ta where ta.task_id=t.id),'[]'::jsonb)) order by t.created_at desc) from public.tasks t),'[]'::jsonb)
  );
end $$;

create or replace function public.update_planner_goal(session_token text, goal_id uuid, goal_title text, goal_description text default '', due_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  update public.goals g set title=trim(goal_title),description=trim(goal_description),due_at=update_planner_goal.due_at where g.id=update_planner_goal.goal_id;
end $$;

create or replace function public.create_planner_sub_goal(session_token text, goal_id uuid, sub_goal_title text, sub_goal_description text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_sub public.sub_goals;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  insert into public.sub_goals(goal_id,title,description) values(goal_id,trim(sub_goal_title),trim(sub_goal_description)) returning * into new_sub;
  return jsonb_build_object('id',new_sub.id);
end $$;

drop function if exists public.create_planner_task(text,text,timestamptz,text,uuid,uuid[],text);
drop function if exists public.update_planner_task(text,uuid,text,timestamptz,text,uuid,uuid[],text);
create or replace function public.create_planner_task(session_token text, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}', task_description text default '', sub_goal_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_task public.tasks; assignee uuid;
begin
 select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
 insert into public.tasks(title,description,due_at,priority,goal_id,sub_goal_id,created_by) values(trim(task_title),trim(task_description),due_at,task_priority,goal_id,sub_goal_id,me.id) returning * into new_task;
 foreach assignee in array assignee_ids loop insert into public.task_assignees values(new_task.id,assignee) on conflict do nothing; end loop; return jsonb_build_object('id',new_task.id);
end $$;
create or replace function public.update_planner_task(session_token text, task_id uuid, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}', task_description text default '', sub_goal_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; assignee uuid;
begin
 select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
 update public.tasks t set title=trim(task_title),description=trim(task_description),due_at=update_planner_task.due_at,priority=task_priority,goal_id=update_planner_task.goal_id,sub_goal_id=update_planner_task.sub_goal_id where t.id=update_planner_task.task_id;
 delete from public.task_assignees where task_assignees.task_id=update_planner_task.task_id; foreach assignee in array assignee_ids loop insert into public.task_assignees values(update_planner_task.task_id,assignee) on conflict do nothing; end loop;
end $$;
grant execute on function public.update_planner_goal(text,uuid,text,text,timestamptz) to anon;
grant execute on function public.create_planner_sub_goal(text,uuid,text,text) to anon;
grant execute on function public.create_planner_task(text,text,timestamptz,text,uuid,uuid[],text,uuid) to anon;
grant execute on function public.update_planner_task(text,uuid,text,timestamptz,text,uuid,uuid[],text,uuid) to anon;
