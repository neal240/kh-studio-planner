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
  if (!response.ok) throw new Error(data?.message || data?.error || "连接 Supabase 失败");
  return data as T;
}

export type WorkspaceSnapshot = {
  member: { id: string; name: string; role: "admin" | "member" };
  members: Array<{ id: string; name: string; role: "admin" | "member"; joined_at: string }>;
  goals: Array<{ id: string; title: string; description: string; due_at: string | null }>;
  tasks: Array<{
    id: string; title: string; status: "todo" | "doing" | "done";
    priority: "high" | "medium" | "low"; due_at: string | null;
    goal_id: string | null; assignees: string[];
  }>;
};

export const plannerApi = {
  redeemInvite: (code: string, name: string) => request<{ session_token: string; member_name: string; role: string }>("rpc/redeem_invite", {
    method: "POST", body: JSON.stringify({ invite_code: code, display_name: name }),
  }),
  snapshot: (token: string) => request<WorkspaceSnapshot>("rpc/get_workspace_snapshot", {
    method: "POST", body: JSON.stringify({ session_token: token }),
  }),
  createTask: (token: string, task: { title: string; dueAt?: string; priority?: string; goalId?: string; assignees?: string[] }) => request<{ id: string }>("rpc/create_planner_task", {
    method: "POST", body: JSON.stringify({ session_token: token, task_title: task.title, due_at: task.dueAt ?? null, task_priority: task.priority ?? "medium", goal_id: task.goalId ?? null, assignee_ids: task.assignees ?? [] }),
  }),
  updateTask: (token: string, taskId: string, task: { title: string; dueAt?: string; priority?: string; goalId?: string; assignees?: string[] }) => request<void>("rpc/update_planner_task", {
    method: "POST", body: JSON.stringify({ session_token: token, task_id: taskId, task_title: task.title, due_at: task.dueAt ?? null, task_priority: task.priority ?? "medium", goal_id: task.goalId ?? null, assignee_ids: task.assignees ?? [] }),
  }),
  setTaskStatus: (token: string, taskId: string, status: "todo" | "doing" | "done") => request<void>("rpc/set_planner_task_status", {
    method: "POST", body: JSON.stringify({ session_token: token, task_id: taskId, new_status: status }),
  }),
  deleteTask: (token: string, taskId: string) => request<void>("rpc/delete_planner_task", {
    method: "POST", body: JSON.stringify({ session_token: token, task_id: taskId }),
  }),
  createGoal: (token: string, title: string, description: string, dueAt?: string) => request<{ id: string }>("rpc/create_planner_goal", {
    method: "POST", body: JSON.stringify({ session_token: token, goal_title: title, goal_description: description, due_at: dueAt || null }),
  }),
  deleteGoal: (token: string, goalId: string) => request<void>("rpc/delete_planner_goal", {
    method: "POST", body: JSON.stringify({ session_token: token, goal_id: goalId }),
  }),
};
