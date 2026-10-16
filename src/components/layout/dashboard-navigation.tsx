"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  Files,
  LayoutDashboard,
  MessageSquareText,
  Users,
  type LucideIcon,
} from "lucide-react";

interface NavigationItem {
  label: string;
  icon: LucideIcon;
  href?: string;
}

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "AI Chat", icon: MessageSquareText, href: "/dashboard/chat" },
  { label: "People", icon: Users, href: "/dashboard/employees" },
  { label: "Attendance", icon: Activity },
  { label: "Time off", icon: CalendarDays },
  { label: "Documents", icon: Files },
];

interface DashboardNavigationProps {
  mobile?: boolean;
}

export function DashboardNavigation({
  mobile = false,
}: DashboardNavigationProps) {
  const pathname = usePathname();

  return (
    <>
      {navigationItems.map(({ href, icon: Icon, label }) => {
        if (!href) {
          return (
            <span
              aria-disabled="true"
              className={`flex cursor-not-allowed items-center gap-3 px-3 py-2.5 text-sm text-[#c1cec7] opacity-70 ${
                mobile ? "shrink-0 gap-2 px-3 py-2 text-xs" : ""
              }`}
              key={label}
              title="Not available in this foundation"
            >
              <Icon aria-hidden="true" size={mobile ? 15 : 17} />
              {label}
            </span>
          );
        }

        const active =
          pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        const className = mobile
          ? `flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
              active
                ? "bg-[#e8efeb] text-green"
                : "text-muted hover:bg-secondary hover:text-foreground"
            }`
          : `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-[#2c4d40] font-medium text-white"
                : "text-[#c1cec7] hover:bg-[#263c33] hover:text-white"
            }`;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={className}
            href={href}
            key={label}
          >
            <Icon aria-hidden="true" size={mobile ? 15 : 17} />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const currentPage = navigationItems.find(
    ({ href }) =>
      href &&
      (pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`))),
  );

  return (
    <span className="font-medium text-foreground">
      {currentPage?.label ?? "Overview"}
    </span>
  );
}
