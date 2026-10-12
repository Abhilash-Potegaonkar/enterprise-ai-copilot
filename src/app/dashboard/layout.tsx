import type { ReactNode } from "react";
import { connection } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const instant = false;

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  await connection();
  const user = await requireAuthenticatedUser();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}