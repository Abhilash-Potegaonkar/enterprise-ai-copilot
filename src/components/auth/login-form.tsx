"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import type { LoginActionState } from "@/lib/auth/types";

const initialState: LoginActionState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Work email
        </label>
        <input
          autoComplete="email"
          className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-green focus:ring-2 focus:ring-green/15"
          id="email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-green focus:ring-2 focus:ring-green/15"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}