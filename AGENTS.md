# KH Studio Planner project instructions

## Project context

- This repository contains the “空括号工作室” task-planning website.
- The production frontend is a static React/Vite build deployed to GitHub Pages from `main` by `.github/workflows/deploy-pages.yml`.
- Supabase provides authentication, database access, Edge Functions, and scheduled reminder support.
- The main UI currently lives in `app/page.tsx`; shared Supabase/auth helpers are in `lib/` and `app/chatgpt-auth.ts`.

## Working agreement

- Reply to the user in Chinese unless they request another language.
- Treat questions about the visible website, its data, login, reminders, deployment, or UI as repository questions.
- Before explaining a repository issue, inspect the relevant source, configuration, and current git state. Do not infer a root cause from a screenshot alone.
- When a visible value may be stale, hard-coded, calculated, cached, or returned by Supabase, trace the actual code path before answering.
- Clearly distinguish verified facts from hypotheses. Include the relevant file and line when it helps the user verify the answer.
- Preserve the user's unrelated and untracked files. Do not modify `examples/`, `tests/`, or generated artifacts unless the task requires it.
- Never expose or commit database passwords, Supabase secret/service-role keys, Resend API keys, cron secrets, or session tokens. The Supabase publishable browser key is not a server secret, but still avoid repeating it unnecessarily.

## Verification and deployment

- After frontend changes, run `npm run build:pages` at minimum.
- Run focused checks or `npm test` when the change affects rendering or behavior and the existing test setup applies.
- Database schema changes belong in a reviewed SQL migration under `supabase/`; explain whether the user must run it in Supabase.
- Pushing `main` triggers GitHub Pages deployment. Do not claim the live site is updated until the push/deployment has been verified or explicitly state that verification is pending.
