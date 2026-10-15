"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "../../../auth";
import type { LoginActionState } from "@/lib/auth/types";
import { parseLoginFormData } from "@/lib/auth/login-input";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const credentials = parseLoginFormData(formData);

  if (!credentials) {
    return { error: "Enter a valid email address and password." };
  }

  try {
    await signIn("credentials", {
      email: credentials.email,
      password: credentials.password,
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