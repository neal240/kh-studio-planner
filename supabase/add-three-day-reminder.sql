alter table public.reminder_deliveries
  drop constraint if exists reminder_deliveries_reminder_kind_check;

alter table public.reminder_deliveries
  add constraint reminder_deliveries_reminder_kind_check
  check (reminder_kind in ('due_3d','due_24h','due_today','overdue_1','overdue_2','overdue_3'));
