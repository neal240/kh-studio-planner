# 到期邮件提醒配置

## Edge Function Secrets

在 Supabase Dashboard 的 Edge Functions → Secrets 添加：

- `RESEND_API_KEY`：Resend API Key
- `REMINDER_FROM_EMAIL`：已验证域名的发件地址，例如 `no-reply@norixremixo.com`
- `CRON_SECRET`：自行生成的一串至少 32 位随机字符

`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 托管环境自动提供。

## 部署函数

在 Edge Functions 中创建名为 `task-reminders` 的函数，使用 `functions/task-reminders/index.ts`，并关闭 JWT verification。部署后不要公开 CRON_SECRET。

## 定时任务

在 Integrations → Cron 新建 HTTP 请求任务：

- Schedule: `0 * * * *`（每小时整点）
- Method: POST
- URL: `https://wlnwvudaoqqmwafkeozu.supabase.co/functions/v1/task-reminders`
- Header: `x-cron-secret: <你的 CRON_SECRET>`
- Body: `{}`

提醒会在截止前约 24 小时、截止当天，以及逾期第 1–3 天各发送一次。
