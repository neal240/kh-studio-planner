const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(projectUrl && publishableKey);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!projectUrl || !publishableKey) throw new Error("Supabase 尚未配置");
  const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.message || data?.error || "连接 Supabase 失败");
  return data as T;
}

export type WorkspaceSnapshot = {
  member: { id: string; name: string; role: "admin" | "member" };
  members: Array<{
    id: string;
    name: string;
    role: "admin" | "member";
    joined_at: string;
  }>;
  goals: Array<{
    id: string;
    title: string;
    description: string;
    due_at: string | null;
  }>;
  sub_goals: Array<{
    id: string;
    goal_id: string;
    title: string;
    description: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: "todo" | "doing" | "done";
    priority: "high" | "medium" | "low";
    due_at: string | null;
    goal_id: string | null;
    sub_goal_id: string | null;
    assignees: string[];
  }>;
  activity_logs: Array<{
    id: string;
    actor_id: string | null;
    actor_name: string;
    entity_type: "task" | "goal" | "sub_goal";
    entity_id: string;
    entity_title: string;
    action: "created" | "updated" | "status_changed" | "deleted";
    changes: Record<string, { old: unknown; new: unknown }>;
    created_at: string;
  }>;
};

export const plannerApi = {
  redeemInvite: (code: string, name: string) =>
    request<{ session_token: string; member_name: string; role: string }>(
      "rpc/redeem_invite",
      {
        method: "POST",
        body: JSON.stringify({ invite_code: code, display_name: name }),
      },
    ),
  snapshot: (token: string) =>
    request<WorkspaceSnapshot>("rpc/get_workspace_snapshot", {
      method: "POST",
      body: JSON.stringify({ session_token: token }),
    }),
  createTask: (
    token: string,
    task: {
      title: string;
      description?: string;
      dueAt?: string;
      priority?: string;
      goalId?: string;
      subGoalId?: string;
      assignees?: string[];
    },
  ) =>
    request<{ id: string }>("rpc/create_planner_task", {
      method: "POST",
      body: JSON.stringify({
        session_token: token,
        task_title: task.title,
        due_at: task.dueAt ?? null,
        task_priority: task.priority ?? "medium",
        goal_id: task.goalId ?? null,
        assignee_ids: task.assignees ?? [],
        task_description: task.description ?? "",
        sub_goal_id: task.subGoalId ?? null,
      }),
    }),
  updateTask: (
    token: string,
    taskId: string,
    task: {
      title: string;
      description?: string;
      dueAt?: string;
      priority?: string;
      goalId?: string;
      subGoalId?: string;
      assignees?: string[];
    },
  ) =>
    request<void>("rpc/update_planner_task", {
      method: "POST",
      body: JSON.stringify({
        session_token: token,
        task_id: taskId,
        task_title: task.title,
        due_at: task.dueAt ?? null,
        task_priority: task.priority ?? "medium",
        goal_id: task.goalId ?? null,
        assignee_ids: task.assignees ?? [],
        task_description: task.description ?? "",
        sub_goal_id: task.subGoalId ?? null,
      }),
    }),
  setTaskStatus: (
    token: string,
    taskId: string,
    status: "todo" | "doing" | "done",
  ) =>
    request<void>("rpc/set_planner_task_status", {
      method: "POST",
      body: JSON.stringify({
        session_token: token,
        task_id: taskId,
        new_status: status,
      }),
    }),
  deleteTask: (token: string, taskId: string) =>
    request<void>("rpc/delete_planner_task", {
      method: "POST",
      body: JSON.stringify({ session_token: token, task_id: taskId }),
    }),
  createGoal: (
    token: string,
    title: string,
    description: string,
    dueAt?: string,
  ) =>
    request<{ id: string }>("rpc/create_planner_goal", {
      method: "POST",
      body: JSON.stringify({
        session_token: token,
        goal_title: title,
        goal_description: description,
        due_at: dueAt || null,
      }),
    }),
  updateGoal: (
    token: string,
    goalId: string,
    title: string,
    description: string,
    dueAt?: string,
  ) =>
    request<void>("rpc/update_planner_goal", {
      method: "POST",
      body: JSON.stringify({
        session_token: token,
        goal_id: goalId,
        goal_title: title,
        goal_description: description,
        due_at: dueAt || null,
      }),
    }),
  createSubGoal: (
    token: string,
    goalId: string,
    title: string,
    description: string,
  ) =>
    request<{ id: string }>("rpc/create_planner_sub_goal", {
      method: "POST",
      body: JSON.stringify({
        session_token: token,
        goal_id: goalId,
        sub_goal_title: title,
        sub_goal_description: description,
      }),
    }),
  deleteGoal: (token: string, goalId: string) =>
    request<void>("rpc/delete_planner_goal", {
      method: "POST",
      body: JSON.stringify({ session_token: token, goal_id: goalId }),
    }),
};
