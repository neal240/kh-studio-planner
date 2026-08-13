"use client";

import { useEffect, useState } from "react";
import { plannerApi, supabaseConfigured } from "../lib/supabase";

type Status = "todo" | "doing" | "done";
type View = "list" | "board" | "calendar";
type Section = "workspace" | "goals" | "members";
type Goal = { id: string; title: string; description: string; dueAt: string | null };
type TeamMember = { id: string; name: string; role: "admin" | "member"; joinedAt: string };
type Task = { id: number | string; title: string; status: Status; date: string; priority: "高" | "中" | "低"; assignees: string[]; goalId?: number | string };

const initialTasks: Task[] = [
  { id: 1, title: "确认序章关卡流程", status: "done", date: "2026-08-12", priority: "高", assignees: ["林野", "阿澈"], goalId: 1 },
  { id: 2, title: "完成主角三视图", status: "doing", date: "2026-08-14", priority: "高", assignees: ["小满"], goalId: 1 },
  { id: 3, title: "整理战斗数值表 v1", status: "doing", date: "2026-08-15", priority: "中", assignees: ["阿澈", "林野"], goalId: 1 },
  { id: 4, title: "搭建第一张测试地图", status: "todo", date: "2026-08-18", priority: "中", assignees: ["林野"], goalId: 1 },
  { id: 5, title: "录制环境音效参考", status: "todo", date: "2026-08-20", priority: "低", assignees: ["小满"], goalId: 1 },
  { id: 6, title: "周五试玩会准备", status: "todo", date: "2026-08-21", priority: "高", assignees: ["林野", "阿澈", "小满"] },
];

const members = ["林野", "阿澈", "小满"];
const statusLabel: Record<Status, string> = { todo: "待开始", doing: "进行中", done: "已完成" };

export default function Home() {
  const [view, setView] = useState<View>("list");
  const [section, setSection] = useState<Section>("workspace");
  const [tasks, setTasks] = useState(initialTasks);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [modal, setModal] = useState<"task" | "invite" | null>(null);
  const [title, setTitle] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("全部任务");
  const [session, setSession] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [currentName, setCurrentName] = useState("林野");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [goalModal, setGoalModal] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const saved = localStorage.getItem("kh_planner_session");
    if (!saved || !supabaseConfigured) return;
    setSession(saved);
    loadWorkspace(saved).catch(() => {
      localStorage.removeItem("kh_planner_session");
      setSession(null);
    });
  }, []);

  async function loadWorkspace(token: string) {
    const data = await plannerApi.snapshot(token);
    setCurrentName(data.member.name);
    setGoals(data.goals.map(g => ({ id:g.id, title:g.title, description:g.description, dueAt:g.due_at })));
    setTeam(data.members.map(m => ({ id:m.id, name:m.name, role:m.role, joinedAt:m.joined_at })));
    setTasks(data.tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        date: t.due_at?.slice(0, 10) || "2026-08-22",
        priority: t.priority === "high" ? "高" : t.priority === "low" ? "低" : "中",
        assignees: t.assignees,
        goalId: t.goal_id || undefined,
      })));
  }

  async function joinWorkspace(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setJoining(true);
    setJoinError("");
    const form = new FormData(e.currentTarget);
    try {
      const joined = await plannerApi.redeemInvite(String(form.get("code")), String(form.get("name")));
      localStorage.setItem("kh_planner_session", joined.session_token);
      setSession(joined.session_token);
      setCurrentName(joined.member_name);
      await loadWorkspace(joined.session_token);
      setToast(joined.role === "admin" ? "管理员账号创建成功" : "已加入空括号工作室");
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "加入失败，请检查邀请码");
    } finally {
      setJoining(false);
    }
  }

  const goalTasks = tasks.filter(t => t.goalId === 1);
  const done = goalTasks.filter(t => t.status === "done").length;
  const progress = Math.round(done / goalTasks.length * 100);
  const visible = filter === "我负责的" ? tasks.filter(t => t.assignees.includes("林野")) : filter === "即将到期" ? tasks.filter(t => t.date <= "2026-08-15" && t.status !== "done") : tasks;

  function toggleTask(id: number | string) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const next = task.status === "done" ? "todo" : "done";
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status: next } : t));
    if (session && typeof id === "string") {
      plannerApi.setTaskStatus(session, id, next).catch(() => {
        setToast("同步失败，请稍后重试");
        loadWorkspace(session);
      });
    }
  }
  async function deleteTask(id: number | string) {
    const task = tasks.find(t => t.id === id);
    if (!task || !window.confirm(`确定删除“${task.title}”吗？此操作会同步给所有成员。`)) return;
    setTasks(ts => ts.filter(t => t.id !== id));
    if (session && typeof id === "string") {
      try { await plannerApi.deleteTask(session, id); setToast("任务已删除"); }
      catch { setToast("删除失败，任务已恢复"); await loadWorkspace(session); }
    } else { setToast("示例任务已删除"); }
  }
  async function addTask(e: React.FormEvent) {
    e.preventDefault(); if (!title.trim()) return;
    const taskTitle = title.trim();
    setTasks(ts => [...ts, { id: Date.now(), title: taskTitle, status: "todo", date: "2026-08-22", priority: "中", assignees: [currentName], goalId: 1 }]);
    setTitle(""); setModal(null); setToast("任务已加入大目标");
    if (session) {
      try {
        await plannerApi.createTask(session, { title: taskTitle, dueAt: "2026-08-22", priority: "medium" });
        await loadWorkspace(session);
      } catch {
        setToast("任务保存在本机，但云端同步失败");
      }
    }
  }

  async function addGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!session) return; const form = new FormData(e.currentTarget);
    try { await plannerApi.createGoal(session,String(form.get("title")),String(form.get("description")),String(form.get("dueAt"))); await loadWorkspace(session); setGoalModal(false); setToast("大目标已创建"); }
    catch(error) { setToast(error instanceof Error ? error.message : "创建失败"); }
  }

  async function deleteGoal(id: string) {
    if (!session || !window.confirm("确定删除这个大目标吗？关联任务会保留。")) return;
    try { await plannerApi.deleteGoal(session,id); await loadWorkspace(session); setToast("大目标已删除"); }
    catch { setToast("删除失败"); }
  }

  if (supabaseConfigured && !session) {
    return <JoinScreen submit={joinWorkspace} loading={joining} error={joinError}/>;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">()</span><span>空括号工作室<span className="muted">XXXX</span></span></div>
        <nav>
          <button className={section==="workspace"?"nav-active":""} onClick={()=>setSection("workspace")}><Icon name="home"/>工作台</button>
          <button className={section==="goals"?"nav-active":""} onClick={()=>setSection("goals")}><Icon name="target"/>大目标</button>
          <button className={section==="members"?"nav-active":""} onClick={()=>setSection("members")}><Icon name="users"/>团队成员</button>
        </nav>
        <div className="side-bottom">
          <button onClick={() => setModal("invite")}><Icon name="plus"/>邀请成员</button>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}><Icon name={theme === "light" ? "moon" : "sun"}/>{theme === "light" ? "切换深色" : "切换浅色"}</button>
          <div className="profile"><div className="avatar">{currentName[0]}</div><div><b>{currentName}</b><span>工作室成员</span></div><span className="more">•••</span></div>
        </div>
      </aside>

      <section className="content">
        {section === "goals" ? <GoalsPage goals={goals} tasks={tasks} add={()=>setGoalModal(true)} remove={deleteGoal}/> : section === "members" ? <MembersPage members={team} invite={()=>setModal("invite")}/> : <>
        <header><div><p className="eyebrow">星期四，8月13日</p><h1>早上好，{currentName}</h1><p>今天也一起把重要的事情向前推一点。</p></div><div className="header-actions"><button className="icon-btn" onClick={() => setToast("浏览器提醒已开启")} aria-label="开启提醒"><Icon name="bell"/><i/></button><button className="primary" onClick={() => setModal("task")}><Icon name="plus"/>新建任务</button></div></header>

        <section className="goal-card">
          <div className="goal-top"><div><span className="goal-tag">当前大目标</span><h2>做出可玩的游戏 Demo</h2><p>在 9 月底前完成 15 分钟核心体验，准备第一次内部试玩。</p></div><button className="dots">•••</button></div>
          <div className="progress-row"><div className="progress-copy"><strong>{progress}%</strong><span>{done} / {goalTasks.length} 项完成</span></div><div className="progress"><span style={{width: `${progress}%`}}/></div><span className="deadline">还剩 48 天</span></div>
          <div className="faces">{members.map((m,i)=><span className={`face f${i}`} key={m}>{m[0]}</span>)}<span className="face plus">+</span><span className="team-note">3 位成员共同参与</span></div>
        </section>

        <section className="tasks-section">
          <div className="toolbar"><div><h2>任务</h2><span>{visible.filter(t => t.status !== "done").length} 项待完成</span></div><div className="view-switch">{(["list","board","calendar"] as View[]).map(v=><button key={v} className={view===v?"selected":""} onClick={()=>setView(v)}><Icon name={v}/>{v==="list"?"清单":v==="board"?"看板":"日历"}</button>)}</div></div>
          <div className="filters">{["全部任务","我负责的","即将到期"].map(f=><button className={filter===f?"active":""} onClick={()=>setFilter(f)} key={f}>{f}</button>)}</div>

          {view === "list" && <TaskList tasks={visible} toggle={toggleTask} remove={deleteTask}/>} 
          {view === "board" && <Board tasks={visible} toggle={toggleTask}/>} 
          {view === "calendar" && <Calendar tasks={visible} toggle={toggleTask}/>} 
        </section></>}
      </section>

      {modal === "task" && <div className="overlay" onMouseDown={()=>setModal(null)}><form className="modal" onSubmit={addTask} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="goal-tag">新任务</span><h2>要推进什么事情？</h2></div><button type="button" onClick={()=>setModal(null)}>×</button></div><label>任务名称<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：完成登录页面设计"/></label><div className="form-grid"><label>截止日期<input type="date" defaultValue="2026-08-22"/></label><label>优先级<select defaultValue="中"><option>高</option><option>中</option><option>低</option></select></label></div><label>负责人<div className="member-pills">{members.map(m=><button type="button" key={m}>{m[0]} {m}</button>)}</div></label><label className="goal-check"><input type="checkbox" defaultChecked/>计入“做出可玩的游戏 Demo”进度</label><button className="primary submit">创建任务</button></form></div>}
      {modal === "invite" && <div className="overlay" onMouseDown={()=>setModal(null)}><div className="modal invite" onMouseDown={e=>e.stopPropagation()}><div className="invite-icon"><Icon name="users"/></div><h2>邀请新成员</h2><p>把邀请码发给同事。对方输入名字，就能加入工作室。</p><div className="code"><span>KHKH-0826</span><button onClick={()=>{navigator.clipboard?.writeText("KHKH-0826");setToast("邀请码已复制")}}>复制</button></div><small>邀请码将在 7 天后失效 · 最多使用 10 次</small><button className="primary submit" onClick={()=>setModal(null)}>完成</button></div></div>}
      {goalModal && <div className="overlay" onMouseDown={()=>setGoalModal(false)}><form className="modal" onSubmit={addGoal} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="goal-tag">新目标</span><h2>立一个大目标</h2></div><button type="button" onClick={()=>setGoalModal(false)}>×</button></div><label>目标名称<input name="title" required placeholder="例如：发布第一版 Demo"/></label><label>目标说明<input name="description" placeholder="一句话描述成功标准"/></label><label>截止日期<input name="dueAt" type="date"/></label><button className="primary submit">创建大目标</button></form></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

function GoalsPage({goals,tasks,add,remove}:{goals:Goal[];tasks:Task[];add:()=>void;remove:(id:string)=>void}) {
  return <><header><div><p className="eyebrow">目标管理</p><h1>大目标</h1><p>把远方拆成一件件能完成的小事。</p></div><button className="primary" onClick={add}><Icon name="plus"/>新建目标</button></header><div className="goal-grid">{goals.length===0?<div className="empty-panel"><Icon name="target"/><b>还没有大目标</b><span>新建目标后，可以把任务归入目标并自动计算进度。</span><button className="primary" onClick={add}>立第一个目标</button></div>:goals.map(g=>{const related=tasks.filter(t=>t.goalId===g.id);const complete=related.filter(t=>t.status==="done").length;const percent=related.length?Math.round(complete/related.length*100):0;return <article className="goal-manage-card" key={g.id}><div className="goal-top"><div><span className="goal-tag">大目标</span><h2>{g.title}</h2><p>{g.description||"暂未填写目标说明"}</p></div><button className="dots delete-dot" onClick={()=>remove(g.id)}>删除</button></div><div className="progress-copy"><strong>{percent}%</strong><span>{complete} / {related.length} 项完成</span></div><div className="progress"><span style={{width:`${percent}%`}}/></div><small>{g.dueAt?`截止 ${g.dueAt.slice(0,10)}`:"未设置截止日期"}</small></article>})}</div></>
}

function MembersPage({members,invite}:{members:TeamMember[];invite:()=>void}) {
  return <><header><div><p className="eyebrow">工作室成员</p><h1>团队成员</h1><p>一起参与目标和任务的所有伙伴。</p></div><button className="primary" onClick={invite}><Icon name="plus"/>邀请成员</button></header><div className="members-panel"><div className="members-head"><b>{members.length} 位成员</b><span>所有成员都可以创建和完成任务</span></div>{members.map((m,i)=><article className="member-row" key={m.id}><span className={`member-avatar f${i%3}`}>{m.name[0]}</span><div><b>{m.name}</b><span>{m.role==="admin"?"管理员":"工作室成员"}</span></div><time>{new Date(m.joinedAt).toLocaleDateString("zh-CN")} 加入</time><span className={`role-badge ${m.role}`}>{m.role==="admin"?"管理员":"成员"}</span></article>)}</div></>
}

function JoinScreen({submit,loading,error}:{submit:(e:React.FormEvent<HTMLFormElement>)=>void;loading:boolean;error:string}) {
  return <main className="join-page"><section className="join-card"><div className="brand join-brand"><span className="brand-mark">()</span><span>空括号工作室<span className="muted">XXXX</span></span></div><div className="join-copy"><span className="goal-tag">仅限受邀成员</span><h1>加入工作室</h1><p>输入管理员发给你的邀请码，再留下你的名字。</p></div><form onSubmit={submit}><label>邀请码<input name="code" autoComplete="off" placeholder="例如 KHKH-0826" required/></label><label>你的名字<input name="name" autoComplete="name" placeholder="团队中显示的名字" maxLength={30} required/></label>{error&&<p className="join-error">{error}</p>}<button className="primary submit" disabled={loading}>{loading?"正在加入…":"进入工作台"}</button></form><small>没有邀请码？请联系工作室管理员。</small></section></main>
}

function TaskList({tasks,toggle,remove}:{tasks:Task[];toggle:(id:number|string)=>void;remove:(id:number|string)=>void}) {
  return <div className="task-list">{tasks.length===0?<div className="empty-state"><b>还没有任务</b><span>点击右上角“新建任务”开始规划。</span></div>:tasks.map(t=><article className="task-row" key={t.id}><button className={`check ${t.status === "done" ? "checked":""}`} onClick={()=>toggle(t.id)} aria-label={t.status === "done" ? "取消完成":"标记完成"}>{t.status === "done" && "✓"}</button><div className="task-main"><h3 className={t.status === "done" ? "done":""}>{t.title}</h3><div className="meta"><span className={`priority p-${t.priority}`}>{t.priority}优先级</span><span><Icon name="calendar"/>{dateText(t.date)}</span>{t.goalId && <span><Icon name="target"/>Demo 大目标</span>}</div></div><div className="assignees">{t.assignees.map((a,i)=><span className={`face f${members.indexOf(a)}`} key={a} style={{zIndex: 4-i}}>{a[0]}</span>)}</div><span className={`status s-${t.status}`}>{statusLabel[t.status]}</span><button className="dots row-dots" onClick={()=>remove(t.id)} aria-label={`删除${t.title}`} title="删除任务">•••</button></article>)}</div>
}

function Board({tasks,toggle}:{tasks:Task[];toggle:(id:number|string)=>void}) { return <div className="board">{(["todo","doing","done"] as Status[]).map(s=><div className="column" key={s}><div className="column-title"><span className={`dot ${s}`}/><b>{statusLabel[s]}</b><em>{tasks.filter(t=>t.status===s).length}</em></div>{tasks.filter(t=>t.status===s).map(t=><button className="board-card" onClick={()=>toggle(t.id)} key={t.id}><span className={`priority p-${t.priority}`}>{t.priority}优先级</span><h3>{t.title}</h3><div><span>{dateText(t.date)}</span><span className="mini-faces">{t.assignees.map(a=><i key={a}>{a[0]}</i>)}</span></div></button>)}</div>)}</div> }

function Calendar({tasks,toggle}:{tasks:Task[];toggle:(id:number|string)=>void}) { const days=[10,11,12,13,14,15,16,17,18,19,20,21,22,23]; return <div className="calendar-view"><div className="cal-head"><button>‹</button><h3>2026 年 8 月</h3><button>›</button></div><div className="week">{"一二三四五六日".split("").map(x=><span key={x}>周{x}</span>)}</div><div className="cal-grid">{days.map(d=><div className={d===13?"today":""} key={d}><b>{d}</b>{tasks.filter(t=>Number(t.date.slice(-2))===d).map(t=><button onClick={()=>toggle(t.id)} className={`cal-task s-${t.status}`} key={t.id}>{t.title}</button>)}</div>)}</div></div> }

function dateText(d:string){ const n=Number(d.slice(-2)); return n===13?"今天":n===14?"明天":`8月${n}日`; }

function Icon({name}:{name:string}) { const paths:Record<string,React.ReactNode>={home:<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,target:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,plus:<path d="M12 5v14M5 12h14"/>,moon:<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>,sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>,bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,list:<><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,board:<><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="12" rx="1"/></>,calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>}; return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg> }
