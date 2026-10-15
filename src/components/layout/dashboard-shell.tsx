import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Files,
  LayoutDashboard,
  LogOut,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth-actions";
import type { SessionUser } from "@/lib/auth/types";

interface DashboardShellProps {
  children: ReactNode;
  user: SessionUser;
}

interface NavigationItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  active?: boolean;
}

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", active: true },
  { label: "People", icon: Users, href: "/dashboard/employees" },
  { label: "Attendance", icon: Activity },
  { label: "Time off", icon: CalendarDays },
  { label: "Documents", icon: Files },
];

function NavigationLinks() {
  return (
    <>
      {navigationItems.map(({ active, href, icon: Icon, label }) => {
        const className = `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
          active
            ? "bg-[#2c4d40] font-medium text-white"
            : "text-[#c1cec7] hover:bg-[#263c33] hover:text-white"
        }`;

        if (!href) {
          return (
            <span
              aria-disabled="true"
              className={`${className} cursor-not-allowed opacity-70`}
              key={label}
              title="Not available in this foundation"
            >
              <Icon aria-hidden="true" size={17} />
              {label}
            </span>
          );
        }

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={className}
            href={href}
            key={label}
          >
            <Icon aria-hidden="true" size={17} />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-[#19372c] px-4 py-5 text-white md:flex">
        <Link aria-label="Operations Copilot home" className="flex items-center gap-3 px-2" href="/dashboard">
          <span className="flex size-9 items-center justify-center rounded-md bg-[#d36b48] font-semibold text-white">
            O
          </span>
          <span>
            <span className="block text-sm font-semibold">Northstar</span>
            <span className="mt-0.5 block text-[11px] text-[#afc0b6]">OPERATIONS WORKSPACE</span>
          </span>
        </Link>

        <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#91a69a]">
          Workspace
        </div>
        <nav aria-label="Primary navigation" className="mt-3 flex flex-col gap-1">
          <NavigationLinks />
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 px-3 text-xs text-[#afc0b6]">
            <span className="size-1.5 rounded-full bg-[#8bc4a1]" />
            Workspace preview
          </div>
          <Link
            className="mt-3 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[#c1cec7] transition-colors hover:bg-[#263c33] hover:text-white"
            href="#foundation-status"
          >
            <Settings2 aria-hidden="true" size={17} />
            Setup status
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-7">
          <div className="flex items-center gap-3 md:hidden">
            <span className="flex size-8 items-center justify-center rounded-md bg-[#19372c] text-sm font-semibold text-white">
              N
            </span>
            <span className="text-sm font-semibold">Northstar</span>
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted md:flex">
            <span>Workspace</span>
            <span aria-hidden="true" className="text-line">/</span>
            <span className="font-medium text-foreground">Overview</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden rounded-sm bg-[#e8efeb] px-2 py-1 text-[11px] font-medium text-green sm:inline">
              {user.role}
            </span>
            <div className="flex items-center gap-2.5 border-l border-line pl-3 sm:pl-4">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-[#f0d8ca] text-xs font-semibold text-[#6b3e2f]"
              >
                {user.name
                  ?.split(" ")
                  .map((part) => part.at(0))
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() ?? "U"}
              </span>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold leading-4">
                  {user.name ?? user.email}
                </p>
                <p className="text-[11px] leading-4 text-muted">{user.email}</p>
              </div>
            </div>
            <form action={logoutAction}>
              <button
                aria-label="Sign out"
                className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground"
                title="Sign out"
                type="submit"
              >
                <LogOut aria-hidden="true" size={17} />
              </button>
            </form>
          </div>
        </header>

        <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:hidden">
          {navigationItems.map(({ active, href, icon: Icon, label }) =>
            href ? (
              <Link
                aria-current={active ? "page" : undefined}
                className="flex shrink-0 items-center gap-2 rounded-md bg-[#e8efeb] px-3 py-2 text-xs font-medium text-green"
                href={href}
                key={label}
              >
                <Icon aria-hidden="true" size={15} />
                {label}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="flex shrink-0 items-center gap-2 px-3 py-2 text-xs text-muted"
                key={label}
              >
                <Icon aria-hidden="true" size={15} />
                {label}
              </span>
            ),
          )}
        </nav>

        <main className="w-full flex-1 px-4 py-8 sm:px-7 sm:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}