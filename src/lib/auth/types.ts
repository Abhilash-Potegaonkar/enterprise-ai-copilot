import type { UserRole } from "@/types";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
}

export interface LoginActionState {
  error: string | null;
}