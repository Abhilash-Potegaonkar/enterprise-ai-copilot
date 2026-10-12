import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <section className="w-full max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#f6e5df] text-accent">
          <ShieldAlert aria-hidden="true" size={22} />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase text-accent">
          Access restricted
        </p>
        <h1 className="mt-2 text-3xl font-semibold">You can’t access this area</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your account does not have permission to view this resource. Contact your workspace administrator if you need access.
        </p>
        <Link
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          href="/dashboard"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}