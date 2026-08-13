import { createClient } from "npm:@supabase/supabase-js@2";

type Task = {
  id: string;
  title: string;
  due_at: string;
  task_assignees: Array<{ members: { id: string; name: string; email: string | null } | null }>;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REMINDER_FROM_EMAIL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!resendKey || !fromEmail || !supabaseUrl || !serviceKey) return json({ error: "Missing server secrets" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = new Date();
  const upper = new Date(now.getTime() + 30 * 60 * 60 * 1000);
  const overdueLower = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const { data, error } = await admin.from("tasks")
    .select("id,title,due_at,task_assignees(members(id,name,email))")
    .neq("status", "done").not("due_at", "is", null)
    .gte("due_at", overdueLower.toISOString()).lte("due_at", upper.toISOString());
  if (error) return json({ error: error.message }, 500);

  let sent = 0; let skipped = 0; const failures: string[] = [];
  for (const task of (data || []) as unknown as Task[]) {
    const due = new Date(task.due_at);
    const hours = (due.getTime() - now.getTime()) / 3600000;
    let kind: string | null = null;
    let label = "";
    if (hours > 18 && hours <= 30) { kind = "due_24h"; label = "将在约 24 小时后截止"; }
    else if (hours >= 0 && hours <= 18) { kind = "due_today"; label = "今天截止"; }
    else if (hours < 0) {
      const day = Math.min(3, Math.max(1, Math.ceil(Math.abs(hours) / 24)));
      if (Math.abs(hours) <= 72) { kind = `overdue_${day}`; label = `已逾期 ${day} 天`; }
    }
    if (!kind) continue;

    for (const assignment of task.task_assignees || []) {
      const member = assignment.members;
      if (!member?.email) { skipped++; continue; }
      const { data: prior } = await admin.from("reminder_deliveries").select("id").eq("task_id", task.id).eq("member_id", member.id).eq("reminder_kind", kind).maybeSingle();
      if (prior) { skipped++; continue; }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `空括号工作室 <${fromEmail}>`, to: [member.email],
          subject: `任务提醒：${task.title}`,
          html: `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;max-width:560px;margin:auto;padding:28px"><p style="color:#777">空括号工作室 · 任务提醒</p><h2 style="color:#18191b">${escapeHtml(task.title)}</h2><p>你好，${escapeHtml(member.name)}。这个任务<strong>${label}</strong>。</p><p>截止时间：${due.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p><p><a href="https://neal240.github.io/kh-studio-planner/" style="display:inline-block;background:#18191b;color:#fff;padding:11px 18px;border-radius:10px;text-decoration:none">打开工作台</a></p><p style="color:#999;font-size:12px">任务完成后将不再发送提醒。</p></div>`,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        await admin.from("reminder_deliveries").insert({ task_id: task.id, member_id: member.id, reminder_kind: kind, provider_id: result.id });
        sent++;
      } else failures.push(`${task.id}:${member.id}:${response.status}`);
    }
  }
  return json({ ok: true, sent, skipped, failures });
});

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]!));
}
