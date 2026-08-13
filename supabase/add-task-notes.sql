drop function if exists public.create_planner_task(text,text,timestamptz,text,uuid,uuid[]);
drop function if exists public.update_planner_task(text,uuid,text,timestamptz,text,uuid,uuid[]);

create or replace function public.create_planner_task(session_token text, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}', task_description text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.members; new_task public.tasks; assignee uuid;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  insert into public.tasks(title,description,due_at,priority,goal_id,created_by) values(trim(task_title),trim(task_description),due_at,task_priority,goal_id,me.id) returning * into new_task;
  foreach assignee in array assignee_ids loop insert into public.task_assignees values(new_task.id,assignee) on conflict do nothing; end loop;
  return jsonb_build_object('id',new_task.id);
end $$;

create or replace function public.update_planner_task(session_token text, task_id uuid, task_title text, due_at timestamptz default null, task_priority text default 'medium', goal_id uuid default null, assignee_ids uuid[] default '{}', task_description text default '')
returns void language plpgsql security definer set search_path=public as $$
declare me public.members; assignee uuid;
begin
  select * into me from public.member_for_token(session_token);
  if me.id is null then raise exception '会话已失效'; end if;
  update public.tasks t set title=trim(task_title), description=trim(task_description), due_at=update_planner_task.due_at, priority=task_priority, goal_id=update_planner_task.goal_id where t.id=update_planner_task.task_id;
  delete from public.task_assignees where task_assignees.task_id=update_planner_task.task_id;
  foreach assignee in array assignee_ids loop insert into public.task_assignees values(update_planner_task.task_id,assignee) on conflict do nothing; end loop;
end $$;

grant execute on function public.create_planner_task(text,text,timestamptz,text,uuid,uuid[],text) to anon;
grant execute on function public.update_planner_task(text,uuid,text,timestamptz,text,uuid,uuid[],text) to anon;
