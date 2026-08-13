"use client";

import { useEffect, useState } from "react";
import { plannerApi, supabaseConfigured, type WorkspaceSnapshot } from "../lib/supabase";
import {
  joinWithVerifiedEmail,
  loginWithVerifiedEmail,
  sendEmailCode,
  verifyEmailCode,
} from "../lib/auth";

type Status = "todo" | "doing" | "done";
type View = "list" | "board" | "calendar";
type Section = "workspace" | "goals" | "members";
type Goal = {
  id: string;
  title: string;
  description: string;
  dueAt: string | null;
};
type SubGoal = {
  id: string;
  goalId: string;
  title: string;
  description: string;
};
type TeamMember = {
  id: string;
  name: string;
  role: "admin" | "member";
  joinedAt: string;
};
type Task = {
  id: number | string;
  title: string;
  description?: string;
  status: Status;
  date: string;
  priority: "高" | "中" | "低";
  assignees: string[];
  goalId?: number | string;
  subGoalId?: string;
};

const initialTasks: Task[] = [
  {
    id: 1,
    title: "确认序章关卡流程",
    status: "done",
    date: "2026-08-12",
    priority: "高",
    assignees: ["林野", "阿澈"],
    goalId: 1,
  },
  {
    id: 2,
    title: "完成主角三视图",
    status: "doing",
    date: "2026-08-14",
    priority: "高",
    assignees: ["小满"],
    goalId: 1,
  },
  {
    id: 3,
    title: "整理战斗数值表 v1",
    status: "doing",
    date: "2026-08-15",
    priority: "中",
    assignees: ["阿澈", "林野"],
    goalId: 1,
  },
  {
    id: 4,
    title: "搭建第一张测试地图",
    status: "todo",
    date: "2026-08-18",
    priority: "中",
    assignees: ["林野"],
    goalId: 1,
  },
  {
    id: 5,
    title: "录制环境音效参考",
    status: "todo",
    date: "2026-08-20",
    priority: "低",
    assignees: ["小满"],
    goalId: 1,
  },
  {
    id: 6,
    title: "周五试玩会准备",
    status: "todo",
    date: "2026-08-21",
    priority: "高",
    assignees: ["林野", "阿澈", "小满"],
  },
];

const members = ["林野", "阿澈", "小满"];
const statusLabel: Record<Status, string> = {
  todo: "待开始",
  doing: "进行中",
  done: "已完成",
};

function getHeaderCopy(now: Date) {
  const hour = now.getHours();
  const date = `${new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now)}，${now.getMonth() + 1}月${now.getDate()}日`;

  if (hour >= 1 && hour < 6) {
    return { date, greeting: "凌晨好", subtitle: "还在熬夜？" };
  }
  if (hour < 12) {
    return { date, greeting: "早上好", subtitle: "今天也一起把重要的事情向前推一点。" };
  }
  if (hour < 18) {
    return { date, greeting: "下午好", subtitle: "下午也继续把重要的事情向前推一点。" };
  }
  return { date, greeting: "晚上好", subtitle: "辛苦一天了，也别忘了适当休息。" };
}

export default function Home() {
  const [view, setView] = useState<View>("list");
  const [section, setSection] = useState<Section>("workspace");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [modal, setModal] = useState<"task" | "invite" | null>(null);
  const [title, setTitle] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("全部任务");
  const [session, setSession] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "join">("login");
  const [authStep, setAuthStep] = useState<"details" | "code">("details");
  const [pendingJoin, setPendingJoin] = useState({
    email: "",
    name: "",
    code: "",
  });
  const [currentName, setCurrentName] = useState("成员");
  const [currentMemberId, setCurrentMemberId] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [taskHasDueDate, setTaskHasDueDate] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [subGoals, setSubGoals] = useState<SubGoal[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [goalModal, setGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [subGoalModal, setSubGoalModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [connectionState, setConnectionState] = useState<"loading" | "online" | "offline">("loading");
  const [now, setNow] = useState(() => new Date());
  const headerCopy = getHeaderCopy(now);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const saved = localStorage.getItem("kh_planner_session");
    if (!saved || !supabaseConfigured) return;
    setSession(saved);
    const cached = localStorage.getItem("kh_planner_workspace_cache");
    if (cached) {
      try { applyWorkspace(JSON.parse(cached) as WorkspaceSnapshot, false); } catch { localStorage.removeItem("kh_planner_workspace_cache"); }
    }
    restoreWorkspace(saved);
  }, []);
  useEffect(() => {
    if (!session) return;
    const retry = () => { if (navigator.onLine) restoreWorkspace(session); };
    window.addEventListener("online", retry);
    const timer = window.setInterval(() => { if (connectionState === "offline" && navigator.onLine) restoreWorkspace(session); }, 15000);
    return () => { window.removeEventListener("online", retry); window.clearInterval(timer); };
  }, [session, connectionState]);

  async function restoreWorkspace(token: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await loadWorkspace(token);
        setConnectionState("online");
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/会话已失效|session.*invalid|unauthorized/i.test(message)) {
          localStorage.removeItem("kh_planner_session");
          localStorage.removeItem("kh_planner_workspace_cache");
          setSession(null);
          return;
        }
        if (attempt < 2)
          await new Promise((resolve) =>
            setTimeout(resolve, 700 * (attempt + 1)),
          );
      }
    }
    setConnectionState("offline");
    setToast("网络暂时不可用，正在显示上次同步的数据");
  }

  async function loadWorkspace(token: string) {
    const data = await plannerApi.snapshot(token);
    applyWorkspace(data, true);
    setConnectionState("online");
  }

  function applyWorkspace(data: WorkspaceSnapshot, persist: boolean) {
    if (persist) localStorage.setItem("kh_planner_workspace_cache", JSON.stringify(data));
    setCurrentName(data.member.name);
    setCurrentMemberId(data.member.id);
    setGoals(
      data.goals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        dueAt: g.due_at,
      })),
    );
    setSubGoals(
      (data.sub_goals || []).map((g) => ({
        id: g.id,
        goalId: g.goal_id,
        title: g.title,
        description: g.description,
      })),
    );
    setTeam(
      data.members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        joinedAt: m.joined_at,
      })),
    );
    setTasks(
      data.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || "",
        status: t.status,
        date: t.due_at?.slice(0, 10) || "",
        priority:
          t.priority === "high" ? "高" : t.priority === "low" ? "低" : "中",
        assignees: t.assignees.map(
          (id) => data.members.find((m) => m.id === id)?.name || "未知成员",
        ),
        goalId: t.goal_id || undefined,
        subGoalId: t.sub_goal_id || undefined,
      })),
    );
  }

  async function joinWorkspace(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setJoining(true);
    setJoinError("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const name = String(form.get("name") || "");
    const code = String(form.get("code") || "");
    try {
      await sendEmailCode(email, authMode === "join");
      setPendingJoin({ email, name, code });
      setAuthStep("code");
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        /failed to fetch|fetch failed|network/i.test(error.message)
      ) {
        setPendingJoin({ email, name, code });
        setAuthStep("code");
        return;
      }
      setJoinError(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setJoining(false);
    }
  }

  async function verifyAndJoin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setJoining(true);
    setJoinError("");
    const form = new FormData(e.currentTarget);
    try {
      const accessToken = await verifyEmailCode(
        pendingJoin.email,
        String(form.get("otp")),
      );
      const joined =
        authMode === "login"
          ? await loginWithVerifiedEmail(accessToken)
          : await joinWithVerifiedEmail(
              accessToken,
              pendingJoin.code,
              pendingJoin.name,
            );
      localStorage.setItem("kh_planner_session", joined.session_token);
      setSession(joined.session_token);
      setCurrentName(joined.member_name);
      await loadWorkspace(joined.session_token);
      setToast(
        authMode === "login"
          ? "登录成功"
          : joined.role === "admin"
            ? "管理员账号创建成功"
            : "已加入空括号工作室",
      );
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "验证失败");
    } finally {
      setJoining(false);
    }
  }

  const currentGoal = goals[0];
  const goalTasks = currentGoal
    ? tasks.filter((t) => t.goalId === currentGoal.id)
    : [];
  const done = goalTasks.filter((t) => t.status === "done").length;
  const progress = goalTasks.length
    ? Math.round((done / goalTasks.length) * 100)
    : 0;
  const daysLeft = currentGoal?.dueAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(currentGoal.dueAt).getTime() - Date.now()) / 86400000,
        ),
      )
    : null;
  const visible =
    filter === "我负责的"
      ? tasks.filter((t) => t.assignees.includes(currentName))
      : filter === "即将到期"
        ? tasks.filter(
            (t) =>
              Boolean(t.date) && t.date <= "2026-08-15" && t.status !== "done",
          )
        : tasks;

  function changeTaskStatus(id: number | string, next: Status) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === next) return;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: next } : t)));
    if (session && typeof id === "string") {
      plannerApi.setTaskStatus(session, id, next).catch(() => {
        setToast("同步失败，请稍后重试");
        loadWorkspace(session);
      });
    }
  }
  function toggleTask(id: number | string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    changeTaskStatus(id, task.status === "done" ? "todo" : "done");
  }
  async function deleteTask(id: number | string) {
    const task = tasks.find((t) => t.id === id);
    if (
      !task ||
      !window.confirm(`确定删除“${task.title}”吗？此操作会同步给所有成员。`)
    )
      return;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    if (session && typeof id === "string") {
      try {
        await plannerApi.deleteTask(session, id);
        setToast("任务已删除");
      } catch {
        setToast("删除失败，任务已恢复");
        await loadWorkspace(session);
      }
    } else {
      setToast("示例任务已删除");
    }
  }
  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const taskTitle = title.trim();
    const description = String(form.get("description") || "").trim();
    const dueAt = taskHasDueDate ? String(form.get("dueAt") || "") : "";
    const priorityLabel = String(form.get("priority")) as "高" | "中" | "低";
    const status = String(form.get("status")) as Status;
    const includeGoal = form.get("includeGoal") === "on";
    const subGoalId = includeGoal
      ? String(form.get("subGoalId") || "") || undefined
      : undefined;
    const selectedNames = team
      .filter((m) => selectedAssignees.includes(m.id))
      .map((m) => m.name);
    setTasks((ts) => [
      ...ts,
      {
        id: Date.now(),
        title: taskTitle,
        description,
        status,
        date: dueAt,
        priority: priorityLabel,
        assignees: selectedNames,
        goalId: includeGoal ? currentGoal?.id : undefined,
        subGoalId,
      },
    ]);
    setTitle("");
    setModal(null);
    setToast("任务已加入大目标");
    if (session) {
      try {
        const created = await plannerApi.createTask(session, {
          title: taskTitle,
          description,
          dueAt: dueAt || undefined,
          priority:
            priorityLabel === "高"
              ? "high"
              : priorityLabel === "低"
                ? "low"
                : "medium",
          goalId: includeGoal ? currentGoal?.id : undefined,
          subGoalId,
          assignees: selectedAssignees,
        });
        if (status !== "todo") {
          await plannerApi.setTaskStatus(session, created.id, status);
        }
        await loadWorkspace(session);
      } catch {
        setToast("任务保存在本机，但云端同步失败");
      }
    }
  }

  function openNewTask() {
    setEditingTask(null);
    setTitle("");
    setTaskHasDueDate(true);
    setSelectedAssignees(currentMemberId ? [currentMemberId] : []);
    setModal("task");
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setTitle(task.title);
    setTaskHasDueDate(Boolean(task.date));
    setSelectedAssignees(
      team
        .filter((member) => task.assignees.includes(member.name))
        .map((member) => member.id),
    );
    setModal("task");
  }

  async function saveTask(e: React.FormEvent) {
    if (!editingTask) return addTask(e);
    e.preventDefault();
    if (!title.trim()) return;
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const description = String(form.get("description") || "").trim();
    const dueAt = taskHasDueDate ? String(form.get("dueAt") || "") : "";
    const priority = String(form.get("priority")) as Task["priority"];
    const status = String(form.get("status")) as Status;
    const includeGoal = form.get("includeGoal") === "on";
    const subGoalId = includeGoal
      ? String(form.get("subGoalId") || "") || undefined
      : undefined;
    const assignees = team.length
      ? team
          .filter((member) => selectedAssignees.includes(member.id))
          .map((member) => member.name)
      : editingTask.assignees;
    const updated: Task = {
      ...editingTask,
      title: title.trim(),
      description,
      date: dueAt,
      priority,
      status,
      assignees,
      goalId: includeGoal ? currentGoal?.id : undefined,
      subGoalId,
    };
    setTasks((items) =>
      items.map((task) => (task.id === updated.id ? updated : task)),
    );
    setModal(null);
    setEditingTask(null);
    setTitle("");
    setToast("任务已更新");
    if (session && typeof updated.id === "string") {
      try {
        await plannerApi.updateTask(session, updated.id, {
          title: updated.title,
          description,
          dueAt: dueAt || undefined,
          priority:
            priority === "高" ? "high" : priority === "低" ? "low" : "medium",
          goalId: includeGoal ? currentGoal?.id : undefined,
          subGoalId,
          assignees: selectedAssignees,
        });
        if (status !== editingTask.status) {
          await plannerApi.setTaskStatus(session, updated.id, status);
        }
        await loadWorkspace(session);
      } catch {
        setToast("更新失败，任务已恢复");
        await loadWorkspace(session);
      }
    }
  }

  async function addGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session) return;
    const form = new FormData(e.currentTarget);
    try {
      if (editingGoal)
        await plannerApi.updateGoal(
          session,
          editingGoal.id,
          String(form.get("title")),
          String(form.get("description")),
          String(form.get("dueAt")),
        );
      else
        await plannerApi.createGoal(
          session,
          String(form.get("title")),
          String(form.get("description")),
          String(form.get("dueAt")),
        );
      await loadWorkspace(session);
      setGoalModal(false);
      setEditingGoal(null);
      setToast(editingGoal ? "大目标已更新" : "大目标已创建");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "创建失败");
    }
  }

  async function deleteGoal(id: string) {
    if (!session || !window.confirm("确定删除这个大目标吗？关联任务会保留。"))
      return;
    try {
      await plannerApi.deleteGoal(session, id);
      await loadWorkspace(session);
      setToast("大目标已删除");
    } catch {
      setToast("删除失败");
    }
  }

  async function addSubGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parentGoal = editingGoal || currentGoal;
    if (!session || !parentGoal) return;
    const form = new FormData(e.currentTarget);
    try {
      await plannerApi.createSubGoal(
        session,
        parentGoal.id,
        String(form.get("title")),
        String(form.get("description")),
      );
      await loadWorkspace(session);
      setSubGoalModal(false);
      setEditingGoal(null);
      setToast("小目标已创建");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "创建小目标失败");
    }
  }

  if (supabaseConfigured && !session) {
    return (
      <JoinScreen
        mode={authMode}
        changeMode={(mode) => {
          setAuthMode(mode);
          setAuthStep("details");
          setJoinError("");
        }}
        submit={joinWorkspace}
        verify={verifyAndJoin}
        step={authStep}
        back={() => {
          setAuthStep("details");
          setJoinError("");
        }}
        email={pendingJoin.email}
        loading={joining}
        error={joinError}
      />
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">()</span>
          <span>
            空括号工作室<span className="muted">XXXX</span>
          </span>
        </div>
        <nav>
          <button
            className={section === "workspace" ? "nav-active" : ""}
            onClick={() => setSection("workspace")}
          >
            <Icon name="home" />
            工作台
          </button>
          <button
            className={section === "goals" ? "nav-active" : ""}
            onClick={() => setSection("goals")}
          >
            <Icon name="target" />
            大目标
          </button>
          <button
            className={section === "members" ? "nav-active" : ""}
            onClick={() => setSection("members")}
          >
            <Icon name="users" />
            团队成员
          </button>
        </nav>
        <div className="side-bottom">
          <button onClick={() => setModal("invite")}>
            <Icon name="plus" />
            邀请成员
          </button>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            <Icon name={theme === "light" ? "moon" : "sun"} />
            {theme === "light" ? "切换深色" : "切换浅色"}
          </button>
          <div className="profile">
            <div className="avatar">{currentName[0]}</div>
            <div>
              <b>{currentName}</b>
              <span>工作室成员</span>
            </div>
            <span className="more">•••</span>
          </div>
        </div>
      </aside>

      <section className="content">
        {section === "goals" ? (
          <GoalsPage
            goals={goals}
            subGoals={subGoals}
            tasks={tasks}
            add={() => {
              setEditingGoal(null);
              setGoalModal(true);
            }}
            edit={(goal) => {
              setEditingGoal(goal);
              setGoalModal(true);
            }}
            remove={deleteGoal}
            addSubGoal={(goal) => { setEditingGoal(goal); setSubGoalModal(true); }}
          />
        ) : section === "members" ? (
          <MembersPage members={team} invite={() => setModal("invite")} />
        ) : (
          <>
            <header>
              <div>
                <p className="eyebrow">{headerCopy.date}</p>
                <h1>{headerCopy.greeting}，{currentName}</h1>
                <p>{headerCopy.subtitle}</p>
              </div>
              <div className="header-actions">
                <span className={`connection-badge ${connectionState}`}>{connectionState === "online" ? "已同步" : connectionState === "offline" ? "离线 · 正在重连" : "正在同步"}</span>
                <button
                  className="icon-btn"
                  onClick={() => setToast("浏览器提醒已开启")}
                  aria-label="开启提醒"
                >
                  <Icon name="bell" />
                  <i />
                </button>
                <button className="primary" onClick={openNewTask}>
                  <Icon name="plus" />
                  新建任务
                </button>
              </div>
            </header>

            <div className="workspace-grid">
              <div className="workspace-main">
                {currentGoal ? (
                  <section className="goal-card">
                    <div className="goal-top">
                      <div>
                        <span className="goal-tag">当前大目标</span>
                        <h2>{currentGoal.title}</h2>
                        <p>{currentGoal.description || "暂未填写目标说明"}</p>
                      </div>
                      <button
                        className="dots"
                        onClick={() => setSection("goals")}
                      >
                        •••
                      </button>
                    </div>
                    <div className="progress-row">
                      <div className="progress-copy">
                        <strong>{progress}%</strong>
                        <span>
                          {done} / {goalTasks.length} 项完成
                        </span>
                      </div>
                      <div className="progress">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <span className="deadline">
                        {daysLeft === null
                          ? "未设截止日期"
                          : `还剩 ${daysLeft} 天`}
                      </span>
                    </div>
                    <div className="faces">
                      {team.slice(0, 4).map((m, i) => (
                        <span className={`face f${i % 3}`} key={m.id}>
                          {m.name[0]}
                        </span>
                      ))}
                      <span className="face plus">+</span>
                      <span className="team-note">
                        {team.length} 位成员共同参与
                      </span>
                    </div>
                  </section>
                ) : (
                  <section className="goal-card no-current-goal">
                    <div>
                      <span className="goal-tag">当前大目标</span>
                      <h2>还没有大目标</h2>
                      <p>先建立目标，再把任务放进去，进度会自动计算。</p>
                    </div>
                    <button
                      className="primary"
                      onClick={() => setSection("goals")}
                    >
                      <Icon name="plus" />
                      新建目标
                    </button>
                  </section>
                )}

                <section className="tasks-section">
                  <div className="toolbar">
                    <div>
                      <h2>任务</h2>
                      <span>
                        {visible.filter((t) => t.status !== "done").length}{" "}
                        项待完成
                      </span>
                    </div>
                    <div className="view-switch">
                      {(["list", "board", "calendar"] as View[]).map((v) => (
                        <button
                          key={v}
                          className={view === v ? "selected" : ""}
                          onClick={() => setView(v)}
                        >
                          <Icon name={v} />
                          {v === "list"
                            ? "清单"
                            : v === "board"
                              ? "看板"
                              : "日历"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filters">
                    {["全部任务", "我负责的", "即将到期"].map((f) => (
                      <button
                        className={filter === f ? "active" : ""}
                        onClick={() => setFilter(f)}
                        key={f}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {view === "list" && (
                    <TaskList
                      tasks={visible}
                      subGoals={subGoals}
                      toggle={toggleTask}
                      changeStatus={changeTaskStatus}
                      edit={openEditTask}
                      remove={deleteTask}
                      viewNote={setViewingTask}
                    />
                  )}
                  {view === "board" && (
                    <Board
                      tasks={visible}
                      toggle={toggleTask}
                      viewNote={setViewingTask}
                    />
                  )}
                  {view === "calendar" && (
                    <Calendar tasks={visible} toggle={toggleTask} />
                  )}
                </section>
              </div>
              <aside className="workspace-calendar" aria-label="任务日历">
                <div className="side-calendar-head">
                  <div>
                    <span className="goal-tag">日程概览</span>
                    <h2>2026 年 8 月</h2>
                  </div>
                  <button
                    className="calendar-link"
                    onClick={() => setView("calendar")}
                  >
                    查看日历
                  </button>
                </div>
                <DashboardCalendar tasks={tasks} toggle={toggleTask} />
              </aside>
            </div>
          </>
        )}
      </section>

      {modal === "task" && (
        <div
          className="overlay"
          onMouseDown={() => {
            setModal(null);
            setEditingTask(null);
          }}
        >
          <form
            key={editingTask?.id ?? "new"}
            className="modal"
            onSubmit={saveTask}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="goal-tag">
                  {editingTask ? "编辑任务" : "新任务"}
                </span>
                <h2>{editingTask ? "修改任务信息" : "要推进什么事情？"}</h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => {
                  setModal(null);
                  setEditingTask(null);
                }}
              >
                ×
              </button>
            </div>
            <label>
              任务名称
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：完成登录页面设计"
              />
            </label>
            <label>
              备注（可选）
              <textarea
                name="description"
                defaultValue={editingTask?.description || ""}
                maxLength={500}
                placeholder="补充任务要求、相关链接或注意事项"
              />
            </label>
            <div className="due-mode">
              <button
                type="button"
                className={taskHasDueDate ? "selected" : ""}
                onClick={() => setTaskHasDueDate(true)}
              >
                设置截止日期
              </button>
              <button
                type="button"
                className={!taskHasDueDate ? "selected" : ""}
                onClick={() => setTaskHasDueDate(false)}
              >
                无截止日期
              </button>
            </div>
            <div className="form-grid">
              <label>
                截止日期
                <input
                  name="dueAt"
                  type="date"
                  disabled={!taskHasDueDate}
                  defaultValue={editingTask?.date || "2026-08-22"}
                />
              </label>
              <label>
                优先级
                <select
                  name="priority"
                  defaultValue={editingTask?.priority ?? "中"}
                >
                  <option>高</option>
                  <option>中</option>
                  <option>低</option>
                </select>
              </label>
              <label>
                任务状态
                <select
                  name="status"
                  defaultValue={editingTask?.status ?? "todo"}
                >
                  <option value="todo">待开始</option>
                  <option value="doing">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </label>
            </div>
            <label>
              负责人
              <div className="member-pills">
                {team.map((m) => (
                  <button
                    type="button"
                    className={
                      selectedAssignees.includes(m.id) ? "selected" : ""
                    }
                    onClick={() =>
                      setSelectedAssignees((ids) =>
                        ids.includes(m.id)
                          ? ids.filter((id) => id !== m.id)
                          : [...ids, m.id],
                      )
                    }
                    key={m.id}
                  >
                    {m.name[0]} {m.name}
                  </button>
                ))}
              </div>
            </label>
            {currentGoal && subGoals.some((g) => g.goalId === currentGoal.id) && (
              <label>归入小目标<select name="subGoalId" defaultValue={editingTask?.subGoalId || ""}><option value="">不归入小目标</option>{subGoals.filter((g) => g.goalId === currentGoal.id).map((g) => <option value={g.id} key={g.id}>{g.title}</option>)}</select></label>
            )}
            <label className="goal-check">
              <input
                name="includeGoal"
                type="checkbox"
                defaultChecked={
                  editingTask ? Boolean(editingTask.goalId) : true
                }
                disabled={!currentGoal}
              />
              {currentGoal
                ? `计入“${currentGoal.title}”进度`
                : "当前没有可关联的大目标"}
            </label>
            <button className="primary submit">
              {editingTask ? "保存修改" : "创建任务"}
            </button>
          </form>
        </div>
      )}
      {modal === "invite" && (
        <div className="overlay" onMouseDown={() => setModal(null)}>
          <div
            className="modal invite"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="invite-icon">
              <Icon name="users" />
            </div>
            <h2>邀请新成员</h2>
            <p>把邀请码发给同事。对方输入名字，就能加入工作室。</p>
            <div className="code">
              <span>KHKH-0826</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText("KHKH-0826");
                  setToast("邀请码已复制");
                }}
              >
                复制
              </button>
            </div>
            <small>邀请码将在 7 天后失效 · 最多使用 10 次</small>
            <button className="primary submit" onClick={() => setModal(null)}>
              完成
            </button>
          </div>
        </div>
      )}
      {viewingTask && (
        <div className="overlay" onMouseDown={() => setViewingTask(null)}>
          <article
            className="modal note-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="goal-tag">任务备注</span>
                <h2>{viewingTask.title}</h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setViewingTask(null)}
              >
                ×
              </button>
            </div>
            <div className="note-full">{viewingTask.description}</div>
            <div className="note-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => setViewingTask(null)}
              >
                关闭
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const task = viewingTask;
                  setViewingTask(null);
                  openEditTask(task);
                }}
              >
                编辑任务
              </button>
            </div>
          </article>
        </div>
      )}
      {goalModal && (
        <div
          className="overlay"
          onMouseDown={() => {
            setGoalModal(false);
            setEditingGoal(null);
          }}
        >
          <form
            key={editingGoal?.id || "new-goal"}
            className="modal"
            onSubmit={addGoal}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="goal-tag">
                  {editingGoal ? "编辑目标" : "新目标"}
                </span>
                <h2>{editingGoal ? "修改大目标" : "立一个大目标"}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGoalModal(false);
                  setEditingGoal(null);
                }}
              >
                ×
              </button>
            </div>
            <label>
              目标名称
              <input
                name="title"
                required
                defaultValue={editingGoal?.title || ""}
                placeholder="例如：发布第一版 Demo"
              />
            </label>
            <label>
              目标说明
              <input
                name="description"
                defaultValue={editingGoal?.description || ""}
                placeholder="一句话描述成功标准"
              />
            </label>
            <label>
              截止日期
              <input
                name="dueAt"
                type="date"
                defaultValue={editingGoal?.dueAt?.slice(0, 10) || ""}
              />
            </label>
            <button className="primary submit">
              {editingGoal ? "保存修改" : "创建大目标"}
            </button>
          </form>
        </div>
      )}
      {subGoalModal && (editingGoal||currentGoal) && <div className="overlay" onMouseDown={()=>{setSubGoalModal(false);setEditingGoal(null)}}><form className="modal" onSubmit={addSubGoal} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="goal-tag">{(editingGoal||currentGoal)?.title}</span><h2>新建小目标</h2></div><button type="button" onClick={()=>{setSubGoalModal(false);setEditingGoal(null)}}>×</button></div><label>小目标名称<input name="title" required placeholder="例如：完成战斗系统原型"/></label><label>说明（可选）<input name="description" placeholder="这个阶段要达成什么"/></label><button className="primary submit">创建小目标</button></form></div>}
      {toast && (
        <div className="toast">
          <span>✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}

function GoalsPage({
  goals,
  subGoals,
  tasks,
  add,
  edit,
  remove,
  addSubGoal,
}: {
  goals: Goal[];
  subGoals: SubGoal[];
  tasks: Task[];
  add: () => void;
  edit: (goal: Goal) => void;
  remove: (id: string) => void;
  addSubGoal: (goal: Goal) => void;
}) {
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">目标管理</p>
          <h1>大目标</h1>
          <p>把远方拆成一件件能完成的小事。</p>
        </div>
        <button className="primary" onClick={add}>
          <Icon name="plus" />
          新建目标
        </button>
      </header>
      <div className="goal-grid">
        {goals.length === 0 ? (
          <div className="empty-panel">
            <Icon name="target" />
            <b>还没有大目标</b>
            <span>新建目标后，可以把任务归入目标并自动计算进度。</span>
            <button className="primary" onClick={add}>
              立第一个目标
            </button>
          </div>
        ) : (
          goals.map((g) => {
            const related = tasks.filter((t) => t.goalId === g.id);
            const complete = related.filter((t) => t.status === "done").length;
            const percent = related.length
              ? Math.round((complete / related.length) * 100)
              : 0;
            return (
              <article className="goal-manage-card" key={g.id}>
                <div className="goal-top">
                  <div>
                    <span className="goal-tag">大目标</span>
                    <h2>{g.title}</h2>
                    <p>{g.description || "暂未填写目标说明"}</p>
                  </div>
                  <div className="goal-actions"><button onClick={() => edit(g)}>编辑</button><button className="danger" onClick={() => remove(g.id)}>删除</button></div>
                </div>
                <div className="progress-copy">
                  <strong>{percent}%</strong>
                  <span>
                    {complete} / {related.length} 项完成
                  </span>
                </div>
                <div className="progress">
                  <span style={{ width: `${percent}%` }} />
                </div>
                <div className="sub-goal-list">{subGoals.filter((sub)=>sub.goalId===g.id).map((sub)=>{const subTasks=tasks.filter((task)=>task.subGoalId===sub.id);const subDone=subTasks.filter((task)=>task.status==="done").length;const subPercent=subTasks.length?Math.round(subDone/subTasks.length*100):0;return <div className="sub-goal-row" key={sub.id}><span><b>{sub.title}</b><small>{subDone}/{subTasks.length} 项完成</small></span><div className="progress"><span style={{width:`${subPercent}%`}}/></div><em>{subPercent}%</em></div>})}<button className="add-sub-goal" onClick={()=>addSubGoal(g)}>＋ 新建小目标</button></div>
                <small>
                  {g.dueAt ? `截止 ${g.dueAt.slice(0, 10)}` : "未设置截止日期"}
                </small>
              </article>
            );
          })
        )}
      </div>
    </>
  );
}

function MembersPage({
  members,
  invite,
}: {
  members: TeamMember[];
  invite: () => void;
}) {
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">工作室成员</p>
          <h1>团队成员</h1>
          <p>一起参与目标和任务的所有伙伴。</p>
        </div>
        <button className="primary" onClick={invite}>
          <Icon name="plus" />
          邀请成员
        </button>
      </header>
      <div className="members-panel">
        <div className="members-head">
          <b>{members.length} 位成员</b>
          <span>所有成员都可以创建和完成任务</span>
        </div>
        {members.map((m, i) => (
          <article className="member-row" key={m.id}>
            <span className={`member-avatar f${i % 3}`}>{m.name[0]}</span>
            <div>
              <b>{m.name}</b>
              <span>{m.role === "admin" ? "管理员" : "工作室成员"}</span>
            </div>
            <time>{new Date(m.joinedAt).toLocaleDateString("zh-CN")} 加入</time>
            <span className={`role-badge ${m.role}`}>
              {m.role === "admin" ? "管理员" : "成员"}
            </span>
          </article>
        ))}
      </div>
    </>
  );
}

function JoinScreen({
  mode,
  changeMode,
  submit,
  verify,
  step,
  back,
  email,
  loading,
  error,
}: {
  mode: "login" | "join";
  changeMode: (mode: "login" | "join") => void;
  submit: (e: React.FormEvent<HTMLFormElement>) => void;
  verify: (e: React.FormEvent<HTMLFormElement>) => void;
  step: "details" | "code";
  back: () => void;
  email: string;
  loading: boolean;
  error: string;
}) {
  return (
    <main className="join-page">
      <section className="join-card">
        <div className="brand join-brand">
          <span className="brand-mark">()</span>
          <span>
            空括号工作室<span className="muted">XXXX</span>
          </span>
        </div>
        {step === "details" ? (
          <>
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "selected" : ""}
                onClick={() => changeMode("login")}
              >
                已有账号登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "join"}
                className={mode === "join" ? "selected" : ""}
                onClick={() => changeMode("join")}
              >
                首次加入
              </button>
            </div>
            <div className="join-copy">
              <span className="goal-tag">
                {mode === "login" ? "成员登录" : "仅限受邀成员"}
              </span>
              <h1>{mode === "login" ? "欢迎回来" : "加入工作室"}</h1>
              <p>
                {mode === "login"
                  ? "输入注册邮箱，我们会发送一次性验证码。"
                  : "使用邀请码和邮箱验证码创建你的成员身份。"}
              </p>
            </div>
            <form onSubmit={submit}>
              {mode === "join" && (
                <>
                  <label>
                    邀请码
                    <input
                      name="code"
                      autoComplete="off"
                      placeholder="例如 KHKH-0826"
                      required
                    />
                  </label>
                  <label>
                    你的名字
                    <input
                      name="name"
                      autoComplete="name"
                      placeholder="团队中显示的名字"
                      maxLength={30}
                      required
                    />
                  </label>
                </>
              )}
              <label>
                邮箱
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                />
              </label>
              {error && <p className="join-error">{error}</p>}
              <button className="primary submit" disabled={loading}>
                {loading
                  ? "正在发送…"
                  : mode === "login"
                    ? "发送登录验证码"
                    : "发送注册验证码"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="join-copy">
              <span className="goal-tag">验证邮箱</span>
              <h1>输入验证码</h1>
              <p>验证码已发送至 {email}</p>
            </div>
            <form onSubmit={verify}>
              <label>
                邮箱验证码
                <input
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="输入邮件中的验证码"
                  minLength={6}
                  required
                />
              </label>
              {error && <p className="join-error">{error}</p>}
              <button className="primary submit" disabled={loading}>
                {loading
                  ? "正在验证…"
                  : mode === "login"
                    ? "登录并进入工作台"
                    : "验证并加入工作室"}
              </button>
              <button className="text-button" type="button" onClick={back}>
                返回修改邮箱
              </button>
            </form>
          </>
        )}
        <small>邮箱仅用于登录和任务提醒，不会公开显示。</small>
      </section>
    </main>
  );
}

function TaskList({
  tasks,
  subGoals,
  toggle,
  changeStatus,
  edit,
  remove,
  viewNote,
}: {
  tasks: Task[];
  subGoals: SubGoal[];
  toggle: (id: number | string) => void;
  changeStatus: (id: number | string, status: Status) => void;
  edit: (task: Task) => void;
  remove: (id: number | string) => void;
  viewNote: (task: Task) => void;
}) {
  const [openMenu, setOpenMenu] = useState<number | string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = [
    ...subGoals.filter((sub) => tasks.some((task) => task.subGoalId === sub.id)).map((sub) => ({ id: sub.id, title: sub.title, tasks: tasks.filter((task) => task.subGoalId === sub.id) })),
    { id: "ungrouped", title: "其他任务", tasks: tasks.filter((task) => !task.subGoalId) },
  ].filter((group) => group.tasks.length > 0);
  const taskRow = (t: Task) => (
    <article className="task-row" key={t.id}>
      <button className={`check ${t.status === "done" ? "checked" : ""}`} onClick={() => toggle(t.id)} aria-label={t.status === "done" ? "取消完成" : "标记完成"}>{t.status === "done" && "✓"}</button>
      <div className="task-main"><h3 className={t.status === "done" ? "done" : ""}>{t.title}</h3>{t.description && <button className="task-note" onClick={() => viewNote(t)}>{t.description}</button>}<div className="meta"><span className={`priority p-${t.priority}`}>{t.priority}优先级</span><span><Icon name="calendar" />{dateText(t.date)}</span>{t.goalId && <span><Icon name="target" />Demo 大目标</span>}</div></div>
      <div className="assignees">{t.assignees.map((a, i) => <span className={`face f${members.indexOf(a)}`} key={a} style={{ zIndex: 4 - i }}>{a[0]}</span>)}</div>
      <select
        className={`status status-select s-${t.status}`}
        value={t.status}
        onChange={(event) => changeStatus(t.id, event.target.value as Status)}
        aria-label={`修改“${t.title}”的状态`}
      >
        <option value="todo">待开始</option>
        <option value="doing">进行中</option>
        <option value="done">已完成</option>
      </select>
      <div className="task-actions"><button className="dots row-dots" onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)} aria-label={`${t.title}的更多操作`}>•••</button>{openMenu === t.id && <><button className="task-menu-scrim" aria-label="关闭任务操作菜单" onClick={() => setOpenMenu(null)} /><div className="task-menu" role="menu"><button onClick={() => { setOpenMenu(null); edit(t); }}>编辑任务</button><button className="danger" onClick={() => { setOpenMenu(null); remove(t.id); }}>删除任务</button></div></>}</div>
    </article>
  );
  return (
    <div className="task-list">
      {tasks.length === 0 ? (
        <div className="empty-state">
          <b>还没有任务</b>
          <span>点击右上角“新建任务”开始规划。</span>
        </div>
      ) : groups.map((group) => <section className="task-folder" key={group.id}><button className="folder-head" onClick={()=>setCollapsed(state=>({...state,[group.id]:!state[group.id]}))}><span className="folder-icon">{collapsed[group.id]?"▸":"▾"}</span><b>{group.title}</b><em>{group.tasks.length} 项</em><span>{group.tasks.filter(task=>task.status==="done").length}/{group.tasks.length} 完成</span></button>{!collapsed[group.id]&&<div className="folder-tasks">{group.tasks.map(taskRow)}</div>}</section>) /* legacy rows retained below */}
      {/*
        tasks.map((t) => (
          <article className="task-row" key={t.id}>
            <button
              className={`check ${t.status === "done" ? "checked" : ""}`}
              onClick={() => toggle(t.id)}
              aria-label={t.status === "done" ? "取消完成" : "标记完成"}
            >
              {t.status === "done" && "✓"}
            </button>
            <div className="task-main">
              <h3 className={t.status === "done" ? "done" : ""}>{t.title}</h3>
              {t.description && <button className="task-note" onClick={() => viewNote(t)}>{t.description}</button>}
              <div className="meta">
                <span className={`priority p-${t.priority}`}>
                  {t.priority}优先级
                </span>
                <span>
                  <Icon name="calendar" />
                  {dateText(t.date)}
                </span>
                {t.goalId && (
                  <span>
                    <Icon name="target" />
                    Demo 大目标
                  </span>
                )}
              </div>
            </div>
            <div className="assignees">
              {t.assignees.map((a, i) => (
                <span
                  className={`face f${members.indexOf(a)}`}
                  key={a}
                  style={{ zIndex: 4 - i }}
                >
                  {a[0]}
                </span>
              ))}
            </div>
            <span className={`status s-${t.status}`}>
              {statusLabel[t.status]}
            </span>
            <div className="task-actions">
              <button
                className="dots row-dots"
                onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                aria-label={`${t.title}的更多操作`}
                aria-haspopup="menu"
                aria-expanded={openMenu === t.id}
              >
                •••
              </button>
              {openMenu === t.id && (
                <>
                  <button
                    className="task-menu-scrim"
                    aria-label="关闭任务操作菜单"
                    onClick={() => setOpenMenu(null)}
                  />
                  <div className="task-menu" role="menu">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setOpenMenu(null);
                        edit(t);
                      }}
                    >
                      编辑任务
                    </button>
                    <button
                      role="menuitem"
                      className="danger"
                      onClick={() => {
                        setOpenMenu(null);
                        remove(t.id);
                      }}
                    >
                      删除任务
                    </button>
                  </div>
                </>
              )}
            </div>
          </article>
        )) */}
    </div>
  );
}

function Board({
  tasks,
  toggle,
  viewNote,
}: {
  tasks: Task[];
  toggle: (id: number | string) => void;
  viewNote: (task: Task) => void;
}) {
  return (
    <div className="board">
      {(["todo", "doing", "done"] as Status[]).map((s) => (
        <div className="column" key={s}>
          <div className="column-title">
            <span className={`dot ${s}`} />
            <b>{statusLabel[s]}</b>
            <em>{tasks.filter((t) => t.status === s).length}</em>
          </div>
          {tasks
            .filter((t) => t.status === s)
            .map((t) => (
              <article className="board-card" key={t.id}>
                <span className={`priority p-${t.priority}`}>
                  {t.priority}优先级
                </span>
                <button className="board-title" onClick={() => toggle(t.id)}>
                  {t.title}
                </button>
                {t.description && (
                  <button className="board-note" onClick={() => viewNote(t)}>
                    {t.description}
                  </button>
                )}
                <div>
                  <span>{dateText(t.date)}</span>
                  <span className="mini-faces">
                    {t.assignees.map((a) => (
                      <i key={a}>{a[0]}</i>
                    ))}
                  </span>
                </div>
              </article>
            ))}
        </div>
      ))}
    </div>
  );
}

function Calendar({
  tasks,
  toggle,
}: {
  tasks: Task[];
  toggle: (id: number | string) => void;
}) {
  const days = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  return (
    <div className="calendar-view">
      <div className="cal-head">
        <button>‹</button>
        <h3>2026 年 8 月</h3>
        <button>›</button>
      </div>
      <div className="week">
        {"一二三四五六日".split("").map((x) => (
          <span key={x}>周{x}</span>
        ))}
      </div>
      <div className="cal-grid">
        {days.map((d) => (
          <div className={d === 13 ? "today" : ""} key={d}>
            <b>{d}</b>
            {tasks
              .filter((t) => Boolean(t.date) && Number(t.date.slice(-2)) === d)
              .map((t) => (
                <button
                  onClick={() => toggle(t.id)}
                  className={`cal-task s-${t.status}`}
                  key={t.id}
                >
                  {t.title}
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardCalendar({
  tasks,
  toggle,
}: {
  tasks: Task[];
  toggle: (id: number | string) => void;
}) {
  const days = [
    null,
    null,
    null,
    null,
    null,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
  ];
  const upcoming = tasks
    .filter((task) => Boolean(task.date) && task.status !== "done")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  return (
    <>
      <div className="mini-week">
        {"一二三四五六日".split("").map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mini-calendar-grid">
        {days.map((day, index) =>
          day === null ? (
            <span className="blank" key={`blank-${index}`} />
          ) : (
            <button
              className={day === 13 ? "today" : ""}
              key={day}
              onClick={() => {
                const task = tasks.find(
                  (item) => Number(item.date.slice(-2)) === day,
                );
                if (task) toggle(task.id);
              }}
            >
              <b>{day}</b>
              {tasks.some((task) => Number(task.date.slice(-2)) === day) && (
                <i />
              )}
            </button>
          ),
        )}
      </div>
      <div className="upcoming">
        <div className="upcoming-title">
          <b>近期任务</b>
          <span>{upcoming.length} 项</span>
        </div>
        {upcoming.length === 0 ? (
          <p>暂时没有待办任务</p>
        ) : (
          upcoming.map((task) => (
            <button key={task.id} onClick={() => toggle(task.id)}>
              <time>
                {Number(task.date.slice(-2))}
                <small>8月</small>
              </time>
              <span>
                <b>{task.title}</b>
                <small>
                  {statusLabel[task.status]} · {task.priority}优先级
                </small>
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function dateText(d: string) {
  if (!d) return "无截止日期";
  const n = Number(d.slice(-2));
  return n === 13 ? "今天" : n === 14 ? "明天" : `8月${n}日`;
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5M9 21v-7h6v7" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    list: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    board: (
      <>
        <rect x="3" y="3" width="7" height="18" rx="1" />
        <rect x="14" y="3" width="7" height="12" rx="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}
