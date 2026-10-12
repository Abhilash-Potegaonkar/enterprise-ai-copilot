import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "../../../auth";
import { LoginForm } from "@/components/auth/login-form";

export const instant = false;

export default async function LoginPage() {
  await connection();
  const session = await auth();

  if (session?.user.id) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen bg-background md:grid-cols-[minmax(0,1fr)_minmax(24rem,0.8fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#19372c] p-12 text-white md:flex xl:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_0%_100%,rgba(211,107,72,0.24),transparent_52%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-[#d36b48] font-semibold">
            O
          </span>
          <span className="text-sm font-semibold">Northstar Operations</span>
        </div>
        <div className="relative max-w-xl pb-8">
          <p className="mb-4 text-xs font-semibold uppercase text-[#a9c4b4]">
            Enterprise workspace
          </p>
          <h1 className="text-4xl font-semibold leading-tight xl:text-5xl">
            Your teams, in sync.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-[#c2d0c8]">
            A secure home for the people, policies, and daily work that keep your organization moving.
          </p>
        </div>
        <p className="relative text-xs text-[#a9bdb1]">
          Access is managed by your organization.
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 md:hidden">
            <span className="flex size-9 items-center justify-center rounded-md bg-[#19372c] font-semibold text-white">
              O
            </span>
            <span className="text-sm font-semibold">Northstar Operations</span>
          </div>
          <p className="text-xs font-semibold uppercase text-green">
            Secure sign in
          </p>
          <h2 className="mt-2 text-3xl font-semibold">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sign in with your organization account to continue.
          </p>
          <LoginForm />
          <p className="mt-8 text-center text-xs leading-5 text-muted">
            Need access? Contact your workspace administrator.
          </p>
        </div>
      </section>
    </main>
  );
}