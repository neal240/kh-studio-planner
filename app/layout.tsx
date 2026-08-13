import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "空括号工作室 XXXX｜团队规划",
  description: "简单、清晰的工作室目标与任务协作空间。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
