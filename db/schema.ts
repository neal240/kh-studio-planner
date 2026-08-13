import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inviteCodes = sqliteTable("invite_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  createdBy: integer("created_by").notNull().references(() => members.id),
  expiresAt: text("expires_at").notNull(),
  maxUses: integer("max_uses").notNull().default(10),
  uses: integer("uses").notNull().default(0),
});

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueAt: text("due_at"),
  createdBy: integer("created_by").notNull().references(() => members.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
  priority: text("priority", { enum: ["high", "medium", "low"] }).notNull().default("medium"),
  dueAt: text("due_at"),
  goalId: integer("goal_id").references(() => goals.id),
  createdBy: integer("created_by").notNull().references(() => members.id),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const taskAssignees = sqliteTable("task_assignees", {
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
}, table => [primaryKey({ columns: [table.taskId, table.memberId] })]);

export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["browser", "email"] }).notNull(),
  remindAt: text("remind_at").notNull(),
  sentAt: text("sent_at"),
});
