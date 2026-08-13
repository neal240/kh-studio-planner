"use client";

import { useEffect, useState } from "react";

type Status = "todo" | "doing" | "done";
type View = "list" | "board" | "calendar";
type Task = { id: number; title: string; status: Status; date: string; priority: "高" | "中" | "低"; assignees: string[]; goalId?: number };

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
  const [tasks, setTasks] = useState(initialTasks);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [modal, setModal] = useState<"task" | "invite" | null>(null);
  const [title, setTitle] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("全部任务");

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const goalTasks = tasks.filter(t => t.goalId === 1);
  const done = goalTasks.filter(t => t.status === "done").length;
  const progress = Math.round(done / goalTasks.length * 100);
  const visible = filter === "我负责的" ? tasks.filter(t => t.assignees.includes("林野")) : filter === "即将到期" ? tasks.filter(t => t.date <= "2026-08-15" && t.status !== "done") : tasks;

  function toggleTask(id: number) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t));
  }
  function addTask(e: React.FormEvent) {
    e.preventDefault(); if (!title.trim()) return;
    setTasks(ts => [...ts, { id: Date.now(), title: title.trim(), status: "todo", date: "2026-08-22", priority: "中", assignees: ["林野"], goalId: 1 }]);
    setTitle(""); setModal(null); setToast("任务已加入大目标");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">()</span><span>空括号工作室<span className="muted">XXXX</span></span></div>
        <nav>
          <button className="nav-active"><Icon name="home"/>工作台</button>
          <button><Icon name="target"/>大目标</button>
          <button><Icon name="users"/>团队成员</button>
        </nav>
        <div className="side-bottom">
          <button onClick={() => setModal("invite")}><Icon name="plus"/>邀请成员</button>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}><Icon name={theme === "light" ? "moon" : "sun"}/>{theme === "light" ? "切换深色" : "切换浅色"}</button>
          <div className="profile"><div className="avatar">林</div><div><b>林野</b><span>管理员</span></div><span className="more">•••</span></div>
        </div>
      </aside>

      <section className="content">
        <header><div><p className="eyebrow">星期四，8月13日</p><h1>早上好，林野</h1><p>今天也一起把重要的事情向前推一点。</p></div><div className="header-actions"><button className="icon-btn" onClick={() => setToast("浏览器提醒已开启")} aria-label="开启提醒"><Icon name="bell"/><i/></button><button className="primary" onClick={() => setModal("task")}><Icon name="plus"/>新建任务</button></div></header>

        <section className="goal-card">
          <div className="goal-top"><div><span className="goal-tag">当前大目标</span><h2>做出可玩的游戏 Demo</h2><p>在 9 月底前完成 15 分钟核心体验，准备第一次内部试玩。</p></div><button className="dots">•••</button></div>
          <div className="progress-row"><div className="progress-copy"><strong>{progress}%</strong><span>{done} / {goalTasks.length} 项完成</span></div><div className="progress"><span style={{width: `${progress}%`}}/></div><span className="deadline">还剩 48 天</span></div>
          <div className="faces">{members.map((m,i)=><span className={`face f${i}`} key={m}>{m[0]}</span>)}<span className="face plus">+</span><span className="team-note">3 位成员共同参与</span></div>
        </section>

        <section className="tasks-section">
          <div className="toolbar"><div><h2>任务</h2><span>{visible.filter(t => t.status !== "done").length} 项待完成</span></div><div className="view-switch">{(["list","board","calendar"] as View[]).map(v=><button key={v} className={view===v?"selected":""} onClick={()=>setView(v)}><Icon name={v}/>{v==="list"?"清单":v==="board"?"看板":"日历"}</button>)}</div></div>
          <div className="filters">{["全部任务","我负责的","即将到期"].map(f=><button className={filter===f?"active":""} onClick={()=>setFilter(f)} key={f}>{f}</button>)}</div>

          {view === "list" && <TaskList tasks={visible} toggle={toggleTask}/>} 
          {view === "board" && <Board tasks={visible} toggle={toggleTask}/>} 
          {view === "calendar" && <Calendar tasks={visible} toggle={toggleTask}/>} 
        </section>
      </section>

      {modal === "task" && <div className="overlay" onMouseDown={()=>setModal(null)}><form className="modal" onSubmit={addTask} onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="goal-tag">新任务</span><h2>要推进什么事情？</h2></div><button type="button" onClick={()=>setModal(null)}>×</button></div><label>任务名称<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：完成登录页面设计"/></label><div className="form-grid"><label>截止日期<input type="date" defaultValue="2026-08-22"/></label><label>优先级<select defaultValue="中"><option>高</option><option>中</option><option>低</option></select></label></div><label>负责人<div className="member-pills">{members.map(m=><button type="button" key={m}>{m[0]} {m}</button>)}</div></label><label className="goal-check"><input type="checkbox" defaultChecked/>计入“做出可玩的游戏 Demo”进度</label><button className="primary submit">创建任务</button></form></div>}
      {modal === "invite" && <div className="overlay" onMouseDown={()=>setModal(null)}><div className="modal invite" onMouseDown={e=>e.stopPropagation()}><div className="invite-icon"><Icon name="users"/></div><h2>邀请新成员</h2><p>把邀请码发给同事。对方输入名字，就能加入工作室。</p><div className="code"><span>KHKH-0826</span><button onClick={()=>{navigator.clipboard?.writeText("KHKH-0826");setToast("邀请码已复制")}}>复制</button></div><small>邀请码将在 7 天后失效 · 最多使用 10 次</small><button className="primary submit" onClick={()=>setModal(null)}>完成</button></div></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

function TaskList({tasks,toggle}:{tasks:Task[];toggle:(id:number)=>void}) {
  return <div className="task-list">{tasks.map(t=><article className="task-row" key={t.id}><button className={`check ${t.status === "done" ? "checked":""}`} onClick={()=>toggle(t.id)} aria-label={t.status === "done" ? "取消完成":"标记完成"}>{t.status === "done" && "✓"}</button><div className="task-main"><h3 className={t.status === "done" ? "done":""}>{t.title}</h3><div className="meta"><span className={`priority p-${t.priority}`}>{t.priority}优先级</span><span><Icon name="calendar"/>{dateText(t.date)}</span>{t.goalId && <span><Icon name="target"/>Demo 大目标</span>}</div></div><div className="assignees">{t.assignees.map((a,i)=><span className={`face f${members.indexOf(a)}`} key={a} style={{zIndex: 4-i}}>{a[0]}</span>)}</div><span className={`status s-${t.status}`}>{statusLabel[t.status]}</span><button className="dots row-dots">•••</button></article>)}</div>
}

function Board({tasks,toggle}:{tasks:Task[];toggle:(id:number)=>void}) { return <div className="board">{(["todo","doing","done"] as Status[]).map(s=><div className="column" key={s}><div className="column-title"><span className={`dot ${s}`}/><b>{statusLabel[s]}</b><em>{tasks.filter(t=>t.status===s).length}</em></div>{tasks.filter(t=>t.status===s).map(t=><button className="board-card" onClick={()=>toggle(t.id)} key={t.id}><span className={`priority p-${t.priority}`}>{t.priority}优先级</span><h3>{t.title}</h3><div><span>{dateText(t.date)}</span><span className="mini-faces">{t.assignees.map(a=><i key={a}>{a[0]}</i>)}</span></div></button>)}</div>)}</div> }

function Calendar({tasks,toggle}:{tasks:Task[];toggle:(id:number)=>void}) { const days=[10,11,12,13,14,15,16,17,18,19,20,21,22,23]; return <div className="calendar-view"><div className="cal-head"><button>‹</button><h3>2026 年 8 月</h3><button>›</button></div><div className="week">{"一二三四五六日".split("").map(x=><span key={x}>周{x}</span>)}</div><div className="cal-grid">{days.map(d=><div className={d===13?"today":""} key={d}><b>{d}</b>{tasks.filter(t=>Number(t.date.slice(-2))===d).map(t=><button onClick={()=>toggle(t.id)} className={`cal-task s-${t.status}`} key={t.id}>{t.title}</button>)}</div>)}</div></div> }

function dateText(d:string){ const n=Number(d.slice(-2)); return n===13?"今天":n===14?"明天":`8月${n}日`; }

function Icon({name}:{name:string}) { const paths:Record<string,React.ReactNode>={home:<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,target:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,plus:<path d="M12 5v14M5 12h14"/>,moon:<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>,sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>,bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,list:<><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,board:<><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="12" rx="1"/></>,calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>}; return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg> }
