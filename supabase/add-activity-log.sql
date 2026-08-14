-- 在已经执行 schema.sql 和 upgrade-goals-and-subgoals.sql 的项目中运行。
-- 记录所有通过网站 RPC 完成的任务、目标和小目标操作。

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.members(id) on delete set null,
  actor_name text not null,
  entity_type text not null check (entity_type in ('task','goal','sub_goal')),
  entity_id uuid not null,
  entity_title text not null,
  action text not null check (action in ('created','updated','status_changed','deleted')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);
create index if not exists activity_logs_entity_idx
  on public.activity_logs (entity_type, entity_id, created_at desc);

alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from anon, authenticated;

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
    'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('assignees',coalesce((select jsonb_agg(ta.member_id) from public.task_assignees ta where ta.task_id=t.id),'[]'::jsonb)) order by t.created_at desc) from public.tasks t),'[]'::jsonb),
    'activity_logs',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from public.activity_logs order by created_at desc limit 50) a),'[]'::jsonb)
  );
end $$;

create or replace function public.create_planner_task(session_token text, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}', task_description text default '', sub_goal_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_task public.tasks; assignee uuid;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  insert into public.tasks(title,description,due_at,priority,goal_id,sub_goal_id,created_by)
  values(trim(task_title),trim(task_description),due_at,task_priority,goal_id,sub_goal_id,me.id) returning * into new_task;
  foreach assignee in array assignee_ids loop insert into public.task_assignees values(new_task.id,assignee) on conflict do nothing; end loop;
  insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action)
  values(me.id,me.name,'task',new_task.id,new_task.title,'created');
  return jsonb_build_object('id',new_task.id);
end $$;

create or replace function public.update_planner_task(session_token text, task_id uuid, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}', task_description text default '', sub_goal_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; old_task public.tasks; assignee uuid; change_set jsonb := '{}'::jsonb; old_assignees uuid[]; normalized_assignees uuid[];
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  select * into old_task from public.tasks where id=task_id for update;
  if old_task.id is null then raise exception '任务不存在'; end if;
  select coalesce(array_agg(member_id order by member_id),'{}'::uuid[]) into old_assignees from public.task_assignees where task_assignees.task_id=update_planner_task.task_id;
  select coalesce(array_agg(member_id_value order by member_id_value),'{}'::uuid[]) into normalized_assignees
  from unnest(assignee_ids) as assignee_values(member_id_value);

  if old_task.title is distinct from trim(task_title) then change_set := change_set || jsonb_build_object('title',jsonb_build_object('old',old_task.title,'new',trim(task_title))); end if;
  if old_task.description is distinct from trim(task_description) then change_set := change_set || jsonb_build_object('description',jsonb_build_object('old',old_task.description,'new',trim(task_description))); end if;
  if old_task.due_at is distinct from update_planner_task.due_at then change_set := change_set || jsonb_build_object('due_at',jsonb_build_object('old',old_task.due_at,'new',update_planner_task.due_at)); end if;
  if old_task.priority is distinct from task_priority then change_set := change_set || jsonb_build_object('priority',jsonb_build_object('old',old_task.priority,'new',task_priority)); end if;
  if old_task.goal_id is distinct from update_planner_task.goal_id then change_set := change_set || jsonb_build_object('goal_id',jsonb_build_object('old',old_task.goal_id,'new',update_planner_task.goal_id)); end if;
  if old_task.sub_goal_id is distinct from update_planner_task.sub_goal_id then change_set := change_set || jsonb_build_object('sub_goal_id',jsonb_build_object('old',old_task.sub_goal_id,'new',update_planner_task.sub_goal_id)); end if;
  if old_assignees is distinct from normalized_assignees then change_set := change_set || jsonb_build_object('assignees',jsonb_build_object('old',to_jsonb(old_assignees),'new',to_jsonb(normalized_assignees))); end if;

  update public.tasks t set title=trim(task_title),description=trim(task_description),due_at=update_planner_task.due_at,priority=task_priority,goal_id=update_planner_task.goal_id,sub_goal_id=update_planner_task.sub_goal_id where t.id=update_planner_task.task_id;
  delete from public.task_assignees where task_assignees.task_id=update_planner_task.task_id;
  foreach assignee in array assignee_ids loop insert into public.task_assignees values(update_planner_task.task_id,assignee) on conflict do nothing; end loop;
  if change_set <> '{}'::jsonb then
    insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action,changes)
    values(me.id,me.name,'task',old_task.id,trim(task_title),'updated',change_set);
  end if;
end $$;

create or replace function public.set_planner_task_status(session_token text, task_id uuid, new_status text)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; old_task public.tasks;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  select * into old_task from public.tasks where id=task_id for update;
  if old_task.id is null then raise exception '任务不存在'; end if;
  if old_task.status is not distinct from new_status then return; end if;
  update public.tasks set status=new_status,completed_at=case when new_status='done' then now() else null end where id=task_id;
  insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action,changes)
  values(me.id,me.name,'task',old_task.id,old_task.title,'status_changed',jsonb_build_object('status',jsonb_build_object('old',old_task.status,'new',new_status)));
end $$;

create or replace function public.delete_planner_task(session_token text, task_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; old_task public.tasks;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  select * into old_task from public.tasks where id=task_id for update;
  if old_task.id is null then raise exception '任务不存在'; end if;
  insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action)
  values(me.id,me.name,'task',old_task.id,old_task.title,'deleted');
  delete from public.tasks where id=task_id;
end $$;

create or replace function public.create_planner_goal(session_token text, goal_title text, goal_description text default '', due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_goal public.goals;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  insert into public.goals(title,description,due_at,created_by) values(trim(goal_title),trim(goal_description),due_at,me.id) returning * into new_goal;
  insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action)
  values(me.id,me.name,'goal',new_goal.id,new_goal.title,'created');
  return jsonb_build_object('id',new_goal.id);
end $$;

create or replace function public.update_planner_goal(session_token text, goal_id uuid, goal_title text, goal_description text default '', due_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; old_goal public.goals; change_set jsonb := '{}'::jsonb;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  select * into old_goal from public.goals where id=goal_id for update;
  if old_goal.id is null then raise exception '目标不存在'; end if;
  if old_goal.title is distinct from trim(goal_title) then change_set := change_set || jsonb_build_object('title',jsonb_build_object('old',old_goal.title,'new',trim(goal_title))); end if;
  if old_goal.description is distinct from trim(goal_description) then change_set := change_set || jsonb_build_object('description',jsonb_build_object('old',old_goal.description,'new',trim(goal_description))); end if;
  if old_goal.due_at is distinct from update_planner_goal.due_at then change_set := change_set || jsonb_build_object('due_at',jsonb_build_object('old',old_goal.due_at,'new',update_planner_goal.due_at)); end if;
  update public.goals g set title=trim(goal_title),description=trim(goal_description),due_at=update_planner_goal.due_at where g.id=update_planner_goal.goal_id;
  if change_set <> '{}'::jsonb then
    insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action,changes)
    values(me.id,me.name,'goal',old_goal.id,trim(goal_title),'updated',change_set);
  end if;
end $$;

create or replace function public.delete_planner_goal(session_token text, goal_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; old_goal public.goals;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  select * into old_goal from public.goals where id=goal_id for update;
  if old_goal.id is null then raise exception '目标不存在'; end if;
  insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action)
  values(me.id,me.name,'goal',old_goal.id,old_goal.title,'deleted');
  delete from public.goals where id=goal_id;
end $$;

create or replace function public.create_planner_sub_goal(session_token text, goal_id uuid, sub_goal_title text, sub_goal_description text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_sub public.sub_goals;
begin
  select * into me from public.member_for_token(session_token); if me.id is null then raise exception '会话已失效'; end if;
  insert into public.sub_goals(goal_id,title,description) values(goal_id,trim(sub_goal_title),trim(sub_goal_description)) returning * into new_sub;
  insert into public.activity_logs(actor_id,actor_name,entity_type,entity_id,entity_title,action)
  values(me.id,me.name,'sub_goal',new_sub.id,new_sub.title,'created');
  return jsonb_build_object('id',new_sub.id);
end $$;

grant execute on function public.get_workspace_snapshot(text) to anon;
grant execute on function public.create_planner_task(text,text,timestamptz,text,uuid,uuid[],text,uuid) to anon;
grant execute on function public.update_planner_task(text,uuid,text,timestamptz,text,uuid,uuid[],text,uuid) to anon;
grant execute on function public.set_planner_task_status(text,uuid,text) to anon;
grant execute on function public.delete_planner_task(text,uuid) to anon;
grant execute on function public.create_planner_goal(text,text,text,timestamptz) to anon;
grant execute on function public.update_planner_goal(text,uuid,text,text,timestamptz) to anon;
grant execute on function public.delete_planner_goal(text,uuid) to anon;
grant execute on function public.create_planner_sub_goal(text,uuid,text,text) to anon;
