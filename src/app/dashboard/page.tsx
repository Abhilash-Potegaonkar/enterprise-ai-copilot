import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowUpRight,
  CalendarDays,
  CircleCheck,
  Clock3,
  FileText,
  Users,
  type LucideIcon,
} from "lucide-react";

interface DashboardMetric {
  label: string;
  note: string;
  icon: LucideIcon;
}

interface ReadinessItem {
  label: string;
  detail: string;
  status: "Ready" | "Planned";
}

const metrics: DashboardMetric[] = [
  { label: "People", note: "Directory not connected", icon: Users },
  { label: "Attendance", note: "No synced records", icon: Clock3 },
  { label: "Time off", note: "No requests yet", icon: CalendarDays },
  { label: "Documents", note: "No files indexed", icon: FileText },
];

const readiness: ReadinessItem[] = [
  {
    label: "Workspace shell",
    detail: "Dashboard and navigation are ready",
    status: "Ready",
  },
  {
    label: "Operations data model",
    detail: "PostgreSQL schema is defined",
    status: "Ready",
  },
  {
    label: "Identity provider",
    detail: "Authentication is not configured",
    status: "Planned",
  },
];

export default async function DashboardPage() {
  await connection();

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-green">
            Operations overview
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            Good morning, Alex
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Your operations overview will take shape as workspace data comes online.
          </p>
        </div>
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-green transition-colors hover:text-accent"
          href="#foundation-status"
        >
          Workspace setup <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <section aria-label="Operations metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ icon: Icon, label, note }) => (
          <article
            className="rounded-md border border-line bg-surface p-5"
            key={label}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted">{label}</h2>
              <Icon aria-hidden="true" className="text-green" size={18} />
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
              --
            </p>
            <p className="mt-1 text-xs text-muted">{note}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]">
        <section aria-labelledby="activity-heading" id="recent-activity">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <p className="text-xs font-semibold uppercase text-muted">
                Operations feed
              </p>
              <h2
                className="mt-1 text-lg font-semibold"
                id="activity-heading"
              >
                Recent activity
              </h2>
            </div>
            <span className="rounded-sm bg-[#e7eee9] px-2.5 py-1 text-xs font-medium text-green">
              Live data pending
            </span>
          </div>
          <div className="flex min-h-52 flex-col items-center justify-center px-4 py-10 text-center">
            <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-[#e7eee9] text-green">
              <Clock3 aria-hidden="true" size={18} />
            </span>
            <h3 className="text-sm font-semibold">Nothing to report yet</h3>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted">
              Activity will appear here after your team and workspace data are connected.
            </p>
          </div>
        </section>

        <section aria-labelledby="foundation-heading" id="foundation-status">
          <div className="border-b border-line pb-4">
            <p className="text-xs font-semibold uppercase text-muted">
              Project foundation
            </p>
            <h2
              className="mt-1 text-lg font-semibold"
              id="foundation-heading"
            >
              Workspace readiness
            </h2>
          </div>
          <ul className="divide-y divide-line">
            {readiness.map((item) => (
              <li className="flex items-start gap-3 py-4" key={item.label}>
                <CircleCheck
                  aria-hidden="true"
                  className={item.status === "Ready" ? "mt-0.5 text-green" : "mt-0.5 text-muted"}
                  size={17}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h3 className="text-sm font-medium">{item.label}</h3>
                    <span className="text-xs font-medium text-muted">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}