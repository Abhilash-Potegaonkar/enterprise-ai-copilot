"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "../../../auth";
import type { LoginActionState } from "@/lib/auth/types";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Enter a valid email address and password." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email or password is incorrect." };
    }

    throw error;
  }

  return { error: null };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}